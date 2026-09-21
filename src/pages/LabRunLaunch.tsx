import {
  plateCoverage,
  PLATE_STAGE_LABELS,
} from "@contracts/samplePlateLayout";
import { SamplePlateView } from "@/features/cloning-planner/SamplePlateWorkspace";
import { useCallback, useMemo, useState } from "react";
import {
  assessMethodEquipment,
  methodMaterialDemand,
  methodParameterIssues,
} from "@contracts/method";
import { runDraftPayloadSchema } from "@contracts/runDraft";
import { resolveSampleBatch } from "@contracts/sampleBatch";
import { useAuth } from "@/hooks/useAuth";
import { useRunDraft, type DraftInitial } from "@/hooks/useRunDraft";
import PairedSamplePicker from "@/components/lab-run/PairedSamplePicker";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ExternalLink,
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
import CloningPlateFlowViewer from "@/features/cloning-planner/CloningPlateFlowViewer";
import { BioViewRuntime } from "@/features/bioview";
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
  sampleId: number;
  sku: string;
  name: string;
  type: string;
  role: LabRunResourceRole;
  amount: number;
  unit: string;
};
const STEPS = ["选择方法", "准备本批", "检查并确认"];

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialSchedule() {
  const start = new Date();
  start.setSeconds(0, 0);
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

export default function LabRunLaunch() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const requestedWorkflowId = Number(searchParams.get("workflowId"));
  const workflowId =
    Number.isSafeInteger(requestedWorkflowId) && requestedWorkflowId > 0
      ? requestedWorkflowId
      : 0;
  const requestedReleaseId = Number(searchParams.get("methodReleaseId"));
  const methodReleaseId =
    Number.isSafeInteger(requestedReleaseId) && requestedReleaseId > 0
      ? requestedReleaseId
      : undefined;
  const drafts = trpc.runDraft.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  if (drafts.isLoading) return <p>{t("正在恢复实验草稿…")}</p>;
  if (drafts.error) return <p role="alert">{drafts.error.message}</p>;
  const server = searchParams.get("draftId")
    ? drafts.data?.find(d => d.id === searchParams.get("draftId"))
    : drafts.data?.find(d => d.workflowId === workflowId);
  if (searchParams.has("draftId") && !server)
    return <p role="alert">{t("草稿不存在或已交接给其他人")}</p>;
  const storageKey = `biomap-run-draft:${user?.id}:${workflowId}`;
  let initial: DraftInitial | undefined = server;
  try {
    const local = JSON.parse(
      localStorage.getItem(storageKey) ?? "null"
    ) as DraftInitial | null;
    if (
      local &&
      ((server &&
        local.id === server.id &&
        local.revision === server.revision) ||
        (!server && local.revision === 0))
    ) {
      const payload = runDraftPayloadSchema.parse(local.payload);
      if (payload.workflowId === workflowId)
        initial = {
          ...local,
          payload,
          unsaved: JSON.stringify(payload) !== JSON.stringify(server?.payload),
        };
    }
  } catch {
    /* Invalid or unavailable browser recovery never replaces the server draft. */
  }
  return (
    <LabRunLaunchForm
      key={`${workflowId}:${methodReleaseId ?? "latest"}`}
      workflowId={workflowId}
      methodReleaseId={methodReleaseId}
      initial={initial}
      storageKey={storageKey}
    />
  );
}

function LabRunLaunchForm({
  workflowId,
  methodReleaseId,
  initial,
  storageKey,
}: {
  workflowId: number;
  methodReleaseId?: number;
  initial?: DraftInitial;
  storageKey: string;
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entryParams, setSearchParams] = useSearchParams();
  const entrySampleId = Number(entryParams.get("sampleId"));
  const hasEntrySample =
    Number.isSafeInteger(entrySampleId) && entrySampleId > 0;
  const [entryAmount, setEntryAmount] = useState("");
  const { data: workflows, error: workflowsError } =
    trpc.workflow.list.useQuery();
  const { data: driverNodes, error: driverNodesError } =
    trpc.driver.nodeCatalog.useQuery();
  const contextQuery = trpc.labRun.launchContext.useQuery(
    {
      workflowId,
      methodReleaseId: initial?.payload.methodReleaseId ?? methodReleaseId,
    },
    { enabled: workflowId > 0 }
  );
  const context = contextQuery.data;
  const eligibleWorkflows =
    workflows?.filter(
      workflow => !workflow.parentWorkflowId && !!workflow.publishedRelease
    ) ?? [];
  const [chooseMethod, setChooseMethod] = useState(!workflowId);
  const [step, setStep] = useState(Math.min(initial?.payload.step ?? 0, 2));
  const [name, setName] = useState<string | null>(
    initial?.payload.name ?? null
  );
  const [purpose, setPurpose] = useState(initial?.payload.purpose ?? "");
  const [projectId, setProjectId] = useState<string | null>(
    initial?.payload.projectId ?? null
  );
  const [operatorName, setOperatorName] = useState(
    initial?.payload.operatorName || user?.name || ""
  );
  const [executionMode, setExecutionMode] = useState<LabRunMode>(
    initial?.payload.executionMode ?? "manual"
  );
  const [scheduleDefaults] = useState(initialSchedule);
  const [scheduledStart, setScheduledStart] = useState(
    initial?.payload.scheduledStart ?? scheduleDefaults.start
  );
  const [scheduledEnd, setScheduledEnd] = useState(
    initial?.payload.scheduledEnd ?? scheduleDefaults.end
  );
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceView, setResourceView] = useState<"all" | LabRunResourceRole>(
    "all"
  );
  const [selectedResources, setSelectedResources] = useState<
    Record<number, ResourceSelection>
  >(initial?.payload.selectedResources ?? {});
  const [cloningLayoutPlanId, setCloningLayoutPlanId] = useState<number | null>(
    initial?.payload.cloningLayoutPlanId ?? null
  );
  const [samplePlatePlanIds, setSamplePlatePlanIds] = useState<number[]>(
    initial?.payload.samplePlatePlanIds ?? []
  );
  const samplePlateQuery = trpc.samplePlate.list.useQuery(
    { workflowId },
    { enabled: workflowId > 0 }
  );
  const selectedSamplePlates = (samplePlateQuery.data ?? []).filter(plan =>
    samplePlatePlanIds.includes(plan.id)
  );
  const [skipCloningLayout, setSkipCloningLayout] = useState(
    initial?.payload.skipCloningLayout ?? false
  );
  const cloningLayoutPlanQuery = trpc.cloningLayout.byId.useQuery(
    { id: cloningLayoutPlanId ?? 0 },
    { enabled: cloningLayoutPlanId !== null }
  );
  const [nodeSetups, setNodeSetups] = useState<Record<string, NodeSetup>>(
    initial?.payload.nodeSetups ?? {}
  );
  const [idempotencyKey] = useState(
    () => initial?.payload.idempotencyKey ?? globalThis.crypto.randomUUID()
  );
  const [sampleOrder, setSampleOrder] = useState<number[]>(
    initial?.payload.sampleOrder ?? []
  );
  const [batchCodes, setBatchCodes] = useState("");
  const draft = useRunDraft(
    context
      ? {
          workflowId,
          methodReleaseId: context.methodRelease.id,
          step,
          name,
          purpose,
          projectId,
          operatorName,
          executionMode,
          scheduledStart,
          scheduledEnd,
          selectedResources,
          sampleOrder,
          cloningLayoutPlanId,
          samplePlatePlanIds,
          skipCloningLayout,
          nodeSetups,
          idempotencyKey,
          stageSource: initial?.payload.stageSource,
          reworkSource: initial?.payload.reworkSource,
        }
      : null,
    initial,
    storageKey
  );
  const utils = trpc.useUtils();
  const operators = trpc.runDraft.operators.useQuery();
  const [handoffTo, setHandoffTo] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const handoff = trpc.runDraft.handoff.useMutation({
    onSuccess: async () => {
      draft.removeLocal();
      await utils.runDraft.list.invalidate();
      navigate("/");
    },
    onError: e => toast.error(e.message),
  });

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
      draft.removeLocal();
      void utils.runDraft.list.invalidate();
      toast.success(
        result.repeated ? t("已返回同一次运行") : t("实验运行已锁定并创建")
      );
      navigate(`/runs/${result.id}?tab=bio-view`);
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
  selectedList.sort(
    (a, b) =>
      (sampleOrder.includes(a.sampleId)
        ? sampleOrder.indexOf(a.sampleId)
        : 10000 + a.sampleId) -
      (sampleOrder.includes(b.sampleId)
        ? sampleOrder.indexOf(b.sampleId)
        : 10000 + b.sampleId)
  );
  const sampleCount = selectedList.filter(
    resource => resource.role === "sample"
  ).length;
  const needsIdentity = Object.values(context?.methodSpec.nodes ?? {}).some(
    rule =>
      ["paired_hc_lc", "same_antibody"].includes(
        rule.produces?.parentPolicy ?? ""
      )
  );
  const needsPair = Object.values(context?.methodSpec.nodes ?? {}).some(
    rule => rule.produces?.parentPolicy === "paired_hc_lc"
  );
  const identityInputs = selectedList.filter(
    resource => resource.role === "sample"
  );
  const identities = trpc.sampleIdentity.resolve.useQuery(
    { sampleIds: identityInputs.map(resource => resource.sampleId) },
    { enabled: needsIdentity && sampleCount > 0, refetchOnWindowFocus: true }
  );
  const identityValid =
    !needsIdentity ||
    (!!identities.data &&
      !identities.error &&
      identityInputs.every(resource =>
        identities.data!.some(
          identity => identity.sampleId === resource.sampleId
        )
      ) &&
      (!needsPair ||
        identities.data.every(
          identity =>
            ["HC", "LC"].includes(identity.chain) &&
            identities.data!.some(
              other =>
                other.antibodyId === identity.antibodyId &&
                other.chain === (identity.chain === "HC" ? "LC" : "HC")
            )
        )));
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
              sampleId: resource.source.id,
              sku: resource.source.sku,
              name: resource.source.name,
              type: resource.source.type,
              role: resource.role,
              amount: resource.amount,
              unit: resource.source.unit,
            },
          ]
        : []
  );

  const compatibleEquipment = (node: (typeof equipmentNodes)[number]) => {
    if (!context) return [];
    return context.equipment.filter(
      device =>
        assessMethodEquipment(
          node,
          device,
          context.methodSpec.nodes[node.nodeKey],
          executionMode
        ).compatible
    );
  };

  const scheduleDuration =
    new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime();
  const scheduleValid =
    !!scheduledStart &&
    !!scheduledEnd &&
    scheduleDuration > 0 &&
    scheduleDuration <= 7 * 24 * 60 * 60 * 1_000;
  const materialDemand = context
    ? methodMaterialDemand(
        context.methodSpec,
        sampleCount,
        selectedList
          .filter(r => r.source)
          .map(r => ({ ...r, sku: r.source!.sku, unit: r.source!.unit }))
      )
    : [];
  const resourceValid =
    materialDemand.every(rule => rule.missing === 0) &&
    sampleCount >= (context?.methodSpec.minSamples ?? 1) &&
    sampleCount <= (context?.methodSpec.maxSamples ?? 200) &&
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
    return (
      !methodParameterIssues(
        { ...fieldDefaults(fieldsForNode(node)), ...parseParams(node.params) },
        setup.params,
        context?.methodSpec.nodes[node.nodeKey]
      ).length &&
      fieldsForNode(node).every(field =>
        fieldValueIsValid(field, setup.params[field.key])
      )
    );
  });
  const bioViewPreviewNodes = (context?.nodes ?? []).map(node => {
    const equipmentNode = equipmentNodes.find(
      candidate => candidate.nodeKey === node.nodeKey
    );
    const setup = equipmentNode ? nodeSetupFor(equipmentNode) : null;
    const selectedDevice = setup
      ? context?.equipment.find(
          device => String(device.id) === setup.equipmentId
        )
      : null;
    const driverRef = parseDriverTemplateKey(node.templateKey);
    return {
      ...node,
      equipmentId: selectedDevice?.id ?? node.equipmentId,
      equipmentName: selectedDevice?.name ?? null,
      equipmentModel: selectedDevice?.model ?? null,
      driverKey: driverRef?.driverKey ?? null,
      driverVersion: driverRef?.version ?? null,
      parameterSnapshot: {
        effectiveValues: setup?.params ?? parseParams(node.params),
        ...(node.templateKey ? { methodRef: node.templateKey } : {}),
        ...(setup?.overrideReason
          ? { overrideReason: setup.overrideReason }
          : {}),
      },
    };
  });
  const workflowRunnable =
    workflowId > 0 &&
    !!context?.methodRelease &&
    context.nodes.length > 0 &&
    childWorkflowNodes.length === 0;
  const samplePlatesValid =
    samplePlatePlanIds.length > 0 &&
    !samplePlateQuery.error &&
    selectedSamplePlates.length === samplePlatePlanIds.length &&
    plateCoverage(
      selectedSamplePlates.map(item => item.plan),
      selectedList
        .filter(item => item.role === "sample")
        .map(item => item.sampleId)
    );
  const stepValid = [
    workflowRunnable &&
      !!effectiveName.trim() &&
      effectiveProjectId !== "none" &&
      scheduleValid,
    resourceValid,
    samplePlatePlanIds.length > 0
      ? samplePlatesValid
      : (!context?.methodSpec.layoutRequired &&
          (cloningLayoutPlans.length === 0 || skipCloningLayout)) ||
        (!!selectedCloningLayoutPlan &&
          !!loadedCloningLayoutPlan &&
          cloningLayoutSampleCountMatches &&
          !cloningLayoutPlanQuery.error),
    equipmentValid && parametersValid,
    identityValid,
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
      .filter(resource =>
        needle
          ? `${resource.sku} ${resource.name} ${resource.type}`
              .toLowerCase()
              .includes(needle)
          : !!selectedResources[resource.id]
      )
      .sort(
        (a, b) =>
          Number(!!selectedResources[b.id]) -
            Number(!!selectedResources[a.id]) ||
          (sampleOrder.includes(a.id)
            ? sampleOrder.indexOf(a.id)
            : 10000 + a.id) -
            (sampleOrder.includes(b.id)
              ? sampleOrder.indexOf(b.id)
              : 10000 + b.id)
      )
      .slice(0, 200);
  }, [
    context?.resources,
    resourceQuery,
    resourceView,
    selectedResources,
    sampleOrder,
  ]);

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
    setSamplePlatePlanIds([]);
    setSkipCloningLayout(false);
    setSearchParams({
      workflowId: String(id),
      ...(hasEntrySample ? { sampleId: String(entrySampleId) } : {}),
    });
  };

  const submit = () => {
    if (!context || !launchValid || !draft.saved) return;
    createMut.mutate({
      workflowId: context.workflow.id,
      methodReleaseId: context.methodRelease.id,
      draftId: draft.id,
      stageSource: initial?.payload.stageSource,
      reworkSource: initial?.payload.reworkSource,
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
      cloningLayoutPlanId: samplePlatePlanIds.length
        ? null
        : (selectedCloningLayoutPlan?.id ?? null),
      samplePlatePlanIds,
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
          <h1 className="text-2xl font-bold tracking-tight">{t("准备实验")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("选择方法，填写本批样本，再检查设备与准备事项。")}
          </p>
        </div>
      </div>

      {initial?.payload.stageSource && (
        <p className="rounded-lg bg-teal-50 p-3 text-sm">
          {t("本任务使用上一阶段放行的产物。")}
          <Link
            className="ml-2 inline-block text-teal-700 underline"
            to={`/runs/${initial.payload.stageSource.runId}`}
          >
            {t("查看上一阶段实验")}
          </Link>
        </p>
      )}
      {context && (
        <div className="rounded-lg border bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              {t(
                draft.error
                  ? "草稿保存失败"
                  : draft.saved
                    ? "草稿已自动保存"
                    : "正在保存草稿…"
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("恢复草稿后仍会重新检查库存、设备和预约")}
            </span>
            {draft.error && (
              <>
                <span role="alert">{draft.error.message}</span>
                <Button variant="outline" size="sm" onClick={draft.retry}>
                  {t("重试保存")}
                </Button>
              </>
            )}
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">
              {t("交接准备工作")}
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                className="rounded border bg-white p-2"
                aria-label={t("接收人")}
                value={handoffTo}
                onChange={e => setHandoffTo(e.target.value)}
              >
                <option value="">{t("选择接收人")}</option>
                {operators.data?.map(operator => (
                  <option key={operator.id} value={operator.id}>
                    {operator.name}
                  </option>
                ))}
              </select>
              <Input
                className="max-w-sm"
                placeholder={t("交接说明")}
                value={handoffNote}
                onChange={e => setHandoffNote(e.target.value)}
              />
              <Button
                disabled={
                  !draft.saved ||
                  !handoffTo ||
                  !handoffNote.trim() ||
                  handoff.isPending
                }
                onClick={() =>
                  handoff.mutate({
                    id: draft.id,
                    expectedRevision: draft.revision,
                    ownerId: Number(handoffTo),
                    note: handoffNote,
                  })
                }
              >
                {t("确认交接")}
              </Button>
            </div>
          </details>
        </div>
      )}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2">
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
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4 text-teal-600" />{" "}
                {t("选择已发布方法")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {eligibleWorkflows.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{t("还没有已发布方法")}</AlertTitle>
                  <AlertDescription>
                    {t("请由方法负责人补充执行要求并复核发布。")}
                  </AlertDescription>
                </Alert>
              ) : (
                eligibleWorkflows
                  .filter(
                    workflow => chooseMethod || workflow.id === workflowId
                  )
                  .map(workflow => (
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
                          {workflow.projectId
                            ? t("已关联项目")
                            : t("未关联项目")}
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
              {workflowId > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChooseMethod(v => !v)}
                >
                  {t(chooseMethod ? "收起方法选择" : "更换方法")}
                </Button>
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
                  readOnly
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
                    <SelectItem value="manual">
                      {t("人工执行与原始证据记录")}
                    </SelectItem>
                    <SelectItem value="simulation">
                      {t("演练步骤路径")}
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
          {hasEntrySample &&
            (() => {
              const sample = context.resources.find(
                item => item.id === entrySampleId
              );
              const selected = selectedResources[entrySampleId];
              return (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <h2 className="font-semibold">{t("从样本页继续准备")}</h2>
                    {!sample ? (
                      <p role="alert" className="text-sm text-amber-700">
                        {t(
                          "此样本当前不可用于实验，请返回样本页检查库存和状态。"
                        )}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm">
                          {sample.sku} · {sample.name}
                        </p>
                        {selected ? (
                          <p className="text-sm">
                            {t(
                              "此样本已在本批清单中，请在清单核对角色和用量。"
                            )}
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-end gap-3">
                            <Label className="block">
                              {t("本次取用量")} ({sample.unit})
                              <Input
                                className="mt-1"
                                type="number"
                                min="0"
                                step="any"
                                value={entryAmount}
                                onChange={event =>
                                  setEntryAmount(event.target.value)
                                }
                              />
                            </Label>
                            <Button
                              variant="outline"
                              disabled={
                                !Number.isFinite(Number(entryAmount)) ||
                                Number(entryAmount) <= 0 ||
                                Number(entryAmount) > sample.availableQuantity
                              }
                              onClick={() => {
                                setSelectedResources(current => ({
                                  ...current,
                                  [sample.id]: {
                                    role: "sample",
                                    amount: Number(entryAmount),
                                  },
                                }));
                                setSampleOrder(current =>
                                  current.includes(sample.id)
                                    ? current
                                    : [...current, sample.id]
                                );
                              }}
                            >
                              {t("加入本批样本")}
                            </Button>
                          </div>
                        )}
                        <Link
                          className="text-sm text-teal-700 underline"
                          to={`/samples/${sample.id}`}
                        >
                          {t("查看来源及身份")}
                        </Link>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}
          {needsIdentity && sampleCount > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h2 className="font-semibold">{t("本批身份与链别")}</h2>
                {identityInputs.map(resource => {
                  const identity = identities.data?.find(
                    value => value.sampleId === resource.sampleId
                  );
                  return (
                    <div
                      key={resource.sampleId}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {resource.source?.sku} ·{" "}
                        {identity
                          ? `${identity.antibodyId} · ${identity.chain}`
                          : t(
                              identities.isLoading
                                ? "正在核对身份"
                                : "尚无有效身份确认"
                            )}
                      </span>
                      <Link
                        className="text-teal-700 underline"
                        to={`/samples/${resource.sampleId}`}
                      >
                        {t("查看来源及身份")}
                      </Link>
                    </div>
                  );
                })}
                {!identityValid && (
                  <p className="text-sm text-amber-700">
                    {t(
                      needsPair
                        ? "请补齐同一抗体的已确认重链与轻链质粒。"
                        : "请先确认每份输入样本的抗体身份。"
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {needsPair && sampleCount > 0 && !identityValid && (
            <Card>
              <CardContent className="p-4">
                <PairedSamplePicker
                  sampleIds={identityInputs.map(resource => resource.sampleId)}
                  selectedIds={selectedList.map(resource => resource.sampleId)}
                  resources={context.resources}
                  scheduledEnd={scheduledEnd}
                  onAdd={(sampleId, amount) => {
                    setSelectedResources(current =>
                      current[sampleId]
                        ? current
                        : { ...current, [sampleId]: { role: "sample", amount } }
                    );
                    setSampleOrder(current =>
                      current.includes(sampleId)
                        ? current
                        : [...current, sampleId]
                    );
                  }}
                />
              </CardContent>
            </Card>
          )}
          {!!materialDemand.length && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <h2 className="font-semibold">{t("本批物料需求")}</h2>
                {materialDemand.map((rule, index) => (
                  <div
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"
                  >
                    <div>
                      <strong>{rule.name}</strong>
                      <p>
                        {t("需要 {amount} {unit}，已选 {selected}", {
                          amount: rule.required,
                          unit: rule.unit,
                          selected: rule.allocated,
                        })}
                      </p>
                      {rule.missing > 0 && (
                        <p className="text-amber-700">
                          {t("还缺 {amount} {unit}", {
                            amount: rule.missing,
                            unit: rule.unit,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {context.resources
                        .filter(
                          item =>
                            rule.approvedSkus.includes(item.sku) &&
                            item.unit === rule.unit
                        )
                        .map(item => (
                          <Button
                            key={item.id}
                            variant="outline"
                            size="sm"
                            disabled={
                              rule.missing === 0 ||
                              (!!selectedResources[item.id] &&
                                selectedResources[item.id].role !==
                                  "material") ||
                              item.availableQuantity -
                                (selectedResources[item.id]?.amount ?? 0) <
                                rule.missing ||
                              (!!item.expiryDate &&
                                item.expiryDate < scheduledEnd.slice(0, 10))
                            }
                            onClick={() =>
                              setSelectedResources(current => ({
                                ...current,
                                [item.id]: {
                                  role: "material",
                                  amount:
                                    (current[item.id]?.amount ?? 0) +
                                    rule.missing,
                                },
                              }))
                            }
                          >
                            {t("补齐用量")} · {item.sku}
                          </Button>
                        ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "按方法批准的库存编号和单位核对；库存不足时请先补货或联系方法负责人。"
                  )}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="space-y-3 p-4">
              <Label>{t("扫码或批量粘贴样本编号")}</Label>
              <Textarea
                value={batchCodes}
                onChange={e => setBatchCodes(e.target.value)}
                placeholder={t(
                  "每行一个完整 Sample ID，也支持逗号分隔。按输入顺序建立映射。"
                )}
              />
              <div className="flex flex-wrap gap-3">
                <input
                  type="file"
                  accept=".txt,.csv,.tsv"
                  aria-label={t("导入样本编号文件")}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file && file.size <= 100000)
                      setBatchCodes(await file.text());
                    else if (file)
                      toast.error(
                        t("文件过大，请导入不超过 100 KB 的编号列表")
                      );
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const batch = resolveSampleBatch(
                      batchCodes,
                      context.resources
                    );
                    if (batch.errors.length) {
                      toast.error(
                        t("无法唯一识别以下编号：{codes}", {
                          codes: batch.errors.join(", "),
                        })
                      );
                      return;
                    }
                    setSelectedResources(current => ({
                      ...current,
                      ...Object.fromEntries(
                        batch.samples.map(sample => [
                          sample.id,
                          {
                            role: "sample" as const,
                            amount: current[sample.id]?.amount ?? 1,
                          },
                        ])
                      ),
                    }));
                    setSampleOrder(batch.samples.map(sample => sample.id));
                    setBatchCodes("");
                  }}
                >
                  {t("加入本批样本")}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TestTubes className="h-4 w-4 text-teal-600" />{" "}
                    {t("本批样本与物料")}
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

              <p className="text-xs text-muted-foreground">
                {t(
                  "默认仅显示本批已选内容。扫码、导入或搜索编号可添加样本与物料。"
                )}
              </p>
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
        </div>
      )}

      {step === 1 && context && sampleCount > 0 && (
        <details
          className="rounded-xl border bg-white p-4"
          open={context.methodSpec.layoutRequired}
        >
          <summary className="cursor-pointer font-medium">
            {t("核对本批样本映射")}
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              context.methodSpec.layoutRequired
                ? "此顺序决定布局目标编号。可调整顺序，并在下方布局中核对容器和孔位。"
                : "此顺序用于本批样本记录，可在此核对编号和调整顺序。"
            )}
          </p>
          <div className="mt-3 max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th>{t("目标编号")}</th>
                  <th>Sample ID</th>
                  <th>{t("样本名称")}</th>
                  <th>{t("调整顺序")}</th>
                </tr>
              </thead>
              <tbody>
                {cloningTargetBindings.map((sample, index) => (
                  <tr key={sample.sampleId} className="border-t">
                    <td className="py-2">{sample.target}</td>
                    <td>{sample.sku}</td>
                    <td>{sample.name}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === 0}
                        onClick={() => {
                          const order = cloningTargetBindings.map(
                            binding => binding.sampleId
                          );
                          [order[index - 1], order[index]] = [
                            order[index],
                            order[index - 1],
                          ];
                          setSampleOrder(order);
                        }}
                      >
                        {t("上移")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {step === 1 && context && (
        <Card>
          <CardHeader>
            <CardTitle>{t("本次实验孔板方案")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("勾选后台保存的孔板版本；创建实验后固定样本、孔位及来源。")}
            </p>
            <Link
              className="text-sm text-teal-700 underline"
              to={`/workflows/${workflowId}/edit?view=plates`}
            >
              {t("到后台配置孔板与样本")}
            </Link>
            {samplePlateQuery.error && (
              <p role="alert">
                {t(samplePlateQuery.error.message)}{" "}
                <Button
                  variant="outline"
                  onClick={() => samplePlateQuery.refetch()}
                >
                  {t("重试")}
                </Button>
              </p>
            )}
            {(samplePlateQuery.data ?? [])
              .filter(
                item =>
                  !context.methodSpec.stage ||
                  item.plan.config.stage === context.methodSpec.stage
              )
              .map(item => (
                <label
                  className="flex items-start gap-2 rounded border p-3 text-sm"
                  key={item.id}
                >
                  <input
                    type="checkbox"
                    checked={samplePlatePlanIds.includes(item.id)}
                    onChange={event => {
                      setSamplePlatePlanIds(current =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter(id => id !== item.id)
                      );
                      setCloningLayoutPlanId(null);
                      setSkipCloningLayout(true);
                    }}
                  />
                  <span>
                    V{item.version} · {item.name} ·{" "}
                    {t(PLATE_STAGE_LABELS[item.plan.config.stage])} ·{" "}
                    {item.plan.samples.map(sample => sample.sku).join(", ")}
                  </span>
                </label>
              ))}
            {samplePlatePlanIds.length > 0 && !samplePlatesValid && (
              <p role="alert" className="text-sm text-amber-700">
                {t("孔板方案必须完整覆盖本次实验样本，且不能包含额外样本")}
              </p>
            )}
            {selectedSamplePlates.map(item => (
              <details key={item.id} className="rounded border p-3">
                <summary>
                  {item.name} · V{item.version}
                </summary>
                <SamplePlateView plan={item.plan} />
              </details>
            ))}
          </CardContent>
        </Card>
      )}
      {step === 1 &&
        context &&
        !samplePlatePlanIds.length &&
        (context.methodSpec.layoutRequired ||
          cloningLayoutPlans.length > 0) && (
          <div className="space-y-4">
            <Alert className="border-sky-200 bg-sky-50">
              <FileLock2 className="h-4 w-4 text-sky-700" />
              <AlertTitle>{t("确认本批样本与孔位对应关系")}</AlertTitle>
              <AlertDescription>
                {t(
                  "请核对样本身份、目标编号、容器和孔位。本次确认的布局将随实验计划保存，方法后续修订不会改变它。"
                )}
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Grid2X2 className="h-4 w-4 text-teal-600" />{" "}
                      {t("确认本批样本布局")}
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
                        context.methodSpec.layoutRequired
                          ? "本方法要求孔板布局，请先在 BioFlow 中保存覆盖本批样本的孔板方案。"
                          : "可以继续创建不带孔板快照的通用 Run；其详情页会明确显示“未关联排板”，不会临时生成或套用其他版本。"
                      )}
                    </p>
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() =>
                        navigate(`/workflows/${workflowId}/edit?view=plates`)
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
                                  <Badge variant="outline">
                                    V{plan.version}
                                  </Badge>
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
                      disabled={context.methodSpec.layoutRequired}
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

      {step === 1 && context && (
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
                  : "本次按人工操作执行"
              )}
            </AlertTitle>
            <AlertDescription>
              {t(
                executionMode === "simulation"
                  ? "演练只用于检查步骤路径，不占用真实库存，不产生实验结果。"
                  : "请选择方法批准的设备。执行时需要记录操作说明、原始文件和样本结果。"
              )}
            </AlertDescription>
          </Alert>
          {sampleCount > 0 && (
            <details className="rounded-xl border bg-white p-4">
              <summary className="cursor-pointer text-sm">
                {t("预览本次实验视图")}
              </summary>
              <BioViewRuntime
                className="mt-4"
                showHeader={false}
                manifest={{
                  bioView: context.workflow.visualizationSpec,
                  workflow: {
                    id: context.workflow.id,
                    name: context.workflow.name,
                  },
                }}
                nodes={bioViewPreviewNodes}
                edges={context.edges}
                samples={planPreviewResources.filter(
                  resource => resource.role !== "material"
                )}
                materials={planPreviewResources.filter(
                  resource => resource.role === "material"
                )}
                samplePlatePlans={selectedSamplePlates}
                parameters={{
                  effectiveValues: {
                    executionMode,
                    scheduledStart,
                    scheduledEnd,
                    operatorName: operatorName || t("当前用户"),
                  },
                }}
                cloningPlan={loadedCloningLayoutPlan}
                targetBindings={cloningTargetBindings}
                mode="draft"
              />
            </details>
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
                              "此处仅列出经过本方法验证且满足当前执行模式的设备。"
                            )}
                          </p>
                        ) : setup.equipmentId !== "none" ? (
                          <p className="text-xs text-amber-700">
                            {t(
                              "所选设备已在方法发布时通过适配确认，开始前仍会检查现场可用性。"
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-700">
                            {t("选择经过方法验证的设备")}
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
                            {fields
                              .filter(
                                field =>
                                  context.methodSpec.nodes[node.nodeKey]
                                    ?.parameters[field.key]?.adjustable
                              )
                              .map(field => {
                                const value = setup.params[field.key] ?? "";
                                const policy =
                                  context.methodSpec.nodes[node.nodeKey]
                                    ?.parameters[field.key];
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
                                      {(policy?.min !== undefined ||
                                        policy?.max !== undefined) && (
                                        <span className="ml-2 text-muted-foreground">
                                          {t("允许范围：{min}–{max}", {
                                            min: policy?.min ?? "—",
                                            max: policy?.max ?? "—",
                                          })}
                                        </span>
                                      )}
                                    </Label>
                                    {field.type === "select" ||
                                    field.type === "boolean" ? (
                                      <Select
                                        disabled={
                                          !context?.methodSpec.nodes[
                                            node.nodeKey
                                          ]?.parameters[field.key]?.adjustable
                                        }
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
                                        readOnly={
                                          !context?.methodSpec.nodes[
                                            node.nodeKey
                                          ]?.parameters[field.key]?.adjustable
                                        }
                                        type={
                                          field.type === "number"
                                            ? "number"
                                            : "text"
                                        }
                                        value={String(value)}
                                        min={
                                          policy?.min ??
                                          ("min" in field
                                            ? field.min
                                            : undefined)
                                        }
                                        max={
                                          policy?.max ??
                                          ("max" in field
                                            ? field.max
                                            : undefined)
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
                    {fields.some(
                      field =>
                        !context.methodSpec.nodes[node.nodeKey]?.parameters[
                          field.key
                        ]?.adjustable
                    ) && (
                      <details className="rounded border bg-slate-50 p-3">
                        <summary className="cursor-pointer text-xs">
                          {t("查看方法固定参数")}
                        </summary>
                        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                          {fields
                            .filter(
                              field =>
                                !context.methodSpec.nodes[node.nodeKey]
                                  ?.parameters[field.key]?.adjustable
                            )
                            .map(field => (
                              <div key={field.key}>
                                <dt className="text-xs text-muted-foreground">
                                  {t(
                                    "labelEn" in field && lang === "en"
                                      ? (field.labelEn ?? field.label)
                                      : field.label
                                  )}
                                </dt>
                                <dd>
                                  {t(String(setup.params[field.key] ?? "—"))}{" "}
                                  {field.unit}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </details>
                    )}
                    {fields.some(
                      field =>
                        context.methodSpec.nodes[node.nodeKey]?.parameters[
                          field.key
                        ]?.adjustable
                    ) && (
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

      {step === 2 && context && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Alert className="border-teal-200 bg-teal-50">
              <ShieldCheck className="h-4 w-4 text-teal-700" />
              <AlertTitle>{t("确认本批实验计划")}</AlertTitle>
              <AlertDescription>
                {t(
                  "保存后会锁定本次方法版本、样本、物料、设备和参数。实验尚未开始，请在任务页完成准备后确认开始。"
                )}
              </AlertDescription>
            </Alert>
            <section className="space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                  {t("3. 确认实验视图与布局")}
                </div>
                <h2 className="mt-1 text-lg font-semibold">
                  {t("确认本次运行的实验视图与布局")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t(
                    "系统会根据已发布方法、本次样本与物料、孔板布局及设备参数自动生成实验视图。创建 Run 后将与运行计划一起冻结，不随方法模板后续修改。"
                  )}
                </p>
              </div>
              <BioViewRuntime
                manifest={{
                  bioView: context.workflow.visualizationSpec,
                  workflow: {
                    id: context.workflow.id,
                    name: context.workflow.name,
                  },
                }}
                nodes={bioViewPreviewNodes}
                edges={context.edges}
                samples={planPreviewResources.filter(
                  resource => resource.role !== "material"
                )}
                materials={planPreviewResources.filter(
                  resource => resource.role === "material"
                )}
                samplePlatePlans={selectedSamplePlates}
                parameters={{
                  effectiveValues: {
                    executionMode,
                    scheduledStart,
                    scheduledEnd,
                    operatorName: operatorName || t("当前用户"),
                  },
                }}
                cloningPlan={loadedCloningLayoutPlan}
                targetBindings={cloningTargetBindings}
                mode="draft"
              />
            </section>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("运行计划")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {[
                  [
                    t("方法版本"),
                    `${context.workflow.name} · V${context.methodRelease.version}`,
                  ],
                  [t("运行名称"), effectiveName],
                  [
                    t("关联项目"),
                    context.projects.find(
                      project => String(project.id) === effectiveProjectId
                    )?.name ?? "—",
                  ],
                  [
                    t("执行模式"),
                    t(
                      executionMode === "simulation"
                        ? "模拟运行"
                        : executionMode === "manual"
                          ? "人工执行"
                          : "自动设备执行"
                    ),
                  ],
                  [
                    t("计划时段"),
                    `${new Date(scheduledStart).toLocaleString(lang === "en" ? "en-US" : "zh-CN")} — ${new Date(scheduledEnd).toLocaleString(lang === "en" ? "en-US" : "zh-CN")}`,
                  ],
                  [t("运行负责人"), operatorName || t("当前用户")],
                  ...(selectedCloningLayoutPlan
                    ? [
                        [
                          t("孔板方案"),
                          `${selectedCloningLayoutPlan.name} · V${selectedCloningLayoutPlan.version}`,
                        ],
                      ]
                    : []),
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
                <details>
                  <summary className="cursor-pointer font-medium">
                    {t("查看样本与用量")}
                  </summary>
                  <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                    {planPreviewResources.map(resource => (
                      <p key={resource.id} className="border-t pt-2 text-xs">
                        {resource.sku} · {resource.name} · {resource.amount}{" "}
                        {resource.unit}
                      </p>
                    ))}
                  </div>
                </details>
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
                  ok: !!context.methodRelease,
                  label: t("使用已复核的发布版本"),
                },
                {
                  ok: context.nodes.length > 0,
                  label: t("流程包含可执行节点"),
                },
                {
                  ok: childWorkflowNodes.length === 0,
                  label: t("方法步骤与子方法已完整展开"),
                },
                { ok: sampleCount > 0, label: t("已绑定实验样本") },
                { ok: resourceValid, label: t("库存可用量满足本次计划") },
                ...(needsIdentity
                  ? [
                      {
                        ok: identityValid,
                        label: t("输入身份与链别符合本方法"),
                      },
                    ]
                  : []),
                ...(cloningLayoutPlans.length > 0 && !samplePlatePlanIds.length
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
                        label: t("设备已通过方法适配确认"),
                      },
                    ]
                  : []),
                { ok: parametersValid, label: t("本批参数在方法允许范围内") },
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
              {context.methodSpec.layoutRequired &&
                cloningLayoutPlans.length === 0 &&
                !samplePlatesValid && (
                  <div className="flex items-start gap-2 text-xs text-amber-700">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    {t(
                      "本方法要求孔板布局，请先在 BioFlow 中保存覆盖本批样本的孔板方案。"
                    )}
                  </div>
                )}
              <div className="rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
                {t(
                  executionMode === "simulation"
                    ? "保存演练计划后，还需在任务页启动演练。演练不占用库存和设备，也不产生真实实验结果。"
                    : "保存计划会预占库存并预约设备；执行需在任务页单独确认开始。"
                )}
              </div>
              <Button
                className="w-full bg-teal-600 hover:bg-teal-500"
                disabled={!launchValid || !draft.saved || createMut.isPending}
                onClick={submit}
              >
                {createMut.isPending
                  ? t("正在保存计划…")
                  : t("保存本次实验计划")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-white/95 px-3 py-3 shadow-sm">
        <Button
          variant="outline"
          disabled={step === 0}
          onClick={() => setStep(current => Math.max(0, current - 1))}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("上一步")}
        </Button>
        {step === 1 && !launchValid && (
          <p className="flex-1 text-right text-xs text-amber-700">
            {t(
              !resourceValid
                ? "请核对样本数量、物料用量与库存"
                : !equipmentValid
                  ? "请选择本方法批准的设备"
                  : !parametersValid
                    ? "请将参数调整到方法允许范围"
                    : "请补齐本批必需的准备事项"
            )}
          </p>
        )}
        {step < STEPS.length - 1 && (
          <Button
            disabled={
              !(step === 0
                ? stepValid[0]
                : stepValid.slice(1).every(Boolean)) || contextQuery.isLoading
            }
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
