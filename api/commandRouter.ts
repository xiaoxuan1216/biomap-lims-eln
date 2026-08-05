import { z } from "zod";
import { and, desc, eq, gte, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  equipment,
  equipmentBookings,
  experiments,
  samples,
  sequences,
  workflows,
  workflowNodes,
} from "@db/schema";
import { WORKFLOW_TEMPLATES } from "@contracts/workflow";
import { logActivity } from "./queries/labHelpers";
import { instantiateTemplate, trForLang } from "./workflowRouter";

/* ------------------------------------------------------------------ */
/* 超级指令入口（Command Deck）：脱离 GUI 的即时指令下发                   */
/* 支持中英双语：导航 / 查询（预约、过期、库存、设备状态、流程进度）/      */
/* 全局搜索 / 从模板创建业务流。返回结构化卡片供前端渲染。                 */
/* ------------------------------------------------------------------ */

export interface CommandAction {
  label: string;
  href: string;
}

export interface CommandResult {
  reply: string;
  table?: { columns: string[]; rows: string[][] };
  actions?: CommandAction[];
  suggestions?: string[];
}

type Lang = "zh" | "en";

const L = (lang: Lang, zh: string, en: string) => (lang === "en" ? en : zh);

function dayRange(offsetDays = 0): { start: Date; end: Date } {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const NAV_TARGETS: { keys: RegExp; href: string; zh: string; en: string }[] = [
  { keys: /workflow|pipeline|流程|业务流|管线/i, href: "/workflows", zh: "业务流", en: "Workflows" },
  { keys: /sample|inventory|样本|库存/i, href: "/samples", zh: "样本库", en: "Samples" },
  { keys: /sequence|plasmid|序列|质粒/i, href: "/sequences", zh: "序列库", en: "Sequences" },
  { keys: /equipment|instrument|设备|仪器/i, href: "/equipment", zh: "设备管理", en: "Equipment" },
  { keys: /experiment|实验/i, href: "/experiments", zh: "实验记录", en: "Experiments" },
  { keys: /project|项目/i, href: "/projects", zh: "项目管理", en: "Projects" },
  { keys: /storage|freezer|冰箱|存储|库位/i, href: "/storage", zh: "存储管理", en: "Storage" },
  { keys: /activity|audit|日志|审计/i, href: "/activity", zh: "活动日志", en: "Activity Log" },
  { keys: /dashboard|工作台|仪表盘/i, href: "/", zh: "工作台", en: "Dashboard" },
];

export const commandRouter = createRouter({
  execute: authedQuery
    .input(z.object({ text: z.string().min(1).max(500), lang: z.enum(["zh", "en"]).default("zh") }))
    .mutation(async ({ ctx, input }): Promise<CommandResult> => {
      const db = getDb();
      const lang = input.lang;
      const text = input.text.trim();
      const norm = text.toLowerCase();

      /* ── 帮助 ── */
      if (/^(help|帮助|会什么|能做什么|你能做什么|指令)/i.test(norm)) {
        return {
          reply: L(
            lang,
            "我可以直接执行这些指令：查询今日设备预约、样本到期/低库存预警、设备状态、流程进度；全局搜索样本/实验/序列/设备；从模板创建业务流；以及打开任意模块页面。",
            "I can execute commands directly: today's equipment bookings, expiring/low-stock samples, equipment status, workflow progress; global search across samples/experiments/sequences/equipment; create a workflow from a template; or open any module.",
          ),
          suggestions: [
            L(lang, "今天有哪些设备预约？", "What equipment bookings are today?"),
            L(lang, "哪些样本快过期？", "Which samples expire soon?"),
            L(lang, "设备状态总览", "Equipment status overview"),
            L(lang, "进行中的流程进度", "Active workflow progress"),
            L(lang, "创建一个重组抗体表达流程", "Create a recombinant antibody workflow"),
            L(lang, "搜索 EGFR", "Search EGFR"),
          ],
        };
      }

      /* ── 今日预约 ── */
      if (/(今天|今日|today|tonight).*(预约|预订|booking)|(预约|预订|booking).*(今天|今日|today|tonight)|^(预约|预订|booking)/i.test(norm)) {
        const { start, end } = dayRange(0);
        const rows = await db
          .select({ b: equipmentBookings, e: equipment })
          .from(equipmentBookings)
          .innerJoin(equipment, eq(equipmentBookings.equipmentId, equipment.id))
          .where(
            and(
              eq(equipmentBookings.status, "active"),
              lte(equipmentBookings.startTime, end),
              gte(equipmentBookings.endTime, start),
            ),
          )
          .orderBy(equipmentBookings.startTime)
          .limit(20);
        const fmt = (d: Date) => new Date(d).toTimeString().slice(0, 5);
        return {
          reply: rows.length
            ? L(lang, `今天共有 ${rows.length} 条设备预约：`, `${rows.length} equipment booking(s) today:`)
            : L(lang, "今天暂无设备预约。", "No equipment bookings today."),
          table: rows.length
            ? {
                columns: L(lang, "设备|时间|使用人|用途", "Equipment|Time|User|Purpose").split("|"),
                rows: rows.map((r) => [
                  r.e.name,
                  `${fmt(r.b.startTime)}–${fmt(r.b.endTime)}`,
                  r.b.userName,
                  r.b.purpose ?? "—",
                ]),
              }
            : undefined,
          actions: [{ label: L(lang, "打开设备管理", "Open Equipment"), href: "/equipment" }],
        };
      }

      /* ── 样本到期预警 ── */
      if (/过期|到期|expir/i.test(norm)) {
        const soon = new Date();
        soon.setDate(soon.getDate() + 30);
        const rows = await db
          .select()
          .from(samples)
          .where(lte(samples.expiryDate, soon.toISOString().slice(0, 10)))
          .orderBy(samples.expiryDate)
          .limit(15);
        return {
          reply: rows.length
            ? L(lang, `${rows.length} 个样本已过期或 30 天内到期：`, `${rows.length} sample(s) expired or expiring within 30 days:`)
            : L(lang, "没有过期或临期样本。", "No expired or expiring samples."),
          table: rows.length
            ? {
                columns: L(lang, "样本|类型|到期日", "Sample|Type|Expiry").split("|"),
                rows: rows.map((s) => [s.name, s.type, s.expiryDate ?? "—"]),
              }
            : undefined,
          actions: [{ label: L(lang, "打开样本库", "Open Samples"), href: "/samples" }],
        };
      }

      /* ── 低库存 ── */
      if (/低库存|库存不足|low.*stock|stock.*low/i.test(norm)) {
        /* 与 Dashboard 预警口径一致：优先使用每条样本的 alertThreshold，未设置时回退到 quantity <= 2 */
        const rows = await db
          .select()
          .from(samples)
          .where(
            or(
              and(isNotNull(samples.alertThreshold), sql`${samples.quantity} <= ${samples.alertThreshold}`),
              and(isNull(samples.alertThreshold), lte(samples.quantity, 2)),
            ),
          )
          .limit(15);
        return {
          reply: rows.length
            ? L(lang, `${rows.length} 个样本库存不足：`, `${rows.length} sample(s) low on stock:`)
            : L(lang, "当前没有低库存样本。", "No low-stock samples."),
          table: rows.length
            ? {
                columns: L(lang, "样本|剩余量|单位", "Sample|Remaining|Unit").split("|"),
                rows: rows.map((s) => [s.name, String(s.quantity), s.unit ?? "—"]),
              }
            : undefined,
          actions: [{ label: L(lang, "打开样本库", "Open Samples"), href: "/samples" }],
        };
      }

      /* ── 设备状态总览 ── */
      if (/设备状态|仪器状态|equipment status|instrument status/i.test(norm)) {
        const rows = await db.select().from(equipment);
        const cnt = (s: string) => rows.filter((r) => r.status === s).length;
        const bad = rows.filter((r) => r.status === "maintenance" || r.status === "fault");
        return {
          reply: L(
            lang,
            `设备共 ${rows.length} 台：可用 ${cnt("available")} · 使用中 ${cnt("in_use")} · 维护中 ${cnt("maintenance")} · 故障 ${cnt("fault")}。`,
            `${rows.length} instruments: ${cnt("available")} available · ${cnt("in_use")} in use · ${cnt("maintenance")} in maintenance · ${cnt("fault")} fault.`,
          ),
          table: bad.length
            ? {
                columns: L(lang, "设备|状态|房间|负责人", "Equipment|Status|Room|Owner").split("|"),
                rows: bad.map((r) => [r.name, r.status, r.room ?? "—", r.responsibleName ?? "—"]),
              }
            : undefined,
          actions: [{ label: L(lang, "打开设备管理", "Open Equipment"), href: "/equipment" }],
        };
      }

      /* ── 流程进度 ── */
      if (/流程进度|进行中的流程|workflow progress|pipeline progress|流程状态/i.test(norm)) {
        const wfs = await db.select().from(workflows).where(eq(workflows.status, "active"));
        const allNodes = await db.select().from(workflowNodes);
        const mains = wfs.filter((w) => !w.parentWorkflowId);
        return {
          reply: mains.length
            ? L(lang, `${mains.length} 条进行中的业务流：`, `${mains.length} active workflow(s):`)
            : L(lang, "当前没有进行中的业务流。", "No active workflows."),
          table: mains.length
            ? {
                columns: L(lang, "业务流|进度|状态", "Workflow|Progress|Status").split("|"),
                rows: mains.map((w) => {
                  const ns = allNodes.filter((n) => n.workflowId === w.id && n.status !== "skipped");
                  const done = ns.filter((n) => n.status === "done").length;
                  return [w.name, `${done}/${ns.length}`, w.status];
                }),
              }
            : undefined,
          actions: [{ label: L(lang, "打开业务流", "Open Workflows"), href: "/workflows" }],
        };
      }

      /* ── 从模板创建业务流 ── */
      if (/(创建|新建|create|new|发起).*(流程|业务流|workflow|pipeline)/i.test(norm)) {
        const findTpl = () => {
          const kwMap: [RegExp, string][] = [
            [/重组|recombinant/i, ""],
            [/噬菌体|phage/i, ""],
            [/酵母|yeast/i, ""],
            [/crispr|基因编辑|genome.?edit/i, ""],
            [/car.?t/i, ""],
            [/稳转|stable/i, ""],
          ];
          for (const tpl of WORKFLOW_TEMPLATES) {
            const hay = `${tpl.key} ${tpl.name} ${tpl.description}`.toLowerCase();
            for (const [re] of kwMap) {
              if (re.test(norm) && re.test(hay)) return tpl;
            }
          }
          return undefined;
        };
        const tpl = findTpl();
        if (!tpl) {
          return {
            reply: L(
              lang,
              "没有找到匹配的流程模板。可用模板关键词：重组抗体（recombinant）、噬菌体展示（phage）、酵母展示（yeast）、CRISPR、CAR-T、稳转株（stable）。",
              "No matching template found. Try keywords: recombinant antibody, phage display, yeast display, CRISPR, CAR-T, stable cell line.",
            ),
            actions: [{ label: L(lang, "打开业务流模板", "Open Workflow Templates"), href: "/workflows" }],
          };
        }
        const name = `${trForLang(tpl.name, lang)} · ${new Date().toISOString().slice(5, 10)}`;
        const [{ id }] = await db
          .insert(workflows)
          .values({
            name,
            description: trForLang(tpl.description, lang),
            scenario: tpl.group === "antibody" ? "antibody" : "synbio",
            status: "draft",
            createdByName: ctx.user.name ?? "未知用户",
          })
          .$returningId();
        await instantiateTemplate(id, tpl.key, lang);
        await logActivity({
          userName: ctx.user.name ?? "未知用户",
          action: "创建了业务流",
          entityType: "workflow",
          entityId: id,
          entityName: name,
          detail: L(lang, "通过指令台创建", "Created via Command Deck"),
        });
        return {
          reply: L(
            lang,
            `已从模板「${trForLang(tpl.name, lang)}」创建业务流（${tpl.nodes.length} 个节点），可直接进入编辑器。`,
            `Created workflow from template "${trForLang(tpl.name, lang)}" (${tpl.nodes.length} nodes). Open the editor to continue.`,
          ),
          actions: [
            { label: L(lang, "进入流程编辑器", "Open in Editor"), href: `/workflows/${id}` },
            { label: L(lang, "查看全部业务流", "All Workflows"), href: "/workflows" },
          ],
        };
      }

      /* ── 全局搜索 ── */
      const searchMatch = norm.match(/^(?:搜索|查询|查一下|查找|找|search|find|lookup)\s*[:：]?\s*(.+)$/i);
      if (searchMatch) {
        const kw = searchMatch[1].trim();
        const pat = `%${kw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const [smp, exp, seq, eqp] = await Promise.all([
          db.select().from(samples).where(like(samples.name, pat)).limit(5),
          db.select().from(experiments).where(like(experiments.title, pat)).limit(5),
          db.select().from(sequences).where(like(sequences.name, pat)).limit(5),
          db.select().from(equipment).where(like(equipment.name, pat)).limit(5),
        ]);
        const total = smp.length + exp.length + seq.length + eqp.length;
        const rows: string[][] = [
          ...smp.map((s) => [L(lang, "样本", "Sample"), s.name, s.type]),
          ...exp.map((e) => [L(lang, "实验", "Experiment"), e.title, e.status]),
          ...seq.map((s) => [L(lang, "序列", "Sequence"), s.name, `${s.sequence.length} bp/aa`]),
          ...eqp.map((e) => [L(lang, "设备", "Equipment"), e.name, e.status]),
        ];
        return {
          reply: total
            ? L(lang, `「${kw}」共命中 ${total} 条记录：`, `Found ${total} record(s) for "${kw}":`)
            : L(lang, `没有找到与「${kw}」相关的记录。`, `No records found for "${kw}".`),
          table: total
            ? { columns: L(lang, "模块|名称|信息", "Module|Name|Info").split("|"), rows }
            : undefined,
          actions: [{ label: L(lang, "打开全局搜索", "Open Global Search"), href: `/search?q=${encodeURIComponent(kw)}` }],
        };
      }

      /* ── 导航 ── */
      if (/^(go to|open|show|navigate|打开|进入|查看|去|跳转)/i.test(norm)) {
        for (const nav of NAV_TARGETS) {
          if (nav.keys.test(norm)) {
            return {
              reply: L(lang, `好的，正在为你打开「${L(lang, nav.zh, nav.en)}」。`, `Opening "${L(lang, nav.zh, nav.en)}".`),
              actions: [{ label: L(lang, `前往${nav.zh}`, `Go to ${nav.en}`), href: nav.href }],
            };
          }
        }
        return {
          reply: L(lang, "没有找到对应的模块。可以打开：业务流 / 样本库 / 序列库 / 设备 / 实验 / 项目 / 存储 / 日志。", "Module not found. Available: workflows, samples, sequences, equipment, experiments, projects, storage, activity."),
        };
      }

      /* ── 兜底 ── */
      return {
        reply: L(
          lang,
          "这条指令我还不能直接执行。试试查询类（今日预约 / 样本到期 / 设备状态 / 流程进度）、创建类（创建一个噬菌体展示流程）或导航类（打开序列库）指令，或输入「帮助」查看全部能力。",
          "I can't execute that yet. Try queries (today's bookings / expiring samples / equipment status / workflow progress), creation (create a phage display workflow), or navigation (open sequences) — or type “help”.",
        ),
        suggestions: [
          L(lang, "帮助", "Help"),
          L(lang, "今天有哪些设备预约？", "What equipment bookings are today?"),
          L(lang, "进行中的流程进度", "Active workflow progress"),
        ],
      };
    }),
});
