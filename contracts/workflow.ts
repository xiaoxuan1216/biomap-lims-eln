// 业务流 DAG 共享契约：节点类型、节点调色板（预存节点组）、预置业务流模板
// 前后端共用（前端编辑器 / 后端模板实例化与校验）

export type FlowNodeType = "manual" | "equipment" | "decision" | "data" | "timer";

export const FLOW_NODE_TYPES: Record<
  FlowNodeType,
  { label: string; color: string; bg: string; description: string }
> = {
  timer: {
    label: "时间控制",
    color: "#0ea5e9",
    bg: "#f0f9ff",
    description: "前置完成后延时或定点开始下一步",
  },
  manual: {
    label: "手工操作",
    color: "#14b8a6",
    bg: "#f0fdfa",
    description: "需要实验人员手工执行的操作步骤",
  },
  equipment: {
    label: "设备任务",
    color: "#6366f1",
    bg: "#eef2ff",
    description: "由指定设备执行的任务，可绑定设备台账",
  },
  decision: {
    label: "逻辑判断",
    color: "#f59e0b",
    bg: "#fffbeb",
    description: "根据结果走向不同分支（是 / 否）",
  },
  data: {
    label: "数据处理",
    color: "#8b5cf6",
    bg: "#f5f3ff",
    description: "数据分析、计算与归档等处理步骤",
  },
};

export const WORKFLOW_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "#94a3b8" },
  active: { label: "进行中", color: "#3b82f6" },
  completed: { label: "已完成", color: "#10b981" },
  archived: { label: "已归档", color: "#64748b" },
};

export type FlowNodeStatus = "pending" | "in_progress" | "done" | "skipped";

export const FLOW_NODE_STATUS: Record<FlowNodeStatus, { label: string; color: string }> = {
  pending: { label: "待执行", color: "#94a3b8" },
  in_progress: { label: "进行中", color: "#3b82f6" },
  done: { label: "已完成", color: "#10b981" },
  skipped: { label: "已跳过", color: "#64748b" },
};

// ─── 预存节点组（调色板） ───

export interface NodeTemplate {
  key: string;
  type: FlowNodeType;
  label: string;
  description?: string;
  defaultOwner?: string;
}

export interface NodeGroup {
  key: string;
  label: string;
  type: FlowNodeType;
  items: NodeTemplate[];
}

export const NODE_PALETTE: NodeGroup[] = [
  {
    key: "manual",
    label: "手工操作",
    type: "manual",
    items: [
      { key: "m_primer_design", type: "manual", label: "引物 / gRNA 设计", description: "设计并评审寡核苷酸序列" },
      { key: "m_pcr", type: "manual", label: "PCR 扩增", description: "高保真酶扩增目标片段" },
      { key: "m_gel", type: "manual", label: "凝胶电泳质检", description: "片段大小与纯度确认" },
      { key: "m_gibson", type: "manual", label: "Gibson 组装", description: "50°C 等温组装 60 min" },
      { key: "m_transform", type: "manual", label: "转化 / 转染", description: "感受态转化或细胞转染" },
      { key: "m_pick_clone", type: "manual", label: "挑取单克隆", description: "挑斑扩大培养" },
      { key: "m_plasmid_prep", type: "manual", label: "质粒提取", description: "小提 / 中提质粒" },
      { key: "m_cell_prep", type: "manual", label: "细胞制备", description: "细胞复苏、计数与状态确认" },
      { key: "m_virus_pack", type: "manual", label: "病毒包装", description: "慢病毒 / AAV 包装与收获" },
      { key: "m_stain", type: "manual", label: "染色 / 孵育", description: "抗体染色或探针孵育" },
    ],
  },
  {
    key: "antibody",
    label: "抗体研发",
    type: "manual",
    items: [
      { key: "m_ab_cloning", type: "manual", label: "抗体基因分子克隆", description: "VH / VL 克隆至表达骨架" },
      { key: "m_transient_expr", type: "manual", label: "瞬转表达", description: "HEK293 / CHO 悬浮瞬转" },
      { key: "m_lib_construct", type: "manual", label: "抗体文库构建", description: "scFv / Fab / VHH 文库" },
      { key: "m_phage_rescue", type: "manual", label: "噬菌体救援扩增", description: "辅助噬菌体超感染与收获" },
      { key: "m_panning", type: "manual", label: "淘选（Panning）", description: "固相 / 液相抗原淘选" },
      { key: "m_yeast_display", type: "manual", label: "酵母诱导展示", description: "半乳糖诱导表面展示" },
      { key: "m_affinity_maturation", type: "manual", label: "亲和力成熟", description: "易错 PCR / CDR 定向突变文库" },
      { key: "m_humanization", type: "manual", label: "抗体人源化", description: "CDR 移植与回复突变设计" },
    ],
  },
  {
    key: "equipment",
    label: "设备任务",
    type: "equipment",
    items: [
      { key: "e_qpcr", type: "equipment", label: "qPCR 定量", description: "拷贝数 / 表达量定量" },
      { key: "e_flow", type: "equipment", label: "流式细胞分析", description: "阳性率 / 分型检测" },
      { key: "e_plate_reader", type: "equipment", label: "酶标仪读板", description: "吸光度 / 荧光 / 发光读取" },
      { key: "e_seq", type: "equipment", label: "测序", description: "Sanger 或 NGS 测序" },
      { key: "e_centrifuge", type: "equipment", label: "离心 / 浓缩", description: "样品离心分离与浓缩" },
      { key: "e_liquid", type: "equipment", label: "自动化液体处理", description: "工作站自动移液体系构建" },
      { key: "e_incubate", type: "equipment", label: "培养箱孵育", description: "温控培养 / 共孵育" },
      { key: "e_purify", type: "equipment", label: "蛋白纯化", description: "层析纯化（ÄKTA）" },
      { key: "e_elisa", type: "equipment", label: "ELISA 检测", description: "抗原结合初筛" },
      { key: "e_facs", type: "equipment", label: "FACS 分选", description: "荧光激活细胞分选" },
      { key: "e_spr", type: "equipment", label: "SPR / BLI 亲和力检测", description: "KD / kon / koff 测定" },
      { key: "e_dsf", type: "equipment", label: "DSF / DSC 稳定性检测", description: "Tm / Tagg 测定" },
    ],
  },
  {
    key: "decision",
    label: "逻辑判断",
    type: "decision",
    items: [
      { key: "d_clone_pos", type: "decision", label: "克隆是否阳性？", description: "菌落 PCR / 酶切鉴定结果" },
      { key: "d_seq_match", type: "decision", label: "测序是否匹配？", description: "Sanger 比对一致性" },
      { key: "d_expr_ok", type: "decision", label: "表达量是否达标？", description: "表达 / 滴度阈值判断" },
      { key: "d_activity_ok", type: "decision", label: "活性是否达标？", description: "功能学指标阈值判断" },
      { key: "d_affinity_ok", type: "decision", label: "亲和力是否达标？", description: "KD 阈值判断" },
      { key: "d_enrich", type: "decision", label: "淘选是否富集？", description: "产出 / 投入比判断" },
      { key: "d_stability_ok", type: "decision", label: "稳定性是否达标？", description: "Tm / 聚集体阈值判断" },
      { key: "d_custom", type: "decision", label: "自定义判断", description: "自定义分支条件" },
    ],
  },
  {
    key: "data",
    label: "数据处理",
    type: "data",
    items: [
      { key: "p_seq_align", type: "data", label: "序列比对分析", description: "测序结果与参考序列比对" },
      { key: "p_flow_analysis", type: "data", label: "流式数据分析", description: "圈门与阳性率统计" },
      { key: "p_curve_fit", type: "data", label: "曲线拟合（IC50）", description: "剂量-效应曲线拟合" },
      { key: "p_activity_calc", type: "data", label: "活性 / 杀伤率计算", description: "功能学指标计算" },
      { key: "p_kd_fit", type: "data", label: "亲和力拟合（KD）", description: "1:1 Langmuir 拟合" },
      { key: "p_ngs_analysis", type: "data", label: "NGS 富集分析", description: "序列去重与 CDR 聚类" },
      { key: "p_stats", type: "data", label: "统计分析", description: "重复间统计检验" },
      { key: "p_archive", type: "data", label: "数据归档", description: "原始数据与报告归档入库" },
    ],
  },
  {
    key: "timer",
    label: "时间控制",
    type: "timer",
    items: [
      { key: "t_delay", type: "timer", label: "延时等待", description: "前置完成后等待指定时长再开始（如 涂板后等待 16 h）" },
      { key: "t_scheduled", type: "timer", label: "定点开始", description: "在指定日期时间开始下一步（如 明早 09:00 上机）" },
    ],
  },
];

// ─── 设备节点结构化参数模式（按节点模板 key 注册） ───

export interface ParamField {
  key: string;
  label: string;
  type: "select" | "number" | "text";
  unit?: string;
  options?: string[];
  default?: string | number;
}

export type NodeParams = Record<string, string | number>;

export const EQUIP_PARAM_SCHEMAS: Record<string, ParamField[]> = {
  e_qpcr: [
    { key: "method", label: "检测方法", type: "select", options: ["SYBR Green", "TaqMan 探针", "EvaGreen"], default: "TaqMan 探针" },
    { key: "cycles", label: "循环数", type: "number", unit: "cycles", default: 40 },
    { key: "volume", label: "反应体系", type: "number", unit: "μL", default: 20 },
    { key: "melting", label: "熔解曲线", type: "select", options: ["需要", "不需要"], default: "需要" },
  ],
  e_plate_reader: [
    { key: "mode", label: "检测模式", type: "select", options: ["吸光度", "荧光强度", "化学发光", "时间分辨荧光"], default: "化学发光" },
    { key: "emWavelength", label: "检测波长", type: "number", unit: "nm", default: 450 },
    { key: "refWavelength", label: "参考波长", type: "number", unit: "nm", default: 620 },
    { key: "shakeSec", label: "振荡时间", type: "number", unit: "s", default: 30 },
  ],
  e_centrifuge: [
    { key: "rpm", label: "转速", type: "number", unit: "rpm", default: 12000 },
    { key: "minutes", label: "离心时间", type: "number", unit: "min", default: 10 },
    { key: "temp", label: "温度", type: "number", unit: "°C", default: 4 },
  ],
  e_flow: [
    { key: "panel", label: "分析方案", type: "select", options: ["表面染色", "胞内染色", "死活染色", "细胞周期"], default: "表面染色" },
    { key: "events", label: "采集事件数", type: "number", unit: "events", default: 10000 },
    { key: "speed", label: "上样速度", type: "select", options: ["低速", "中速", "高速"], default: "中速" },
  ],
  e_seq: [
    { key: "seqType", label: "测序类型", type: "select", options: ["Sanger", "NGS（Illumina）", "三代（PacBio）"], default: "Sanger" },
    { key: "primer", label: "测序引物", type: "text" },
    { key: "coverage", label: "读长模式", type: "select", options: ["单端", "双端"], default: "单端" },
  ],
  e_incubate: [
    { key: "temp", label: "温度", type: "number", unit: "°C", default: 37 },
    { key: "co2", label: "CO₂ 浓度", type: "number", unit: "%", default: 5 },
    { key: "hours", label: "孵育时长", type: "number", unit: "h", default: 4 },
  ],
  e_liquid: [
    { key: "channel", label: "移液模式", type: "select", options: ["单通道", "8 通道", "96 通道"], default: "96 通道" },
    { key: "volume", label: "体系体积", type: "number", unit: "μL", default: 50 },
    { key: "mixTimes", label: "混合次数", type: "number", unit: "次", default: 3 },
  ],
  e_purify: [
    { key: "column", label: "层析柱类型", type: "select", options: ["Protein A 亲和", "Ni-NTA 亲和", "离子交换", "分子筛"], default: "Ni-NTA 亲和" },
    { key: "flowRate", label: "流速", type: "number", unit: "mL/min", default: 1 },
    { key: "gradient", label: "洗脱梯度", type: "text", default: "20–250 mM 咪唑" },
  ],
  e_elisa: [
    { key: "antigen", label: "包被抗原", type: "text" },
    { key: "coatConc", label: "包被浓度", type: "number", unit: "µg/mL", default: 1 },
    { key: "detect", label: "检测二抗", type: "select", options: ["anti-Fc-HRP", "anti-His-HRP", "anti-Fab-HRP"], default: "anti-Fc-HRP" },
  ],
  e_facs: [
    { key: "gate", label: "分选门控", type: "select", options: ["双阳性 top 1%", "双阳性 top 5%", "单阳性"], default: "双阳性 top 1%" },
    { key: "cells", label: "分选细胞数", type: "number", unit: "events", default: 10000000 },
    { key: "mode", label: "分选模式", type: "select", options: ["富集", "纯度"], default: "富集" },
  ],
  e_spr: [
    { key: "platform", label: "检测平台", type: "select", options: ["SPR（Biacore）", "BLI（Octet）"], default: "SPR（Biacore）" },
    { key: "ligand", label: "固定相", type: "select", options: ["抗原固定", "抗体捕获"], default: "抗原固定" },
    { key: "concSeries", label: "浓度梯度", type: "text", default: "0.78–100 nM" },
  ],
  e_dsf: [
    { key: "method", label: "检测方法", type: "select", options: ["DSF（nanoDSF）", "DSC"], default: "DSF（nanoDSF）" },
    { key: "rampRate", label: "升温速率", type: "number", unit: "°C/min", default: 1 },
    { key: "conc", label: "样品浓度", type: "number", unit: "mg/mL", default: 1 },
  ],
};

// ─── 时间控制节点参数 ───

export const TIMER_UNITS: Record<string, string> = { min: "分钟", h: "小时", d: "天" };

/** 节点卡片上的参数摘要（设备取前两项，时间节点显示等待/定点信息）；t 为可选翻译函数（以中文原文为 key） */
export function nodeParamSummary(
  nodeType: FlowNodeType,
  templateKey: string | null | undefined,
  params: NodeParams | null | undefined,
  t?: (key: string, vars?: Record<string, unknown>) => string,
): string {
  const tr = (key: string, vars?: Record<string, unknown>) => (t ? t(key, vars) : key);
  if (nodeType === "timer") {
    if (!params) return "";
    if (params.mode === "scheduled" && params.datetime) return tr("{time} 开始", { time: params.datetime });
    if (params.value)
      return tr("前置完成后等待 {value} {unit}", {
        value: params.value,
        unit: tr(TIMER_UNITS[String(params.unit)] ?? String(params.unit ?? "h")),
      });
    return tr("等待前置完成");
  }
  if (nodeType === "equipment" && templateKey && params) {
    const schema = EQUIP_PARAM_SCHEMAS[templateKey] ?? [];
    return schema
      .slice(0, 2)
      .map((f) => (params[f.key] != null && params[f.key] !== "" ? `${tr(f.label)} ${tr(String(params[f.key]))}${f.unit ? ` ${f.unit}` : ""}` : null))
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

// ─── 预置业务流模板 ───

export interface WorkflowTemplateNode {
  key: string;
  type: FlowNodeType;
  templateKey?: string;
  label: string;
  owner?: string;
  config?: string;
  params?: NodeParams;
  x: number;
  y: number;
}

export interface WorkflowTemplateEdge {
  from: string;
  to: string;
  sourceHandle?: string; // decision 节点: "yes" | "no"
  label?: string;
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description: string;
  /** pipeline = 合成生物学 Pipeline；antibody = 抗体研发 Pipeline；flow = 通用业务流 */
  group: "pipeline" | "antibody" | "flow";
  nodes: WorkflowTemplateNode[];
  edges: WorkflowTemplateEdge[];
}

export const TEMPLATE_GROUPS: Record<string, string> = {
  pipeline: "合成生物学 Pipeline",
  antibody: "抗体研发 Pipeline",
  flow: "通用业务流",
};

export const TEMPLATE_GROUP_ORDER = ["pipeline", "antibody", "flow"] as const;

/** 模板分组 → 业务流场景 */
export function templateScenario(group: string): "synbio" | "antibody" {
  return group === "antibody" ? "antibody" : "synbio";
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "gibson_assembly",
    name: "载体构建 Pipeline（Gibson 组装）",
    description: "序列设计到质粒入库的标准载体构建流程，含阳性筛选与测序确认分支",
    group: "pipeline",
    nodes: [
      { key: "n1", type: "data", templateKey: "p_seq_align", label: "序列设计与密码子优化", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_primer_design", label: "引物设计与合成", owner: "王工", x: 320, y: 180 },
      { key: "n3", type: "manual", templateKey: "m_pcr", label: "基因片段 PCR 扩增", owner: "王工", x: 580, y: 180 },
      { key: "n4", type: "manual", templateKey: "m_gel", label: "载体酶切线性化", owner: "陈研究员", x: 840, y: 180 },
      { key: "n5", type: "manual", templateKey: "m_gibson", label: "Gibson 组装", owner: "陈研究员", x: 1100, y: 180 },
      { key: "n6", type: "manual", templateKey: "m_transform", label: "转化与克隆筛选", owner: "陈研究员", x: 1360, y: 180 },
      { key: "n7", type: "decision", templateKey: "d_clone_pos", label: "克隆是否阳性？", x: 1640, y: 170 },
      { key: "n8", type: "equipment", templateKey: "e_seq", label: "Sanger 测序验证", owner: "张工", params: { seqType: "Sanger", primer: "CMV-F" }, x: 1900, y: 80 },
      { key: "n9", type: "decision", templateKey: "d_seq_match", label: "测序是否匹配？", x: 2160, y: 70 },
      { key: "n10", type: "manual", templateKey: "m_plasmid_prep", label: "质粒保藏入库", owner: "陈研究员", x: 2420, y: 80 },
      { key: "n11", type: "manual", templateKey: "m_pick_clone", label: "重新挑取克隆鉴定", owner: "陈研究员", x: 1900, y: 300 },
      { key: "n12", type: "manual", templateKey: "m_gibson", label: "排查原因重做组装", owner: "王工", x: 2160, y: 280 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7" },
      { from: "n7", to: "n8", sourceHandle: "yes", label: "是" },
      { from: "n7", to: "n11", sourceHandle: "no", label: "否" },
      { from: "n8", to: "n9" },
      { from: "n9", to: "n10", sourceHandle: "yes", label: "是" },
      { from: "n9", to: "n12", sourceHandle: "no", label: "否" },
    ],
  },
  {
    key: "golden_gate",
    name: "Golden Gate 多片段组装 Pipeline",
    description: "部件 Domestication 到层级组装验证，IIS 酶切连接标准流程",
    group: "pipeline",
    nodes: [
      { key: "n1", type: "data", templateKey: "p_seq_align", label: "部件 Domestication 设计（去 IIS 位点）", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_pcr", label: "引物设计与部件扩增", owner: "王工", x: 360, y: 180 },
      { key: "n3", type: "manual", templateKey: "m_gibson", label: "IIS 酶切连接组装", owner: "陈研究员", x: 660, y: 180 },
      { key: "n4", type: "manual", templateKey: "m_transform", label: "转化与抗性筛选", owner: "陈研究员", x: 940, y: 180 },
      { key: "n5", type: "decision", templateKey: "d_clone_pos", label: "组装是否正确？（菌落 PCR）", x: 1200, y: 170 },
      { key: "n6", type: "equipment", templateKey: "e_seq", label: "测序验证", owner: "张工", params: { seqType: "Sanger" }, x: 1460, y: 80 },
      { key: "n7", type: "manual", templateKey: "m_plasmid_prep", label: "保藏入库", owner: "陈研究员", x: 1700, y: 80 },
      { key: "n8", type: "manual", templateKey: "m_gibson", label: "重做酶切连接", owner: "陈研究员", x: 1460, y: 300 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6", sourceHandle: "yes", label: "是" },
      { from: "n5", to: "n8", sourceHandle: "no", label: "否" },
      { from: "n6", to: "n7" },
    ],
  },
  {
    key: "dbtl_cycle",
    name: "DBTL 工程循环 Pipeline",
    description: "设计-构建-测试-学习迭代循环，含迭代决策分支",
    group: "pipeline",
    nodes: [
      { key: "n1", type: "data", templateKey: "p_stats", label: "Design · 设计与建模", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_gibson", label: "Build · 构建", owner: "陈研究员", x: 320, y: 180 },
      { key: "n3", type: "equipment", templateKey: "e_plate_reader", label: "Test · 高通量检测", owner: "张工", params: { mode: "化学发光" }, x: 580, y: 180 },
      { key: "n4", type: "data", templateKey: "p_stats", label: "Learn · 学习与建模", owner: "王工", x: 840, y: 180 },
      { key: "n5", type: "decision", templateKey: "d_activity_ok", label: "进入下一轮迭代？", x: 1100, y: 170 },
      { key: "n6", type: "data", templateKey: "p_stats", label: "第 N+1 轮 Design", owner: "王工", x: 1360, y: 80 },
      { key: "n7", type: "data", templateKey: "p_archive", label: "数据归档与结题", owner: "王工", x: 1360, y: 300 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6", sourceHandle: "yes", label: "是" },
      { from: "n5", to: "n7", sourceHandle: "no", label: "否" },
    ],
  },

  {
    key: "crispr_strain",
    name: "菌株基因组编辑 Pipeline（CRISPR）",
    description: "从 gRNA 设计到编辑效率分析的标准菌株构建流程，含阳性筛选与测序确认分支",
    group: "pipeline",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_primer_design", label: "gRNA 设计", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_gibson", label: "编辑质粒构建", owner: "王工", x: 300, y: 180 },
      { key: "n3", type: "manual", templateKey: "m_transform", label: "转化与涂板", owner: "陈研究员", x: 540, y: 180 },
      { key: "n3b", type: "timer", templateKey: "t_delay", label: "涂板培养等待", params: { mode: "delay", value: 16, unit: "h" }, x: 720, y: 180 },
      { key: "n4", type: "decision", templateKey: "d_clone_pos", label: "克隆是否阳性？", x: 940, y: 170 },
      { key: "n5", type: "manual", templateKey: "m_pick_clone", label: "扩大培养与保种", owner: "陈研究员", x: 1200, y: 80 },
      { key: "n6", type: "equipment", templateKey: "e_seq", label: "Sanger 测序", owner: "张工", params: { seqType: "Sanger", primer: "pLKO.1 通用引物" }, x: 1440, y: 80 },
      { key: "n7", type: "decision", templateKey: "d_seq_match", label: "测序是否匹配？", x: 1700, y: 70 },
      { key: "n8", type: "data", templateKey: "p_activity_calc", label: "编辑效率分析", owner: "王工", x: 1960, y: 80 },
      { key: "n9", type: "data", templateKey: "p_archive", label: "数据归档", owner: "王工", x: 2200, y: 80 },
      { key: "n10", type: "manual", templateKey: "m_primer_design", label: "重新设计 gRNA", owner: "王工", x: 1200, y: 300 },
      { key: "n11", type: "manual", templateKey: "m_transform", label: "优化条件重做转化", owner: "陈研究员", x: 1700, y: 280 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n3b" },
      { from: "n3b", to: "n4" },
      { from: "n4", to: "n5", sourceHandle: "yes", label: "是" },
      { from: "n4", to: "n10", sourceHandle: "no", label: "否" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7" },
      { from: "n7", to: "n8", sourceHandle: "yes", label: "是" },
      { from: "n7", to: "n11", sourceHandle: "no", label: "否" },
      { from: "n8", to: "n9" },
    ],
  },
  {
    key: "cart_killing",
    name: "CAR-T 杀伤评估自动化业务流",
    description: "效应细胞制备到杀伤率计算的自动化评估流程，岛台孵育 + 流式检测 + 阈值判断",
    group: "flow",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_cell_prep", label: "效应 T 细胞制备", owner: "赵工", x: 60, y: 180 },
      { key: "n2", type: "equipment", templateKey: "e_liquid", label: "自动化铺板（效靶比梯度）", owner: "赵工", x: 320, y: 180 },
      { key: "n3", type: "equipment", templateKey: "e_incubate", label: "岛台共孵育", owner: "赵工", params: { temp: 37, co2: 5, hours: 4 }, x: 600, y: 180 },
      { key: "n4", type: "manual", templateKey: "m_stain", label: "流式抗体染色", owner: "陈研究员", x: 860, y: 180 },
      { key: "n5", type: "equipment", templateKey: "e_flow", label: "流式细胞检测", owner: "张工", params: { panel: "表面染色", events: 10000 }, x: 1120, y: 180 },
      { key: "n6", type: "data", templateKey: "p_activity_calc", label: "杀伤率计算", owner: "王工", x: 1380, y: 180 },
      { key: "n7", type: "decision", templateKey: "d_activity_ok", label: "杀伤率 ≥ 60%？", x: 1640, y: 170 },
      { key: "n8", type: "data", templateKey: "p_stats", label: "统计分析与报告", owner: "王工", x: 1900, y: 80 },
      { key: "n9", type: "data", templateKey: "p_archive", label: "数据归档", owner: "王工", x: 2140, y: 80 },
      { key: "n10", type: "manual", templateKey: "m_cell_prep", label: "优化效靶比重复实验", owner: "赵工", x: 1900, y: 300 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7" },
      { from: "n7", to: "n8", sourceHandle: "yes", label: "是" },
      { from: "n7", to: "n10", sourceHandle: "no", label: "否" },
      { from: "n8", to: "n9" },
    ],
  },
  {
    key: "protein_expr",
    name: "蛋白表达纯化 Pipeline",
    description: "小试表达到放大纯化，含表达量阈值判断与 IC50 曲线分析",
    group: "pipeline",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_transform", label: "表达载体转化 BL21", owner: "陈研究员", x: 60, y: 180 },
      { key: "n2", type: "equipment", templateKey: "e_incubate", label: "小试诱导表达", owner: "陈研究员", params: { temp: 37, hours: 16 }, x: 320, y: 180 },
      { key: "n3", type: "decision", templateKey: "d_expr_ok", label: "表达量是否达标？", x: 580, y: 170 },
      { key: "n4", type: "equipment", templateKey: "e_incubate", label: "放大培养", owner: "陈研究员", params: { temp: 30, hours: 24 }, x: 840, y: 80 },
      { key: "n5", type: "equipment", templateKey: "e_purify", label: "亲和层析纯化", owner: "王工", x: 1080, y: 80 },
      { key: "n6", type: "equipment", templateKey: "e_plate_reader", label: "浓度与纯度测定", owner: "张工", x: 1320, y: 80 },
      { key: "n7", type: "data", templateKey: "p_curve_fit", label: "活性曲线拟合（IC50）", owner: "王工", x: 1580, y: 80 },
      { key: "n8", type: "data", templateKey: "p_archive", label: "数据归档", owner: "王工", x: 1820, y: 80 },
      { key: "n9", type: "manual", templateKey: "m_primer_design", label: "优化诱导条件", owner: "陈研究员", x: 840, y: 300 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", sourceHandle: "yes", label: "是" },
      { from: "n3", to: "n9", sourceHandle: "no", label: "否" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7" },
      { from: "n7", to: "n8" },
    ],
  },
];

// ─── 抗体研发 Pipeline ───

WORKFLOW_TEMPLATES.push(
  {
    key: "ab_recombinant",
    name: "重组抗体表达与表征 Pipeline",
    description: "从分子克隆到亲和力 / 稳定性表征的重组抗体表达流程（HEK293 / CHO 瞬转），含表达量、KD、Tm 三级质量判断",
    group: "antibody",
    nodes: [
      { key: "n1", type: "data", templateKey: "p_seq_align", label: "抗体序列设计与密码子优化", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_ab_cloning", label: "分子克隆（表达骨架构建）", owner: "陈研究员", x: 320, y: 180 },
      { key: "n3", type: "decision", templateKey: "d_seq_match", label: "质粒测序正确？", x: 580, y: 170 },
      { key: "n4", type: "manual", templateKey: "m_transient_expr", label: "HEK293F 小试瞬转表达", owner: "陈研究员", x: 840, y: 80 },
      { key: "n5", type: "decision", templateKey: "d_expr_ok", label: "表达量 ≥ 50 mg/L？", x: 1100, y: 70 },
      { key: "n6", type: "equipment", templateKey: "e_purify", label: "Protein A 亲和纯化", owner: "王工", params: { column: "Protein A 亲和" }, x: 1360, y: 80 },
      { key: "n7", type: "equipment", templateKey: "e_purify", label: "SEC 精纯（去聚集体）", owner: "王工", params: { column: "分子筛" }, x: 1620, y: 80 },
      { key: "n8", type: "equipment", templateKey: "e_spr", label: "SPR 亲和力检测（KD）", owner: "张工", x: 1880, y: 80 },
      { key: "n9", type: "decision", templateKey: "d_affinity_ok", label: "KD ≤ 10 nM？", x: 2140, y: 70 },
      { key: "n10", type: "equipment", templateKey: "e_dsf", label: "DSF 热稳定性检测", owner: "张工", x: 2400, y: 80 },
      { key: "n11", type: "decision", templateKey: "d_stability_ok", label: "Tm ≥ 60 °C？", x: 2660, y: 70 },
      { key: "n12", type: "data", templateKey: "p_archive", label: "表征报告归档", owner: "王工", x: 2920, y: 80 },
      { key: "n13", type: "manual", templateKey: "m_ab_cloning", label: "定点突变重新克隆", owner: "陈研究员", x: 2140, y: 300 },
      { key: "n14", type: "data", templateKey: "p_seq_align", label: "序列优化（去聚集 / 去 PTM）", owner: "王工", x: 2660, y: 300 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", sourceHandle: "yes", label: "是" },
      { from: "n3", to: "n13", sourceHandle: "no", label: "否" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6", sourceHandle: "yes", label: "是" },
      { from: "n5", to: "n13", sourceHandle: "no", label: "否" },
      { from: "n6", to: "n7" },
      { from: "n7", to: "n8" },
      { from: "n8", to: "n9" },
      { from: "n9", to: "n10", sourceHandle: "yes", label: "是" },
      { from: "n9", to: "n13", sourceHandle: "no", label: "否" },
      { from: "n10", to: "n11" },
      { from: "n11", to: "n12", sourceHandle: "yes", label: "是" },
      { from: "n11", to: "n14", sourceHandle: "no", label: "否" },
    ],
  },
  {
    key: "ab_phage_display",
    name: "噬菌体展示抗体筛选 Pipeline",
    description: "从文库构建到候选分子归档的噬菌体展示筛选流程，含淘选富集判断、ELISA 初筛、亲和力排序与人源化",
    group: "antibody",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_lib_construct", label: "scFv 噬菌体抗体文库构建", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_phage_rescue", label: "噬菌体救援与扩增", owner: "陈研究员", x: 320, y: 180 },
      { key: "n3", type: "manual", templateKey: "m_panning", label: "固相淘选（3 轮，抗原递减）", owner: "陈研究员", x: 580, y: 180 },
      { key: "n4", type: "decision", templateKey: "d_enrich", label: "产出 / 投入比富集 ≥ 100 倍？", x: 840, y: 170 },
      { key: "n5", type: "equipment", templateKey: "e_elisa", label: "单克隆 phage ELISA 初筛", owner: "张工", x: 1100, y: 80 },
      { key: "n6", type: "decision", templateKey: "d_clone_pos", label: "阳性率 ≥ 10%？", x: 1360, y: 70 },
      { key: "n7", type: "equipment", templateKey: "e_seq", label: "阳性克隆 Sanger 测序", owner: "张工", params: { seqType: "Sanger" }, x: 1620, y: 80 },
      { key: "n8", type: "data", templateKey: "p_ngs_analysis", label: "序列去重与 CDR 聚类", owner: "王工", x: 1880, y: 80 },
      { key: "n9", type: "manual", templateKey: "m_transient_expr", label: "scFv-Fc 重组表达", owner: "陈研究员", x: 2140, y: 80 },
      { key: "n10", type: "equipment", templateKey: "e_spr", label: "SPR 亲和力排序", owner: "张工", x: 2400, y: 80 },
      { key: "n11", type: "decision", templateKey: "d_affinity_ok", label: "获得 nM 级克隆？", x: 2660, y: 70 },
      { key: "n12", type: "manual", templateKey: "m_humanization", label: "人源化设计", owner: "王工", x: 2920, y: 80 },
      { key: "n13", type: "data", templateKey: "p_archive", label: "候选分子归档", owner: "王工", x: 3180, y: 80 },
      { key: "n14", type: "manual", templateKey: "m_panning", label: "提高严格度追加淘选", owner: "陈研究员", x: 1100, y: 300 },
      { key: "n15", type: "equipment", templateKey: "e_elisa", label: "复测确认结合", owner: "张工", x: 1360, y: 300 },
      { key: "n16", type: "manual", templateKey: "m_affinity_maturation", label: "亲和力成熟文库", owner: "王工", x: 2660, y: 300 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5", sourceHandle: "yes", label: "是" },
      { from: "n4", to: "n14", sourceHandle: "no", label: "否" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7", sourceHandle: "yes", label: "是" },
      { from: "n6", to: "n15", sourceHandle: "no", label: "否" },
      { from: "n7", to: "n8" },
      { from: "n8", to: "n9" },
      { from: "n9", to: "n10" },
      { from: "n10", to: "n11" },
      { from: "n11", to: "n12", sourceHandle: "yes", label: "是" },
      { from: "n11", to: "n16", sourceHandle: "no", label: "否" },
      { from: "n12", to: "n13" },
    ],
  },
  {
    key: "ab_yeast_display",
    name: "酵母表面展示筛选 Pipeline",
    description: "酵母展示文库经 FACS 多轮分选富集高亲和力克隆，含 NGS 富集分析、全长 IgG 验证与亲和力成熟分支",
    group: "antibody",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_lib_construct", label: "酵母展示 scFv 文库构建", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_transform", label: "电转酿酒酵母（覆盖 1E8）", owner: "陈研究员", x: 320, y: 180 },
      { key: "n3", type: "manual", templateKey: "m_yeast_display", label: "半乳糖诱导表面展示", owner: "陈研究员", x: 580, y: 180 },
      { key: "n4", type: "manual", templateKey: "m_stain", label: "抗原荧光标记染色", owner: "陈研究员", x: 840, y: 180 },
      { key: "n5", type: "equipment", templateKey: "e_facs", label: "FACS 双阳性分选", owner: "张工", x: 1100, y: 180 },
      { key: "n6", type: "decision", templateKey: "d_enrich", label: "双阳性群体富集？", x: 1360, y: 170 },
      { key: "n7", type: "equipment", templateKey: "e_seq", label: "分选克隆 NGS 测序", owner: "张工", params: { seqType: "NGS（Illumina）" }, x: 1620, y: 80 },
      { key: "n8", type: "data", templateKey: "p_ngs_analysis", label: "富集序列聚类分析", owner: "王工", x: 1880, y: 80 },
      { key: "n9", type: "manual", templateKey: "m_transient_expr", label: "全长 IgG 重组表达", owner: "陈研究员", x: 2140, y: 80 },
      { key: "n10", type: "equipment", templateKey: "e_spr", label: "SPR / BLI 亲和力验证", owner: "张工", x: 2400, y: 80 },
      { key: "n11", type: "decision", templateKey: "d_affinity_ok", label: "KD 达标（nM 级）？", x: 2660, y: 70 },
      { key: "n12", type: "data", templateKey: "p_archive", label: "候选分子归档", owner: "王工", x: 2920, y: 80 },
      { key: "n13", type: "manual", templateKey: "m_affinity_maturation", label: "易错 PCR 亲和力成熟文库", owner: "王工", x: 2920, y: 300 },
      { key: "n14", type: "manual", templateKey: "m_yeast_display", label: "新一轮展示与分选", owner: "陈研究员", x: 3180, y: 300 },
      { key: "n15", type: "manual", templateKey: "m_yeast_display", label: "放宽门控复筛", owner: "陈研究员", x: 1620, y: 300 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7", sourceHandle: "yes", label: "是" },
      { from: "n6", to: "n15", sourceHandle: "no", label: "否" },
      { from: "n7", to: "n8" },
      { from: "n8", to: "n9" },
      { from: "n9", to: "n10" },
      { from: "n10", to: "n11" },
      { from: "n11", to: "n12", sourceHandle: "yes", label: "是" },
      { from: "n11", to: "n13", sourceHandle: "no", label: "否" },
      { from: "n13", to: "n14" },
    ],
  },
);
