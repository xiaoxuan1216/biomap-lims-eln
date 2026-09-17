import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  Database,
  FileCheck2,
  FlaskConical,
  GitBranch,
  Hash,
  Layers3,
  MapPin,
  PackageCheck,
  PanelRight,
  PlayCircle,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  TestTubes,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { SAMPLE_TYPES } from "@/lib/labels";
import type { LabRunDataFlowEvidence, LabRunDataFlowProjection } from "@contracts/labRun";

type Id = string | number;
type DateLike = Date | string | number | null;

export type RunDataFlowEvidence = LabRunDataFlowEvidence;
export type RunDataFlowData = LabRunDataFlowProjection;
export type RunDataFlowPhase = LabRunDataFlowProjection["phases"][number];
export type RunDataFlowLineageNode = LabRunDataFlowProjection["nodes"][number];

export interface RunDataFlowResource {
  id: Id;
  sampleId?: Id;
  sku?: string | null;
  sampleName?: string | null;
  sampleType?: string | null;
  role?: string | null;
  amount?: number | string | null;
  unit?: string | null;
  currentQuantity?: number | string | null;
  nodeKey?: string | null;
  sampleSnapshot?: unknown;
  locationName?: string | null;
  containerName?: string | null;
  position?: string | null;
  currentLocationId?: Id | null;
  currentLocationName?: string | null;
  currentLocationType?: string | null;
  currentBoxRow?: string | number | null;
  currentBoxCol?: string | number | null;
}

export interface RunDataFlowRunNode {
  id: Id;
  nodeKey?: string | null;
  type?: string | null;
  label?: string | null;
  status?: string | null;
  equipmentId?: Id | null;
  equipmentName?: string | null;
  equipmentModel?: string | null;
  equipmentSnapshot?: unknown;
  driverKey?: string | null;
  driverVersion?: string | null;
  driverMode?: string | null;
  parameterSnapshot?: unknown;
}

export interface RunDataFlowRun {
  id: Id;
  runNo?: string | null;
  name?: string | null;
  purpose?: string | null;
  projectName?: string | null;
  requestNo?: string | null;
  workflowName?: string | null;
  workflowSnapshot?: unknown;
  snapshotHash?: string | null;
  executionMode?: string | null;
  status?: string | null;
  operatorName?: string | null;
  scheduledStart?: DateLike;
  scheduledEnd?: DateLike;
  startedAt?: DateLike;
  completedAt?: DateLike;
  integrityValid?: boolean | null;
  resources?: readonly RunDataFlowResource[] | null;
  nodes?: readonly RunDataFlowRunNode[] | null;
  dataFlow?: RunDataFlowData | null;
}

export interface RunDataFlowProps {
  run: RunDataFlowRun;
  /** Overrides run.dataFlow, useful while the lineage projection is loaded separately. */
  dataFlow?: RunDataFlowData | null;
  className?: string;
}

type StageKey = "context" | "materials" | "plan" | "execution" | "results";
type Selection =
  | { kind: "stage"; id: StageKey }
  | { kind: "resource"; id: string }
  | { kind: "run-node"; id: string }
  | { kind: "lineage"; id: string };

const STAGES: Array<{
  id: StageKey;
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  tone: string;
  iconTone: string;
}> = [
  { id: "context", title: "需求上下文", eyebrow: "为什么做", icon: FlaskConical, tone: "border-violet-200 bg-violet-50/55", iconTone: "bg-violet-100 text-violet-700" },
  { id: "materials", title: "样本与物料", eyebrow: "用什么做", icon: TestTubes, tone: "border-amber-200 bg-amber-50/55", iconTone: "bg-amber-100 text-amber-700" },
  { id: "plan", title: "Frozen RunPlan", eyebrow: "按什么做", icon: FileCheck2, tone: "border-sky-200 bg-sky-50/55", iconTone: "bg-sky-100 text-sky-700" },
  { id: "execution", title: "节点与设备", eyebrow: "在哪里做", icon: ServerCog, tone: "border-teal-200 bg-teal-50/55", iconTone: "bg-teal-100 text-teal-700" },
  { id: "results", title: "结果与回库", eyebrow: "产生了什么", icon: Database, tone: "border-emerald-200 bg-emerald-50/55", iconTone: "bg-emerald-100 text-emerald-700" },
];

const RUN_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  preparing: "准备中",
  ready: "计划就绪",
  running: "运行中",
  completed: "已完成",
  failed: "异常",
  cancelled: "已取消",
  lab: "实验区",
  freezer: "超低温冰箱",
  fridge: "冷藏柜",
  shelf: "层架",
  rack: "支架",
  box: "冻存盒",
};

const NODE_STATUS_LABELS: Record<string, string> = {
  pending: "待执行",
  running: "模拟执行中",
  completed: "已完成",
  skipped: "已跳过",
  failed: "异常",
};

const NODE_TYPE_LABELS: Record<string, string> = {
  manual: "人工节点",
  equipment: "设备节点",
  decision: "判断节点",
  data: "数据节点",
  timer: "定时节点",
  external: "外部节点",
};

const ROLE_LABELS: Record<string, string> = {
  sample: "实验样本",
  material: "试剂与物料",
  control: "标准与对照",
};

const SOURCE_LABELS: Record<string, string> = {
  run_plan_snapshot: "冻结 RunPlan",
  lab_run_resource: "运行资源记录",
  sample_inventory: "当前库存记录",
  storage_location: "当前储位记录",
  sample_request: "样本请求",
  sample_request_item: "样本请求项",
  inventory_reservation: "库存预占",
  fulfillment_task: "领料履约任务",
  sample_lineage: "样本谱系记录",
  lab_run_node: "运行节点记录",
  equipment_booking: "设备预约记录",
  none: "待接入",
};

const FACT_STATUS_LABELS: Record<string, string> = {
  locked: "已锁定",
  integrity_failed: "完整性校验失败",
  snapshot_only: "仅快照",
  not_recorded: "未记录",
  selected: "已选择",
  recorded: "已记录",
  frozen: "已冻结",
  current: "当前",
  verified: "已校验",
  invalid: "校验失败",
  not_reserved: "未预占",
  active: "有效",
  reserved: "已预占",
  in_fulfillment: "履约中",
  fulfilled: "已完成领料",
  pending: "待执行",
  in_progress: "进行中",
  ready: "计划就绪",
  claimed: "已领取",
  running: "运行中",
  succeeded: "成功",
  completed: "已完成",
  skipped: "已跳过",
  failed: "异常",
  cancelled: "已取消",
};

const EMPTY_PHASES: readonly RunDataFlowPhase[] = [];
const EMPTY_LINEAGE_NODES: readonly RunDataFlowLineageNode[] = [];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function formatDate(value: DateLike | undefined, lang: "zh" | "en") {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function compactHash(value?: string | null) {
  if (!value) return "—";
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function selectionKey(selection: Selection) {
  return `${selection.kind}:${selection.id}`;
}

function statusTone(status?: string | null) {
  if (["active", "completed", "fulfilled", "locked", "ready", "recorded", "selected", "succeeded", "frozen", "verified"].includes(status ?? "")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["running", "in_progress"].includes(status ?? "")) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (["failed", "invalid", "blocking"].includes(status ?? "")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-slate-200 bg-white/80 text-slate-600";
}

function uniqueEvidence(evidence: readonly RunDataFlowEvidence[]) {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.source}:${item.ref}:${item.label}:${item.status ?? ""}:${item.immutable}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function MosaicTile({
  title,
  subtitle,
  meta,
  icon: Icon,
  selected,
  onClick,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  icon: LucideIcon;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-white/90 p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
        selected && "border-slate-800 ring-1 ring-slate-800",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-800">{title}</span>
          {subtitle ? <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-slate-500">{subtitle}</span> : null}
        </span>
      </div>
      {meta ? <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500">{meta}</div> : null}
    </button>
  );
}

function StageColumn({
  stage,
  status,
  toneStatus,
  selected,
  evidenceCount,
  isLast,
  onSelect,
  children,
}: {
  stage: (typeof STAGES)[number];
  status: string;
  toneStatus: string;
  selected: boolean;
  evidenceCount: number;
  isLast?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const Icon = stage.icon;
  return (
    <div className="relative min-w-0">
      <section className={cn("flex h-full min-h-[350px] flex-col rounded-2xl border p-3", stage.tone, selected && "ring-2 ring-slate-900/80")}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <div className="flex items-start justify-between gap-2">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", stage.iconTone)}><Icon className="h-4 w-4" /></span>
            <Badge variant="outline" className={cn("max-w-[120px] truncate text-[9px]", statusTone(toneStatus))}>{t(status)}</Badge>
          </div>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t(stage.eyebrow)}</div>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">{t(stage.title)}</h3>
        </button>
        <div className="mt-3 flex flex-1 flex-col gap-2">{children}</div>
        <button type="button" onClick={onSelect} className="mt-3 flex items-center justify-between rounded-lg border border-white/80 bg-white/55 px-2.5 py-2 text-[10px] text-slate-500 hover:bg-white">
          <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{t("证据 {n} 项", { n: evidenceCount })}</span>
          <PanelRight className="h-3 w-3" />
        </button>
      </section>
      {!isLast ? (
        <span className="pointer-events-none absolute -right-2.5 top-12 z-10 flex h-5 w-5 items-center justify-center rounded-full border bg-white text-slate-400 shadow-sm">
          <ArrowRight className="h-3 w-3" />
        </span>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={cn("min-w-0 break-words text-right text-xs font-medium text-slate-800", mono && "font-mono text-[10px]")}>{value || "—"}</dd>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: readonly RunDataFlowEvidence[] }) {
  const { t } = useI18n();
  if (evidence.length === 0) {
    return <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">{t("当前对象暂无独立证据记录")}</div>;
  }
  return (
    <div className="space-y-2">
      {evidence.map((item, index) => (
        <div key={`${item.source}:${item.ref}:${index}`} className="rounded-xl border bg-slate-50/70 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-medium text-slate-800">
              {item.label.startsWith("冻结储位 ")
                ? `${t("冻结储位")} ${item.label.slice("冻结储位".length).trim()}`
                : item.label.startsWith("节点 ")
                  ? `${t("节点")} ${item.label.slice("节点".length).trim()}`
                  : item.label.startsWith("设备 #")
                    ? `${t("设备")} ${item.label.slice("设备".length).trim()}`
                    : t(item.label)}
            </div>
            {item.immutable ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-600" /> : <CircleDashed className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          </div>
          <div className="mt-1 break-all font-mono text-[9px] text-slate-400">{t(SOURCE_LABELS[item.source] ?? item.source)} · {item.ref}</div>
          {item.status ? <Badge variant="outline" className={cn("mt-2 text-[9px]", statusTone(item.status))}>{t(FACT_STATUS_LABELS[item.status] ?? item.status)}</Badge> : null}
        </div>
      ))}
    </div>
  );
}

export function RunDataFlow({ run, dataFlow: dataFlowOverride, className }: RunDataFlowProps) {
  const { t, lang } = useI18n();
  const [selection, setSelection] = useState<Selection>({ kind: "stage", id: "context" });
  const [showAllExecutionNodes, setShowAllExecutionNodes] = useState(false);
  const resources = run.resources ?? [];
  const runNodes = run.nodes ?? [];
  const dataFlow = dataFlowOverride ?? run.dataFlow ?? null;
  const lineageNodes = dataFlow?.nodes ?? EMPTY_LINEAGE_NODES;
  const phases = dataFlow?.phases ?? EMPTY_PHASES;
  const edges = dataFlow?.edges ?? [];

  const phaseById = useMemo(() => new Map(phases.map((phase) => [phase.id, phase])), [phases]);
  const lineageById = useMemo(() => new Map(lineageNodes.map((node) => [node.id, node])), [lineageNodes]);
  const flowNodesByPhase = (phase: RunDataFlowPhase["id"]) => lineageNodes.filter((node) => node.phase === phase);
  const selectedKey = selectionKey(selection);
  const completedNodes = runNodes.filter((node) => node.status === "completed" || node.status === "skipped").length;
  const equipmentNodes = runNodes.filter((node) => node.type === "equipment" || node.equipmentId != null);
  const progress = runNodes.length ? Math.round((completedNodes / runNodes.length) * 100) : 0;
  const isSimulation = run.executionMode === "simulation";
  const isEdge = run.executionMode === "edge";
  const nodeStatusText = (status?: string | null) => t(
    isSimulation && status === "completed"
      ? "模拟已推进"
      : NODE_STATUS_LABELS[status ?? ""] ?? status ?? "待执行",
  );

  const phaseEvidence = (phase: RunDataFlowPhase["id"]) => phaseById.get(phase)?.evidence ?? [];
  const stageEvidence = (stage: StageKey) => {
    if (stage === "context") return phaseEvidence("plan");
    const phase: RunDataFlowPhase["id"] = stage;
    return uniqueEvidence([
      ...phaseEvidence(phase),
      ...flowNodesByPhase(phase).flatMap((node) => node.evidence),
      ...(stage === "results" ? dataFlow?.resultState?.evidence ?? [] : []),
    ]);
  };

  const resourceFlowNode = (resource: RunDataFlowResource) =>
    lineageById.get(`resource:${resource.id}`) ?? lineageById.get(`resource:${resource.sampleId ?? resource.id}`);
  const executionFlowNode = (node: RunDataFlowRunNode) =>
    lineageById.get(`run-node:${node.nodeKey ?? node.id}`);

  const sampleCount = resources.filter((resource) => resource.role === "sample").length;
  const materialCount = resources.length - sampleCount;
  const materialLineageNodes = flowNodesByPhase("materials").filter((node) => node.kind === "lineage");
  const resultNodes = flowNodesByPhase("results");
  const resultRecorded = resultNodes.length > 0 && dataFlow?.resultState?.status !== "not_recorded";
  const stageStatus: Record<StageKey, string> = {
    context: run.purpose || run.projectName ? "上下文已记录" : "待补充",
    materials: resources.length ? "资源快照已冻结" : "待补充",
    plan: run.integrityValid === false ? "完整性校验失败" : run.integrityValid ? "快照已校验" : "计划已冻结",
    execution: isSimulation && run.status === "completed"
      ? "模拟状态推进完成"
      : RUN_STATUS_LABELS[run.status ?? ""] ?? run.status ?? "待执行",
    results: resultRecorded ? "结果已记录" : "结果待接入",
  };
  const stageToneStatus: Record<StageKey, string> = {
    context: run.purpose || run.projectName ? "recorded" : "not_recorded",
    materials: resources.length ? "frozen" : "not_recorded",
    plan: run.integrityValid === false ? "invalid" : run.integrityValid ? "verified" : "frozen",
    execution: run.status ?? "pending",
    results: resultRecorded ? "recorded" : "not_recorded",
  };

  const snapshot = asRecord(run.workflowSnapshot);
  const snapshotEdges = Array.isArray(snapshot.edges) ? snapshot.edges.length : edges.length;

  const detail = (() => {
    if (selection.kind === "resource") {
      const resource = resources.find((item) => String(item.id) === selection.id);
      if (!resource) return null;
      const frozen = asRecord(resource.sampleSnapshot);
      const frozenName = textValue(frozen.name) ?? resource.sampleName ?? resource.sku ?? t("未命名对象");
      const frozenSku = textValue(frozen.sku) ?? resource.sku ?? String(resource.sampleId ?? resource.id);
      const frozenType = textValue(frozen.type) ?? resource.sampleType;
      const frozenLocation = resource.locationName ?? textValue(frozen.locationName) ?? textValue(frozen.locationId);
      const currentLocation = resource.currentLocationName ?? (resource.currentLocationId != null ? String(resource.currentLocationId) : null);
      const boxRow = textValue(frozen.boxRow);
      const boxCol = textValue(frozen.boxCol);
      const frozenPosition = resource.position ?? (boxRow && boxCol ? `R${boxRow} · C${boxCol}` : null);
      const currentPosition = resource.currentBoxRow != null && resource.currentBoxCol != null
        ? `R${resource.currentBoxRow} · C${resource.currentBoxCol}`
        : null;
      const flowNode = resourceFlowNode(resource);
      return {
        eyebrow: t("库存对象"),
        title: frozenName,
        status: t(ROLE_LABELS[resource.role ?? ""] ?? resource.role ?? "未分类"),
        icon: Boxes,
        rows: [
          [t("Sample ID"), frozenSku, true],
          [t("类型"), frozenType ? t(SAMPLE_TYPES[frozenType]?.label ?? frozenType) : "—"],
          [t("计划量"), `${resource.amount ?? "—"} ${resource.unit ?? ""}`.trim()],
          [t("冻结时数量"), `${textValue(frozen.quantityAtFreeze) ?? "—"} ${resource.unit ?? textValue(frozen.unit) ?? ""}`.trim()],
          [t("容器"), resource.containerName || t("未记录容器")],
          [t("冻结位置"), frozenLocation ? `${resource.locationName ? "" : "#"}${frozenLocation}${frozenPosition ? ` · ${frozenPosition}` : ""}` : t("位置待确认")],
          [t("当前位置"), currentLocation ? `${resource.currentLocationName ? "" : "#"}${currentLocation}${currentPosition ? ` · ${currentPosition}` : ""}` : t("位置待确认")],
          [t("关联节点"), resource.nodeKey || t("未指定节点")],
        ] as Array<[string, ReactNode, boolean?]>,
        evidence: flowNode?.evidence ?? [],
      };
    }
    if (selection.kind === "run-node") {
      const node = runNodes.find((item) => String(item.id) === selection.id);
      if (!node) return null;
      const parameterSnapshot = asRecord(node.parameterSnapshot);
      const equipmentSnapshot = asRecord(node.equipmentSnapshot);
      const effectiveValues = asRecord(parameterSnapshot.effectiveValues);
      const units = asRecord(parameterSnapshot.units);
      const parameters = Object.entries(effectiveValues).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value));
      const flowNode = executionFlowNode(node);
      return {
        eyebrow: t(NODE_TYPE_LABELS[node.type ?? ""] ?? node.type ?? "流程节点"),
        title: node.label || node.nodeKey || t("未命名节点"),
        status: nodeStatusText(node.status),
        icon: node.type === "equipment" ? ServerCog : GitBranch,
        rows: [
          [t("节点标识"), node.nodeKey || node.id, true],
          [t("设备"), node.equipmentName || textValue(equipmentSnapshot.name) || t("未绑定设备")],
          [t("型号"), node.equipmentModel || textValue(equipmentSnapshot.model) || "—"],
          [t("驱动"), node.driverKey ? `${node.driverKey}@${node.driverVersion ?? "—"}` : t("未绑定驱动"), true],
          [t("执行通道"), node.driverMode ? t(node.driverMode === "simulation" ? "模拟运行" : "现场执行") : "—"],
          [t("方法文件"), textValue(parameterSnapshot.methodRef) || "—"],
        ] as Array<[string, ReactNode, boolean?]>,
        parameters: parameters.map(([key, value]) => ({ key, value: String(value), unit: textValue(units[key]) })),
        evidence: flowNode?.evidence ?? [],
      };
    }
    if (selection.kind === "lineage") {
      const node = lineageById.get(selection.id);
      if (!node) return null;
      return {
        eyebrow: t("谱系对象"),
        title: node.title,
        status: t(FACT_STATUS_LABELS[node.status] ?? node.status),
        icon: node.kind === "lineage" ? RotateCcw : Database,
        rows: [
          [t("对象标识"), node.id, true],
          [t("对象类型"), t(node.kind)],
          [t("来源"), node.source, true],
          [t("说明"), node.subtitle || "—"],
        ] as Array<[string, ReactNode, boolean?]>,
        evidence: node.evidence,
      };
    }

    const stage = selection.id;
    const common = { status: t(stageStatus[stage]), icon: STAGES.find((item) => item.id === stage)?.icon ?? Layers3, evidence: stageEvidence(stage) };
    if (stage === "context") return {
      ...common,
      eyebrow: t("阶段详情"),
      title: t("需求上下文"),
      rows: [
        [t("项目"), run.projectName || t("未关联项目")],
        [t("运行目的"), run.purpose || t("尚未绑定意图对象")],
        [t("样本请求"), run.requestNo || t("未关联样本请求")],
        [t("负责人"), run.operatorName || "—"],
        [t("计划窗口"), `${formatDate(run.scheduledStart, lang)} → ${formatDate(run.scheduledEnd, lang)}`],
      ] as Array<[string, ReactNode, boolean?]>,
    };
    if (stage === "materials") return {
      ...common,
      eyebrow: t("阶段详情"),
      title: t("样本与物料"),
      rows: [
        [t("实验样本"), t("{n} 项", { n: sampleCount })],
        [t("物料与对照"), t("{n} 项", { n: materialCount })],
        [t("资源总数"), t("{n} 项", { n: resources.length })],
        [t("库存影响"), t(isSimulation ? "模拟快照，不占用真实库存" : isEdge ? "以样本请求与库存流水为准" : "执行模式待确认，不能判断库存占用")],
      ] as Array<[string, ReactNode, boolean?]>,
    };
    if (stage === "plan") return {
      ...common,
      eyebrow: t("阶段详情"),
      title: "Frozen RunPlan",
      rows: [
        [t("运行编号"), run.runNo || run.id, true],
        [t("来源流程"), run.workflowName || "—"],
        [t("冻结节点"), t("{n} 个节点", { n: runNodes.length })],
        [t("流程连线"), t("{n} 条", { n: snapshotEdges })],
        [t("完整性校验"), t(run.integrityValid === false ? "校验失败" : run.integrityValid ? "校验通过" : "未提供校验状态")],
        [t("快照哈希"), run.snapshotHash || "—", true],
      ] as Array<[string, ReactNode, boolean?]>,
    };
    if (stage === "execution") return {
      ...common,
      eyebrow: t("阶段详情"),
      title: t("节点与设备"),
      rows: [
        [t("运行状态"), t(isSimulation && run.status === "completed" ? "模拟状态推进完成" : RUN_STATUS_LABELS[run.status ?? ""] ?? run.status ?? "待执行")],
        [t("节点进度"), `${completedNodes}/${runNodes.length} · ${progress}%`],
        [t("设备节点"), t("{n} 个节点", { n: equipmentNodes.length })],
        [t("开始时间"), formatDate(run.startedAt, lang)],
        [t("完成时间"), formatDate(run.completedAt, lang)],
        [t("执行事实"), t(isSimulation ? "仅记录模拟状态推进" : isEdge ? "以 Edge 回执与审计记录为准" : "未记录执行模式，需检查原始 Run 记录")],
      ] as Array<[string, ReactNode, boolean?]>,
    };
    return {
      ...common,
      eyebrow: t("阶段详情"),
      title: t("结果与回库"),
      rows: [
        [t("结果状态"), t(resultRecorded ? "结果已记录" : "尚未生成结果包")],
        [t("结果对象"), t("{n} 项", { n: resultNodes.length })],
        [t("回库状态"), t("待接入正式结果与回库记录")],
        [t("事实边界"), t(isSimulation ? "模拟节点完成不代表已产生实验结果" : isEdge ? "只有受控写回记录可作为结果证据" : "未记录执行模式；只有受控写回记录可作为结果证据")],
      ] as Array<[string, ReactNode, boolean?]>,
    };
  })();

  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-white shadow-sm", className)}>
      <div className="flex flex-col gap-4 border-b bg-slate-950 px-5 py-5 text-white sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300"><GitBranch className="h-3.5 w-3.5" />{t("端到端数据谱系")}</div>
          <h2 className="mt-2 text-lg font-semibold">{t("Run 数据流转")}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">{t("从需求上下文、物理样本到冻结计划、节点执行和结果回库，点击任一阶段或对象查看证据详情。")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge className={cn("border", isSimulation ? "border-blue-400/40 bg-blue-400/15 text-blue-200" : "border-teal-400/40 bg-teal-400/15 text-teal-200")}>
            {t(isSimulation ? "模拟链路" : isEdge ? "现场执行链路" : "执行模式待确认")}
          </Badge>
          <Badge className="border border-white/20 bg-white/10 text-slate-200">{run.runNo || run.id}</Badge>
        </div>
      </div>

      {isSimulation || !isEdge ? (
        <div className="flex items-start gap-2 border-b border-blue-100 bg-blue-50 px-5 py-3 text-xs leading-5 text-blue-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(isSimulation ? "当前仅展示受控模拟的计划快照与状态推进，不代表真机已执行，也不代表已产生实验结果。" : "当前运行未记录执行模式，不能据此判断真机执行或实验结果。")}</span>
        </div>
      ) : null}

      <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:p-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Layers3 className="h-4 w-4 text-teal-600" />{t("数据对象泳道")}</div>
            <div className="text-[10px] text-slate-400">{t("横向滚动查看完整链路")}</div>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1050px] grid-cols-5 gap-3">
              <StageColumn stage={STAGES[0]} status={stageStatus.context} toneStatus={stageToneStatus.context} selected={selectedKey === "stage:context"} evidenceCount={stageEvidence("context").length} onSelect={() => setSelection({ kind: "stage", id: "context" })}>
                <MosaicTile title={run.projectName || t("未关联项目")} subtitle={t("项目与运行边界")} meta={run.operatorName || t("负责人待补充")} icon={Layers3} selected={false} onClick={() => setSelection({ kind: "stage", id: "context" })} />
                <MosaicTile title={run.purpose || t("尚未绑定意图对象")} subtitle={run.purpose ? t("运行目的") : t("没有正式 ExperimentIntent ID")} meta={run.requestNo || t("未关联样本请求")} icon={FlaskConical} selected={false} onClick={() => setSelection({ kind: "stage", id: "context" })} />
              </StageColumn>

              <StageColumn stage={STAGES[1]} status={stageStatus.materials} toneStatus={stageToneStatus.materials} selected={selectedKey === "stage:materials"} evidenceCount={stageEvidence("materials").length} onSelect={() => setSelection({ kind: "stage", id: "materials" })}>
                {resources.slice(0, 2).map((resource) => {
                  const frozen = asRecord(resource.sampleSnapshot);
                  const frozenName = textValue(frozen.name) ?? resource.sampleName ?? resource.sku ?? t("未命名对象");
                  const boxRow = textValue(frozen.boxRow) ?? textValue(resource.currentBoxRow);
                  const boxCol = textValue(frozen.boxCol) ?? textValue(resource.currentBoxCol);
                  const position = resource.position || (boxRow && boxCol ? `R${boxRow} · C${boxCol}` : "");
                  return <MosaicTile key={resource.id} title={frozenName} subtitle={`${resource.amount ?? "—"} ${resource.unit ?? ""}`} meta={position ? `${t("孔位")} · ${position}` : t("位置待确认")} icon={resource.role === "sample" ? TestTubes : Boxes} selected={selectedKey === `resource:${resource.id}`} onClick={() => setSelection({ kind: "resource", id: String(resource.id) })} />;
                })}
                {materialLineageNodes.slice(0, 1).map((node) => <MosaicTile key={node.id} title={node.title} subtitle={node.subtitle} meta={t("上游谱系对象")} icon={GitBranch} selected={selectedKey === `lineage:${node.id}`} onClick={() => setSelection({ kind: "lineage", id: node.id })} />)}
                {resources.length === 0 ? <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-amber-200 bg-white/50 p-4 text-center text-xs text-slate-500">{t("尚未绑定样本与物料")}</div> : null}
                {resources.length > 2 ? <div className="rounded-lg bg-white/60 px-3 py-2 text-center text-[10px] text-slate-500">{t("另有 {n} 项资源", { n: resources.length - 2 })}</div> : null}
                {materialLineageNodes.length > 1 ? <div className="rounded-lg bg-white/60 px-3 py-2 text-center text-[10px] text-slate-500">{t("另有 {n} 项谱系对象", { n: materialLineageNodes.length - 1 })}</div> : null}
              </StageColumn>

              <StageColumn stage={STAGES[2]} status={stageStatus.plan} toneStatus={stageToneStatus.plan} selected={selectedKey === "stage:plan"} evidenceCount={stageEvidence("plan").length} onSelect={() => setSelection({ kind: "stage", id: "plan" })}>
                <MosaicTile title={run.workflowName || t("来源流程")} subtitle={run.runNo || String(run.id)} meta={`${runNodes.length} ${t("个节点")} · ${snapshotEdges} ${t("条连线")}`} icon={FileCheck2} selected={selectedKey === "stage:plan"} onClick={() => setSelection({ kind: "stage", id: "plan" })} />
                <div className="rounded-xl border border-sky-100 bg-slate-950 p-3 text-slate-200">
                  <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-400"><Hash className="h-3 w-3" />SHA-256</div>
                  <div className="mt-2 break-all font-mono text-[10px]">{compactHash(run.snapshotHash)}</div>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-sky-300">{run.integrityValid ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}{t(run.integrityValid ? "校验通过" : "校验状态待确认")}</div>
                </div>
              </StageColumn>

              <StageColumn stage={STAGES[3]} status={stageStatus.execution} toneStatus={stageToneStatus.execution} selected={selectedKey === "stage:execution"} evidenceCount={stageEvidence("execution").length} onSelect={() => setSelection({ kind: "stage", id: "execution" })}>
                <div className="rounded-xl border border-teal-100 bg-white/80 p-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-500"><span>{t("节点进度")}</span><span>{completedNodes}/{runNodes.length}</span></div>
                  <Progress value={progress} className="mt-2 h-1.5" />
                </div>
                <div className={cn("space-y-2", showAllExecutionNodes && "max-h-[420px] overflow-y-auto pr-1")}>
                  {runNodes.slice(0, showAllExecutionNodes ? runNodes.length : 3).map((node) => <MosaicTile key={node.id} title={node.label || node.nodeKey || t("未命名节点")} subtitle={node.equipmentName || t(NODE_TYPE_LABELS[node.type ?? ""] ?? node.type ?? "流程节点")} meta={nodeStatusText(node.status)} icon={node.type === "equipment" ? ServerCog : PlayCircle} selected={selectedKey === `run-node:${node.id}`} onClick={() => setSelection({ kind: "run-node", id: String(node.id) })} />)}
                </div>
                {runNodes.length > 3 ? (
                  <button type="button" onClick={() => setShowAllExecutionNodes((current) => !current)} className="rounded-lg bg-white/60 px-3 py-2 text-center text-[10px] font-medium text-teal-700 hover:bg-white">
                    {t(showAllExecutionNodes ? "收起节点" : "查看全部 {n} 个节点", { n: runNodes.length })}
                  </button>
                ) : null}
              </StageColumn>

              <StageColumn stage={STAGES[4]} status={stageStatus.results} toneStatus={stageToneStatus.results} selected={selectedKey === "stage:results"} evidenceCount={stageEvidence("results").length} isLast onSelect={() => setSelection({ kind: "stage", id: "results" })}>
                {resultNodes.map((node) => <MosaicTile key={node.id} title={node.title} subtitle={node.subtitle} meta={t(FACT_STATUS_LABELS[node.status] ?? node.status)} icon={node.kind === "lineage" ? RotateCcw : Database} selected={selectedKey === `lineage:${node.id}`} onClick={() => setSelection({ kind: "lineage", id: node.id })} />)}
                {resultNodes.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-white/60 p-4 text-center">
                    <PackageCheck className="h-7 w-7 text-emerald-300" />
                    <div className="mt-3 text-xs font-semibold text-slate-700">{t("尚未生成结果包")}</div>
                    <div className="mt-1 text-[10px] leading-4 text-slate-500">{t(isSimulation ? "模拟节点完成不代表已产生实验结果" : "等待受控结果写回与回库记录")}</div>
                  </div>
                ) : null}
              </StageColumn>
            </div>
          </div>
          <div className="mt-3 grid gap-2 rounded-xl border bg-slate-50 p-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 text-[10px] text-slate-600"><ShieldCheck className="h-3.5 w-3.5 text-teal-600" /><span>{t("证据来自保存的业务记录")}</span></div>
            <div className="flex items-center gap-2 text-[10px] text-slate-600"><Clock3 className="h-3.5 w-3.5 text-sky-600" /><span>{t("状态沿 Run 独立推进")}</span></div>
            <div className="flex items-center gap-2 text-[10px] text-slate-600"><MapPin className="h-3.5 w-3.5 text-amber-600" /><span>{t("位置只展示已记录标识")}</span></div>
          </div>
        </div>

        <aside className="min-w-0 rounded-2xl border bg-slate-50/70 p-4 xl:sticky xl:top-4 xl:self-start">
          {detail ? (
            <>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"><detail.icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{detail.eyebrow}</div>
                  <h3 className="mt-1 break-words text-sm font-semibold text-slate-900">{detail.title}</h3>
                  <Badge variant="outline" className={cn("mt-2 text-[9px]", statusTone(typeof detail.status === "string" ? detail.status : undefined))}>{detail.status}</Badge>
                </div>
              </div>
              <dl className="mt-4 rounded-xl border bg-white px-3">{detail.rows.map(([label, value, mono]) => <DetailRow key={label} label={label} value={value} mono={mono} />)}</dl>
              {"parameters" in detail && detail.parameters && detail.parameters.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t("当次参数")}</div>
                  <div className="flex flex-wrap gap-1.5">{detail.parameters.map((parameter) => <span key={parameter.key} className="rounded-md border bg-white px-2 py-1 text-[10px]"><span className="text-slate-400">{parameter.key}</span> · {parameter.value}{parameter.unit ? ` ${parameter.unit}` : ""}</span>)}</div>
                </div>
              ) : null}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t("证据")}</span><span className="text-[10px] text-slate-400">{t("{n} 项", { n: detail.evidence.length })}</span></div>
                <EvidenceList evidence={detail.evidence} />
              </div>
            </>
          ) : <div className="py-12 text-center text-xs text-slate-500">{t("所选对象已不在当前数据中")}</div>}
        </aside>
      </div>
    </section>
  );
}

export default RunDataFlow;
