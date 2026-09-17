export type SceneKey = "hplc" | "purifier" | "reader" | "stability";
export type WorkspaceKey = "overview" | "parameters" | "samples" | "data";
export type ScanMode = "receive" | "checkout" | "return" | "audit";
export type RunStage = "draft" | "ready" | "running" | "review" | "completed";
export type RiskLevel = "low" | "medium" | "high";
export type ConnectionState = "online" | "warning" | "offline";
export type SopGate = "scan" | "human" | "system" | "review";

export interface ParameterSpec {
  id: string;
  label: string;
  baseline: string;
  recommended: string;
  rationale: string;
  source: string;
  risk: RiskLevel;
}

export interface SceneDefinition {
  key: SceneKey;
  label: string;
  shortLabel: string;
  description: string;
  task: string;
  device: string;
  method: string;
  sop: string;
  software: string;
  icon: SceneKey;
  color: string;
  soft: string;
  parameters: ParameterSpec[];
  sopSteps: SopStep[];
}

export interface SopStep {
  id: string;
  label: string;
  detail: string;
  gate: SopGate;
}

export interface DisplaySample {
  id: number;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  locationName: string;
  projectName: string;
  status: string;
}

export interface DeviceView {
  id: string;
  name: string;
  model: string;
  scene: SceneKey;
  connection: ConnectionState;
  queueDepth: number;
  health: number;
  lastSync: string;
  calibration: string;
  driverVersion: string;
  source: "demo" | "registry";
}

export interface RunStep {
  stage: RunStage;
  label: string;
  description: string;
}

export interface AuditEvent {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "info";
}

export interface DataAsset {
  id: string;
  kind: string;
  name: string;
  detail: string;
  state: "verified" | "review" | "pending";
}

export const SCENES: SceneDefinition[] = [
  {
    key: "hplc",
    label: "HPLC / OpenLab 属性智能体",
    shortLabel: "Agilent HPLC",
    description: "OpenLab 序列、进样与手动积分",
    task: "Agilent 1260 序列执行与色谱结果复核",
    device: "Agilent 1260 HPLC-04",
    method: "OpenLab 序列 · 客户分析方法",
    sop: "客户 SOP · HPLC 操作流程",
    software: "OpenLab 联机 / 脱机工作站",
    icon: "hplc",
    color: "text-blue-700",
    soft: "bg-blue-50 border-blue-200",
    parameters: [
      { id: "method-binding", label: "OpenLab 分析方法", baseline: "OpenLab 已有方法", recommended: "按样本类型绑定受控方法版本", rationale: "SOP 要求从方法列表调用相应方法，具体方法值由实验员确认", source: "客户 SOP · HPLC 步骤 3", risk: "high" },
      { id: "purge", label: "系统排空", baseline: "未结构化", recommended: "5 mL/min · ≥5 min · 排空阀开启", rationale: "将流动相排空操作变成可复核的前置步骤", source: "客户 SOP · HPLC 步骤 4", risk: "high" },
      { id: "equilibration", label: "基线平衡", baseline: "目视确认", recommended: "方法流速 · 约 30 min · 基线稳定", rationale: "关闭排空阀后需恢复方法流速并由人工确认基线", source: "客户 SOP · HPLC 步骤 4", risk: "medium" },
      { id: "sequence", label: "序列表", baseline: "人工录入", recommended: "盘位 / Sample ID / 方法 / 进样次数", rationale: "扫码生成序列草稿，提交 OpenLab 前仍需操作员确认", source: "客户 SOP · HPLC 步骤 6-7", risk: "high" },
      { id: "data-path", label: "数据保存路径", baseline: "本地目录", recommended: "项目名称子目录 · 绑定 Run ID", rationale: "在 SOP 的项目子目录基础上补充 Run ID 追溯键", source: "客户 SOP · HPLC 步骤 6", risk: "medium" },
      { id: "standby", label: "待机流速", baseline: "未配置", recommended: "超过 30 min 无样本：0.2 mL/min", rationale: "等待下一样本时执行 SOP 待机策略", source: "客户 SOP · HPLC 步骤 9", risk: "medium" },
    ],
    sopSteps: [
      { id: "power", label: "开机自检", detail: "依次开启脱气机、泵、进样器和检测器，确认自检成功", gate: "human" },
      { id: "online", label: "OpenLab 联机", detail: "启动联机工作站、开启紫外灯并调用经确认的方法", gate: "human" },
      { id: "equilibrate", label: "排空与平衡", detail: "5 mL/min 排空至少 5 min，关阀后按方法流速平衡约 30 min", gate: "human" },
      { id: "sequence", label: "扫码建序列", detail: "核对样品瓶盘位、Sample ID、方法、进样次数和项目数据路径", gate: "scan" },
      { id: "run", label: "序列执行", detail: "仅在 OpenLab 就绪且操作员批准后执行，本演示不下发真实指令", gate: "human" },
      { id: "review", label: "脱机积分复核", detail: "在 OpenLab 脱机工作站手动积分并保存，复核后才写入结果对象", gate: "review" },
    ],
  },
  {
    key: "purifier",
    label: "KingFisher 磁珠纯化智能体",
    shortLabel: "磁珠纯化",
    description: "24 孔磁珠纯化与 8 板程序",
    task: "粗蛋白液磁珠纯化、洗涤与双板洗脱",
    device: "KingFisher Apex-01",
    method: "24 Combi · 8 板磁珠纯化",
    sop: "客户 SOP · 磁珠纯化流程",
    software: "KingFisher 程序（正式适配器待确认）",
    icon: "purifier",
    color: "text-teal-700",
    soft: "bg-teal-50 border-teal-200",
    parameters: [
      { id: "magnetic-head", label: "磁头", baseline: "24 Combi 磁头", recommended: "24 Combi 磁头 · 货号 5400940", rationale: "与 KingFisher Apex 及 24 孔深孔板流程匹配", source: "客户 SOP · 仪器清单", risk: "low" },
      { id: "bead-volume", label: "磁珠量", baseline: "按蛋白量", recommended: "400 µL 磁珠悬液（本次 SOP）", rationale: "沿用客户本次实验输入，执行前必须按实际蛋白量复核", source: "客户 SOP · 样本处理 2-3", risk: "medium" },
      { id: "equilibration", label: "磁珠平衡", baseline: "未结构化", recommended: "2 mL 平衡缓冲液 × 2 · 涡旋 10 s", rationale: "将两次平衡与去上清转为必须确认的前处理步骤", source: "客户 SOP · 样本处理 3-4", risk: "medium" },
      { id: "lysate-load", label: "粗蛋白上样", baseline: "未结构化", recommended: "4 mL 粗蛋白液 · 24 孔深孔板", rationale: "上样体积和容器类型与客户实验流程一致", source: "客户 SOP · 样本处理 4", risk: "high" },
      { id: "plate-map", label: "8 板位映射", baseline: "人工摆板", recommended: "1-8 板位顺序锁定 · 扫码复核", rationale: "避免 Beads、Bind、Wash 与 Elution 板位错置", source: "客户 SOP · 8 板布局", risk: "high" },
      { id: "duration", label: "程序时长", baseline: "人工输入", recommended: "2.5-3.5 h · 人工确认", rationale: "保留 SOP 给出的处理时间范围，不由智能体自动决策", source: "客户 SOP · 上机程序", risk: "medium" },
    ],
    sopSteps: [
      { id: "pretreatment", label: "获取粗蛋白液", detail: "菌液离心取沉淀，超声破碎后离心取上清；原始样本与中间物均绑定 Sample ID", gate: "scan" },
      { id: "beads", label: "磁珠两次平衡", detail: "400 µL 磁珠，每次 2 mL 平衡缓冲液并涡旋 10 s，磁性支架收珠后去上清", gate: "human" },
      { id: "load", label: "深孔板上样", detail: "加入 4 mL 粗蛋白液、涡旋 10 s，转移到 24 孔深孔板", gate: "scan" },
      { id: "plates", label: "8 板位核验", detail: "依次核对 Beads、Bead equilibration、Bind 1/2、Wash 1/2、Elution 1/2", gate: "scan" },
      { id: "run", label: "KingFisher 程序", detail: "操作员确认每步处理时间，本演示仅模拟 2.5-3.5 h 程序状态", gate: "human" },
      { id: "handoff", label: "纯化产物交接", detail: "为洗脱产物生成 Sample ID，扫码入库后分流至 PSA-16、Varioskan 和 HPLC", gate: "scan" },
    ],
  },
  {
    key: "reader",
    label: "Varioskan LUX 酶标仪智能体",
    shortLabel: "Varioskan LUX",
    description: "Session、方法、波长与板布局",
    task: "多功能读板方法配置与结果回收",
    device: "Varioskan LUX 3020-03",
    method: "Varioskan LUX · 客户检测程序",
    sop: "客户 SOP · Varioskan LUX 操作流程",
    software: "Varioskan 仪器软件 · USB 连接",
    icon: "reader",
    color: "text-violet-700",
    soft: "bg-violet-50 border-violet-200",
    parameters: [
      { id: "connection", label: "仪器连接", baseline: "人工确认", recommended: "USB 已连接 · 设备类型 Varioskan LUX", rationale: "新建 Session 前先确认设备连接和仪器类型", source: "客户 SOP · Varioskan 步骤 2.2", risk: "medium" },
      { id: "session-name", label: "Session 名称", baseline: "临时命名", recommended: "项目 / Sample ID / Run ID", rationale: "将软件 Session 与平台任务及样本追溯键关联", source: "客户 SOP · Varioskan 步骤 2.2-2.3", risk: "medium" },
      { id: "detection-method", label: "检测方法", baseline: "未绑定", recommended: "按受控实验程序选择 · 人工确认", rationale: "客户 SOP 未给出具体检测模式，智能体不猜测方法", source: "客户 SOP · Varioskan 步骤 2.4", risk: "high" },
      { id: "wavelength", label: "检测波长", baseline: "未设置", recommended: "按受控程序加载 · 禁止智能体猜测", rationale: "SOP 仅要求选择波长，需由实验模板提供精确值", source: "客户 SOP · Varioskan 步骤 2.4", risk: "high" },
      { id: "plate-layout", label: "板布局", baseline: "未绑定", recommended: "板位-Sample ID 映射 · 扫码复核", rationale: "将板布局与平台样本身份建立可追溯映射", source: "客户 SOP · Varioskan 步骤 2.4", risk: "high" },
    ],
    sopSteps: [
      { id: "connect", label: "开机与 USB 确认", detail: "启动仪器，确认 USB 连接电脑；正式环境需设备连接适配器回传状态", gate: "human" },
      { id: "session", label: "创建 Session", detail: "在仪器软件选择 create new session 和 Varioskan LUX 设备类型", gate: "human" },
      { id: "program", label: "程序与命名", detail: "创建或打开程序，使用项目、Sample ID 与 Run ID 组成可追溯名称", gate: "system" },
      { id: "layout", label: "方法与板布局", detail: "选择检测方法、精确波长和板布局，逐孔核对 Sample ID", gate: "scan" },
      { id: "read", label: "开始与结果回收", detail: "人工批准后启动检测，结束后回收 Session 结果并进入复核", gate: "review" },
    ],
  },
  {
    key: "stability",
    label: "PSA-16 稳定性智能体",
    shortLabel: "PSA-16",
    description: "样本加载、预扫描与热稳定性",
    task: "蛋白样品热稳定性与半数变性温度测定",
    device: "PSA-16-02",
    method: "热稳定性 · 预扫描 / Tm",
    sop: "客户 SOP · PSA-16 操作流程",
    software: "PSA-16 实验模块",
    icon: "stability",
    color: "text-amber-700",
    soft: "bg-amber-50 border-amber-200",
    parameters: [
      { id: "sample-volume", label: "样本体积", baseline: "至少 20 µL", recommended: "20-40 µL · 石英管", rationale: "满足客户 SOP 规定的最小和最大上样体积", source: "客户 SOP · PSA-16 步骤 2.2", risk: "medium" },
      { id: "start-temperature", label: "起始温度", baseline: "30 °C", recommended: "30 °C", rationale: "客户 SOP 记录的默认起始温度", source: "客户 SOP · PSA-16 热稳定 1", risk: "low" },
      { id: "end-temperature", label: "终点温度", baseline: "90 °C", recommended: "90 °C（设备上限 110 °C）", rationale: "默认终点与设备上限分开展示，超过默认值必须复核", source: "客户 SOP · PSA-16 热稳定 2", risk: "medium" },
      { id: "ramp", label: "升温速率", baseline: "未设置", recommended: "0.1-15 °C/min 范围内人工确认", rationale: "SOP 只提供设备可调范围，不足以自动选择具体速率", source: "客户 SOP · PSA-16 热稳定 3", risk: "high" },
      { id: "sensitivity", label: "检测灵敏度", baseline: "自动", recommended: "按样品浓度选择 · 预扫描校验", rationale: "灵敏度需结合样品浓度并以预扫描信号判定", source: "客户 SOP · PSA-16 热稳定 4-6", risk: "high" },
      { id: "prescan", label: "预扫描门禁", baseline: "未设门禁", recommended: "预扫描通过后才允许开始", rationale: "仪器需先检查荧光值是否符合实验要求", source: "客户 SOP · PSA-16 步骤 6-7", risk: "high" },
    ],
    sopSteps: [
      { id: "load", label: "石英管上样", detail: "加载 20-40 µL 蛋白溶液、密封并瞬时离心 1-2 s，然后放入样品仓", gate: "scan" },
      { id: "program", label: "热稳定参数", detail: "设置起始温度、终点温度、升温速率和灵敏度，并绑定样品名与 Sample ID", gate: "human" },
      { id: "prescan", label: "预扫描", detail: "检查荧光值是否符合实验要求，未通过时阻断正式测试", gate: "system" },
      { id: "run", label: "热稳定性测试", detail: "操作员确认预扫描和参数后才开始，本演示不控制真实设备", gate: "human" },
      { id: "review", label: "Tm 结果复核", detail: "回收半数变性温度数据，与样本、程序版本和设备快照关联", gate: "review" },
    ],
  },
];

export const DEMO_SAMPLES: DisplaySample[] = [
  { id: -1, sku: "SMP-2026-0086", name: "目标蛋白粗蛋白液", quantity: 4, unit: "mL", locationName: "4 °C 冷藏柜 A-02", projectName: "客户蛋白纯化与表征", status: "待磁珠纯化" },
  { id: -2, sku: "SMP-2026-0087-PUR", name: "磁珠纯化蛋白洗脱液", quantity: 0.8, unit: "mL", locationName: "2-8 °C 表征待检架 B-04", projectName: "客户蛋白纯化与表征", status: "待表征" },
  { id: -3, sku: "SMP-2026-0087-ALI", name: "纯化蛋白表征分装", quantity: 0.12, unit: "mL", locationName: "PSA / 酶标待检盒 C-01", projectName: "客户蛋白纯化与表征", status: "检测中" },
  { id: -4, sku: "SMP-2026-0088-REF", name: "蛋白过程对照样本", quantity: 0.04, unit: "mL", locationName: "-80 °C 冰箱 R2-C03", projectName: "客户蛋白纯化与表征", status: "在库" },
];

export const DEMO_DEVICES: DeviceView[] = [
  { id: "DEV-HPLC-04", name: "Agilent 1260 HPLC-04", model: "Agilent 1260 + OpenLab", scene: "hplc", connection: "online", queueDepth: 2, health: 94, lastSync: "演示快照 · 20 秒前", calibration: "校准日期待客户确认", driverVersion: "演示适配器 · 未接 OpenLab", source: "demo" },
  { id: "DEV-KF-01", name: "KingFisher Apex-01", model: "Thermo Scientific KingFisher Apex · 24 Combi", scene: "purifier", connection: "online", queueDepth: 1, health: 97, lastSync: "演示快照 · 8 秒前", calibration: "校准日期待客户确认", driverVersion: "演示适配器 · 未接硬件", source: "demo" },
  { id: "DEV-LUX-03", name: "Varioskan LUX 3020-03", model: "Thermo Scientific Varioskan LUX 3020", scene: "reader", connection: "warning", queueDepth: 4, health: 84, lastSync: "演示快照 · 3 分钟前", calibration: "校准日期待客户确认", driverVersion: "演示适配器 · 未接 USB", source: "demo" },
  { id: "DEV-PSA-02", name: "PSA-16-02", model: "北京佰司特 PSA-16", scene: "stability", connection: "online", queueDepth: 0, health: 92, lastSync: "演示快照 · 35 秒前", calibration: "校准日期待客户确认", driverVersion: "演示适配器 · 未接硬件", source: "demo" },
];

export const DEMO_RUN_ID = "RUN-DEMO-20260828-014";

export const RUN_STEPS: RunStep[] = [
  { stage: "draft", label: "任务草稿", description: "绑定项目、样本和目标" },
  { stage: "ready", label: "执行就绪", description: "完成样本、参数和设备检查" },
  { stage: "running", label: "设备运行", description: "持续采集状态、告警和原始数据" },
  { stage: "review", label: "结果复核", description: "规则引擎与人工审核共同判定" },
  { stage: "completed", label: "数据归档", description: "形成可追溯结果与报告" },
];

export const INITIAL_AUDIT_EVENTS: AuditEvent[] = [
  { id: "evt-1", time: "10:24:18", title: "演示设备快照已锁定", detail: "KingFisher Apex-01 · 24 Combi · 未接真实硬件", tone: "success" },
  { id: "evt-2", time: "10:23:41", title: "客户 SOP 参数建议 V3 已生成", detail: "6 项参数 · 2 项高风险 · 等待人工审批", tone: "info" },
  { id: "evt-3", time: "10:22:09", title: "样本身份已核验", detail: "SMP-2026-0086 · 容器与储位一致", tone: "success" },
  { id: "evt-4", time: "10:20:32", title: "客户 SOP 演示任务已创建", detail: `${DEMO_RUN_ID} · 客户蛋白纯化与表征`, tone: "neutral" },
];

export const DATA_ASSETS: DataAsset[] = [
  { id: "asset-1", kind: "程序快照", name: "KF_APEX_8PLATE_0828.json", detail: "8 板位映射 · 演示适配器生成", state: "verified" },
  { id: "asset-2", kind: "PSA-16 结果", name: "PSA16_TM_014.csv", detail: "半数变性温度 68.2 °C · 待人工复核", state: "review" },
  { id: "asset-3", kind: "Varioskan 结果", name: "VARIOSKAN_SESSION_014（格式待确认）", detail: "Session / 波长 / 板布局 · 待人工复核", state: "review" },
  { id: "asset-4", kind: "OpenLab 结果", name: "OPENLAB_LC_014/", detail: "色谱图 / 手动积分 · 待人工复核", state: "review" },
  { id: "asset-5", kind: "受控报告", name: "PROTEIN_CHARACTERIZATION_014.pdf", detail: "等待 QA 电子签署", state: "pending" },
];

export const SCAN_MODE_LABELS: Record<ScanMode, string> = {
  receive: "扫码入库",
  checkout: "扫码出库",
  return: "扫码归还",
  audit: "扫码盘点",
};

const RUN_STAGE_ORDER: RunStage[] = ["draft", "ready", "running", "review", "completed"];

export function inferScene(name: string): SceneKey {
  const normalized = name.toLocaleLowerCase("en-US");
  if (/kingfisher|kingfiesher|24\s*combi|磁珠|äkta|akta|纯化|chromatography/.test(normalized)) return "purifier";
  if (/varioskan|3020|envision|plate|酶标|reader/.test(normalized)) return "reader";
  if (/psa[-\s]?16|佰司特|uncle|stability|稳定/.test(normalized)) return "stability";
  if (/agilent|1260|openlab|hplc|液相/.test(normalized)) return "hplc";
  return "hplc";
}

export function findSampleByBarcode(samples: DisplaySample[], code: string): DisplaySample | undefined {
  const normalized = code.trim().toLocaleLowerCase("en-US");
  if (!normalized) return undefined;
  return samples.find((sample) => sample.sku.toLocaleLowerCase("en-US") === normalized);
}

export function inventoryDelta(mode: ScanMode, amount: number): number {
  if (mode === "audit") return 0;
  return mode === "checkout" ? -amount : amount;
}

export function applyDemoScan(
  samples: DisplaySample[],
  sampleId: number,
  mode: ScanMode,
  amount: number,
): DisplaySample[] {
  if (mode === "audit") return samples;
  const delta = inventoryDelta(mode, amount);
  return samples.map((sample) => {
    if (sample.id !== sampleId) return sample;
    const quantity = Number((sample.quantity + delta).toFixed(3));
    if (quantity < 0) throw new Error("INSUFFICIENT_INVENTORY");
    return {
      ...sample,
      quantity,
      status: delta > 0 ? "已入库" : "已出库",
    };
  });
}

export function runStageIndex(stage: RunStage): number {
  return RUN_STAGE_ORDER.indexOf(stage);
}

export function runProgress(stage: RunStage): number {
  const index = runStageIndex(stage);
  return index < 0 ? 0 : Math.round((index / (RUN_STAGE_ORDER.length - 1)) * 100);
}

export function nextRunStage(stage: RunStage): RunStage {
  const index = runStageIndex(stage);
  if (index < 0 || index === RUN_STAGE_ORDER.length - 1) return "completed";
  return RUN_STAGE_ORDER[index + 1];
}

export function canAdvanceRun(input: {
  stage: RunStage;
  sampleLoaded: boolean;
  parametersApproved: boolean;
  deviceConnection: ConnectionState;
}): { ok: boolean; reason?: "sample" | "parameters" | "device" | "completed" } {
  if (input.stage === "completed") return { ok: false, reason: "completed" };
  if (!input.sampleLoaded) return { ok: false, reason: "sample" };
  if (!input.parametersApproved) return { ok: false, reason: "parameters" };
  if (input.deviceConnection !== "online") return { ok: false, reason: "device" };
  return { ok: true };
}

export function riskSummary(parameters: ParameterSpec[]): Record<RiskLevel, number> {
  return parameters.reduce<Record<RiskLevel, number>>(
    (summary, parameter) => {
      summary[parameter.risk] += 1;
      return summary;
    },
    { low: 0, medium: 0, high: 0 },
  );
}
