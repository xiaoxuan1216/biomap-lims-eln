import { z } from "zod";
import { and, eq, gte, isNotNull, like, lte, lt, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  equipment,
  equipmentBookings,
  experiments,
  pipelines,
  pipelineStages,
  projects,
  samples,
  sequences,
} from "@db/schema";
import {
  designGibsonPrimers,
  findOrfs,
  findRestrictionSites,
  gcContent,
  tmEstimate,
  uniqueCutters,
} from "./queries/bioUtils";

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
  insights: authedQuery.query(async () => {
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
          ? `样本「${s.name}」（${s.sku}）已过期，建议尽快处置或复检`
          : `「${s.name}」将于 ${s.expiryDate} 到期，建议在后续实验中优先消耗`,
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
        text: `「${s.name}」库存仅剩 ${s.quantity} ${s.unit}，低于预警阈值，建议补货`,
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
        text: `设备「${e.name}」校准到期日 ${e.nextCalibrationDate}，请安排计量校准`,
        url: "/equipment",
      });
    }

    const activePipes = await db
      .select()
      .from(pipelines)
      .where(eq(pipelines.status, "active"))
      .limit(3);
    for (const p of activePipes) {
      const stages = await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, p.id));
      const current = stages.find((s) => s.status === "in_progress");
      if (current && !current.linkedExperimentId) {
        insights.push({
          icon: "workflow",
          level: "info",
          text: `Pipeline「${p.name}」当前阶段「${current.name}」尚无关联实验，建议创建实验记录`,
          url: `/pipelines/${p.id}`,
        });
      }
    }

    if (insights.length === 0) {
      insights.push({
        icon: "sparkles",
        level: "ok",
        text: "实验室运行状态良好，无待处理预警。可以开始规划下一轮 DBTL 迭代。",
      });
    }
    return insights.slice(0, 6);
  }),

  /** Copilot 对话（领域意图引擎） */
  chat: authedQuery
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        context: z
          .object({
            page: z.string().optional(),
            entityType: z.string().optional(),
            entityId: z.number().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const msg = input.message;
      const actions: { label: string; url?: string; kind?: string; templateKey?: string }[] = [];

      // ── 效期/过期查询 ──
      if (/过期|临期|效期|到期/.test(msg)) {
        const rows = await db
          .select()
          .from(samples)
          .where(and(isNotNull(samples.expiryDate), lte(samples.expiryDate, dateStr(30))))
          .orderBy(samples.expiryDate)
          .limit(8);
        if (!rows.length) {
          return { reply: "好消息：未来 30 天内没有样本到期，效期管理状态良好 ✅", actions };
        }
        const lines = rows.map((s) => {
          const expired = s.expiryDate! <= dateStr(0);
          return `• ${expired ? "🔴" : "🟡"} ${s.sku} ${s.name} — ${expired ? "已过期" : `${s.expiryDate} 到期`}（余 ${s.quantity} ${s.unit}）`;
        });
        return {
          reply: `我查到 ${rows.length} 个需要关注的效期样本：\n\n${lines.join("\n")}\n\n建议：临期样本优先安排消耗，过期样本走复检或废弃流程。`,
          actions: [{ label: "查看全部样本", url: "/samples" }],
        };
      }

      // ── 低库存 ──
      if (/低库存|补货|库存不足|不够/.test(msg)) {
        const rows = await db
          .select()
          .from(samples)
          .where(
            and(isNotNull(samples.alertThreshold), sql`${samples.quantity} <= ${samples.alertThreshold}`),
          )
          .limit(8);
        if (!rows.length) return { reply: "所有样本库存均在预警阈值之上，无需补货 ✅", actions };
        const lines = rows.map(
          (s) => `• ${s.sku} ${s.name} — 仅剩 ${s.quantity} ${s.unit}（阈值 ${s.alertThreshold}）`,
        );
        return {
          reply: `以下 ${rows.length} 个样本需要补货：\n\n${lines.join("\n")}\n\n建议按采购周期提前下单，关键试剂（如 psPAX2）建议保持双倍安全库存。`,
          actions: [{ label: "去处理库存", url: "/samples" }],
        };
      }

      // ── 设备状态/预约 ──
      if (/设备|仪器|预约|机时/.test(msg)) {
        if (/预约|机时/.test(msg)) {
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
              reply: "今明两天没有设备预约，所有空闲设备均可直接上机。要预约设备吗？去设备管理页操作即可。",
              actions: [{ label: "设备管理", url: "/equipment" }],
            };
          }
          const lines = rows.map(
            (r) =>
              `• ${r.name}：${r.b.startTime.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} — ${r.b.endTime.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}（${r.b.userName}${r.b.purpose ? ` · ${r.b.purpose}` : ""}）`,
          );
          return {
            reply: `今明两天共有 ${rows.length} 个设备预约：\n\n${lines.join("\n")}`,
            actions: [{ label: "设备管理", url: "/equipment" }],
          };
        }
        const rows = await db.select().from(equipment);
        const byStatus = {
          available: rows.filter((e) => e.status === "available"),
          in_use: rows.filter((e) => e.status === "in_use"),
          maintenance: rows.filter((e) => e.status === "maintenance"),
          fault: rows.filter((e) => e.status === "fault"),
        };
        return {
          reply: `实验室共 ${rows.length} 台设备：\n\n🟢 可用 ${byStatus.available.length} 台：${byStatus.available.map((e) => e.name).join("、") || "无"}\n🔵 使用中 ${byStatus.in_use.length} 台：${byStatus.in_use.map((e) => e.name).join("、") || "无"}\n🟡 维护中 ${byStatus.maintenance.length} 台：${byStatus.maintenance.map((e) => e.name).join("、") || "无"}\n🔴 故障 ${byStatus.fault.length} 台：${byStatus.fault.map((e) => e.name).join("、") || "无"}`,
          actions: [{ label: "设备管理", url: "/equipment" }],
        };
      }

      // ── 统计概览 ──
      if (/统计|多少|几个|概况|总结|汇报/.test(msg) && /项目|实验|样本|室/.test(msg)) {
        const [pc] = await db.select({ n: sql<number>`COUNT(*)` }).from(projects).where(eq(projects.status, "active"));
        const [ec] = await db.select({ n: sql<number>`COUNT(*)` }).from(experiments);
        const [sc] = await db.select({ n: sql<number>`COUNT(*)` }).from(samples);
        const [qc] = await db.select({ n: sql<number>`COUNT(*)` }).from(equipment);
        const [rc] = await db.select({ n: sql<number>`COUNT(*)` }).from(pipelines).where(eq(pipelines.status, "active"));
        return {
          reply: `实验室当前概况：\n\n📁 进行中项目 ${Number(pc?.n)} 个\n📓 实验记录 ${Number(ec?.n)} 条\n🧪 在库样本 ${Number(sc?.n)} 份\n🔬 设备 ${Number(qc?.n)} 台\n🔄 进行中 Pipeline ${Number(rc?.n)} 条\n\n需要深入了解哪一部分？`,
          actions: [
            { label: "仪表盘", url: "/" },
            { label: "项目管理", url: "/projects" },
          ],
        };
      }

      // ── 序列分析 ──
      if (/分析|GC|酶切|ORF|开放阅读框/.test(msg) && /序列|基因|质粒/.test(msg)) {
        let seqId = input.context?.entityType === "sequence" ? input.context.entityId : undefined;
        if (!seqId) {
          const all = await db.select().from(sequences).limit(50);
          const matched = all.find((s) => msg.includes(s.name));
          if (matched) seqId = matched.id;
        }
        if (!seqId) {
          return {
            reply: "请告诉我要分析哪条序列（说出序列名称），或在序列详情页打开 Copilot，我会自动分析当前序列。",
            actions: [{ label: "序列库", url: "/sequences" }],
          };
        }
        const seq = await db.query.sequences.findFirst({ where: eq(sequences.id, seqId) });
        if (!seq) return { reply: "没有找到这条序列。", actions };
        const gc = gcContent(seq.sequence);
        const orfs = findOrfs(seq.sequence, 30).slice(0, 3);
        const sites = findRestrictionSites(seq.sequence);
        const uniq = uniqueCutters(seq.sequence);
        const lines = [
          `「${seq.name}」分析结果：`,
          `• 长度 ${seq.sequence.length} ${seq.type === "protein" ? "aa" : "bp"}，GC 含量 ${gc}%${gc > 65 ? "（偏高，PCR 可能需要加 DMSO 或甜菜碱）" : gc < 35 ? "（偏低，注意退火温度优化）" : "（正常范围）"}`,
        ];
        if (orfs.length) {
          lines.push(
            `• 发现 ${orfs.length} 个主要 ORF，最长 ${orfs[0].lengthAa} aa（读框 ${orfs[0].frame > 0 ? "+" : ""}${orfs[0].frame}，${orfs[0].start}–${orfs[0].end}），蛋白预览：${orfs[0].proteinPreview}…`,
          );
        } else {
          lines.push("• 未发现 ≥30 aa 的完整 ORF（若为部件片段属正常）");
        }
        lines.push(
          `• 常用酶切位点 ${sites.length} 个；唯一切点酶（载体构建可用）：${uniq.slice(0, 8).join("、") || "无"}`,
        );
        return {
          reply: lines.join("\n"),
          actions: [{ label: "打开序列图谱", url: `/sequences?focus=${seqId}` }],
        };
      }

      // ── Gibson 引物设计 ──
      if (/引物/.test(msg) && /Gibson|gibson|组装/.test(msg)) {
        return {
          reply:
            "Gibson 引物设计要点：\n\n1️⃣ 同源臂 20–40 bp（与载体末端完全同源），重叠区 Tm ≥ 48°C\n2️⃣ 退火区 18–25 bp，Tm 建议 58–62°C，引物间 ΔTm < 3°C\n3️⃣ 5' 端 = 同源臂 + 3' 端 = 模板退火区\n\n你可以在序列详情页使用「Gibson 引物设计」工具，输入载体末端序列即可自动计算。",
          actions: [{ label: "打开序列库", url: "/sequences" }],
        };
      }

      // ── 实验方案生成 ──
      const protocolMatch = Object.entries(PROTOCOL_TEMPLATES).find(([key]) => {
        const keywords: Record<string, RegExp> = {
          gibson: /Gibson|gibson|吉布森/,
          golden_gate: /Golden|golden|金门/,
          transformation: /转化|感受态/,
          colony_pcr: /菌落|筛选.*PCR|PCR.*筛选/,
          qpcr: /qPCR|荧光定量|定量PCR/i,
          flow: /流式|flow/i,
        };
        return keywords[key]?.test(msg);
      });
      if (/方案|protocol|Protocol|步骤|怎么做|如何做/.test(msg) || protocolMatch) {
        if (protocolMatch) {
          const [key, tpl] = protocolMatch;
          const blocks = tpl.build();
          const inExperiment = input.context?.entityType === "experiment";
          return {
            reply: `已为你生成「${tpl.label}」标准方案，包含反应体系、操作步骤与质控要点${inExperiment ? "，点击下方按钮可直接插入当前实验记录" : "。打开某个实验后我可以直接帮你插入"}。`,
            actions: inExperiment
              ? [{ label: "插入到当前实验", kind: "insertBlocks", templateKey: key }]
              : [{ label: "去实验记录本", url: "/experiments" }],
            blocks,
          };
        }
        const list = Object.entries(PROTOCOL_TEMPLATES)
          .map(([, t]) => `• ${t.label}`)
          .join("\n");
        return {
          reply: `我可以生成以下合成生物学标准方案（说出名称即可）：\n\n${list}\n\n在实验详情页打开我，生成的方案可直接插入实验记录。`,
          actions,
        };
      }

      // ── Pipeline 建议 ──
      if (/pipeline|Pipeline|流程|载体构建|菌株|蛋白表达|DBTL/i.test(msg)) {
        if (/菌株|CRISPR|基因编辑|敲除|敲入/.test(msg)) {
          return {
            reply:
              "针对菌株基因组编辑，建议使用「菌株基因组编辑（CRISPR）」Pipeline，标准 8 阶段：gRNA 设计 → 供体模板构建 → RNP/质粒制备 → 转化编辑 → 菌落筛选 → 基因型验证 → 表型验证 → 保藏。\n\n要现在创建吗？",
            actions: [{ label: "创建 Pipeline", url: "/pipelines" }],
          };
        }
        if (/载体|组装|克隆|构建/.test(msg)) {
          return {
            reply:
              "载体构建有两条推荐路线：\n\n🧬 **Gibson 组装**：适合 1–3 个片段，同源臂 20–40 bp，成功率高的通用方案\n🔗 **Golden Gate**：适合 ≥4 个部件的标准化组装（MoClo 体系），无痕、可层级化\n\n片段多且需要标准化库就选 Golden Gate，否则 Gibson 更快。",
            actions: [{ label: "创建 Pipeline", url: "/pipelines" }],
          };
        }
        const rows = await db.select().from(pipelines).where(eq(pipelines.status, "active")).limit(5);
        if (rows.length) {
          const lines = [];
          for (const p of rows) {
            const stages = await db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, p.id));
            const cur = stages.find((s) => s.status === "in_progress");
            lines.push(`• ${p.name}（第 ${p.iteration} 轮）— 当前：${cur?.name ?? "已完成"}`);
          }
          return {
            reply: `当前进行中的 Pipeline：\n\n${lines.join("\n")}\n\n需要我帮你推进某个阶段，还是创建新的 Pipeline？`,
            actions: [{ label: "Pipeline 总览", url: "/pipelines" }],
          };
        }
        return {
          reply:
            "目前还没有运行中的 Pipeline。我推荐按项目目标选择：载体构建（Gibson/Golden Gate）、菌株编辑（CRISPR）、蛋白表达纯化，或通用的 DBTL 工程循环。",
          actions: [{ label: "创建 Pipeline", url: "/pipelines" }],
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
          (s) => `• ${s.sku} ${s.name} — 余量 ${s.quantity} ${s.unit}${s.expiryDate ? `，效期 ${s.expiryDate}` : ""}`,
        );
        return {
          reply: `找到相关样本：\n\n${lines.join("\n")}`,
          actions: sampleHit.map((s) => ({ label: `查看 ${s.sku}`, url: `/samples/${s.id}` })),
        };
      }

      // ── 兜底：能力清单 ──
      return {
        reply: `我是 LabNova Copilot，你的合成生物学实验助手 🧬\n\n我目前可以：\n\n📊 **实验室问答** —「哪些样本快过期了」「流式细胞仪今天有预约吗」「实验室现在什么情况」\n🧬 **序列分析** — 在序列页打开我，自动给出 GC%、ORF、酶切位点分析\n📋 **方案生成** — 说出「Gibson 方案」「qPCR 步骤」等，生成标准 Protocol 并插入实验记录\n🔧 **设计建议** — Gibson 引物设计、载体构建路线选择、Pipeline 推荐\n\n试试对我说：「帮我分析这条序列」或「生成 Gibson 组装方案」`,
        actions: [
          { label: "序列库", url: "/sequences" },
          { label: "Pipeline", url: "/pipelines" },
        ],
      };
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
      const result = designGibsonPrimers(
        seq.sequence,
        input.vectorLeftArm,
        input.vectorRightArm,
        input.armLength,
        input.annealLength,
      );
      return {
        insertName: seq.name,
        ...result,
        note: "同源臂 Tm 应 ≥48°C；两条引物退火区 ΔTm 建议 <3°C；合成前请核对载体酶切/线性化方式与同源臂方向。",
      };
    }),

  /** 引物 Tm 速算 */
  tm: authedQuery.input(z.object({ primer: z.string().min(4) })).query(({ input }) => ({
    primer: input.primer.toUpperCase(),
    length: input.primer.length,
    tm: tmEstimate(input.primer),
    gc: gcContent(input.primer),
  })),
});
