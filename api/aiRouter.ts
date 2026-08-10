import { z } from "zod";
import { createHash } from "node:crypto";
import { and, eq, gte, isNotNull, like, lte, lt, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  equipment,
  equipmentBookings,
  experiments,
  projects,
  samples,
  sequences,
  workflows,
  workflowNodes,
} from "@db/schema";
import {
  designGibsonPrimers,
  findOrfs,
  findRestrictionSites,
  gcContent,
  tmEstimate,
  uniqueCutters,
  normalizeUnambiguousDna,
} from "./queries/bioUtils";
import { logActivity } from "./queries/labHelpers";
import {
  completeLabQuestion,
  isModelConfigured,
  ModelUnavailableError,
} from "./services/modelClient";

const MODEL_REQUESTS_PER_HOUR = 20;
const modelUsage = new Map<number, { startedAt: number; count: number }>();

function consumeModelQuota(userId: number): boolean {
  const now = Date.now();
  const usage = modelUsage.get(userId);
  if (!usage || now - usage.startedAt >= 60 * 60 * 1000) {
    modelUsage.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (usage.count >= MODEL_REQUESTS_PER_HOUR) return false;
  usage.count += 1;
  return true;
}

// ─── Copilot 协议模板 ───────────────────────────────────────────────────
interface ElnBlockOut {
  id: string;
  type: "heading" | "text" | "checklist";
  text?: string;
  items?: { id: string; text: string; done: boolean }[];
}

let blockSeq = 0;
const bid = () => `ai-${Date.now()}-${blockSeq++}`;
const H = (text: string): ElnBlockOut => ({ id: bid(), type: "heading", text });
const T = (text: string): ElnBlockOut => ({ id: bid(), type: "text", text });
const C = (items: string[]): ElnBlockOut => ({
  id: bid(),
  type: "checklist",
  items: items.map((text) => ({ id: bid(), text, done: false })),
});

export const PROTOCOL_TEMPLATES: Record<string, { label: string; build: () => ElnBlockOut[] }> = {
  gibson: {
    label: "Gibson 组装反应",
    build: () => [
      H("Gibson 组装反应（20 µL 体系）"),
      T("原理：T5 外切酶产生粘性末端 → 高保真聚合酶补平 → Taq 连接酶连接，50°C 等温反应 60 min。同源臂建议 20–40 bp，重叠区 Tm ≥ 48°C。"),
      H("反应体系"),
      C([
        "2× Gibson Assembly Master Mix：10 µL",
        "线性化载体（50–100 ng）：X µL",
        "插入片段（摩尔比 载体:插入 = 1:2–3）：Y µL",
        "ddH₂O 补足至 20 µL",
      ]),
      H("操作步骤"),
      C([
        "冰上配制反应体系，轻柔混匀（勿涡旋）",
        "50°C 孵育 60 min（片段 >3 个时延长至 60–90 min）",
        "取 2–5 µL 产物转化 DH5α 感受态细胞",
        "涂布含相应抗性的 LB 平板，37°C 过夜培养",
        "挑取单克隆进行菌落 PCR 初筛",
      ]),
      H("注意事项"),
      T("载体与插入片段需经 DpnI 消化或凝胶纯化去除模板；片段浓度用 Qubit 或 Nanodrop 精确定量；设无插入片段的阴性对照评估载体自连背景。"),
    ],
  },
  golden_gate: {
    label: "Golden Gate 酶切连接",
    build: () => [
      H("Golden Gate 组装（IIS 型限制酶）"),
      T("BsaI/BsmBI 切割位点在识别序列之外，消化后产生自定义 4 bp 粘性末端，实现无痕多片段定向组装。循环酶切-连接可显著提高阳性率。"),
      H("反应体系（20 µL）"),
      C([
        "各部件片段（等摩尔，各 20–50 fmol）",
        "IIS 限制酶（BsaI-HF v2 或 BsmBI v2）：1 µL",
        "T4 DNA 连接酶：1 µL",
        "10× T4 连接酶缓冲液：2 µL",
        "ddH₂O 补足至 20 µL",
      ]),
      H("循环程序"),
      C([
        "37°C 3 min（酶切）→ 16°C 4 min（连接），25–30 个循环",
        "50°C 5 min（终末酶切，去除未组装产物）",
        "80°C 10 min（热灭活）",
        "转化 5 µL 至感受态细胞，抗性平板筛选",
      ]),
    ],
  },
  transformation: {
    label: "感受态细胞转化",
    build: () => [
      H("化学转化（DH5α / TOP10）"),
      H("操作步骤"),
      C([
        "感受态细胞冰浴解冻（约 10 min，勿反复冻融）",
        "加入 1–5 µL 连接/组装产物，轻弹混匀，冰浴 30 min",
        "42°C 热激 45 s，立即冰浴 2 min",
        "加入 500 µL SOC 培养基，37°C 220 rpm 复苏 45–60 min",
        "取 50–200 µL 涂布抗性 LB 平板（必要时 X-gal/IPTG 蓝白斑筛选）",
        "37°C 倒置培养 12–16 h",
      ]),
      H("质控"),
      T("记录转化效率：cfu/µg DNA。pUC19 对照应 ≥ 1×10⁸ cfu/µg。"),
    ],
  },
  colony_pcr: {
    label: "菌落 PCR 筛选",
    build: () => [
      H("菌落 PCR 克隆验证"),
      H("反应体系（20 µL）"),
      C([
        "2× Taq Master Mix：10 µL",
        "上游引物（10 µM）：0.8 µL",
        "下游引物（10 µM）：0.8 µL",
        "ddH₂O：8.4 µL",
        "枪头挑取单菌落点入体系（同时划线保种）",
      ]),
      H("程序"),
      C([
        "95°C 5 min（裂解）",
        "95°C 30 s → 退火（按引物 Tm -5°C）30 s → 72°C 1 kb/min，30 循环",
        "72°C 5 min 终延伸",
        "1% 琼脂糖凝胶电泳鉴定条带大小",
      ]),
    ],
  },
  qpcr: {
    label: "qPCR 定量检测",
    build: () => [
      H("qPCR（SYBR Green，20 µL 体系）"),
      H("反应体系"),
      C([
        "2× SYBR Green Master Mix：10 µL",
        "上游引物（10 µM）：0.4 µL（终浓度 200 nM）",
        "下游引物（10 µM）：0.4 µL",
        "模板 cDNA / gDNA：2 µL",
        "ddH₂O：7.2 µL",
        "每个样本 3 个技术重复，设 NTC 阴性对照",
      ]),
      H("程序"),
      C([
        "95°C 3 min",
        "95°C 10 s → 60°C 30 s（采集荧光），40 循环",
        "熔解曲线 65–95°C，验证扩增特异性",
      ]),
      H("分析"),
      T("2^-ΔΔCt 法定量；内参基因：GAPDH / 16S rRNA。扩增效率应在 90–110% 之间，R² ≥ 0.99。"),
    ],
  },
  flow: {
    label: "流式细胞术检测",
    build: () => [
      H("流式细胞术染色与分析"),
      H("样本制备"),
      C([
        "收集 1–5×10⁵ 细胞，300 g 离心 5 min",
        "PBS + 2% FBS 洗涤 2 次",
        "荧光抗体避光 4°C 染色 20–30 min（按抗体说明书稀释）",
        "洗涤 2 次后 300 µL PBS 重悬，上机前过 40 µm 滤网",
        "设未染色 / 单染补偿 / FMO 对照",
      ]),
      H("上机与分析"),
      C([
        "FSC/SSC 圈定主细胞群 → 单细胞门（FSC-A vs FSC-H）",
        "活死染料排除死细胞",
        "收集 ≥ 10,000 个目标事件",
        "分析阳性率与 MFI（中位荧光强度）",
      ]),
    ],
  },
};

// ─── Copilot 洞察引擎 ───────────────────────────────────────────────────
function dateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const aiRouter = createRouter({
  /** 仪表盘 AI 洞察 */
  insights: authedQuery
    .input(z.object({ lang: z.enum(["zh", "en"]).optional() }).optional())
    .query(async ({ input }) => {
    const en = input?.lang === "en";
    const R = (zh: string, enText: string) => (en ? enText : zh);
    const db = getDb();
    const insights: { icon: string; text: string; level: "warn" | "info" | "ok"; url?: string }[] = [];

    const today = dateStr(0);
    const soon = dateStr(14);
    const expiring = await db
      .select()
      .from(samples)
      .where(and(isNotNull(samples.expiryDate), lte(samples.expiryDate, soon)))
      .orderBy(samples.expiryDate)
      .limit(3);
    for (const s of expiring) {
      const expired = s.expiryDate! <= today;
      insights.push({
        icon: "flask",
        level: expired ? "warn" : "info",
        text: expired
          ? R(`样本「${s.name}」（${s.sku}）已过期，建议尽快处置或复检`,
              `Sample "${s.name}" (${s.sku}) has expired — dispose or retest soon`)
          : R(`「${s.name}」将于 ${s.expiryDate} 到期，建议在后续实验中优先消耗`,
              `"${s.name}" expires on ${s.expiryDate} — prioritize using it in upcoming experiments`),
        url: `/samples/${s.id}`,
      });
    }

    const low = await db
      .select()
      .from(samples)
      .where(
        and(isNotNull(samples.alertThreshold), sql`${samples.quantity} <= ${samples.alertThreshold}`),
      )
      .limit(2);
    for (const s of low) {
      insights.push({
        icon: "alert",
        level: "warn",
        text: R(`「${s.name}」库存仅剩 ${s.quantity} ${s.unit}，低于预警阈值，建议补货`,
            `"${s.name}" is down to ${s.quantity} ${s.unit}, below the alert threshold — restock recommended`),
        url: `/samples/${s.id}`,
      });
    }

    const calSoon = await db
      .select()
      .from(equipment)
      .where(and(isNotNull(equipment.nextCalibrationDate), lte(equipment.nextCalibrationDate, soon)))
      .limit(2);
    for (const e of calSoon) {
      insights.push({
        icon: "gauge",
        level: e.nextCalibrationDate! <= today ? "warn" : "info",
        text: R(`设备「${e.name}」校准到期日 ${e.nextCalibrationDate}，请安排计量校准`,
            `Equipment "${e.name}" calibration is due ${e.nextCalibrationDate} — schedule a calibration`),
        url: "/equipment",
      });
    }

    const activeFlows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.status, "active"))
      .limit(3);
    for (const w of activeFlows) {
      const nodes = await db
        .select()
        .from(workflowNodes)
        .where(eq(workflowNodes.workflowId, w.id));
      const cur = nodes.find((n) => n.status === "in_progress");
      if (cur && !cur.owner) {
        insights.push({
          icon: "workflow",
          level: "info",
          text: R(`流程「${w.name}」进行中节点「${cur.label}」尚未分配负责人，建议尽快分配`,
              `In workflow "${w.name}", the active node "${cur.label}" has no owner assigned yet`),
          url: `/workflows/${w.id}`,
        });
      }
    }

    if (insights.length === 0) {
      insights.push({
        icon: "sparkles",
        level: "ok",
        text: R("实验室运行状态良好，无待处理预警。可以开始规划下一轮 DBTL 迭代。",
            "All systems nominal — no pending alerts. A good time to plan the next DBTL iteration."),
      });
    }
    return insights.slice(0, 6);
    }),

  /** Copilot 对话（领域意图引擎） */
  chat: authedQuery
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        lang: z.enum(["zh", "en"]).optional(),
        context: z
          .object({
            page: z.string().optional(),
            entityType: z.string().optional(),
            entityId: z.number().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const en = input.lang === "en";
      const R = (zh: string, enText: string) => (en ? enText : zh);
      try {
      const dateLocale = en ? "en-US" : "zh-CN";
      const db = getDb();
      const msg = input.message;
      const actions: { label: string; url?: string; kind?: string; templateKey?: string; name?: string }[] = [];

      // ── 效期/过期查询 ──
      if (/过期|临期|效期|到期|expir|due soon/i.test(msg)) {
        const rows = await db
          .select()
          .from(samples)
          .where(and(isNotNull(samples.expiryDate), lte(samples.expiryDate, dateStr(30))))
          .orderBy(samples.expiryDate)
          .limit(8);
        if (!rows.length) {
          return { reply: R("好消息：未来 30 天内没有样本到期，效期管理状态良好 ✅",
            "Good news: no samples expire within the next 30 days ✅"), actions };
        }
        const lines = rows.map((s) => {
          const expired = s.expiryDate! <= dateStr(0);
          return `• ${expired ? "🔴" : "🟡"} ${s.sku} ${s.name} — ${expired ? R("已过期", "expired") : R(`${s.expiryDate} 到期`, `expires ${s.expiryDate}`)}（${R("余", "left")} ${s.quantity} ${s.unit}）`;
        });
        return {
          reply: R(
            `我查到 ${rows.length} 个需要关注的效期样本：\n\n${lines.join("\n")}\n\n建议：临期样本优先安排消耗，过期样本走复检或废弃流程。`,
            `I found ${rows.length} samples needing attention:\n\n${lines.join("\n")}\n\nTip: consume soon-to-expire samples first; route expired ones to retesting or disposal.`),
          actions: [{ label: R("查看全部样本", "View all samples"), url: "/samples" }],
        };
      }

      // ── 低库存 ──
      if (/低库存|补货|库存不足|不够|low.?stock|restock|reorder/i.test(msg)) {
        const rows = await db
          .select()
          .from(samples)
          .where(
            and(isNotNull(samples.alertThreshold), sql`${samples.quantity} <= ${samples.alertThreshold}`),
          )
          .limit(8);
        if (!rows.length) return { reply: R("所有样本库存均在预警阈值之上，无需补货 ✅",
          "All samples are above their alert thresholds — no restocking needed ✅"), actions };
        const lines = rows.map(
          (s) => `• ${s.sku} ${s.name} — ${R(`仅剩 ${s.quantity} ${s.unit}（阈值 ${s.alertThreshold}）`, `only ${s.quantity} ${s.unit} left (threshold ${s.alertThreshold})`)}`,
        );
        return {
          reply: R(
            `以下 ${rows.length} 个样本需要补货：\n\n${lines.join("\n")}\n\n建议按采购周期提前下单，关键试剂（如 psPAX2）建议保持双倍安全库存。`,
            `${rows.length} sample(s) need restocking:\n\n${lines.join("\n")}\n\nOrder ahead of your procurement cycle; keep double safety stock for critical reagents (e.g. psPAX2).`),
          actions: [{ label: R("去处理库存", "Manage inventory"), url: "/samples" }],
        };
      }

      // ── 设备状态/预约 ──
      if (/设备|仪器|预约|机时|equipment|instrument|booking/i.test(msg)) {
        if (/预约|机时|booking|reservation/i.test(msg)) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setDate(end.getDate() + 2);
          const rows = await db
            .select({ b: equipmentBookings, name: equipment.name })
            .from(equipmentBookings)
            .leftJoin(equipment, eq(equipmentBookings.equipmentId, equipment.id))
            .where(
              and(
                eq(equipmentBookings.status, "active"),
                lt(equipmentBookings.startTime, end),
                gte(equipmentBookings.endTime, start),
              ),
            )
            .orderBy(equipmentBookings.startTime)
            .limit(10);
          if (!rows.length) {
            return {
              reply: R("今明两天没有设备预约，所有空闲设备均可直接上机。要预约设备吗？去设备管理页操作即可。",
                "No equipment bookings today or tomorrow — all idle equipment is walk-up available. You can book on the Equipment page."),
              actions: [{ label: R("设备管理", "Equipment"), url: "/equipment" }],
            };
          }
          const lines = rows.map(
            (r) =>
              `• ${r.name}：${r.b.startTime.toLocaleString(dateLocale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} — ${r.b.endTime.toLocaleString(dateLocale, { hour: "2-digit", minute: "2-digit" })}（${r.b.userName}${r.b.purpose ? ` · ${r.b.purpose}` : ""}）`,
          );
          return {
            reply: R(`今明两天共有 ${rows.length} 个设备预约：\n\n${lines.join("\n")}`,
              `There are ${rows.length} equipment bookings today and tomorrow:\n\n${lines.join("\n")}`),
            actions: [{ label: R("设备管理", "Equipment"), url: "/equipment" }],
          };
        }
        const rows = await db.select().from(equipment);
        const byStatus = {
          available: rows.filter((e) => e.status === "available"),
          in_use: rows.filter((e) => e.status === "in_use"),
          maintenance: rows.filter((e) => e.status === "maintenance"),
          fault: rows.filter((e) => e.status === "fault"),
        };
        const fmtGroup = (arr: typeof rows) => arr.map((e) => e.name).join(en ? ", " : "、") || R("无", "none");
        return {
          reply: R(
            `实验室共 ${rows.length} 台设备：\n\n🟢 可用 ${byStatus.available.length} 台：${fmtGroup(byStatus.available)}\n🔵 使用中 ${byStatus.in_use.length} 台：${fmtGroup(byStatus.in_use)}\n🟡 维护中 ${byStatus.maintenance.length} 台：${fmtGroup(byStatus.maintenance)}\n🔴 故障 ${byStatus.fault.length} 台：${fmtGroup(byStatus.fault)}`,
            `The lab has ${rows.length} instruments:\n\n🟢 Available ${byStatus.available.length}: ${fmtGroup(byStatus.available)}\n🔵 In use ${byStatus.in_use.length}: ${fmtGroup(byStatus.in_use)}\n🟡 Maintenance ${byStatus.maintenance.length}: ${fmtGroup(byStatus.maintenance)}\n🔴 Fault ${byStatus.fault.length}: ${fmtGroup(byStatus.fault)}`),
          actions: [{ label: R("设备管理", "Equipment"), url: "/equipment" }],
        };
      }

      // ── BioFlow 抗体研发流程推荐（支持一键创建） ──
      {
        const abSpecific = /噬菌体|phage|酵母|yeast|表面展示|display|亲和力|affinity|人源化|humaniz|scFv|VHH|单抗|mab\b|SPR|BLI|淘选|panning/i.test(msg);
        const abGeneric = /抗体|antibod|Fab/i.test(msg) && /研发|筛选|展示|表达|pipeline|流程|文库|library|screen|discover|develop|engineering/i.test(msg);
        if (abSpecific || abGeneric) {
          if (/噬菌体|phage/i.test(msg)) {
            return {
              reply: R(
                "噬菌体展示筛选推荐 BioFlow 的「噬菌体展示抗体筛选 Pipeline」模板：scFv 文库构建 → 噬菌体救援扩增 → 3 轮固相淘选 →「富集 ≥ 100 倍？」判断 → phage ELISA 初筛 → 测序与 CDR 聚类 → scFv-Fc 重组表达 → SPR 亲和力排序 → 人源化设计。\n\n点击下方按钮即可一键创建整套 DAG：",
                "For phage display screening, I recommend the BioFlow \"Phage Display Antibody Discovery Pipeline\" template: scFv library construction → phage rescue → 3 rounds of solid-phase panning → \"Enrichment ≥ 100×?\" decision → phage ELISA screening → sequencing & CDR clustering → scFv-Fc recombinant expression → SPR affinity ranking → humanization.\n\nClick below to create the full DAG in one step:"),
              actions: [
                { label: R("立即创建噬菌体展示流程", "Create phage display workflow"), kind: "createWorkflow", templateKey: "ab_phage_display", name: R("噬菌体展示抗体筛选 Pipeline", "Phage Display Antibody Discovery Pipeline") },
              ],
            };
          }
          if (/酵母|yeast/i.test(msg)) {
            return {
              reply: R(
                "酵母表面展示推荐 BioFlow 的「酵母表面展示筛选 Pipeline」模板：文库构建 → 电转酵母 → 诱导展示 → 抗原荧光标记 → FACS 双阳性分选 →「群体富集？」判断 → NGS 测序与聚类 → 全长 IgG 重组表达 → SPR / BLI 验证，未达标自动衔接亲和力成熟分支。\n\n点击下方按钮即可一键创建整套 DAG：",
                "For yeast surface display, I recommend the BioFlow \"Yeast Surface Display Screening Pipeline\" template: library construction → yeast electroporation → induction & display → fluorescent antigen staining → FACS double-positive sorting → \"Population enriched?\" decision → NGS sequencing & clustering → full-length IgG recombinant expression → SPR/BLI validation, with an affinity-maturation branch if not on target.\n\nClick below to create the full DAG in one step:"),
              actions: [
                { label: R("立即创建酵母展示流程", "Create yeast display workflow"), kind: "createWorkflow", templateKey: "ab_yeast_display", name: R("酵母表面展示筛选 Pipeline", "Yeast Surface Display Screening Pipeline") },
              ],
            };
          }
          if (/表达|纯化|表征|瞬转|express|purif|characteri|recombinant/i.test(msg)) {
            return {
              reply: R(
                "重组抗体表达推荐 BioFlow 的「重组抗体表达与表征 Pipeline」模板：序列设计 → 分子克隆 → 小试瞬转 →「表达量 ≥ 50 mg/L？」判断 → Protein A 亲和纯化 → SEC 精纯 → SPR 亲和力（KD）→「KD ≤ 10 nM？」判断 → DSF 热稳定性（Tm）→ 表征报告归档，任一级不达标自动回流优化分支。\n\n点击下方按钮即可一键创建整套 DAG：",
                "For recombinant antibody expression, I recommend the BioFlow \"Recombinant Antibody Expression & Characterization Pipeline\" template: sequence design → molecular cloning → small-scale transient expression → \"Titer ≥ 50 mg/L?\" decision → Protein A affinity purification → SEC polishing → SPR affinity (KD) → \"KD ≤ 10 nM?\" decision → DSF thermal stability (Tm) → characterization report archiving, with feedback branches at every quality gate.\n\nClick below to create the full DAG in one step:"),
              actions: [
                { label: R("立即创建重组抗体流程", "Create recombinant antibody workflow"), kind: "createWorkflow", templateKey: "ab_recombinant", name: R("重组抗体表达与表征 Pipeline", "Recombinant Antibody Expression & Characterization Pipeline") },
              ],
            };
          }
          return {
            reply: R(
              "抗体研发有三条内置路线，都已作为 Pipeline 模板内置在 BioFlow 中，自带判断分支：\n\n🧪 **重组抗体表达与表征** — 分子克隆 → 瞬转表达 → Protein A / SEC 纯化 → 亲和力（KD）与稳定性（Tm）检测\n🔬 **噬菌体展示筛选** — 文库 → 淘选富集 → ELISA 初筛 → 亲和力排序 → 人源化\n🍞 **酵母表面展示筛选** — 文库 → FACS 多轮分选 → NGS 富集分析 → 亲和力成熟\n\n点击下方按钮即可一键创建：",
              "Three built-in routes for antibody R&D, all available as BioFlow pipeline templates with decision branches:\n\n🧪 **Recombinant Expression & Characterization** — cloning → transient expression → Protein A / SEC purification → affinity (KD) & stability (Tm)\n🔬 **Phage Display Discovery** — library → panning enrichment → ELISA screening → affinity ranking → humanization\n🍞 **Yeast Surface Display** — library → multi-round FACS sorting → NGS enrichment analysis → affinity maturation\n\nClick a button below to create one in a single step:"),
            actions: [
              { label: R("重组抗体表达流程", "Recombinant expression"), kind: "createWorkflow", templateKey: "ab_recombinant", name: R("重组抗体表达与表征 Pipeline", "Recombinant Antibody Expression & Characterization Pipeline") },
              { label: R("噬菌体展示流程", "Phage display"), kind: "createWorkflow", templateKey: "ab_phage_display", name: R("噬菌体展示抗体筛选 Pipeline", "Phage Display Antibody Discovery Pipeline") },
              { label: R("酵母展示流程", "Yeast display"), kind: "createWorkflow", templateKey: "ab_yeast_display", name: R("酵母表面展示筛选 Pipeline", "Yeast Surface Display Screening Pipeline") },
            ],
          };
        }
      }

      // ── BioFlow 流程推荐（支持一键创建） ──
      if (/载体|菌株|CRISPR|基因编辑|敲除|敲入|蛋白表达|蛋白质|纯化|DBTL|工程循环|Golden\s*Gate|Gibson|组装|质粒|分子克隆|克隆构建|vector|strain|genome edit|knockout|knock-?in|protein expression|purif|assembly|plasmid|clon/i.test(msg)) {
        if (/菌株|CRISPR|基因编辑|敲除|敲入|strain|genome edit|knockout|knock-?in/i.test(msg)) {
          return {
            reply: R(
              "针对菌株基因组编辑，推荐 BioFlow 的「菌株基因组编辑 Pipeline（CRISPR）」模板：gRNA 设计 → 编辑质粒构建 → 转化 → 「克隆是否阳性？」判断 → Sanger 测序 → 「测序是否匹配？」判断 → 编辑效率分析。\n\n点击下方按钮即可一键创建整套 DAG 流程：",
              "For strain genome editing, I recommend the BioFlow \"Strain Genome Editing Pipeline (CRISPR)\" template: gRNA design → editing plasmid construction → transformation → \"Clone positive?\" decision → Sanger sequencing → \"Sequence match?\" decision → editing-efficiency analysis.\n\nClick the button below to create the full DAG in one step:"),
            actions: [
              { label: R("立即创建 CRISPR 流程", "Create CRISPR workflow"), kind: "createWorkflow", templateKey: "crispr_strain", name: R("菌株基因组编辑 Pipeline（CRISPR）", "Strain Genome Editing Pipeline (CRISPR)") },
            ],
          };
        }
        if (/DBTL|工程循环|迭代|design.?build.?test|iteration/i.test(msg)) {
          return {
            reply: R(
              "DBTL 工程循环已作为模板内置在 BioFlow 中：Design（数据节点）→ Build（手工节点）→ Test（设备节点）→ Learn（数据节点）→「进入下一轮迭代？」判断节点，自动衔接第 N+1 轮循环。\n\n点击下方按钮即可一键创建：",
              "The DBTL engineering cycle is built into BioFlow as a template: Design (data node) → Build (manual node) → Test (equipment node) → Learn (data node) → \"Next iteration?\" decision, flowing into round N+1.\n\nClick the button below to create it in one step:"),
            actions: [
              { label: R("立即创建 DBTL 循环", "Create DBTL cycle"), kind: "createWorkflow", templateKey: "dbtl_cycle", name: R("DBTL 工程循环", "DBTL Engineering Cycle") },
            ],
          };
        }
        if (/蛋白表达|纯化|表达|protein expression|purif/i.test(msg)) {
          return {
            reply: R(
              "蛋白表达推荐 BioFlow 的「蛋白表达纯化 Pipeline」模板：转化 → 小试诱导 →「表达量是否达标？」判断 → 放大培养 → 亲和层析纯化 → 浓度纯度测定 → IC50 曲线拟合 → 数据归档。\n\n点击下方按钮即可一键创建：",
              "For protein expression, I recommend the BioFlow \"Protein Expression & Purification Pipeline\" template: transformation → small-scale induction → \"Expression on target?\" decision → scale-up culture → affinity purification → concentration/purity measurement → IC50 curve fitting → archiving.\n\nClick the button below to create it in one step:"),
            actions: [
              { label: R("立即创建蛋白表达流程", "Create protein expression workflow"), kind: "createWorkflow", templateKey: "protein_expr", name: R("蛋白表达纯化 Pipeline", "Protein Expression & Purification Pipeline") },
            ],
          };
        }
        if (/Golden\s*Gate/i.test(msg)) {
          return {
            reply: R(
              "Golden Gate 组装适合 ≥4 个部件的标准化组装（MoClo 体系），无痕、可层级化，模板自带酶切连接、转化筛选与测序判断分支。\n\n点击下方按钮即可一键创建：",
              "Golden Gate assembly suits standardized assembly of ≥4 parts (MoClo) — scarless and hierarchical. The template includes digest-ligation, transformation screening, and sequencing decision branches.\n\nClick the button below to create it in one step:"),
            actions: [
              { label: R("立即创建 Golden Gate 流程", "Create Golden Gate workflow"), kind: "createWorkflow", templateKey: "golden_gate", name: R("Golden Gate 组装 Pipeline", "Golden Gate Assembly Pipeline") },
            ],
          };
        }
        if (/Gibson/i.test(msg)) {
          return {
            reply: R(
              "Gibson 组装适合 1–3 个片段，同源臂 20–40 bp，通用高效，模板自带阳性筛选与测序判断分支。\n\n点击下方按钮即可一键创建：",
              "Gibson assembly suits 1–3 fragments with 20–40 bp homology arms — versatile and efficient. The template includes positive-screen and sequencing decision branches.\n\nClick the button below to create it in one step:"),
            actions: [
              { label: R("立即创建 Gibson 流程", "Create Gibson workflow"), kind: "createWorkflow", templateKey: "gibson_assembly", name: R("Gibson 组装 Pipeline", "Gibson Assembly Pipeline") },
            ],
          };
        }
        return {
          reply: R(
            "载体构建有两条推荐路线：\n\n🧬 **Gibson 组装**：适合 1–3 个片段，同源臂 20–40 bp，通用高效\n🔗 **Golden Gate**：适合 ≥4 个部件的标准化组装（MoClo 体系），无痕、可层级化\n\n两套路线都已作为 Pipeline 模板内置在 BioFlow 中，自带阳性筛选与测序判断分支。点击下方按钮即可一键创建：",
            "Two recommended routes for vector construction:\n\n🧬 **Gibson Assembly**: 1–3 fragments, 20–40 bp homology arms, versatile and efficient\n🔗 **Golden Gate**: standardized assembly of ≥4 parts (MoClo), scarless and hierarchical\n\nBoth are built into BioFlow as pipeline templates with positive-screen and sequencing decision branches. Click a button below to create one in a single step:"),
          actions: [
            { label: R("创建 Gibson 流程", "Create Gibson workflow"), kind: "createWorkflow", templateKey: "gibson_assembly", name: R("Gibson 组装 Pipeline", "Gibson Assembly Pipeline") },
            { label: R("创建 Golden Gate 流程", "Create Golden Gate workflow"), kind: "createWorkflow", templateKey: "golden_gate", name: R("Golden Gate 组装 Pipeline", "Golden Gate Assembly Pipeline") },
          ],
        };
      }

      // ── SynFlow 流程查询 ──
      if (/业务流|工作流|DAG|流程|pipeline|Pipeline|SynFlow|BioFlow|合成流|workflow/i.test(msg)) {
        const wfs = await db.select().from(workflows);
        const allWn = await db.select().from(workflowNodes);
        if (!wfs.length) {
          return {
            reply: R("还没有流程。去 BioFlow 新建一个吧——内置合成生物与抗体研发 Pipeline 模板（Gibson / Golden Gate / CRISPR / 蛋白表达 / DBTL / 重组抗体 / 噬菌体展示 / 酵母展示），也可以用手工、设备、判断、数据处理节点从零搭建。",
              "No workflows yet. Create one in BioFlow — built-in synbio and antibody pipeline templates (Gibson / Golden Gate / CRISPR / protein expression / DBTL / recombinant antibody / phage display / yeast display), or build from scratch with manual, equipment, decision, and data nodes."),
            actions: [{ label: R("BioFlow 工作流", "BioFlow"), url: "/workflows" }],
          };
        }
        const lines = wfs.map((w) => {
          const ns = allWn.filter((n) => n.workflowId === w.id && n.status !== "skipped");
          const done = ns.filter((n) => n.status === "done").length;
          const cur = ns.find((n) => n.status === "in_progress");
          return R(
            `• ${w.name}：${done}/${ns.length} 节点完成${cur ? `，当前「${cur.label}」（${cur.owner ?? "未分配"}）` : ""}`,
            `• ${w.name}: ${done}/${ns.length} nodes done${cur ? `, currently "${cur.label}" (${cur.owner ?? "unassigned"})` : ""}`);
        });
        return {
          reply: R(`当前共 ${wfs.length} 条流程：\n\n${lines.join("\n")}\n\n打开 BioFlow 可以查看 DAG 图、推进节点、分配负责人。`,
            `${wfs.length} workflow(s):\n\n${lines.join("\n")}\n\nOpen BioFlow to view the DAG, advance nodes, and assign owners.`),
          actions: [{ label: R("BioFlow 工作流", "BioFlow"), url: "/workflows" }],
        };
      }

      // ── 统计概览 ──
      if ((/统计|多少|几个|概况|总结|汇报/.test(msg) && /项目|实验|样本|室/.test(msg)) || /实验室.*(什么情况|怎么样|如何)|现在什么情况|lab.*(status|overview|summary)|overview|summary of the lab/i.test(msg)) {
        const [pc] = await db.select({ n: sql<number>`COUNT(*)` }).from(projects).where(eq(projects.status, "active"));
        const [ec] = await db.select({ n: sql<number>`COUNT(*)` }).from(experiments);
        const [sc] = await db.select({ n: sql<number>`COUNT(*)` }).from(samples);
        const [qc] = await db.select({ n: sql<number>`COUNT(*)` }).from(equipment);
        const [rc] = await db.select({ n: sql<number>`COUNT(*)` }).from(workflows).where(eq(workflows.status, "active"));
        return {
          reply: R(
            `实验室当前概况：\n\n📁 进行中项目 ${Number(pc?.n)} 个\n📓 实验记录 ${Number(ec?.n)} 条\n🧪 在库样本 ${Number(sc?.n)} 份\n🔬 设备 ${Number(qc?.n)} 台\n🔄 进行中流程 ${Number(rc?.n)} 条\n\n需要深入了解哪一部分？`,
            `Lab overview:\n\n📁 Active projects: ${Number(pc?.n)}\n📓 Experiment records: ${Number(ec?.n)}\n🧪 Samples in stock: ${Number(sc?.n)}\n🔬 Equipment: ${Number(qc?.n)}\n🔄 Active workflows: ${Number(rc?.n)}\n\nWhich part would you like to dig into?`),
          actions: [
            { label: R("仪表盘", "Dashboard"), url: "/" },
            { label: R("项目管理", "Projects"), url: "/projects" },
          ],
        };
      }

      // ── 序列分析 ──
      if (/分析|GC|酶切|ORF|开放阅读框|analy[sz]e|restriction/i.test(msg) && /序列|基因|质粒|sequence|gene|plasmid/i.test(msg)) {
        let seqId = input.context?.entityType === "sequence" ? input.context.entityId : undefined;
        if (!seqId) {
          const all = await db.select().from(sequences).limit(50);
          const matched = all.find((s) => msg.includes(s.name));
          if (matched) seqId = matched.id;
        }
        if (!seqId) {
          return {
            reply: R("请告诉我要分析哪条序列（说出序列名称），或在序列详情页打开 Copilot，我会自动分析当前序列。",
              "Tell me which sequence to analyze (give its name), or open Copilot from a sequence detail page and I'll analyze it automatically."),
            actions: [{ label: R("序列库", "Sequence Library"), url: "/sequences" }],
          };
        }
        const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, seqId) });
        if (!seq) return { reply: R("没有找到这条序列。", "Sequence not found."), actions };
        const gc = gcContent(seq.sequence);
        const orfs = findOrfs(seq.sequence, 30).slice(0, 3);
        const sites = findRestrictionSites(seq.sequence);
        const uniq = uniqueCutters(seq.sequence);
        const gcNote = gc > 65
          ? R("（偏高，PCR 可能需要加 DMSO 或甜菜碱）", "(high — PCR may need DMSO or betaine)")
          : gc < 35
            ? R("（偏低，注意退火温度优化）", "(low — optimize annealing temperature)")
            : R("（正常范围）", "(normal range)");
        const lines = [
          R(`「${seq.name}」分析结果：`, `Analysis of "${seq.name}":`),
          R(`• 长度 ${seq.sequence.length} ${seq.type === "protein" ? "aa" : "bp"}，GC 含量 ${gc}%${gcNote}`,
            `• Length ${seq.sequence.length} ${seq.type === "protein" ? "aa" : "bp"}, GC ${gc}% ${gcNote}`),
        ];
        if (orfs.length) {
          lines.push(
            R(`• 发现 ${orfs.length} 个主要 ORF，最长 ${orfs[0].lengthAa} aa（读框 ${orfs[0].frame > 0 ? "+" : ""}${orfs[0].frame}，${orfs[0].start}–${orfs[0].end}），蛋白预览：${orfs[0].proteinPreview}…`,
              `• ${orfs.length} major ORF(s), longest ${orfs[0].lengthAa} aa (frame ${orfs[0].frame > 0 ? "+" : ""}${orfs[0].frame}, ${orfs[0].start}–${orfs[0].end}), protein preview: ${orfs[0].proteinPreview}…`),
          );
        } else {
          lines.push(R("• 未发现 ≥30 aa 的完整 ORF（若为部件片段属正常）",
            "• No complete ORF ≥30 aa found (normal for part fragments)"));
        }
        lines.push(
          R(`• 常用酶切位点 ${sites.length} 个；唯一切点酶（载体构建可用）：${uniq.slice(0, 8).join("、") || "无"}`,
            `• ${sites.length} common restriction sites; unique cutters (cloning-ready): ${uniq.slice(0, 8).join(", ") || "none"}`),
        );
        return {
          reply: lines.join("\n"),
          actions: [{ label: R("打开序列图谱", "Open sequence map"), url: `/sequences?focus=${seqId}` }],
        };
      }

      // ── Gibson 引物设计 ──
      if (/引物|primer/i.test(msg) && /Gibson|gibson|组装|assembly/i.test(msg)) {
        return {
          reply: R(
            "Gibson 引物设计要点：\n\n1️⃣ 同源臂 20–40 bp（与载体末端完全同源），重叠区 Tm ≥ 48°C\n2️⃣ 退火区 18–25 bp，Tm 建议 58–62°C，引物间 ΔTm < 3°C\n3️⃣ 5' 端 = 同源臂 + 3' 端 = 模板退火区\n\n你可以在序列详情页使用「Gibson 引物设计」工具，输入载体末端序列即可自动计算。",
            "Gibson primer design essentials:\n\n1️⃣ Homology arm 20–40 bp (fully homologous to vector ends), overlap Tm ≥ 48°C\n2️⃣ Annealing region 18–25 bp, Tm 58–62°C, ΔTm between primers < 3°C\n3️⃣ 5' end = homology arm + 3' end = template annealing region\n\nUse the \"Gibson Primer Design\" tool on a sequence detail page — enter the vector end sequences and it computes the primers automatically."),
          actions: [{ label: R("打开序列库", "Open Sequence Library"), url: "/sequences" }],
        };
      }

      // ── 实验方案生成 ──
      const protocolMatch = Object.entries(PROTOCOL_TEMPLATES).find(([key]) => {
        const keywords: Record<string, RegExp> = {
          gibson: /Gibson|gibson|吉布森/,
          golden_gate: /Golden|golden|金门/,
          transformation: /转化|感受态|transformation|competent/i,
          colony_pcr: /菌落|筛选.*PCR|PCR.*筛选|colony/i,
          qpcr: /qPCR|荧光定量|定量PCR/i,
          flow: /流式|flow|cytometry/i,
        };
        return keywords[key]?.test(msg);
      });
      if (/方案|protocol|Protocol|步骤|怎么做|如何做|steps|how (to|do)/i.test(msg) || protocolMatch) {
        if (protocolMatch) {
          const [key, tpl] = protocolMatch;
          const blocks = tpl.build();
          const inExperiment = input.context?.entityType === "experiment";
          return {
            reply: R(
              `已为你生成「${tpl.label}」标准方案，包含反应体系、操作步骤与质控要点${inExperiment ? "，点击下方按钮可直接插入当前实验记录" : "。打开某个实验后我可以直接帮你插入"}。`,
              `I've generated the standard "${tpl.label}" protocol with reaction setup, steps, and QC notes${inExperiment ? " — click the button below to insert it into the current experiment record" : ". Open an experiment and I can insert it directly"}.`),
            actions: inExperiment
              ? [{ label: R("插入到当前实验", "Insert into current experiment"), kind: "insertBlocks", templateKey: key }]
              : [{ label: R("去实验记录本", "Go to ELN"), url: "/experiments" }],
            blocks,
          };
        }
        const list = Object.entries(PROTOCOL_TEMPLATES)
          .map(([, t]) => `• ${t.label}`)
          .join("\n");
        return {
          reply: R(`我可以生成以下合成生物学标准方案（说出名称即可）：\n\n${list}\n\n在实验详情页打开我，生成的方案可直接插入实验记录。`,
            `I can generate these standard synthetic-biology protocols (just name one):\n\n${list}\n\nOpen me from an experiment detail page and the protocol can be inserted directly into the record.`),
          actions,
        };
      }

      // ── 样本查询 ──
      const sampleHit = await db
        .select()
        .from(samples)
        .where(like(samples.name, `%${msg.replace(/[的吗呢吧啊？?！!，。\s]/g, "")}%`))
        .limit(3);
      if (sampleHit.length && msg.length >= 2) {
        const lines = sampleHit.map(
          (s) => `• ${s.sku} ${s.name} — ${R(`余量 ${s.quantity} ${s.unit}`, `${s.quantity} ${s.unit} left`)}${s.expiryDate ? R(`，效期 ${s.expiryDate}`, `, expires ${s.expiryDate}`) : ""}`,
        );
        return {
          reply: R(`找到相关样本：\n\n${lines.join("\n")}`, `Matching samples:\n\n${lines.join("\n")}`),
          actions: sampleHit.map((s) => ({ label: R(`查看 ${s.sku}`, `View ${s.sku}`), url: `/samples/${s.id}` })),
        };
      }

      // ── 开放式问题：可选 Kimi 模型（只读、限频、无自动工具执行） ──
      if (isModelConfigured()) {
        if (!consumeModelQuota(ctx.user.id)) {
          return {
            reply: R(
              "开放式模型问答已达到每小时限额，请稍后再试。确定性库存、设备和流程查询仍可继续使用。",
              "The hourly model-answer quota has been reached. Deterministic inventory, equipment, and workflow queries remain available.",
            ),
            actions,
          };
        }
        try {
          const [[projectCount], [experimentCount], [sampleCount], [workflowCount]] = await Promise.all([
            db.select({ count: sql<number>`COUNT(*)` }).from(projects),
            db.select({ count: sql<number>`COUNT(*)` }).from(experiments),
            db.select({ count: sql<number>`COUNT(*)` }).from(samples),
            db.select({ count: sql<number>`COUNT(*)` }).from(workflows),
          ]);
          const reply = await completeLabQuestion({
            message: input.message,
            language: en ? "en" : "zh",
            contextSummary: JSON.stringify({
              page: input.context?.page ?? null,
              entityType: input.context?.entityType ?? null,
              entityId: input.context?.entityId ?? null,
              counts: {
                projects: Number(projectCount?.count ?? 0),
                experiments: Number(experimentCount?.count ?? 0),
                samples: Number(sampleCount?.count ?? 0),
                workflows: Number(workflowCount?.count ?? 0),
              },
            }),
          });
          const promptHash = createHash("sha256").update(input.message).digest("hex");
          await logActivity({
            userId: ctx.user.id,
            userName: ctx.user.name,
            source: "web",
            action: "调用了只读 AI 助手",
            entityType: input.context?.entityType ?? "assistant",
            entityId: input.context?.entityId,
            detail: `model=${process.env.KIMI_MODEL ?? "kimi-k2.6"}; promptHash=${promptHash}; responseChars=${reply.length}`,
          });
          return { reply, actions, mode: "model" as const };
        } catch (error) {
          if (!(error instanceof ModelUnavailableError)) throw error;
          console.warn("[ai.chat] Kimi model unavailable, using deterministic fallback:", error.message);
        }
      }

      // ── 兜底：确定性能力清单 ──
      return {
        reply: R(
          `我是 BioMap OS 的确定性实验助手 🧬\n\n我可以查询样本效期与库存、设备预约、流程进度，执行序列基础分析，并生成供人工复核的协议草稿。当前未配置开放式模型问答；实验参数请始终以已验证 SOP、试剂说明书和设备方法为准。`,
          `I'm BioMap OS's deterministic lab assistant 🧬\n\nI can query sample expiry and inventory, equipment bookings, and workflow progress; run basic sequence analysis; and draft protocols for human review. Open-ended model Q&A is not configured. Always verify experimental parameters against validated SOPs and reagent/equipment instructions.`),
        actions: [
          { label: R("序列库", "Sequence Library"), url: "/sequences" },
          { label: R("BioFlow 工作流", "BioFlow"), url: "/workflows" },
        ],
      };
      } catch (err) {
        // 关键：真实错误打到服务端日志，前端得到友好降级回复而不是「出错了」
        console.error("[ai.chat] 处理消息时出错:", err);
        return {
          reply: R("抱歉，我在查询数据时遇到了一点问题，请稍后再试。如果问题持续出现，可能是数据库尚未完成初始化——稍等片刻让服务完成启动，或联系管理员查看服务端日志。",
            "Sorry, I hit a problem while querying the data — please try again shortly. If it persists, the database may still be initializing; wait for the service to finish starting, or ask an admin to check the server logs."),
          actions: [],
        };
      }
    }),

  /** 生成协议区块（供前端插入 ELN） */
  generateProtocol: authedQuery
    .input(z.object({ templateKey: z.string() }))
    .query(({ input }) => {
      const tpl = PROTOCOL_TEMPLATES[input.templateKey];
      if (!tpl) return { label: null, blocks: [] };
      return { label: tpl.label, blocks: tpl.build() };
    }),

  protocolTemplates: authedQuery.query(() =>
    Object.entries(PROTOCOL_TEMPLATES).map(([key, t]) => ({ key, label: t.label })),
  ),

  /** Gibson 引物设计 */
  designGibson: authedQuery
    .input(
      z.object({
        insertSequenceId: z.number(),
        vectorLeftArm: z.string().min(10),
        vectorRightArm: z.string().min(10),
        armLength: z.number().min(15).max(60).default(25),
        annealLength: z.number().min(15).max(35).default(20),
      }),
    )
    .mutation(async ({ input }) => {
      const seq = await getDb().query.sequences.findFirst({
        where: eq(sequences.id, input.insertSequenceId),
      });
      if (!seq) return { error: "插入片段序列不存在" };
      let result: ReturnType<typeof designGibsonPrimers>;
      try {
        result = designGibsonPrimers(
          seq.sequence,
          input.vectorLeftArm,
          input.vectorRightArm,
          input.armLength,
          input.annealLength,
        );
      } catch (error) {
        return { error: error instanceof Error ? error.message : "序列格式无效" };
      }
      return {
        insertName: seq.name,
        ...result,
        note: "同源臂 Tm 应 ≥48°C；两条引物退火区 ΔTm 建议 <3°C；合成前请核对载体酶切/线性化方式与同源臂方向。",
      };
    }),

  /** 引物 Tm 速算 */
  tm: authedQuery.input(z.object({ primer: z.string().min(4).max(200) })).query(({ input }) => {
    const primer = normalizeUnambiguousDna(input.primer, "引物");
    return {
      primer,
      length: primer.length,
      tm: tmEstimate(primer),
      gc: gcContent(primer),
      method: primer.length < 14 ? "Wallace" : "empirical",
      disclaimer: "估算值仅供设计初筛；请使用与缓冲液、盐浓度和仪器方法匹配的验证模型复核。",
    };
  }),
});
