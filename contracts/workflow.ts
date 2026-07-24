// 业务流 DAG 共享契约：节点类型、节点调色板（预存节点组）、预置业务流模板
// 前后端共用（前端编辑器 / 后端模板实例化与校验）

export type FlowNodeType = "manual" | "equipment" | "decision" | "data";

export const FLOW_NODE_TYPES: Record<
  FlowNodeType,
  { label: string; color: string; bg: string; description: string }
> = {
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
      { key: "p_stats", type: "data", label: "统计分析", description: "重复间统计检验" },
      { key: "p_archive", type: "data", label: "数据归档", description: "原始数据与报告归档入库" },
    ],
  },
];

// ─── 预置业务流模板 ───

export interface WorkflowTemplateNode {
  key: string;
  type: FlowNodeType;
  templateKey?: string;
  label: string;
  owner?: string;
  config?: string;
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
  nodes: WorkflowTemplateNode[];
  edges: WorkflowTemplateEdge[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "crispr_strain",
    name: "CRISPR 菌株编辑业务流",
    description: "从 gRNA 设计到编辑效率分析的标准菌株构建流程，含阳性筛选与测序确认分支",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_primer_design", label: "gRNA 设计", owner: "王工", x: 60, y: 180 },
      { key: "n2", type: "manual", templateKey: "m_gibson", label: "编辑质粒构建", owner: "王工", x: 300, y: 180 },
      { key: "n3", type: "manual", templateKey: "m_transform", label: "转化与涂板", owner: "陈研究员", x: 540, y: 180 },
      { key: "n4", type: "decision", templateKey: "d_clone_pos", label: "克隆是否阳性？", x: 800, y: 170 },
      { key: "n5", type: "manual", templateKey: "m_pick_clone", label: "扩大培养与保种", owner: "陈研究员", x: 1060, y: 80 },
      { key: "n6", type: "equipment", templateKey: "e_seq", label: "Sanger 测序", owner: "张工", x: 1300, y: 80 },
      { key: "n7", type: "decision", templateKey: "d_seq_match", label: "测序是否匹配？", x: 1560, y: 70 },
      { key: "n8", type: "data", templateKey: "p_activity_calc", label: "编辑效率分析", owner: "王工", x: 1820, y: 80 },
      { key: "n9", type: "data", templateKey: "p_archive", label: "数据归档", owner: "王工", x: 2060, y: 80 },
      { key: "n10", type: "manual", templateKey: "m_primer_design", label: "重新设计 gRNA", owner: "王工", x: 1060, y: 300 },
      { key: "n11", type: "manual", templateKey: "m_transform", label: "优化条件重做转化", owner: "陈研究员", x: 1560, y: 280 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
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
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_cell_prep", label: "效应 T 细胞制备", owner: "赵工", x: 60, y: 180 },
      { key: "n2", type: "equipment", templateKey: "e_liquid", label: "自动化铺板（效靶比梯度）", owner: "赵工", x: 320, y: 180 },
      { key: "n3", type: "equipment", templateKey: "e_incubate", label: "岛台共孵育", owner: "赵工", x: 600, y: 180 },
      { key: "n4", type: "manual", templateKey: "m_stain", label: "流式抗体染色", owner: "陈研究员", x: 860, y: 180 },
      { key: "n5", type: "equipment", templateKey: "e_flow", label: "流式细胞检测", owner: "张工", x: 1120, y: 180 },
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
    name: "蛋白表达纯化业务流",
    description: "小试表达到放大纯化，含表达量阈值判断与 IC50 曲线分析",
    nodes: [
      { key: "n1", type: "manual", templateKey: "m_transform", label: "表达载体转化 BL21", owner: "陈研究员", x: 60, y: 180 },
      { key: "n2", type: "equipment", templateKey: "e_incubate", label: "小试诱导表达", owner: "陈研究员", x: 320, y: 180 },
      { key: "n3", type: "decision", templateKey: "d_expr_ok", label: "表达量是否达标？", x: 580, y: 170 },
      { key: "n4", type: "equipment", templateKey: "e_incubate", label: "放大培养", owner: "陈研究员", x: 840, y: 80 },
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
