import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  FileClock,
  FileLock2,
  Grid2X2,
  Info,
  Loader2,
  MonitorCog,
  Network,
  Search,
  ShieldCheck,
  TestTubes,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  LAB_RUN_ROLE_META,
  suggestedResourceRole,
  type LabRunMode,
  type LabRunResourceRole,
} from "@contracts/labRun";
import { EQUIP_PARAM_SCHEMAS, type ParamField } from "@contracts/workflow";
import {
  parseDriverTemplateKey,
  type DriverField,
} from "@contracts/deviceDriver";
import { EQUIP_STATUS } from "@/lib/labels";
import CloningPlateFlowViewer from "@/features/cloning-planner/CloningPlateFlowViewer";
import { toast } from "sonner";

type Primitive = string | number | boolean;
type ResourceSelection = { role: LabRunResourceRole; amount: number };
type NodeSetup = {
  equipmentId: string;
  params: Record<string, Primitive>;
  overrideReason: string;
};
type FieldLike = ParamField | DriverField;
type PlanPreviewResource = {
  id: number;
  sku: string;
  name: string;
  role: LabRunResourceRole;
  amount: number;
  unit: string;
};
type PlanPreviewNode = { nodeKey: string; label: string; type: string };
type PlanPreviewEquipment = {
  nodeKey: string;
  nodeLabel: string;
  deviceName: string | null;
  deviceStatus: string | null;
  configured: boolean;
};

const STEPS = [
  "运行信息",
  "样本与物料",
  "流程与孔板",
  "设备与参数",
  "确认发起",
] as const;

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialSchedule() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function parseParams(raw: string | null): Record<string, Primitive> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, Primitive] =>
        ["string", "number", "boolean"].includes(typeof entry[1])
      )
    );
  } catch {
    return {};
  }
}

function fieldDefaults(fields: FieldLike[]) {
  return Object.fromEntries(
    fields
      .filter(field => field.default !== undefined)
      .map(field => [field.key, field.default as Primitive])
  );
}

function fieldValueIsValid(field: FieldLike, value: Primitive | undefined) {
  const required = "required" in field && field.required;
  if (value === undefined || value === "") return !required;
  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if ("min" in field && field.min !== undefined && value < field.min)
      return false;
    if ("max" in field && field.max !== undefined && value > field.max)
      return false;
  }
  if (field.type === "boolean" && typeof value !== "boolean") return false;
  if (
    ["text", "path", "select"].includes(field.type) &&
    typeof value !== "string"
  )
    return false;
  if (
    field.options &&
    typeof value === "string" &&
    !field.options.includes(value)
  )
    return false;
  if ("pattern" in field && field.pattern && typeof value === "string") {
    try {
      if (!new RegExp(field.pattern).test(value)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

const PREVIEW_TILE_TONES = {
  slate: "border-slate-200 bg-white",
  cyan: "border-cyan-200 bg-cyan-50/50",
  teal: "border-teal-200 bg-teal-50/50",
  violet: "border-violet-200 bg-violet-50/50",
  amber: "border-amber-200 bg-amber-50/60",
} as const;

function PlanPreviewTile({
  icon: Icon,
  eyebrow,
  title,
  tone,
  children,
}: {
  icon: typeof Network;
  eyebrow: string;
  title: string;
  tone: keyof typeof PREVIEW_TILE_TONES;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex min-h-44 min-w-0 flex-col rounded-2xl border p-3.5 shadow-sm ${PREVIEW_TILE_TONES[tone]}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/80 text-slate-700 shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {eyebrow}
          </div>
          <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-950">
            {title}
          </div>
        </div>
      </div>
      <div className="mt-3 min-w-0 flex-1 text-xs text-slate-600">
        {children}
      </div>
    </div>
  );
}

function PlanPreviewArrow() {
  return (
    <div
      className="flex items-center justify-center text-slate-300"
      aria-hidden="true"
    >
      <div className="h-px flex-1 bg-slate-200" />
      <ArrowRight className="h-4 w-4 shrink-0" />
    </div>
  );
}

function RunPlanDataFlowPreview({
  projectName,
  purpose,
  workflowName,
  resources,
  nodes,
  equipment,
  showEquipmentDetails,
}: {
  projectName: string | null;
  purpose: string;
  workflowName: string;
  resources: PlanPreviewResource[];
  nodes: PlanPreviewNode[];
  equipment: PlanPreviewEquipment[];
  showEquipmentDetails: boolean;
}) {
  const { t } = useI18n();
  const sampleCount = resources.filter(
    resource => resource.role === "sample"
  ).length;
  const materialCount = resources.filter(
    resource => resource.role === "material"
  ).length;
  const controlCount = resources.filter(
    resource => resource.role === "control"
  ).length;
  const selectedEquipmentCount = equipment.filter(
    item => !!item.deviceName
  ).length;
  const configuredEquipmentCount = equipment.filter(
    item => item.configured
  ).length;
  const equipmentHeadline =
    equipment.length === 0
      ? t("无设备节点")
      : configuredEquipmentCount === equipment.length
        ? t("设备已配置")
        : selectedEquipmentCount > 0
          ? t("设备配置中")
          : t("设备待配置");

  return (
    <Card className="overflow-hidden border-amber-300 bg-[linear-gradient(135deg,rgba(255,251,235,0.92),rgba(248,250,252,0.96))] shadow-sm">
      <CardHeader className="border-b border-amber-200/80 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100">
                {t("计划预览 · 尚未冻结")}
              </Badge>
              <span className="text-xs text-slate-600">
                {t(
                  "当前仅展示表单中的计划关系，不代表已创建 Run 或已产生任何业务记录。"
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["未保存", "未预占", "未预约", "未执行"].map(label => (
              <Badge
                key={label}
                variant="outline"
                className="border-amber-300 bg-white/80 text-amber-800"
              >
                {t(label)}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[1080px] grid-cols-[minmax(180px,1fr)_34px_minmax(210px,1.15fr)_34px_minmax(190px,1fr)_34px_minmax(210px,1.15fr)_34px_minmax(180px,1fr)] items-stretch">
            <PlanPreviewTile
              icon={ClipboardList}
              eyebrow={t("项目 / 目的")}
              title={projectName ?? t("项目待选择")}
              tone="slate"
            >
              <p className="line-clamp-3 leading-relaxed">
                {purpose.trim() || t("未填写实验目的")}
              </p>
            </PlanPreviewTile>
            <PlanPreviewArrow />

            <PlanPreviewTile
              icon={TestTubes}
              eyebrow={t("样本与物料")}
              title={t("已选 {n} 项", { n: resources.length })}
              tone="cyan"
            >
              <div className="flex flex-wrap gap-1">
                <span className="rounded-full bg-white/90 px-2 py-0.5">
                  {t("样本 {n}", { n: sampleCount })}
                </span>
                <span className="rounded-full bg-white/90 px-2 py-0.5">
                  {t("物料 {n}", { n: materialCount })}
                </span>
                <span className="rounded-full bg-white/90 px-2 py-0.5">
                  {t("对照 {n}", { n: controlCount })}
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {resources.slice(0, 2).map(resource => (
                  <div
                    key={resource.id}
                    className="truncate"
                    title={`${resource.sku} · ${resource.name}`}
                  >
                    <span className="font-mono text-[10px] text-cyan-700">
                      {resource.sku}
                    </span>
                    <span>
                      {" "}
                      · {resource.name} · {resource.amount} {resource.unit}
                    </span>
                  </div>
                ))}
                {resources.length > 2 && (
                  <div className="text-slate-500">
                    {t("另 {n} 项", { n: resources.length - 2 })}
                  </div>
                )}
              </div>
            </PlanPreviewTile>
            <PlanPreviewArrow />

            <PlanPreviewTile
              icon={Network}
              eyebrow={t("BioFlow 节点")}
              title={workflowName}
              tone="teal"
            >
              <div className="mb-2 font-medium text-teal-800">
                {t("流程节点 {n}", { n: nodes.length })}
              </div>
              <div className="space-y-1.5">
                {nodes.slice(0, 3).map((node, index) => (
                  <div
                    key={node.nodeKey}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[9px] font-semibold text-teal-700">
                      {index + 1}
                    </span>
                    <span className="truncate" title={node.label}>
                      {node.label}
                    </span>
                  </div>
                ))}
                {nodes.length > 3 && (
                  <div className="pl-5 text-slate-500">
                    {t("另 {n} 个节点", { n: nodes.length - 3 })}
                  </div>
                )}
              </div>
            </PlanPreviewTile>
            <PlanPreviewArrow />

            <PlanPreviewTile
              icon={MonitorCog}
              eyebrow={t("设备与参数")}
              title={equipmentHeadline}
              tone="violet"
            >
              {equipment.length === 0 ? (
                <p className="leading-relaxed">
                  {t("该流程没有设备节点，将按人工流程创建运行。")}
                </p>
              ) : (
                <>
                  <div className="mb-2 font-medium text-violet-800">
                    {t("已配置 {configured}/{total}", {
                      configured: configuredEquipmentCount,
                      total: equipment.length,
                    })}
                  </div>
                  {showEquipmentDetails ? (
                    <div className="space-y-1.5">
                      {equipment.slice(0, 2).map(item => (
                        <div
                          key={item.nodeKey}
                          className="rounded-lg bg-white/75 px-2 py-1.5"
                        >
                          <div
                            className="truncate font-medium"
                            title={item.nodeLabel}
                          >
                            {item.nodeLabel}
                          </div>
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-slate-500">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.configured ? "bg-emerald-500" : item.deviceName ? "bg-amber-500" : "bg-slate-300"}`}
                            />
                            <span
                              className="truncate"
                              title={item.deviceName ?? t("待配置")}
                            >
                              {item.deviceName ?? t("待配置")}
                            </span>
                            {item.deviceStatus && (
                              <span className="shrink-0">
                                · {t(item.deviceStatus)}
                              </span>
                            )}
                            {item.deviceName && !item.configured && (
                              <span className="shrink-0">· {t("需复核")}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {equipment.length > 2 && (
                        <div className="text-slate-500">
                          {t("另 {n} 个设备节点", { n: equipment.length - 2 })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="leading-relaxed text-slate-500">
                      {t("下一步配置设备后，此处将显示已选设备及当前状态。")}
                    </p>
                  )}
                </>
              )}
            </PlanPreviewTile>
            <PlanPreviewArrow />

            <PlanPreviewTile
              icon={FileClock}
              eyebrow={t("结果记录")}
              title={t("结果待回传")}
              tone="amber"
            >
              <p className="leading-relaxed">
                {t("当前没有结果记录。发起并执行后，结果才会进入回传与记录。")}
              </p>
            </PlanPreviewTile>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LabRunLaunch() {
  const [searchParams] = useSearchParams();
  const workflowId = Number(searchParams.get("workflowId")) || 0;

  return <LabRunLaunchForm key={workflowId} workflowId={workflowId} />;
}

function LabRunLaunchForm({ workflowId }: { workflowId: number }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { data: workflows, error: workflowsError } =
    trpc.workflow.list.useQuery();
  const { data: driverNodes, error: driverNodesError } =
    trpc.driver.nodeCatalog.useQuery();
  const contextQuery = trpc.labRun.launchContext.useQuery(
    { workflowId },
    { enabled: workflowId > 0 }
  );
  const context = contextQuery.data;
  const eligibleWorkflows =
    workflows?.filter(
      workflow => !workflow.parentWorkflowId && workflow.status === "active"
    ) ?? [];
  const [step, setStep] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState("");
  const [executionMode, setExecutionMode] = useState<LabRunMode>("simulation");
  const [scheduleDefaults] = useState(initialSchedule);
  const [scheduledStart, setScheduledStart] = useState(scheduleDefaults.start);
  const [scheduledEnd, setScheduledEnd] = useState(scheduleDefaults.end);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceView, setResourceView] = useState<"all" | LabRunResourceRole>(
    "all"
  );
  const [selectedResources, setSelectedResources] = useState<
    Record<number, ResourceSelection>
  >({});
  const [cloningLayoutPlanId, setCloningLayoutPlanId] = useState<number | null>(
    null
  );
  const [skipCloningLayout, setSkipCloningLayout] = useState(false);
  const cloningLayoutPlanQuery = trpc.cloningLayout.byId.useQuery(
    { id: cloningLayoutPlanId ?? 0 },
    { enabled: cloningLayoutPlanId !== null }
  );
  const [nodeSetups, setNodeSetups] = useState<Record<string, NodeSetup>>({});
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  const driverByTemplate = useMemo(
    () => new Map((driverNodes ?? []).map(entry => [entry.templateKey, entry])),
    [driverNodes]
  );

  const fieldsForNode = useCallback(
    (node: { templateKey: string | null }): FieldLike[] => {
      if (!node.templateKey) return [];
      const driver = driverByTemplate.get(node.templateKey);
      if (driver) return driver.action.fields;
      return EQUIP_PARAM_SCHEMAS[node.templateKey] ?? [];
    },
    [driverByTemplate]
  );

  const defaultRunName = useMemo(() => {
    if (!context) return "";
    const day = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return `${context.workflow.name} · ${day}`;
  }, [context, lang]);
  const effectiveName = name ?? defaultRunName;
  const effectiveProjectId =
    projectId ??
    (context?.workflow.projectId ? String(context.workflow.projectId) : "none");

  const createMut = trpc.labRun.create.useMutation({
    onSuccess: result => {
      toast.success(
        result.repeated ? t("已返回同一次运行") : t("实验运行已锁定并创建")
      );
      navigate(`/runs/${result.id}`);
    },
    onError: error => toast.error(error.message),
  });

  const equipmentNodes =
    context?.nodes.filter(node => node.type === "equipment") ?? [];
  const childWorkflowNodes =
    context?.nodes.filter(node => !!node.childWorkflowId) ?? [];
  const driverEquipmentNodes = equipmentNodes.filter(
    node => !!parseDriverTemplateKey(node.templateKey)
  );
  const genericEquipmentNodes = equipmentNodes.filter(
    node => !parseDriverTemplateKey(node.templateKey)
  );
  const nodeSetupFor = useCallback(
    (node: (typeof equipmentNodes)[number]): NodeSetup => {
      return (
        nodeSetups[node.nodeKey] ?? {
          equipmentId: node.equipmentId ? String(node.equipmentId) : "none",
          params: {
            ...fieldDefaults(fieldsForNode(node)),
            ...parseParams(node.params),
          },
          overrideReason: "",
        }
      );
    },
    [fieldsForNode, nodeSetups]
  );
  const selectedList = Object.entries(selectedResources).map(
    ([sampleId, selection]) => ({
      sampleId: Number(sampleId),
      ...selection,
      source: context?.resources.find(
        resource => resource.id === Number(sampleId)
      ),
    })
  );
  const sampleCount = selectedList.filter(
    resource => resource.role === "sample"
  ).length;
  const cloningTargetBindings = selectedList
    .flatMap(resource =>
      resource.role === "sample" && resource.source
        ? [
            {
              sampleId: resource.sampleId,
              sku: resource.source.sku,
              name: resource.source.name,
              type: resource.source.type,
            },
          ]
        : []
    )
    .map((sample, index) => ({ target: index + 1, ...sample }));
  const materialCount = selectedList.filter(
    resource => resource.role === "material"
  ).length;
  const controlCount = selectedList.filter(
    resource => resource.role === "control"
  ).length;
  const cloningLayoutPlans = context?.cloningLayoutPlans ?? [];
  const selectedCloningLayoutPlan =
    cloningLayoutPlans.find(plan => plan.id === cloningLayoutPlanId) ?? null;
  const loadedCloningLayoutPlan =
    selectedCloningLayoutPlan &&
    cloningLayoutPlanQuery.data?.id === selectedCloningLayoutPlan.id &&
    cloningLayoutPlanQuery.data.workflowId === context?.workflow.id
      ? cloningLayoutPlanQuery.data
      : null;
  const cloningLayoutPlanMismatch =
    !!selectedCloningLayoutPlan &&
    !!cloningLayoutPlanQuery.data &&
    !loadedCloningLayoutPlan;
  const cloningLayoutSampleCountMatches =
    !!selectedCloningLayoutPlan &&
    sampleCount === selectedCloningLayoutPlan.sampleCount;
  const planPreviewResources: PlanPreviewResource[] = selectedList.flatMap(
    resource =>
      resource.source
        ? [
            {
              id: resource.source.id,
              sku: resource.source.sku,
              name: resource.source.name,
              role: resource.role,
              amount: resource.amount,
              unit: resource.source.unit,
            },
          ]
        : []
  );

  const compatibleEquipment = (node: (typeof equipmentNodes)[number]) => {
    if (!context) return [];
    const ref = parseDriverTemplateKey(node.templateKey);
    return context.equipment.filter(device => {
      if (["maintenance", "fault"].includes(device.status)) return false;
      if (!ref) return true;
      const expectedStatus =
        executionMode === "simulation" ? "simulation_ready" : "ready";
      return (
        device.binding?.enabled &&
        device.binding.driverKey === ref.driverKey &&
        device.binding.driverVersion === ref.version &&
        device.binding.mode === executionMode &&
        device.binding.status === expectedStatus
      );
    });
  };

  const scheduleDuration =
    new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime();
  const scheduleValid =
    !!scheduledStart &&
    !!scheduledEnd &&
    scheduleDuration > 0 &&
    scheduleDuration <= 7 * 24 * 60 * 60 * 1_000;
  const resourceValid =
    sampleCount > 0 &&
    selectedList.every(
      resource =>
        !!resource.source &&
        resource.amount > 0 &&
        resource.amount <= Number(resource.source.availableQuantity)
    );
  const equipmentSelectionIsValid = (node: (typeof equipmentNodes)[number]) => {
    const equipmentId = Number(nodeSetupFor(node).equipmentId) || 0;
    return (
      equipmentId > 0 &&
      compatibleEquipment(node).some(device => device.id === equipmentId)
    );
  };
  const driverEquipmentValid = driverEquipmentNodes.every(
    equipmentSelectionIsValid
  );
  const genericEquipmentValid = genericEquipmentNodes.every(
    equipmentSelectionIsValid
  );
  const equipmentValid = driverEquipmentValid && genericEquipmentValid;
  const parametersValid = equipmentNodes.every(node => {
    const setup = nodeSetupFor(node);
    return fieldsForNode(node).every(field =>
      fieldValueIsValid(field, setup.params[field.key])
    );
  });
  const planPreviewEquipment: PlanPreviewEquipment[] = equipmentNodes.map(
    node => {
      const setup = nodeSetupFor(node);
      const selectedDevice =
        context?.equipment.find(
          device => String(device.id) === setup.equipmentId
        ) ?? null;
      return {
        nodeKey: node.nodeKey,
        nodeLabel: node.label,
        deviceName: selectedDevice?.name ?? null,
        deviceStatus: selectedDevice
          ? (EQUIP_STATUS[selectedDevice.status]?.label ??
            selectedDevice.status)
          : null,
        configured: equipmentSelectionIsValid(node),
      };
    }
  );
  const workflowRunnable =
    workflowId > 0 &&
    context?.workflow.status === "active" &&
    context.nodes.length > 0 &&
    childWorkflowNodes.length === 0;
  const stepValid = [
    workflowRunnable &&
      !!effectiveName.trim() &&
      effectiveProjectId !== "none" &&
      scheduleValid,
    resourceValid,
    cloningLayoutPlans.length === 0 ||
      skipCloningLayout ||
      (!!selectedCloningLayoutPlan &&
        !!loadedCloningLayoutPlan &&
        cloningLayoutSampleCountMatches &&
        !cloningLayoutPlanQuery.error),
    equipmentValid && parametersValid,
    true,
  ];
  const launchValid = stepValid.every(Boolean);

  const visibleResources = useMemo(() => {
    const needle = resourceQuery.trim().toLowerCase();
    return (context?.resources ?? [])
      .filter(resource => {
        const currentRole =
          selectedResources[resource.id]?.role ??
          suggestedResourceRole(resource.type);
        return resourceView === "all" || currentRole === resourceView;
      })
      .filter(
        resource =>
          !needle ||
          `${resource.sku} ${resource.name} ${resource.type}`
            .toLowerCase()
            .includes(needle)
      )
      .sort(
        (a, b) =>
          Number(!!selectedResources[b.id]) - Number(!!selectedResources[a.id])
      )
      .slice(0, 200);
  }, [context?.resources, resourceQuery, resourceView, selectedResources]);

  const updateNode = (nodeKey: string, patch: Partial<NodeSetup>) => {
    const node = equipmentNodes.find(
      candidate => candidate.nodeKey === nodeKey
    );
    if (!node) return;
    setNodeSetups(current => ({
      ...current,
      [nodeKey]: { ...nodeSetupFor(node), ...patch },
    }));
  };

  const selectWorkflow = (id: number) => {
    setCloningLayoutPlanId(null);
    setSkipCloningLayout(false);
    setSearchParams({ workflowId: String(id) });
  };

  const submit = () => {
    if (!context || !launchValid) return;
    createMut.mutate({
      workflowId: context.workflow.id,
      name: effectiveName.trim(),
      purpose: purpose.trim() || null,
      projectId: Number(effectiveProjectId),
      executionMode,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      operatorName: operatorName.trim() || null,
      resources: selectedList.map(resource => ({
        sampleId: resource.sampleId,
        role: resource.role,
        amount: resource.amount,
      })),
      cloningLayoutPlanId: selectedCloningLayoutPlan?.id ?? null,
      nodeBindings: equipmentNodes.map(node => ({
        nodeKey: node.nodeKey,
        equipmentId: Number(nodeSetupFor(node).equipmentId),
        params: nodeSetupFor(node).params,
        overrideReason: nodeSetupFor(node).overrideReason || null,
      })),
      idempotencyKey,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/runs")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="text-sm font-medium text-teal-700">
            {t("实验执行")}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("发起实验运行")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("把可复用流程实例化为一次独立 Run，并锁定本批资源和设备参数。")}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-5 gap-2">
            {STEPS.map((label, index) => (
              <div key={label} className="relative">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      index < step
                        ? "bg-teal-600 text-white"
                        : index === step
                          ? "bg-slate-950 text-white"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {index < step ? <Check className="h-4 w-4" /> : index + 1}
                  </div>
                  <span
                    className={`hidden text-xs font-medium sm:block ${index === step ? "text-slate-950" : "text-muted-foreground"}`}
                  >
                    {t(label)}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className="absolute left-8 right-0 top-3.5 h-px bg-slate-200 sm:left-32" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(workflowsError || driverNodesError || contextQuery.error) && (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>{t("无法加载发起运行所需数据")}</AlertTitle>
          <AlertDescription>
            {workflowsError?.message ??
              driverNodesError?.message ??
              contextQuery.error?.message}
          </AlertDescription>
        </Alert>
      )}

      {step === 0 && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4 text-teal-600" />{" "}
                {t("1. 选择已配置流程")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {eligibleWorkflows.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{t("还没有已启用的流程")}</AlertTitle>
                  <AlertDescription>
                    {t("请先在 BioFlow 中完成配置并将流程状态设为进行中。")}
                  </AlertDescription>
                </Alert>
              ) : (
                eligibleWorkflows.map(workflow => (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => selectWorkflow(workflow.id)}
                    className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                      workflowId === workflow.id
                        ? "border-teal-500 bg-teal-50/60 ring-1 ring-teal-500"
                        : "hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${workflowId === workflow.id ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
                    >
                      <Network className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{workflow.name}</div>
                      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {workflow.description || t("未填写流程说明")}
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <div className="text-xs font-medium">
                        {t("{n} 个节点", { n: workflow.nodeCount })}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {workflow.projectId ? t("已关联项目") : t("未关联项目")}
                      </div>
                    </div>
                    {workflowId === workflow.id ? (
                      <CheckCircle2 className="h-5 w-5 text-teal-600" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    )}
                  </button>
                ))
              )}
              {childWorkflowNodes.length > 0 && (
                <Alert variant="destructive">
                  <CircleAlert className="h-4 w-4" />
                  <AlertTitle>{t("当前流程包含未展开的物理子流程")}</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      {t(
                        "运行快照暂不支持递归冻结子流程。请先在 BioFlow 中展开或改为顶层节点后再发起。"
                      )}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/workflows/${workflowId}`)}
                    >
                      {t("返回 BioFlow 处理")}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("本次运行信息")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("运行名称")}</Label>
                <Input
                  value={effectiveName}
                  onChange={event => setName(event.target.value)}
                  placeholder={t("例如：抗体 BLI 表征 · 批次 01")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("关联项目")}</Label>
                <Select
                  value={effectiveProjectId}
                  onValueChange={setProjectId}
                  disabled={!context}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("选择项目")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("请选择项目")}</SelectItem>
                    {context?.projects
                      .filter(project => project.status === "active")
                      .map(project => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {project.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("运行负责人")}</Label>
                <Input
                  value={operatorName}
                  onChange={event => setOperatorName(event.target.value)}
                  placeholder={t("默认当前用户")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("执行模式")}</Label>
                <Select
                  value={executionMode}
                  onValueChange={value => setExecutionMode(value as LabRunMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simulation">
                      {t("模拟运行（推荐用于当前验证）")}
                    </SelectItem>
                    <SelectItem value="edge" disabled>
                      {t("现场设备（等待 Edge 运行通道）")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("计划开始")}</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledStart}
                    onChange={event => setScheduledStart(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("计划结束")}</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledEnd}
                    onChange={event => setScheduledEnd(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("实验目的（可选）")}</Label>
                <Textarea
                  value={purpose}
                  onChange={event => setPurpose(event.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 1 && context && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TestTubes className="h-4 w-4 text-teal-600" />{" "}
                    {t("2. 选择本批样本与物料")}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      executionMode === "simulation"
                        ? "选中后填写本次计划量；模拟 Run 只冻结资源快照，不占用真实库存。"
                        : "选中后填写本次计划量；现场运行将创建样品请求并预占库存，不直接扣减余额。"
                    )}
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <Badge variant="secondary">
                    {t("样本 {n}", { n: sampleCount })}
                  </Badge>
                  <Badge variant="secondary">
                    {t("物料 {n}", { n: materialCount })}
                  </Badge>
                  <Badge variant="secondary">
                    {t("对照 {n}", { n: controlCount })}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={resourceQuery}
                    onChange={event => setResourceQuery(event.target.value)}
                    placeholder={t("搜索 Sample ID、名称或类型")}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  {(["all", "sample", "material", "control"] as const).map(
                    role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setResourceView(role)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium ${resourceView === role ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                      >
                        {role === "all"
                          ? t("全部")
                          : t(LAB_RUN_ROLE_META[role].label)}
                      </button>
                    )
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedResources(current => {
                        const next = { ...current };
                        for (const resource of visibleResources) {
                          if (
                            Number(resource.availableQuantity) <= 0 ||
                            next[resource.id]
                          )
                            continue;
                          next[resource.id] = {
                            role: suggestedResourceRole(resource.type),
                            amount: Math.min(
                              1,
                              Number(resource.availableQuantity)
                            ),
                          };
                        }
                        return next;
                      })
                    }
                  >
                    {t("选择当前结果")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={selectedList.length === 0}
                    onClick={() => setSelectedResources({})}
                  >
                    {t("清空已选")}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <div className="min-w-[680px] grid grid-cols-[40px_minmax(180px,1fr)_130px_120px_130px] gap-3 border-b bg-slate-50 px-4 py-2.5 text-[11px] font-semibold text-slate-500">
                  <span />
                  <span>{t("库存对象")}</span>
                  <span>{t("本次角色")}</span>
                  <span>{t("可用量")}</span>
                  <span>{t("本次计划量")}</span>
                </div>
                <div className="max-h-[480px] min-w-[680px] divide-y overflow-y-auto">
                  {visibleResources.map(resource => {
                    const selected = selectedResources[resource.id];
                    const enabled = Number(resource.availableQuantity) > 0;
                    return (
                      <div
                        key={resource.id}
                        className={`grid grid-cols-[40px_minmax(180px,1fr)_130px_120px_130px] items-center gap-3 px-4 py-3 text-sm ${selected ? "bg-teal-50/40" : ""}`}
                      >
                        <Checkbox
                          checked={!!selected}
                          disabled={!enabled}
                          onCheckedChange={checked => {
                            setSelectedResources(current => {
                              const next = { ...current };
                              if (!checked) delete next[resource.id];
                              else
                                next[resource.id] = {
                                  role: suggestedResourceRole(resource.type),
                                  amount: Math.min(
                                    1,
                                    Number(resource.availableQuantity)
                                  ),
                                };
                              return next;
                            });
                          }}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            <span className="mr-2 text-xs text-teal-700">
                              {resource.sku}
                            </span>
                            {resource.name}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {t(resource.type)} ·{" "}
                            {resource.locationId
                              ? t("已定位")
                              : t("位置待确认")}
                          </div>
                        </div>
                        {selected ? (
                          <Select
                            value={selected.role}
                            onValueChange={value =>
                              setSelectedResources(current => ({
                                ...current,
                                [resource.id]: {
                                  ...current[resource.id],
                                  role: value as LabRunResourceRole,
                                },
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(["sample", "material", "control"] as const).map(
                                role => (
                                  <SelectItem key={role} value={role}>
                                    {t(LAB_RUN_ROLE_META[role].label)}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t(
                              LAB_RUN_ROLE_META[
                                suggestedResourceRole(resource.type)
                              ].label
                            )}
                          </span>
                        )}
                        <span
                          className={
                            Number(resource.availableQuantity) > 0
                              ? "text-slate-700"
                              : "text-red-600"
                          }
                        >
                          {resource.availableQuantity} {resource.unit}
                        </span>
                        {selected ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min="0.001"
                              step="0.001"
                              max={Number(resource.availableQuantity)}
                              value={selected.amount}
                              onChange={event =>
                                setSelectedResources(current => ({
                                  ...current,
                                  [resource.id]: {
                                    ...current[resource.id],
                                    amount: Number(event.target.value),
                                  },
                                }))
                              }
                              className="h-8"
                            />
                            <span className="text-xs text-muted-foreground">
                              {resource.unit}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {sampleCount === 0 && (
                <p className="text-xs text-amber-700">
                  {t("至少需要选择一个“实验样本”。")}
                </p>
              )}
            </CardContent>
          </Card>
          {sampleCount > 0 && (
            <RunPlanDataFlowPreview
              projectName={
                context.projects.find(
                  project => String(project.id) === effectiveProjectId
                )?.name ?? null
              }
              purpose={purpose}
              workflowName={context.workflow.name}
              resources={planPreviewResources}
              nodes={context.nodes}
              equipment={planPreviewEquipment}
              showEquipmentDetails={false}
            />
          )}
        </div>
      )}

      {step === 2 && context && (
        <div className="space-y-4">
          <Alert className="border-sky-200 bg-sky-50">
            <FileLock2 className="h-4 w-4 text-sky-700" />
            <AlertTitle>{t("选择要随 Run 冻结的孔板方案")}</AlertTitle>
            <AlertDescription>
              {t(
                "这里只能选择当前流程已经保存的版本。Run 创建后会保留所选快照，不会自动跟随 BioFlow 中的新版本。"
              )}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Grid2X2 className="h-4 w-4 text-teal-600" />{" "}
                    {t("3. 选择流程与孔板")}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "排板中的目标号、容器和孔位是规划数据；运行节点状态、实际样本位置与实验结果仍以 Run 业务记录为准。"
                    )}
                  </p>
                </div>
                {cloningLayoutPlans.length > 0 && (
                  <Badge variant="secondary">
                    {t("{n} 个已保存版本", { n: cloningLayoutPlans.length })}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {cloningLayoutPlans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                  <Grid2X2 className="mx-auto h-9 w-9 text-slate-300" />
                  <h3 className="mt-3 text-sm font-semibold">
                    {t("当前流程还没有已保存的排板方案")}
                  </h3>
                  <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
                    {t(
                      "可以继续创建不带孔板快照的通用 Run；其详情页会明确显示“未关联排板”，不会临时生成或套用其他版本。"
                    )}
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    onClick={() =>
                      navigate(`/workflows/${workflowId}?view=plates`)
                    }
                  >
                    {t("返回 BioFlow 配置孔板")}{" "}
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-amber-700">
                    {skipCloningLayout
                      ? t(
                          "已明确选择不关联孔板方案；最终确认前仍可改选已保存版本。"
                        )
                      : selectedCloningLayoutPlan
                        ? t("已显式选择 V{version}；最终确认前仍可改选。", {
                            version: selectedCloningLayoutPlan.version,
                          })
                        : t(
                            "请选择一个明确版本；系统不会默认把最新版本悄悄写入 Run。"
                          )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "分子克隆 / Gibson Run 建议关联已保存方案；只有确实不需要孔板追溯时，才选择不关联。"
                    )}
                  </p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {cloningLayoutPlans.map(plan => {
                      const selected =
                        plan.id === selectedCloningLayoutPlan?.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setSkipCloningLayout(false);
                            setCloningLayoutPlanId(plan.id);
                          }}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            selected
                              ? "border-teal-500 bg-teal-50/60 ring-1 ring-teal-500"
                              : "bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}
                            >
                              {selected ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Grid2X2 className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">
                                  {plan.name}
                                </span>
                                <Badge variant="outline">V{plan.version}</Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  {t("{n} 个目标", { n: plan.sampleCount })}
                                </span>
                                <span>
                                  {t("{n} 块孔板", { n: plan.plateCount })}
                                </span>
                                <span>
                                  {plan.nodeLabel
                                    ? t("来源节点：{node}", {
                                        node: plan.nodeLabel,
                                      })
                                    : t("流程级方案")}
                                </span>
                              </div>
                              <div className="mt-2 text-[10px] text-muted-foreground">
                                {new Date(plan.createdAt).toLocaleString(
                                  lang === "en" ? "en-US" : "zh-CN"
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    aria-pressed={skipCloningLayout}
                    onClick={() => {
                      setCloningLayoutPlanId(null);
                      setSkipCloningLayout(true);
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      skipCloningLayout
                        ? "border-amber-500 bg-amber-50/70 ring-1 ring-amber-500"
                        : "border-dashed bg-white hover:border-amber-300 hover:bg-amber-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          skipCloningLayout
                            ? "bg-amber-600 text-white"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {skipCloningLayout ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <FileLock2 className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            {t("不关联孔板方案")}
                          </span>
                          <Badge variant="outline">{t("通用 Run")}</Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {t(
                            "本次 Run 不冻结孔板快照；详情页会保留未关联空态，不会套用当前或最新方案。"
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedCloningLayoutPlan && (
            <Alert
              className={
                cloningLayoutSampleCountMatches
                  ? "border-teal-200 bg-teal-50"
                  : "border-amber-300 bg-amber-50"
              }
            >
              {cloningLayoutSampleCountMatches ? (
                <CheckCircle2 className="h-4 w-4 text-teal-700" />
              ) : (
                <CircleAlert className="h-4 w-4 text-amber-700" />
              )}
              <AlertTitle>
                {t("实验样本绑定：{selected} / {required}", {
                  selected: sampleCount,
                  required: selectedCloningLayoutPlan.sampleCount,
                })}
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  {cloningLayoutSampleCountMatches
                    ? t("数量已匹配；创建 Run 时会冻结 TGT→sample 顺序映射。")
                    : t(
                        "所选方案需要 {required} 个目标，当前绑定了 {selected} 个实验样本。数量一致后才能继续。",
                        {
                          selected: sampleCount,
                          required: selectedCloningLayoutPlan.sampleCount,
                        }
                      )}
                </p>
                {!cloningLayoutSampleCountMatches && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                    {t("返回上一步选择样本")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {skipCloningLayout && cloningLayoutPlans.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <Info className="h-4 w-4 text-amber-700" />
              <AlertTitle>{t("本次明确不关联孔板方案")}</AlertTitle>
              <AlertDescription>
                {t(
                  "将创建通用 Run，不包含流程与孔板快照。若本次是分子克隆 / Gibson 执行，建议改选上方已保存方案。"
                )}
              </AlertDescription>
            </Alert>
          )}

          {selectedCloningLayoutPlan && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Grid2X2 className="h-4 w-4 text-teal-600" />
                  {t("所选方案预览")}
                  <Badge variant="outline">
                    V{selectedCloningLayoutPlan.version}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "请在继续前核对流程节点、孔板和所选目标详情；Run 将冻结这里显示的已保存版本。"
                  )}
                </p>
              </CardHeader>
              <CardContent>
                {cloningLayoutPlanQuery.isLoading && (
                  <div
                    className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"
                    role="status"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("加载中…")}
                  </div>
                )}

                {(cloningLayoutPlanQuery.error ||
                  cloningLayoutPlanMismatch) && (
                  <Alert variant="destructive">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>{t("无法加载所选孔板方案")}</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p>
                        {cloningLayoutPlanMismatch
                          ? t("所选方案不属于当前流程，请重新选择。")
                          : t(cloningLayoutPlanQuery.error?.message ?? "")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void cloningLayoutPlanQuery.refetch()}
                      >
                        {t("重新加载")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {loadedCloningLayoutPlan && !cloningLayoutPlanQuery.error && (
                  <CloningPlateFlowViewer
                    plan={loadedCloningLayoutPlan.plan}
                    showJsonExport={false}
                    targetBindings={
                      cloningLayoutSampleCountMatches &&
                      cloningTargetBindings.length ===
                        selectedCloningLayoutPlan.sampleCount
                        ? cloningTargetBindings
                        : undefined
                    }
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === 3 && context && (
        <div className="space-y-4">
          <Alert
            className={
              executionMode === "simulation"
                ? "border-blue-200 bg-blue-50"
                : "border-amber-200 bg-amber-50"
            }
          >
            <MonitorCog className="h-4 w-4" />
            <AlertTitle>
              {t(
                executionMode === "simulation"
                  ? "当前创建模拟运行"
                  : "当前申请现场设备运行"
              )}
            </AlertTitle>
            <AlertDescription>
              {t(
                executionMode === "simulation"
                  ? "驱动节点仅显示通过 simulation_ready 校验的设备；通用设备节点需人工确认能力与型号。"
                  : "驱动节点仅显示真实 ready 的设备；通用设备节点需人工确认能力与型号，最终启动仍由 Edge 门禁控制。"
              )}
            </AlertDescription>
          </Alert>
          {sampleCount > 0 && (
            <RunPlanDataFlowPreview
              projectName={
                context.projects.find(
                  project => String(project.id) === effectiveProjectId
                )?.name ?? null
              }
              purpose={purpose}
              workflowName={context.workflow.name}
              resources={planPreviewResources}
              nodes={context.nodes}
              equipment={planPreviewEquipment}
              showEquipmentDetails
            />
          )}
          {equipmentNodes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t("该流程没有设备节点，将按人工流程创建运行。")}
              </CardContent>
            </Card>
          ) : (
            equipmentNodes.map((node, index) => {
              const setup = nodeSetupFor(node);
              const fields = fieldsForNode(node);
              const devices = compatibleEquipment(node);
              const driver = node.templateKey
                ? driverByTemplate.get(node.templateKey)
                : undefined;
              const isDriverNode = !!parseDriverTemplateKey(node.templateKey);
              return (
                <Card key={node.nodeKey}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                          {t("设备节点 {n}", { n: index + 1 })}
                        </div>
                        <CardTitle className="mt-1 text-base">
                          {node.label}
                        </CardTitle>
                      </div>
                      {driver && (
                        <Badge variant="outline">
                          {driver.driverName} · {driver.driverVersion}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]">
                      <div className="space-y-2">
                        <Label>{t("本次使用设备")}</Label>
                        <Select
                          value={setup.equipmentId}
                          onValueChange={value =>
                            updateNode(node.nodeKey, { equipmentId: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("选择设备实例")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {t("请选择设备")}
                            </SelectItem>
                            {devices.map(device => (
                              <SelectItem
                                key={device.id}
                                value={String(device.id)}
                              >
                                {device.name}
                                {device.model ? ` · ${device.model}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {devices.length === 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs text-red-600">
                              {t(
                                isDriverNode
                                  ? "没有与当前模式及驱动版本匹配的就绪设备。"
                                  : "没有可选择的通用设备，请先检查设备状态。"
                              )}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate("/equipment")}
                              >
                                {t("设备管理")}
                              </Button>
                              {isDriverNode && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate("/drivers")}
                                >
                                  {t("驱动中心")}
                                </Button>
                              )}
                            </div>
                          </div>
                        ) : isDriverNode ? (
                          <p className="text-xs text-muted-foreground">
                            {t(
                              "驱动节点仅列出状态、驱动版本和执行模式均匹配的设备。"
                            )}
                          </p>
                        ) : setup.equipmentId !== "none" ? (
                          <p className="text-xs text-amber-700">
                            {t(
                              "已选择通用设备，需人工确认设备能力与型号适配本步骤。"
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-700">
                            {t("请选择通用设备，并人工确认设备能力与型号。")}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label>{t("当次参数")}</Label>
                        {fields.length === 0 ? (
                          <div className="mt-2 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                            {t("该节点没有声明可覆盖参数，将沿用流程配置。")}
                          </div>
                        ) : (
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            {fields.map(field => {
                              const value = setup.params[field.key] ?? "";
                              return (
                                <div key={field.key} className="space-y-1.5">
                                  <Label className="text-xs">
                                    {t(
                                      "labelEn" in field && lang === "en"
                                        ? (field.labelEn ?? field.label)
                                        : field.label
                                    )}
                                    {"required" in field && field.required
                                      ? " *"
                                      : ""}
                                    {field.unit ? ` (${field.unit})` : ""}
                                  </Label>
                                  {field.type === "select" ||
                                  field.type === "boolean" ? (
                                    <Select
                                      value={String(value)}
                                      onValueChange={next =>
                                        updateNode(node.nodeKey, {
                                          params: {
                                            ...setup.params,
                                            [field.key]:
                                              field.type === "boolean"
                                                ? next === "true"
                                                : next,
                                          },
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-9">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {field.type === "boolean" ? (
                                          <>
                                            <SelectItem value="true">
                                              {t("是")}
                                            </SelectItem>
                                            <SelectItem value="false">
                                              {t("否")}
                                            </SelectItem>
                                          </>
                                        ) : (
                                          field.options?.map(option => (
                                            <SelectItem
                                              key={option}
                                              value={option}
                                            >
                                              {t(option)}
                                            </SelectItem>
                                          ))
                                        )}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Input
                                      type={
                                        field.type === "number"
                                          ? "number"
                                          : "text"
                                      }
                                      value={String(value)}
                                      min={
                                        "min" in field ? field.min : undefined
                                      }
                                      max={
                                        "max" in field ? field.max : undefined
                                      }
                                      onChange={event =>
                                        updateNode(node.nodeKey, {
                                          params: {
                                            ...setup.params,
                                            [field.key]:
                                              field.type === "number"
                                                ? Number(event.target.value)
                                                : event.target.value,
                                          },
                                        })
                                      }
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {fields.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          {t("参数调整说明（可选）")}
                        </Label>
                        <Input
                          value={setup.overrideReason}
                          onChange={event =>
                            updateNode(node.nodeKey, {
                              overrideReason: event.target.value,
                            })
                          }
                          placeholder={t("说明本批为什么需要覆盖模板默认值")}
                        />
                      </div>
                    )}
                    {!fields.every(field =>
                      fieldValueIsValid(field, setup.params[field.key])
                    ) && (
                      <p className="text-xs text-red-600">
                        {t("请补齐必填参数并检查允许范围。")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {step === 4 && context && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Alert className="border-teal-200 bg-teal-50">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <AlertTitle>{t("将创建不可变 Run 快照")}</AlertTitle>
              <AlertDescription>
                {t(
                  selectedCloningLayoutPlan
                    ? "流程节点、所选孔板方案、样本与物料、设备实例、驱动版本和最终有效参数都会固化；后续修改不会回写本次运行。"
                    : "流程节点、样本与物料、设备实例、驱动版本和最终有效参数都会固化；本次未关联孔板方案，详情页将保留诚实空态。"
                )}
              </AlertDescription>
            </Alert>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("运行计划")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {[
                  [t("来源流程"), context.workflow.name],
                  [t("运行名称"), effectiveName],
                  [
                    t("关联项目"),
                    context.projects.find(
                      project => String(project.id) === effectiveProjectId
                    )?.name ?? "—",
                  ],
                  [
                    t("执行模式"),
                    t(executionMode === "simulation" ? "模拟运行" : "现场执行"),
                  ],
                  [
                    t("计划时段"),
                    `${new Date(scheduledStart).toLocaleString(lang === "en" ? "en-US" : "zh-CN")} — ${new Date(scheduledEnd).toLocaleString(lang === "en" ? "en-US" : "zh-CN")}`,
                  ],
                  [t("运行负责人"), operatorName || t("当前用户")],
                  [
                    t("冻结孔板方案"),
                    selectedCloningLayoutPlan
                      ? `${selectedCloningLayoutPlan.name} · V${selectedCloningLayoutPlan.version}`
                      : skipCloningLayout
                        ? t("已明确不关联（通用 Run）")
                        : t("未关联排板"),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {label}
                    </div>
                    <div className="mt-1 text-sm font-medium">{value}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("资源与设备摘要")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span>{t("实验样本")}</span>
                  <strong>{sampleCount}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span>{t("试剂与物料 / 标准对照")}</span>
                  <strong>{materialCount + controlCount}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span>{t("设备节点")}</span>
                  <strong>{equipmentNodes.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span>{t("流程节点总数")}</span>
                  <strong>{context.nodes.length}</strong>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">{t("发起前检查")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  ok: context.workflow.status === "active",
                  label: t("流程已启用并保存"),
                },
                {
                  ok: context.nodes.length > 0,
                  label: t("流程包含可执行节点"),
                },
                {
                  ok: childWorkflowNodes.length === 0,
                  label: t("流程不含未展开的物理子流程"),
                },
                { ok: sampleCount > 0, label: t("已绑定实验样本") },
                { ok: resourceValid, label: t("库存可用量满足本次计划") },
                ...(cloningLayoutPlans.length > 0
                  ? [
                      {
                        ok: skipCloningLayout || !!selectedCloningLayoutPlan,
                        label: t(
                          skipCloningLayout
                            ? "已明确选择不关联孔板方案"
                            : "已显式选择要冻结的孔板方案版本"
                        ),
                      },
                      ...(selectedCloningLayoutPlan
                        ? [
                            {
                              ok: cloningLayoutSampleCountMatches,
                              label: t("实验样本数与排板目标数一致"),
                            },
                            {
                              ok:
                                !!loadedCloningLayoutPlan &&
                                !cloningLayoutPlanQuery.error,
                              label: t("所选孔板方案已完整加载"),
                            },
                          ]
                        : []),
                    ]
                  : []),
                ...(driverEquipmentNodes.length > 0
                  ? [
                      {
                        ok: driverEquipmentValid,
                        label: t("驱动节点的设备与执行模式匹配"),
                      },
                    ]
                  : []),
                ...(genericEquipmentNodes.length > 0
                  ? [
                      {
                        ok: genericEquipmentValid,
                        label: t("通用设备节点已选择；能力与型号需人工确认"),
                      },
                    ]
                  : []),
                { ok: parametersValid, label: t("当次参数通过字段校验") },
                { ok: scheduleValid, label: t("运行时段有效") },
              ].map(check => (
                <div
                  key={check.label}
                  className="flex items-start gap-2 text-sm"
                >
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span>{check.label}</span>
                </div>
              ))}
              {materialCount === 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-700">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("本次未选择试剂或物料；若流程确实不消耗库存，可继续。")}
                </div>
              )}
              {cloningLayoutPlans.length === 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-700">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  {t(
                    "当前流程没有已保存排板；本次 Run 不会包含流程与孔板快照。"
                  )}
                </div>
              )}
              <div className="rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
                {t(
                  executionMode === "simulation"
                    ? "“发起”只会锁定模拟计划，不预占真实库存、不预约真实设备，也不会下发物理命令。"
                    : "“发起”只会锁定计划、预占库存并预约设备，不会直接向 Hamilton、酶标仪或其他真机下发命令。"
                )}
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-500"
                disabled={!launchValid || createMut.isPending}
                onClick={submit}
              >
                {createMut.isPending ? t("正在锁定资源…") : t("锁定并发起运行")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(current => Math.max(0, current - 1))}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("上一步")}
        </Button>
        {step < STEPS.length - 1 && (
          <Button
            disabled={!stepValid[step] || contextQuery.isLoading}
            onClick={() =>
              setStep(current => Math.min(STEPS.length - 1, current + 1))
            }
          >
            {t("下一步")} <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
