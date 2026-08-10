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
      { key: "a_auto_cloning", type: "manual", label: "全自动分子克隆（机械臂串联）", description: "无人值守分子克隆岛：仪器间物料全部由机械臂转运" },
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
      { key: "e_hamilton_cleanup", type: "equipment", label: "Hamilton STAR V 纯化定量", description: "磁珠法 PCR 产物纯化与 Qubit 定量" },
      { key: "e_hamilton_gibson", type: "equipment", label: "Hamilton VANTAGE 体系构建", description: "Gibson / PCR 体系自动化构建" },
      { key: "e_biomek_colony", type: "equipment", label: "Biomek i7 挑菌分液", description: "96 深孔板克隆接种与分液" },
      { key: "e_mgi_g400", type: "equipment", label: "MGI DNBSEQ-G400 测序", description: "扩增子 PE150 高通量测序" },
      { key: "e_ont_minion", type: "equipment", label: "ONT MinION Mk1B 测序", description: "质粒全长纳米孔验证测序" },
      { key: "e_robot_pf400", type: "equipment", label: "PreciseFlex 400 机械臂转运", description: "工作站间板件 / 耗材自动转运" },
      { key: "e_hamilton_pcrsetup", type: "equipment", label: "Hamilton STAR V PCR 体系构建", description: "96 孔 PCR 体系自动化配制" },
      { key: "e_trobot", type: "equipment", label: "Biometra TRobot II 自动化 PCR", description: "机械臂直连的全自动热循环仪" },
      { key: "e_hamilton_transform", type: "equipment", label: "Hamilton STAR V 自动转化涂布", description: "热激转化与玻璃珠涂布自动化" },
      { key: "e_cytomat", type: "equipment", label: "Cytomat 2 C-LIN 自动化孵箱", description: "机械臂闸门直连的平板培养" },
      { key: "e_kuhner", type: "equipment", label: "Kühner LT-X 自动化摇床", description: "深孔板摇菌培养（OPC-UA 联机）" },
      { key: "e_hamilton_miniprep", type: "equipment", label: "Hamilton STAR V 质粒小提", description: "NucleoSpin 96 全自动质粒提取" },
      { key: "e_liconic", type: "equipment", label: "LiCONiC StoreX 板库出入库", description: "耗材 / 试剂板冷藏库自动出入库" },
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

// ─── 具体仪器指令档案（厂商型号级：板位 / 体积 / 方法脚本） ───

export interface BiText {
  zh: string;
  en: string;
}

export interface InstrumentDeckSlot {
  pos: string;
  labware: BiText;
  content: BiText;
}

export interface InstrumentParam {
  label: BiText;
  value: string;
}

export interface InstrumentProfile {
  key: string;
  vendor: string;
  model: string;
  software: string;
  /** 厂商方法 / 脚本文件名（与厂家软件联动） */
  methodFile: string;
  /** 台面板位布局（测序仪为上机配置） */
  deckLayout: InstrumentDeckSlot[];
  /** 关键运行参数（体积 / 比例 / 循环等） */
  params: InstrumentParam[];
  /** 自动运行步骤 */
  steps: BiText[];
  /** 耗材与注意事项 */
  tips: BiText;
}

export const INSTRUMENT_PROFILES: Record<string, InstrumentProfile> = {
  e_hamilton_cleanup: {
    key: "e_hamilton_cleanup",
    vendor: "Hamilton",
    model: "Microlab STAR V",
    software: "VENUS 6.1",
    methodFile: "PCR_Cleanup_AmpureXP_v3.2.med",
    deckLayout: [
      { pos: "P1", labware: { zh: "96 孔 PCR 板（样本）", en: "96-well PCR plate (samples)" }, content: { zh: "PCR 产物 50 µL/孔 ×8", en: "PCR products, 50 µL/well ×8" } },
      { pos: "P2", labware: { zh: "试剂槽", en: "Reagent trough" }, content: { zh: "AMPure XP 磁珠（1.8×）", en: "AMPure XP beads (1.8×)" } },
      { pos: "P3", labware: { zh: "试剂槽", en: "Reagent trough" }, content: { zh: "80% 乙醇（新鲜配制）", en: "80% ethanol (freshly prepared)" } },
      { pos: "P4", labware: { zh: "试剂槽", en: "Reagent trough" }, content: { zh: "Buffer EB 洗脱液", en: "Buffer EB eluent" } },
      { pos: "P5", labware: { zh: "300 µL 吸头架 ×2", en: "300 µL tip racks ×2" }, content: { zh: "CO-RE II 滤芯吸头", en: "CO-RE II filter tips" } },
      { pos: "P6", labware: { zh: "Alpaqua 96S 磁力架", en: "Alpaqua 96S magnet plate" }, content: { zh: "磁珠分离位", en: "Bead separation position" } },
      { pos: "P7", labware: { zh: "Qubit 管架", en: "Qubit tube rack" }, content: { zh: "dsDNA HS 定量（2 µL 上样）", en: "dsDNA HS assay (2 µL load)" } },
    ],
    params: [
      { label: { zh: "磁珠比例", en: "Bead ratio" }, value: "1.8× (90 µL)" },
      { label: { zh: "结合时间", en: "Binding time" }, value: "5 min" },
      { label: { zh: "漂洗", en: "Washes" }, value: "200 µL ×2 (80% EtOH)" },
      { label: { zh: "洗脱体积", en: "Elution volume" }, value: "40 µL EB" },
      { label: { zh: "混匀", en: "Mixing" }, value: "Mix ×10 @ 150 µL/s" },
      { label: { zh: "通道模式", en: "Channels" }, value: "8-ch independent" },
    ],
    steps: [
      { zh: "台面自检与吸头装载（Deck Scan）", en: "Deck scan & tip loading" },
      { zh: "磁珠重悬后按 1.8× 加入样本，吹打混匀", en: "Resuspend beads, add to samples at 1.8×, mix" },
      { zh: "室温结合 5 min，磁力架分离 3 min，弃上清", en: "Bind 5 min RT, separate on magnet 3 min, discard supernatant" },
      { zh: "80% 乙醇漂洗两次（200 µL ×2）", en: "Two 80% ethanol washes (200 µL ×2)" },
      { zh: "室温干燥 5 min，40 µL EB 洗脱", en: "Air-dry 5 min, elute in 40 µL EB" },
      { zh: "Qubit dsDNA HS 定量，浓度回写 LIMS", en: "Qubit dsDNA HS quantification, results written back to LIMS" },
    ],
    tips: {
      zh: "耗材：CO-RE II 300 µL 滤芯吸头；AMPure XP 需室温平衡 30 min 后使用",
      en: "Consumables: CO-RE II 300 µL filter tips; equilibrate AMPure XP at RT for 30 min before use",
    },
  },
  e_hamilton_gibson: {
    key: "e_hamilton_gibson",
    vendor: "Hamilton",
    model: "Microlab VANTAGE",
    software: "VENUS 6.1 · cooling carriers",
    methodFile: "Gibson_Assembly_Setup_v1.8.med",
    deckLayout: [
      { pos: "P1", labware: { zh: "96 孔 PCR 板（反应板）", en: "96-well PCR plate (reactions)" }, content: { zh: "4°C 预冷", en: "Pre-chilled at 4°C" } },
      { pos: "P2", labware: { zh: "载体管架", en: "Vector tube rack" }, content: { zh: "线性化载体 50 ng/µL", en: "Linearized vector, 50 ng/µL" } },
      { pos: "P3", labware: { zh: "片段管架", en: "Insert tube rack" }, content: { zh: "VH / VL 纯化片段", en: "Purified VH / VL fragments" } },
      { pos: "P4", labware: { zh: "试剂槽（冰浴）", en: "Reagent trough (on ice)" }, content: { zh: "2× Gibson Master Mix (NEB E2611)", en: "2× Gibson Master Mix (NEB E2611)" } },
      { pos: "P5", labware: { zh: "50 µL 吸头架 ×2", en: "50 µL tip racks ×2" }, content: { zh: "低吸附滤芯吸头", en: "Low-retention filter tips" } },
    ],
    params: [
      { label: { zh: "片段 : 载体摩尔比", en: "Insert : vector molar ratio" }, value: "3 : 1" },
      { label: { zh: "载体用量", en: "Vector input" }, value: "50 ng" },
      { label: { zh: "反应总体积", en: "Reaction volume" }, value: "20 µL（Mix 10 µL）" },
      { label: { zh: "加样顺序", en: "Pipetting order" }, value: "Mix → Vector → Insert" },
      { label: { zh: "混匀", en: "Mixing" }, value: "Mix ×10 @ 50% speed" },
      { label: { zh: "保温", en: "Incubation" }, value: "50°C × 60 min（PCR 仪）" },
    ],
    steps: [
      { zh: "台面 4°C 预冷并完成自检", en: "Pre-chill deck to 4°C and run self-check" },
      { zh: "各孔分配 2× Gibson Master Mix 10 µL", en: "Dispense 10 µL 2× Gibson Master Mix per well" },
      { zh: "按 3:1 摩尔比计算并加入载体与片段", en: "Add vector and inserts at 3:1 molar ratio" },
      { zh: "低速吹打混匀 10 次，避免气泡", en: "Mix by gentle pipetting ×10, avoid bubbles" },
      { zh: "封膜，导出加样记录 CSV 并回写实", en: "Seal plate, export pipetting log CSV back to ELN" },
      { zh: "转移 PCR 仪：50°C × 60 min → 4°C 保持", en: "Transfer to cycler: 50°C × 60 min → 4°C hold" },
    ],
    tips: {
      zh: "NEB E2611 全程冰上操作；加样记录自动写入实验日志，体积误差 < 5%",
      en: "Keep NEB E2611 on ice throughout; pipetting log auto-written to ELN, volume error < 5%",
    },
  },
  e_biomek_colony: {
    key: "e_biomek_colony",
    vendor: "Beckman Coulter",
    model: "Biomek i7 Hybrid",
    software: "Biomek Software 5.1",
    methodFile: "Colony_Inoculation_96DW_v2.4.bmf",
    deckLayout: [
      { pos: "P1", labware: { zh: "96 深孔板（2.2 mL 方孔）", en: "96 deep-well plate (2.2 mL square)" }, content: { zh: "LB + Kan 50 µg/mL，1 mL/孔", en: "LB + Kan 50 µg/mL, 1 mL/well" } },
      { pos: "P2", labware: { zh: "源板位", en: "Source position" }, content: { zh: "转化平板（已挑单克隆）", en: "Transformation plates (picked colonies)" } },
      { pos: "P3", labware: { zh: "P1000 吸头盒", en: "P1000 tip box" }, content: { zh: "Span-8 用无菌吸头", en: "Sterile tips for Span-8" } },
      { pos: "P4", labware: { zh: "废弃位", en: "Waste position" }, content: { zh: "吸头废弃槽", en: "Tip waste chute" } },
    ],
    params: [
      { label: { zh: "培养基分液", en: "Media dispense" }, value: "1000 µL/well" },
      { label: { zh: "接种转移", en: "Inoculum transfer" }, value: "50 µL" },
      { label: { zh: "通道", en: "Channels" }, value: "Span-8（P1000）" },
      { label: { zh: "培养", en: "Culture" }, value: "37°C · 220 rpm × 16 h" },
      { label: { zh: "追溯", en: "Traceability" }, value: "Well-to-colony mapping" },
    ],
    steps: [
      { zh: "深孔板自动分液 LB + Kan 1 mL/孔", en: "Auto-dispense 1 mL/well LB + Kan into deep-well plate" },
      { zh: "人工挑取单克隆至对应孔位，扫码确认映射", en: "Pick single colonies into mapped wells, scan to confirm" },
      { zh: "透气封板膜封口", en: "Seal with breathable film" },
      { zh: "转移 37°C 摇床 220 rpm 培养 16 h", en: "Transfer to 37°C shaker, 220 rpm, 16 h" },
      { zh: "取样 2 µL 作为菌落 PCR 模板", en: "Sample 2 µL as colony-PCR template" },
    ],
    tips: {
      zh: "孔位-克隆映射表自动回写 LIMS，杜绝克隆错位",
      en: "Well-to-colony mapping auto-written to LIMS, eliminating clone misplacement",
    },
  },
  e_mgi_g400: {
    key: "e_mgi_g400",
    vendor: "MGI 华大智造",
    model: "DNBSEQ-G400",
    software: "DNBSEQ-G400RS Control · ZLIMS",
    methodFile: "RunConfig_G400_FCL_PE150.xml",
    deckLayout: [
      { pos: "Slot A", labware: { zh: "FCL 测序芯片", en: "FCL flow cell" }, content: { zh: "2 lane · PE150", en: "2 lanes · PE150" } },
      { pos: "Reagent", labware: { zh: "FCL PE150 测序试剂盒", en: "FCL PE150 sequencing kit" }, content: { zh: "DNBSEQ-G400RS 高通量试剂套装", en: "DNBSEQ-G400RS high-throughput reagent set" } },
      { pos: "Sample", labware: { zh: "DNB 文库管", en: "DNB library tube" }, content: { zh: "扩增子双 barcode 环化文库，8 克隆混样", en: "Dual-barcoded circularized amplicon library, 8 clones pooled" } },
    ],
    params: [
      { label: { zh: "读长", en: "Read length" }, value: "PE150" },
      { label: { zh: "数据量", en: "Output" }, value: "≥1 Gb / sample" },
      { label: { zh: "Q30", en: "Q30" }, value: "≥85%" },
      { label: { zh: "拆分", en: "Demultiplexing" }, value: "Dual-barcode exact match" },
      { label: { zh: "运行时长", en: "Run time" }, value: "≈36 h" },
    ],
    steps: [
      { zh: "扩增子加接头与双 barcode（MGIEasy UDB）", en: "Ligate adapters & dual barcodes (MGIEasy UDB)" },
      { zh: "单链环化制备 ssCir DNA", en: "Circularize to ssCir DNA" },
      { zh: "DNB 制备与自动加载", en: "DNB preparation and auto-loading" },
      { zh: "上机 PE150 测序（2 lane FCL）", en: "Sequence PE150 on FCL flow cell" },
      { zh: "basecall 与 barcode 拆分，FASTQ 自动归档", en: "Basecall & demultiplex, auto-archive FASTQ" },
    ],
    tips: {
      zh: "8 克隆混样单 lane 即可；Q30 与拆分率自动写入测序报告",
      en: "8 clones fit in a single lane; Q30 & demux rate auto-written to run report",
    },
  },
  e_ont_minion: {
    key: "e_ont_minion",
    vendor: "Oxford Nanopore",
    model: "MinION Mk1B",
    software: "MinKNOW 24.06 · Dorado SUP v5",
    methodFile: "SQK-NBD114.24 Native Barcode · FLO-MIN114",
    deckLayout: [
      { pos: "Flow cell", labware: { zh: "FLO-MIN114（R10.4.1）", en: "FLO-MIN114 (R10.4.1)" }, content: { zh: "可用孔 ≥800", en: "≥800 available pores" } },
      { pos: "Library", labware: { zh: "Native barcode 连接文库", en: "Native-barcoded ligation library" }, content: { zh: "8 质粒等摩尔混样", en: "8 plasmids, equimolar pool" } },
      { pos: "Buffer", labware: { zh: "Flow Cell Priming Kit (EXP-FLP002)", en: "Flow Cell Priming Kit (EXP-FLP002)" }, content: { zh: "priming ×2 次", en: "Prime ×2" } },
    ],
    params: [
      { label: { zh: "运行时长", en: "Run time" }, value: "12 h (early stop OK)" },
      { label: { zh: "碱基识别", en: "Basecalling" }, value: "Dorado SUP v5" },
      { label: { zh: "读长", en: "Read length" }, value: "N50 > 5 kb (spans plasmid)" },
      { label: { zh: "混样", en: "Multiplex" }, value: "8 native barcodes" },
      { label: { zh: "产出", en: "Output" }, value: "≈2–5 Gb" },
    ],
    steps: [
      { zh: "质粒定量并等摩尔混样（200 fmol/样本）", en: "Quantify plasmids and pool equimolar (200 fmol/sample)" },
      { zh: "末端修复 + native barcode 连接", en: "End-prep + native barcode ligation" },
      { zh: "测序接头连接，磁珠纯化", en: "Adapter ligation, bead cleanup" },
      { zh: "芯片 priming 后上样 50 fmol", en: "Prime flow cell, load 50 fmol" },
      { zh: "MinKNOW 运行 12 h，Dorado SUP 实时碱基识别", en: "Run 12 h in MinKNOW with live Dorado SUP basecalling" },
      { zh: "全长一致性序列与参考比对", en: "Align full-length consensus to reference" },
    ],
    tips: {
      zh: "全长读长直接跨越载体重复元件，无需短读长拼接",
      en: "Full-length reads span vector repeats directly — no short-read assembly needed",
    },
  },
  /* ── 全自动分子克隆岛：机械臂串联的物料流转设备 ── */
  e_robot_pf400: {
    key: "e_robot_pf400",
    vendor: "Precise Automation",
    model: "PreciseFlex 400",
    software: "Guidance Motion Control · Cellario",
    methodFile: "Workcell_Transfer_v2.3.tpl",
    deckLayout: [
      { pos: "A1", labware: { zh: "StoreX 出库口", en: "StoreX output gate" }, content: { zh: "耗材 / 试剂板取板点", en: "Consumable/reagent plate pickup" } },
      { pos: "A2", labware: { zh: "STAR V 左栈位", en: "STAR V left stack" }, content: { zh: "PCR 体系板交接位", en: "PCR plate handoff" } },
      { pos: "A3", labware: { zh: "TRobot 托盘", en: "TRobot tray" }, content: { zh: "热循环仪进出板位", en: "Thermocycler load/unload" } },
      { pos: "A4", labware: { zh: "VANTAGE 右栈位", en: "VANTAGE right stack" }, content: { zh: "组装体系板交接位", en: "Assembly plate handoff" } },
      { pos: "A5", labware: { zh: "Cytomat 闸门", en: "Cytomat gate" }, content: { zh: "平板出入孵箱位", en: "Plate in/out of incubator" } },
      { pos: "A6", labware: { zh: "Biomek i7 栈位", en: "Biomek i7 stack" }, content: { zh: "深孔板交接位", en: "Deep-well plate handoff" } },
      { pos: "A7", labware: { zh: "Kühner 夹持位", en: "Kühner clamp position" }, content: { zh: "摇床板夹交接位", en: "Shaker clamp handoff" } },
      { pos: "A8", labware: { zh: "中转台（G400 旁）", en: "Staging table (by G400)" }, content: { zh: "测序上机前暂存位", en: "Pre-sequencing staging" } },
    ],
    params: [
      { label: { zh: "夹持力", en: "Grip force" }, value: "35 N (servo gripper)" },
      { label: { zh: "运行速度", en: "Speed" }, value: "60% (~750 mm/s)" },
      { label: { zh: "重复定位精度", en: "Repeatability" }, value: "±0.02 mm" },
      { label: { zh: "Z 轴行程", en: "Z travel" }, value: "500 mm" },
      { label: { zh: "手指行程", en: "Finger stroke" }, value: "100 mm (SBS plate)" },
      { label: { zh: "联锁", en: "Interlock" }, value: "Cellario scheduler handshake" },
    ],
    steps: [
      { zh: "接收调度系统转运任务（源位 → 目标位）", en: "Receive transfer job from scheduler (source → destination)" },
      { zh: "MoveJ 至取板示教点，下降至板位高度", en: "MoveJ to pickup teach point, descend to plate height" },
      { zh: "夹爪伺服闭合（35 N），夹持确认", en: "Servo gripper close (35 N), grip confirmed" },
      { zh: "抬板并沿安全路径 MoveL 至目标位", en: "Lift plate, MoveL along safe path to destination" },
      { zh: "下放、释放、回零，回传完成信号", en: "Place, release, home, send completion signal" },
    ],
    tips: {
      zh: "所有仪器上下料均经机械臂示教点交接；急停回路与安全门联锁，断点续运由 Cellario 恢复",
      en: "All instrument loading/unloading goes through arm teach points; E-stop loop interlocked with safety doors, resume handled by Cellario",
    },
  },
  e_hamilton_pcrsetup: {
    key: "e_hamilton_pcrsetup",
    vendor: "Hamilton",
    model: "Microlab STAR V",
    software: "VENUS 6.1 · cooling carriers",
    methodFile: "PCR_Setup_KAPA_HiFi_v2.1.med",
    deckLayout: [
      { pos: "P1", labware: { zh: "制冷试剂槽", en: "Cooled reagent trough" }, content: { zh: "KAPA HiFi 2× MasterMix", en: "KAPA HiFi 2× MasterMix" } },
      { pos: "P2", labware: { zh: "96 孔引物板（10 µM）", en: "96-well primer plate (10 µM)" }, content: { zh: "VH / VL 特异性引物对", en: "VH/VL specific primer pairs" } },
      { pos: "P3", labware: { zh: "模板板", en: "Template plate" }, content: { zh: "cDNA / 载体模板 1 ng/µL", en: "cDNA/vector template, 1 ng/µL" } },
      { pos: "P4", labware: { zh: "96 孔 PCR 板（目标）", en: "96-well PCR plate (destination)" }, content: { zh: "50 µL 反应体系", en: "50 µL reactions" } },
      { pos: "P5", labware: { zh: "50 µL 吸头架 ×3", en: "50 µL tip racks ×3" }, content: { zh: "CO-RE II 滤芯吸头", en: "CO-RE II filter tips" } },
      { pos: "P6", labware: { zh: "台面封膜机位", en: "On-deck sealer position" }, content: { zh: "光学封板膜", en: "Optical sealing film" } },
    ],
    params: [
      { label: { zh: "反应体积", en: "Reaction volume" }, value: "50 µL" },
      { label: { zh: "MasterMix", en: "MasterMix" }, value: "KAPA HiFi 2× · 25 µL" },
      { label: { zh: "引物终浓度", en: "Primer final conc." }, value: "0.3 µM each" },
      { label: { zh: "模板量", en: "Template input" }, value: "1 ng" },
      { label: { zh: "通道模式", en: "Channels" }, value: "8-ch independent" },
      { label: { zh: "台面温控", en: "Deck cooling" }, value: "4 °C carrier" },
    ],
    steps: [
      { zh: "Deck Scan 与吸头 / 试剂自检", en: "Deck scan, tip & reagent check" },
      { zh: "分装 MasterMix 25 µL/孔", en: "Dispense 25 µL MasterMix per well" },
      { zh: "按孔位表加入引物对与模板", en: "Add primer pairs and templates per worklist" },
      { zh: "吹打混匀 ×8，台面封膜", en: "Mix ×8, seal plate on deck" },
      { zh: "机械臂取板送往 TRobot", en: "Arm transfers plate to TRobot" },
    ],
    tips: {
      zh: "全程 4 °C 制冷载台保酶活；封膜后由机械臂 A2→A3 转运，无需人工干预",
      en: "4 °C carriers preserve enzyme activity; after sealing the arm transfers A2→A3 with no manual step",
    },
  },
  e_trobot: {
    key: "e_trobot",
    vendor: "Analytik Jena",
    model: "Biometra TRobot II 96",
    software: "Biometra TSuite 2.0 · motorized lid",
    methodFile: "PCR_VHVL_KAPA_HiFi_v1.2.prog",
    deckLayout: [
      { pos: "T1", labware: { zh: "96 孔加热模块托盘", en: "96-well block tray" }, content: { zh: "机械臂自动进出板", en: "Robotic plate load/unload" } },
      { pos: "T2", labware: { zh: "电动热盖", en: "Motorized heated lid" }, content: { zh: "105 °C 自动压盖", en: "105 °C auto lid pressure" } },
    ],
    params: [
      { label: { zh: "预变性", en: "Initial denaturation" }, value: "95 °C · 3 min" },
      { label: { zh: "循环", en: "Cycling" }, value: "98 °C 20 s / 60 °C 15 s / 72 °C 60 s ×30" },
      { label: { zh: "终延伸", en: "Final extension" }, value: "72 °C · 5 min" },
      { label: { zh: "升降温速率", en: "Ramp rate" }, value: "4 °C/s" },
      { label: { zh: "热盖", en: "Heated lid" }, value: "105 °C" },
    ],
    steps: [
      { zh: "托盘伸出，机械臂放板后收回", en: "Tray extends, arm places plate, tray retracts" },
      { zh: "电动热盖下压锁定", en: "Motorized lid closes and locks" },
      { zh: "按程序执行 30 循环扩增", en: "Run 30-cycle amplification program" },
      { zh: "4 °C 保持，托盘伸出等待取板", en: "Hold at 4 °C, tray extends for pickup" },
      { zh: "运行日志回传 LIMS（曲线 / 状态）", en: "Run log written back to LIMS (trace/status)" },
    ],
    tips: {
      zh: "TRobot II 专为机械臂直连设计：电动托盘 + 热盖全自动，无需人工开关盖",
      en: "TRobot II is built for direct robotic integration: motorized tray and lid require no manual handling",
    },
  },
  e_hamilton_transform: {
    key: "e_hamilton_transform",
    vendor: "Hamilton",
    model: "Microlab STAR V",
    software: "VENUS 6.1 · INHECO heat-shock block",
    methodFile: "HeatShock_Plating_Auto_v1.5.med",
    deckLayout: [
      { pos: "P1", labware: { zh: "制冷管架（0 °C）", en: "Cooling tube rack (0 °C)" }, content: { zh: "DH5α 感受态 50 µL/管", en: "DH5α competent cells, 50 µL/tube" } },
      { pos: "P2", labware: { zh: "Gibson 产物板", en: "Gibson product plate" }, content: { zh: "组装产物 2 µL/转化", en: "Assembly products, 2 µL/transformation" } },
      { pos: "P3", labware: { zh: "INHECO 热激模块", en: "INHECO heat-shock block" }, content: { zh: "42 °C 精确热激位", en: "42 °C precise heat-shock position" } },
      { pos: "P4", labware: { zh: "试剂槽", en: "Reagent trough" }, content: { zh: "SOC 复苏培养基", en: "SOC recovery medium" } },
      { pos: "P5", labware: { zh: "LB + Kan 平板栈 ×4", en: "LB + Kan agar plate stack ×4" }, content: { zh: "50 µg/mL Kan 平板", en: "50 µg/mL Kan plates" } },
      { pos: "P6", labware: { zh: "玻璃珠盒（无菌 3 mm）", en: "Glass bead dispenser (sterile, 3 mm)" }, content: { zh: "自动涂布珠 ×5/板", en: "Auto-plating beads ×5/plate" } },
      { pos: "P7", labware: { zh: "1000 µL 吸头架 ×2", en: "1000 µL tip racks ×2" }, content: { zh: "CO-RE II 滤芯吸头", en: "CO-RE II filter tips" } },
    ],
    params: [
      { label: { zh: "热激", en: "Heat shock" }, value: "42 °C · 45 s" },
      { label: { zh: "冰浴", en: "Ice incubation" }, value: "2 min (0 °C carrier)" },
      { label: { zh: "SOC 复苏", en: "SOC recovery" }, value: "200 µL · 37 °C · 45 min (on-deck shaker)" },
      { label: { zh: "涂布量", en: "Plating volume" }, value: "100 µL/plate" },
      { label: { zh: "涂布方式", en: "Spreading" }, value: "Glass beads ×5, shake 30 s" },
    ],
    steps: [
      { zh: "感受态分装至冷板，加入 2 µL Gibson 产物", en: "Aliquot competent cells, add 2 µL Gibson product" },
      { zh: "冰浴 2 min → INHECO 42 °C 热激 45 s → 冰浴 2 min", en: "Ice 2 min → INHECO 42 °C 45 s → ice 2 min" },
      { zh: "加 SOC 200 µL，台面摇床 37 °C 复苏 45 min", en: "Add 200 µL SOC, recover on deck shaker 37 °C 45 min" },
      { zh: "取 100 µL 点至 Kan 平板，投玻璃珠震荡涂布", en: "Spot 100 µL onto Kan plate, add beads, shake to spread" },
      { zh: "倒珠后由机械臂 A2→A5 送入 Cytomat", en: "Decant beads; arm transfers plates A2→A5 to Cytomat" },
    ],
    tips: {
      zh: "热激温度均一性 ±0.3 °C（INHECO 校准）；玻璃珠涂布替代手工涂布棒，板间一致性 CV < 8%",
      en: "Heat-shock uniformity ±0.3 °C (INHECO calibrated); bead spreading replaces manual spreaders, plate-to-plate CV < 8%",
    },
  },
  e_cytomat: {
    key: "e_cytomat",
    vendor: "Thermo Scientific",
    model: "Cytomat 2 C-LIN",
    software: "Cytomat Control · Momentum",
    methodFile: "Plate_Incubation_37C_16h.cfg",
    deckLayout: [
      { pos: "C1", labware: { zh: "闸门（机械臂对接口）", en: "Gate (robot interface)" }, content: { zh: "平板自动进出", en: "Automated plate in/out" } },
      { pos: "C2", labware: { zh: "内部板架 42 位", en: "Internal rack, 42 positions" }, content: { zh: "LB + Kan 平板倒置培养", en: "LB + Kan plates, inverted" } },
    ],
    params: [
      { label: { zh: "温度", en: "Temperature" }, value: "37 °C ± 0.5" },
      { label: { zh: "湿度", en: "Humidity" }, value: "95% rH (water reservoir)" },
      { label: { zh: "培养时长", en: "Duration" }, value: "16 h" },
      { label: { zh: "容量", en: "Capacity" }, value: "42 plates" },
      { label: { zh: "闸门开闭", en: "Gate cycle" }, value: "< 10 s" },
    ],
    steps: [
      { zh: "闸门开启，机械臂放板至指定架位", en: "Gate opens, arm places plate at assigned position" },
      { zh: "架位占用状态回写调度系统", en: "Rack occupancy written back to scheduler" },
      { zh: "37 °C / 95% rH 培养 16 h", en: "Incubate 16 h at 37 °C / 95% rH" },
      { zh: "到期后调度系统派单，机械臂取板送往 Biomek i7", en: "On timer expiry, scheduler dispatches arm to move plate to Biomek i7" },
    ],
    tips: {
      zh: "平板倒置放置防冷凝水滴落；门禁与机械臂互锁，开闸期间培养腔扰动 < 0.2 °C",
      en: "Plates inverted to prevent condensation drip; gate interlocked with arm, chamber disturbance < 0.2 °C during transfer",
    },
  },
  e_kuhner: {
    key: "e_kuhner",
    vendor: "Adolf Kühner",
    model: "LT-X (ISF1-X cabinet)",
    software: "Kühner EQCloud · OPC-UA",
    methodFile: "Shake_96DW_37C_220rpm.cfg",
    deckLayout: [
      { pos: "K1", labware: { zh: "板夹持位 ×4", en: "Plate clamps ×4" }, content: { zh: "96 深孔板（透气封膜）", en: "96 deep-well plates (breathable film)" } },
    ],
    params: [
      { label: { zh: "温度", en: "Temperature" }, value: "37 °C ± 0.3" },
      { label: { zh: "转速 / 振幅", en: "Speed / throw" }, value: "220 rpm / 25 mm" },
      { label: { zh: "培养时长", en: "Duration" }, value: "14–16 h" },
      { label: { zh: "通气", en: "Aeration" }, value: "Breathable seal, humidity 80%" },
    ],
    steps: [
      { zh: "夹持位解锁，机械臂放入深孔板", en: "Clamps unlock, arm loads deep-well plate" },
      { zh: "夹具锁紧确认（扭矩反馈）", en: "Clamp lock confirmed (torque feedback)" },
      { zh: "37 °C / 220 rpm 振荡培养 14–16 h", en: "Shake 14–16 h at 37 °C / 220 rpm" },
      { zh: "OPC-UA 状态回传，到期解锁待取", en: "Status via OPC-UA; unlock for pickup when done" },
    ],
    tips: {
      zh: "透气封膜保证溶氧；板夹扭矩不足会触发报警并暂停下游机械臂任务",
      en: "Breathable seals ensure oxygenation; insufficient clamp torque raises an alarm and pauses downstream arm jobs",
    },
  },
  e_hamilton_miniprep: {
    key: "e_hamilton_miniprep",
    vendor: "Hamilton",
    model: "Microlab STAR V",
    software: "VENUS 6.1 · NucleoVac 96 manifold",
    methodFile: "Miniprep_NucleoSpin96_v2.0.med",
    deckLayout: [
      { pos: "P1", labware: { zh: "96 深孔板（菌液）", en: "96 deep-well plate (cultures)" }, content: { zh: "1 mL/孔 过夜菌液", en: "1 mL/well overnight cultures" } },
      { pos: "P2", labware: { zh: "NucleoVac 96 真空歧管", en: "NucleoVac 96 vacuum manifold" }, content: { zh: "NucleoSpin 96 结合板", en: "NucleoSpin 96 binding plate" } },
      { pos: "P3", labware: { zh: "试剂槽 ×3", en: "Reagent troughs ×3" }, content: { zh: "Buffer A1 / A2 / A3（裂解体系）", en: "Buffer A1/A2/A3 (lysis set)" } },
      { pos: "P4", labware: { zh: "试剂槽 ×2", en: "Reagent troughs ×2" }, content: { zh: "Buffer AW / A4（漂洗）", en: "Buffer AW/A4 (washes)" } },
      { pos: "P5", labware: { zh: "试剂槽", en: "Reagent trough" }, content: { zh: "Buffer AE 洗脱液", en: "Buffer AE eluent" } },
      { pos: "P6", labware: { zh: "96 孔收集板（半裙边）", en: "96-well collection plate" }, content: { zh: "洗脱质粒 100 µL/孔", en: "Eluted plasmids, 100 µL/well" } },
      { pos: "P7", labware: { zh: "1000 µL 吸头架 ×4", en: "1000 µL tip racks ×4" }, content: { zh: "CO-RE II 滤芯吸头", en: "CO-RE II filter tips" } },
    ],
    params: [
      { label: { zh: "菌液量", en: "Culture input" }, value: "1 mL/well" },
      { label: { zh: "裂解", en: "Lysis" }, value: "A1/A2/A3 · 200/200/300 µL" },
      { label: { zh: "真空度", en: "Vacuum" }, value: "-600 mbar" },
      { label: { zh: "漂洗", en: "Washes" }, value: "AW 500 µL + A4 600 µL" },
      { label: { zh: "洗脱", en: "Elution" }, value: "100 µL AE · 60 °C" },
    ],
    steps: [
      { zh: "菌液板离心沉降（台面离心模块 4000×g 10 min）", en: "Pellet cells (on-deck centrifuge module, 4000×g 10 min)" },
      { zh: "弃上清，A1 重悬 / A2 裂解 / A3 中和", en: "Decant, resuspend A1 / lyse A2 / neutralize A3" },
      { zh: "真空过板结合，AW / A4 漂洗", en: "Vacuum-bind on plate, wash AW / A4" },
      { zh: "60 °C AE 100 µL 洗脱至收集板", en: "Elute in 100 µL AE at 60 °C into collection plate" },
      { zh: "浓度测定回写 LIMS，板送中转台待测序", en: "Quantify, write back to LIMS; plate staged for sequencing" },
    ],
    tips: {
      zh: "真空歧管压力曲线全程记录，堵孔自动标记该孔并重试一次",
      en: "Manifold pressure curves logged; clogged wells auto-flagged and retried once",
    },
  },
  e_liconic: {
    key: "e_liconic",
    vendor: "LiCONiC",
    model: "StoreX STX44-IC",
    software: "StoreX Control · Cellario",
    methodFile: "StoreX_Retrieval_Consumables.cfg",
    deckLayout: [
      { pos: "S1", labware: { zh: "出入库闸门", en: "Transfer gate" }, content: { zh: "机械臂 A1 对接位", en: "Arm A1 docking position" } },
      { pos: "S2", labware: { zh: "内部板架 44 位", en: "Internal rack, 44 positions" }, content: { zh: "PCR 板 / 深孔板 / 吸头 / 试剂板", en: "PCR plates / DW plates / tips / reagent plates" } },
    ],
    params: [
      { label: { zh: "库温", en: "Storage temp" }, value: "4 °C ± 1 (reagents)" },
      { label: { zh: "容量", en: "Capacity" }, value: "44 SBS plates" },
      { label: { zh: "出库时间", en: "Retrieval time" }, value: "< 20 s/plate" },
      { label: { zh: "库存管理", en: "Inventory" }, value: "Barcode scan on entry" },
    ],
    steps: [
      { zh: "调度系统按工单下发耗材清单", en: "Scheduler issues consumable pick list per work order" },
      { zh: "板库按序出库至闸门，条码复核", en: "Plates retrieved to gate in sequence, barcode verified" },
      { zh: "机械臂 A1 取板送往 STAR V 台面", en: "Arm picks at A1 and delivers to STAR V deck" },
      { zh: "出库记录回写 LIMS 库存", en: "Retrieval logged back to LIMS inventory" },
    ],
    tips: {
      zh: "酶 / 感受态等冷敏试剂板 4 °C 存放，出库到上机 < 15 min，超时自动报警",
      en: "Cold-sensitive plates (enzymes, competent cells) stored at 4 °C; gate-to-deck < 15 min or an alarm fires",
    },
  },
};

// ─── 时间控制节点参数 ───

export const TIMER_UNITS: Record<string, string> = { min: "分钟", h: "小时", d: "天" };

/** 节点卡片上的参数摘要（设备取前两项，时间节点显示等待/定点信息）；t 为可选翻译函数（以中文原文为 key） */
export function nodeParamSummary(
  nodeType: FlowNodeType,
  templateKey: string | null | undefined,
  params: NodeParams | null | undefined,
  t?: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const tr = (key: string, vars?: Record<string, string | number>) => (t ? t(key, vars) : key);
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
  if (nodeType === "equipment" && templateKey && INSTRUMENT_PROFILES[templateKey]) {
    const p = INSTRUMENT_PROFILES[templateKey];
    return `${p.vendor} ${p.model} · ${p.methodFile}`;
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
      { key: "n2", type: "manual", templateKey: "a_auto_cloning", label: "分子克隆（表达骨架构建）", owner: "陈研究员", x: 320, y: 180 },
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

/* ------------------------------------------------------------------ */
/* 子流程（Sub-flow）模板：父节点 templateKey → 物理执行层子 DAG          */
/* 大流程只呈现关键里程碑，选中节点即可穿透到实验操作级细节。            */
/* ------------------------------------------------------------------ */
export interface SubflowTemplate {
  key: string;
  name: string;
  description: string;
  nodes: WorkflowTemplateNode[];
  edges: WorkflowTemplateEdge[];
}

export const SUBFLOW_TEMPLATES: Record<string, SubflowTemplate> = {
  // 「抗体基因分子克隆」节点的物理执行层：片段 PCR → 定量 → 连接 → 转化 → 涂布 → 培养 → 挑菌 → 测序 → 培养 → 质粒抽提
  m_ab_cloning: {
    key: "sf_molecular_cloning",
    name: "分子克隆物理执行流程",
    description: "VH / VL 片段从 PCR 到阳性克隆质粒的完整湿实验操作流",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_pcr", label: "片段 PCR（VH / VL）", owner: "王工", config: "高保真酶，退火 60°C × 30 循环", x: 0, y: 0 },
      { key: "n2", type: "manual", templateKey: "m_gel", label: "凝胶电泳质检", owner: "王工", config: "1% 琼脂糖，确认片段大小", x: 300, y: 0 },
      { key: "n3", type: "equipment", templateKey: "e_hamilton_cleanup", label: "PCR 产物纯化定量（Hamilton STAR V）", owner: "王工", x: 600, y: 0 },
      { key: "n4", type: "equipment", templateKey: "e_hamilton_gibson", label: "Gibson 连接体系构建（VANTAGE）", owner: "王工", config: "50°C 等温组装 60 min", x: 900, y: 0 },
      { key: "n5", type: "manual", templateKey: "m_transform", label: "感受态转化（DH5α）", owner: "李工", config: "热激 42°C 45 s", x: 1200, y: 0 },
      { key: "n6", type: "manual", label: "涂布平板（Kan+）", owner: "李工", x: 1500, y: 0 },
      { key: "n7", type: "equipment", templateKey: "e_incubate", label: "平板培养（37°C，16 h）", owner: "李工", x: 1800, y: 0 },
      { key: "n8", type: "equipment", templateKey: "e_biomek_colony", label: "挑菌接种 96 深孔板（Biomek i7）", owner: "李工", x: 1800, y: 260 },
      { key: "n9", type: "equipment", templateKey: "e_mgi_g400", label: "插入片段扩增子测序（MGI G400）", owner: "张工", x: 1500, y: 260 },
      { key: "n10", type: "data", templateKey: "p_seq_align", label: "序列比对分析", owner: "张工", x: 1200, y: 260 },
      { key: "n11", type: "decision", templateKey: "d_seq_match", label: "测序正确？", x: 900, y: 250 },
      { key: "n12", type: "equipment", templateKey: "e_incubate", label: "摇菌培养（37°C，220 rpm）", owner: "李工", x: 600, y: 260 },
      { key: "n13", type: "manual", templateKey: "m_plasmid_prep", label: "质粒抽提（Miniprep）", owner: "李工", x: 300, y: 260 },
      { key: "n16", type: "equipment", templateKey: "e_ont_minion", label: "质粒全长验证测序（ONT MinION）", owner: "张工", x: 150, y: 440 },
      { key: "n14", type: "data", templateKey: "p_archive", label: "阳性克隆归档", owner: "张工", x: 0, y: 260 },
      { key: "n15", type: "manual", label: "失败排查 · 重新挑菌", owner: "李工", config: "检查连接效率 / 感受态效率，扩大挑菌数量", x: 900, y: 500 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7" },
      { from: "n7", to: "n8" },
      { from: "n8", to: "n9" },
      { from: "n9", to: "n10" },
      { from: "n10", to: "n11" },
      { from: "n11", to: "n12", sourceHandle: "yes", label: "是" },
      { from: "n11", to: "n15", sourceHandle: "no", label: "否" },
      { from: "n12", to: "n13" },
      { from: "n13", to: "n16" },
      { from: "n16", to: "n14" },
    ],
  },
  // 「全自动分子克隆」节点的无人值守执行层：所有仪器间物料流转均由 PreciseFlex 400 机械臂完成
  a_auto_cloning: {
    key: "sf_auto_cloning",
    name: "全自动分子克隆（机械臂串联）",
    description: "无人值守分子克隆岛：板库出库 → PCR → 纯化 → 组装 → 转化涂布 → 培养 → 挑菌 → 摇菌 → 小提 → 测序，仪器间物料全部由机械臂转运",
    nodes: [
      { key: "n1", type: "equipment", templateKey: "e_liconic", label: "耗材 / 试剂板出库（StoreX 板库）", owner: "张工", x: 0, y: 0 },
      { key: "n2", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：StoreX → STAR V", owner: "张工", config: "示教点 A1 → A2", x: 300, y: 0 },
      { key: "n3", type: "equipment", templateKey: "e_hamilton_pcrsetup", label: "PCR 体系构建（Hamilton STAR V）", owner: "王工", config: "KAPA HiFi 50 µL 体系 ×96", x: 600, y: 0 },
      { key: "n4", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：STAR V → TRobot", owner: "张工", config: "示教点 A2 → A3", x: 900, y: 0 },
      { key: "n5", type: "equipment", templateKey: "e_trobot", label: "PCR 扩增（Biometra TRobot II）", owner: "王工", config: "98/60/72 °C ×30 循环", x: 1200, y: 0 },
      { key: "n6", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：TRobot → STAR V", owner: "张工", config: "示教点 A3 → A2", x: 1500, y: 0 },
      { key: "n7", type: "equipment", templateKey: "e_hamilton_cleanup", label: "AMPure 纯化定量（STAR V）", owner: "王工", config: "1.8× 磁珠，Qubit 定量回写", x: 1800, y: 0 },
      { key: "n8", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：STAR V → VANTAGE", owner: "张工", config: "示教点 A2 → A4", x: 1800, y: 240 },
      { key: "n9", type: "equipment", templateKey: "e_hamilton_gibson", label: "Gibson 组装 + 50 °C 孵育（VANTAGE）", owner: "王工", config: "20 µL 体系，50 °C × 60 min", x: 1500, y: 240 },
      { key: "n10", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：VANTAGE → STAR V", owner: "张工", config: "示教点 A4 → A2", x: 1200, y: 240 },
      { key: "n11", type: "equipment", templateKey: "e_hamilton_transform", label: "自动化热激转化 + 涂布（STAR V）", owner: "李工", config: "42 °C 45 s 热激，玻璃珠涂布 Kan 平板", x: 900, y: 240 },
      { key: "n12", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：STAR V → Cytomat", owner: "张工", config: "示教点 A2 → A5", x: 600, y: 240 },
      { key: "n13", type: "equipment", templateKey: "e_cytomat", label: "平板培养 37 °C × 16 h（Cytomat）", owner: "李工", x: 300, y: 240 },
      { key: "n14", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：Cytomat → Biomek i7", owner: "张工", config: "示教点 A5 → A6", x: 0, y: 240 },
      { key: "n15", type: "equipment", templateKey: "e_biomek_colony", label: "挑菌接种 96 深孔板（Biomek i7）", owner: "李工", config: "LB + Kan 50 µg/mL，1 mL/孔", x: 0, y: 480 },
      { key: "n16", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：Biomek → Kühner", owner: "张工", config: "示教点 A6 → A7", x: 300, y: 480 },
      { key: "n17", type: "equipment", templateKey: "e_kuhner", label: "摇菌培养 37 °C 220 rpm（Kühner LT-X）", owner: "李工", config: "14–16 h，透气封膜", x: 600, y: 480 },
      { key: "n18", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：Kühner → STAR V", owner: "张工", config: "示教点 A7 → A2", x: 900, y: 480 },
      { key: "n19", type: "equipment", templateKey: "e_hamilton_miniprep", label: "质粒小提 96 通道（STAR V）", owner: "李工", config: "NucleoSpin 96，真空 -600 mbar", x: 1200, y: 480 },
      { key: "n20", type: "equipment", templateKey: "e_robot_pf400", label: "机械臂转运：STAR V → 中转台", owner: "张工", config: "示教点 A2 → A8", x: 1500, y: 480 },
      { key: "n21", type: "equipment", templateKey: "e_mgi_g400", label: "质粒扩增子测序（MGI G400）", owner: "张工", config: "PE150，≥1 Gb/样本", x: 1800, y: 480 },
      { key: "n22", type: "data", templateKey: "p_seq_align", label: "序列比对分析（自动回传）", owner: "张工", x: 1500, y: 720 },
      { key: "n23", type: "decision", templateKey: "d_seq_match", label: "测序正确？", x: 1200, y: 710 },
      { key: "n24", type: "data", templateKey: "p_archive", label: "阳性克隆归档", owner: "张工", x: 900, y: 720 },
      { key: "n25", type: "manual", label: "异常工单：扩大挑菌重跑", owner: "李工", config: "调度系统自动开单，复检连接 / 转化效率", x: 1200, y: 890 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
      { from: "n4", to: "n5" },
      { from: "n5", to: "n6" },
      { from: "n6", to: "n7" },
      { from: "n7", to: "n8" },
      { from: "n8", to: "n9" },
      { from: "n9", to: "n10" },
      { from: "n10", to: "n11" },
      { from: "n11", to: "n12" },
      { from: "n12", to: "n13" },
      { from: "n13", to: "n14" },
      { from: "n14", to: "n15" },
      { from: "n15", to: "n16" },
      { from: "n16", to: "n17" },
      { from: "n17", to: "n18" },
      { from: "n18", to: "n19" },
      { from: "n19", to: "n20" },
      { from: "n20", to: "n21" },
      { from: "n21", to: "n22" },
      { from: "n22", to: "n23" },
      { from: "n23", to: "n24", sourceHandle: "yes", label: "是" },
      { from: "n23", to: "n25", sourceHandle: "no", label: "否" },
    ],
  },
};
