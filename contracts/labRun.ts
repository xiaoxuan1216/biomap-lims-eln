import { z } from "zod";

export const LAB_RUN_STATUSES = [
  "draft",
  "preparing",
  "ready",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export const LAB_RUN_MODES = ["simulation", "edge"] as const;
export const LAB_RUN_RESOURCE_ROLES = ["sample", "material", "control"] as const;
export const LAB_RUN_NODE_STATUSES = ["pending", "running", "completed", "skipped", "failed"] as const;

export type LabRunStatus = (typeof LAB_RUN_STATUSES)[number];
export type LabRunMode = (typeof LAB_RUN_MODES)[number];
export type LabRunResourceRole = (typeof LAB_RUN_RESOURCE_ROLES)[number];
export type LabRunNodeStatus = (typeof LAB_RUN_NODE_STATUSES)[number];

export const LAB_RUN_STATUS_META: Record<
  LabRunStatus,
  { label: string; color: string; description: string }
> = {
  draft: { label: "草稿", color: "#64748b", description: "尚未锁定资源与执行快照" },
  preparing: { label: "准备中", color: "#f59e0b", description: "资源已预占，等待领料或就绪确认" },
  ready: { label: "计划就绪", color: "#0d9488", description: "运行计划已锁定；物理启动仍需独立门禁" },
  running: { label: "运行中", color: "#2563eb", description: "实验已进入受控执行" },
  completed: { label: "已完成", color: "#16a34a", description: "运行与结果记录已完成" },
  failed: { label: "异常", color: "#dc2626", description: "运行失败或需要人工处置" },
  cancelled: { label: "已取消", color: "#94a3b8", description: "运行已取消并停止后续执行" },
};

export const LAB_RUN_ROLE_META: Record<
  LabRunResourceRole,
  { label: string; description: string }
> = {
  sample: { label: "实验样本", description: "本次实验处理或检测的研究样本" },
  material: { label: "试剂与物料", description: "本次运行会使用或消耗的试剂、耗材与缓冲液" },
  control: { label: "标准与对照", description: "阳性、阴性、空白或标准品" },
};

export const labRunParamValueSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
]);

export const labRunResourceInputSchema = z.object({
  sampleId: z.number().int().positive(),
  role: z.enum(LAB_RUN_RESOURCE_ROLES),
  amount: z.number().min(0.001).max(1_000_000_000).multipleOf(0.001),
  nodeKey: z.string().min(1).max(64).nullish(),
});

export const labRunNodeBindingInputSchema = z.object({
  nodeKey: z.string().min(1).max(64),
  equipmentId: z.number().int().positive().nullish(),
  params: z.record(z.string().min(1).max(100), labRunParamValueSchema).default({}),
  overrideReason: z.string().trim().max(500).nullish(),
});

export const createLabRunInputSchema = z
  .object({
    workflowId: z.number().int().positive(),
    cloningLayoutPlanId: z.number().int().positive().nullish(),
    name: z.string().trim().min(1, "运行名称不能为空").max(255),
    purpose: z.string().trim().max(10_000).nullish(),
    projectId: z.number().int().positive().nullish(),
    executionMode: z.enum(LAB_RUN_MODES).default("simulation"),
    scheduledStart: z.date(),
    scheduledEnd: z.date(),
    operatorName: z.string().trim().max(255).nullish(),
    resources: z.array(labRunResourceInputSchema).min(1, "至少选择一个实验样本").max(200),
    nodeBindings: z.array(labRunNodeBindingInputSchema).max(200),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .superRefine((value, ctx) => {
    if (value.scheduledEnd <= value.scheduledStart) {
      ctx.addIssue({ code: "custom", path: ["scheduledEnd"], message: "结束时间必须晚于开始时间" });
    }
    if (value.scheduledEnd.getTime() - value.scheduledStart.getTime() > 7 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: "custom", path: ["scheduledEnd"], message: "单次运行预约不能超过 7 天" });
    }
    if (!value.resources.some((resource) => resource.role === "sample")) {
      ctx.addIssue({ code: "custom", path: ["resources"], message: "至少选择一个实验样本" });
    }
    const resourceKeys = value.resources.map((resource) => resource.sampleId);
    if (new Set(resourceKeys).size !== resourceKeys.length) {
      ctx.addIssue({ code: "custom", path: ["resources"], message: "不能重复添加同一库存项" });
    }
    const nodeKeys = value.nodeBindings.map((node) => node.nodeKey);
    if (new Set(nodeKeys).size !== nodeKeys.length) {
      ctx.addIssue({ code: "custom", path: ["nodeBindings"], message: "设备节点配置重复" });
    }
  });

export type CreateLabRunInput = z.infer<typeof createLabRunInputSchema>;

export const labRunTransitionInputSchema = z.object({
  id: z.number().int().positive(),
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const cancelLabRunInputSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  /** Optional during the UI migration; API clients should always send it. */
  expectedRevision: z.number().int().nonnegative().optional(),
  /** Legacy UI calls derive a stable key from run id + reason on the server. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const labRunTransitionResultSchema = z.object({
  ok: z.literal(true),
  status: z.enum(LAB_RUN_STATUSES),
  revision: z.number().int().nonnegative(),
  releasedResources: z.boolean().optional(),
});

export type LabRunTransitionResult = z.infer<typeof labRunTransitionResultSchema>;

export type RunGraphNode = { nodeKey: string };
export type RunGraphEdge = { sourceKey: string; targetKey: string };

export type RunGraphValidation =
  | { valid: true; order: string[]; error: null }
  | { valid: false; order: []; error: string };

/** Validate the immutable execution graph and return a stable topological order. */
export function validateRunGraph(
  nodes: readonly RunGraphNode[],
  edges: readonly RunGraphEdge[],
): RunGraphValidation {
  if (nodes.length === 0) {
    return { valid: false, order: [], error: "流程模板中没有可执行节点" };
  }

  const sourceOrder = nodes.map((node) => node.nodeKey);
  if (sourceOrder.some((nodeKey) => typeof nodeKey !== "string" || nodeKey.length === 0 || nodeKey.length > 64)) {
    return { valid: false, order: [], error: "流程包含无效的节点标识" };
  }
  if (new Set(sourceOrder).size !== sourceOrder.length) {
    return { valid: false, order: [], error: "流程包含重复的节点标识" };
  }

  const nodeKeys = new Set(sourceOrder);
  const indegree = new Map(sourceOrder.map((nodeKey) => [nodeKey, 0]));
  const targets = new Map<string, string[]>();
  for (const edge of edges) {
    if (
      typeof edge.sourceKey !== "string" ||
      typeof edge.targetKey !== "string" ||
      !nodeKeys.has(edge.sourceKey) ||
      !nodeKeys.has(edge.targetKey)
    ) {
      return { valid: false, order: [], error: "流程包含指向未知节点的连线" };
    }
    indegree.set(edge.targetKey, (indegree.get(edge.targetKey) ?? 0) + 1);
    targets.set(edge.sourceKey, [...(targets.get(edge.sourceKey) ?? []), edge.targetKey]);
  }

  const queue = sourceOrder.filter((nodeKey) => indegree.get(nodeKey) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const nodeKey = queue.shift()!;
    order.push(nodeKey);
    for (const targetKey of targets.get(nodeKey) ?? []) {
      const remaining = (indegree.get(targetKey) ?? 0) - 1;
      indegree.set(targetKey, remaining);
      if (remaining === 0) queue.push(targetKey);
    }
  }
  if (order.length !== sourceOrder.length) {
    return { valid: false, order: [], error: "流程包含循环依赖" };
  }
  return { valid: true, order, error: null };
}

export function terminalRunStatus(
  statuses: readonly LabRunNodeStatus[],
): Extract<LabRunStatus, "completed" | "failed"> | null {
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.length > 0 && statuses.every((status) => status === "completed" || status === "skipped")) {
    return "completed";
  }
  return null;
}

export interface RunReadinessIssue {
  code: "sample_request" | "equipment" | "driver" | "schedule";
  level: "blocking" | "warning";
  label: string;
  labelEn?: string;
  nodeKey?: string;
}

export function suggestedResourceRole(type: string): LabRunResourceRole {
  return ["reagent", "chemical", "buffer", "enzyme", "competent_cell"].includes(type)
    ? "material"
    : "sample";
}

export function readinessSummary(issues: RunReadinessIssue[]) {
  const blocking = issues.filter((issue) => issue.level === "blocking").length;
  const warnings = issues.length - blocking;
  return { ready: blocking === 0, blocking, warnings };
}

export const LAB_RUN_DATA_FLOW_PHASES = ["plan", "materials", "execution", "results"] as const;
export type LabRunDataFlowPhase = (typeof LAB_RUN_DATA_FLOW_PHASES)[number];

export type LabRunDataFlowSource =
  | "run_plan_snapshot"
  | "lab_run_resource"
  | "sample_inventory"
  | "storage_location"
  | "sample_request"
  | "sample_request_item"
  | "inventory_reservation"
  | "fulfillment_task"
  | "sample_lineage"
  | "lab_run_node"
  | "equipment_booking"
  | "none";

export interface LabRunDataFlowEvidence {
  source: LabRunDataFlowSource;
  ref: string;
  label: string;
  status: string | null;
  immutable: boolean;
}

export interface LabRunDataFlowInput {
  run: {
    id: number;
    runNo: string;
    name: string;
    status: LabRunStatus;
    executionMode: LabRunMode;
    workflowId: number;
    workflowName: string;
    snapshotHash: string;
    sampleRequestId: number | null;
    requestNo: string | null;
    requestStatus: string | null;
  };
  integrityValid: boolean;
  workflowEdges: Array<{ sourceKey: string; targetKey: string }>;
  resources: Array<{
    id: number;
    sampleId: number;
    role: LabRunResourceRole;
    nodeKey: string | null;
    amount: number;
    unit: string;
    sku: string;
    name: string;
    type: string;
    frozenLocationId: number | null;
    frozenBoxRow: number | null;
    frozenBoxCol: number | null;
    currentLocationId: number | null;
    currentLocationName: string | null;
    currentLocationType: string | null;
    currentBoxRow: number | null;
    currentBoxCol: number | null;
    sampleRequestItemId: number | null;
    requestItemStatus: string | null;
    inventoryReservationId: number | null;
    reservationStatus: string | null;
    fulfillmentTaskId: number | null;
    fulfillmentStatus: string | null;
  }>;
  nodes: Array<{
    id: number;
    nodeKey: string;
    type: string;
    label: string;
    status: LabRunNodeStatus;
    equipmentId: number | null;
    equipmentName: string | null;
    driverKey: string | null;
    driverVersion: string | null;
  }>;
  bookings: Array<{
    id: number;
    equipmentId: number;
    status: string;
    startTime: Date;
    endTime: Date;
  }>;
  lineageNodes: Array<{
    kind: "sample" | "sequence";
    id: number;
    title: string;
    subtitle: string | null;
  }>;
  lineageEdges: Array<{
    id: number;
    childKind: "sample" | "sequence";
    childId: number;
    parentKind: "sample" | "sequence";
    parentId: number;
    relation: string;
  }>;
}

export interface LabRunDataFlowProjection {
  schemaVersion: "1.0";
  phases: Array<{
    id: LabRunDataFlowPhase;
    label: string;
    labelEn: string;
    status: string;
    source: LabRunDataFlowSource;
    evidence: LabRunDataFlowEvidence[];
  }>;
  nodes: Array<{
    id: string;
    phase: LabRunDataFlowPhase;
    kind: "run_plan" | "resource" | "lineage" | "run_node";
    title: string;
    subtitle: string | null;
    status: string;
    source: LabRunDataFlowSource;
    evidence: LabRunDataFlowEvidence[];
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relation: string;
    sourceType: LabRunDataFlowSource;
    evidence: LabRunDataFlowEvidence[];
  }>;
  resultState: {
    status: "not_recorded";
    source: "none";
    evidence: [];
  };
}

function dataFlowEvidence(
  source: LabRunDataFlowSource,
  ref: string,
  label: string,
  status: string | null,
  immutable: boolean,
): LabRunDataFlowEvidence {
  return { source, ref, label, status, immutable };
}

/**
 * Produce a UI-ready Mosaic projection from persisted Run facts. This deliberately
 * emits no result tile: the current model has no Run result record to substantiate one.
 */
export function buildLabRunDataFlow(input: LabRunDataFlowInput): LabRunDataFlowProjection {
  const { run } = input;
  const planNodeId = `plan:${run.id}`;
  const planEvidence = [
    dataFlowEvidence("run_plan_snapshot", run.snapshotHash, `SHA-256 · ${run.snapshotHash}`, input.integrityValid ? "verified" : "invalid", true),
    dataFlowEvidence("run_plan_snapshot", `workflow:${run.workflowId}`, run.workflowName, "frozen", true),
  ];
  const requestEvidence = run.sampleRequestId && run.requestNo
    ? [dataFlowEvidence("sample_request", `sample-request:${run.sampleRequestId}`, run.requestNo ?? `#${run.sampleRequestId}`, run.requestStatus, false)]
    : [];
  const bookingEvidence = input.bookings.map((booking) =>
    dataFlowEvidence("equipment_booking", `equipment-booking:${booking.id}`, `${booking.startTime.toISOString()} – ${booking.endTime.toISOString()}`, booking.status, false),
  );

  const resourceNodeBySample = new Map(input.resources.map((resource) => [resource.sampleId, `resource:${resource.id}`]));
  const lineageNodeId = (kind: "sample" | "sequence", id: number) =>
    kind === "sample" && resourceNodeBySample.has(id) ? resourceNodeBySample.get(id)! : `lineage:${kind}:${id}`;

  const lineageNodes = input.lineageNodes
    .filter((node) => !resourceNodeBySample.has(node.id) || node.kind !== "sample")
    .map((node) => ({
      id: lineageNodeId(node.kind, node.id),
      phase: "materials" as const,
      kind: "lineage" as const,
      title: node.title,
      subtitle: node.subtitle,
      status: "recorded",
      source: "sample_lineage" as const,
      evidence: [dataFlowEvidence("sample_lineage", `${node.kind}:${node.id}`, "已持久化谱系对象", "recorded", false)],
    }));

  const resourceNodes = input.resources.map((resource) => {
    const status = run.executionMode === "simulation"
      ? "snapshot_only"
      : resource.fulfillmentStatus ?? resource.requestItemStatus ?? resource.reservationStatus ?? run.requestStatus ?? "selected";
    const frozenPosition = resource.frozenLocationId === null
      ? "冻结时未记录储位"
      : `冻结储位 #${resource.frozenLocationId}${resource.frozenBoxRow !== null && resource.frozenBoxCol !== null ? ` · R${resource.frozenBoxRow} · C${resource.frozenBoxCol}` : ""}`;
    const currentPosition = resource.currentLocationName
      ? `${resource.currentLocationName}${resource.currentBoxRow !== null && resource.currentBoxCol !== null ? ` · R${resource.currentBoxRow} · C${resource.currentBoxCol}` : ""}`
      : "当前未记录储位";
    return {
      id: `resource:${resource.id}`,
      phase: "materials" as const,
      kind: "resource" as const,
      title: resource.name,
      subtitle: `${resource.sku} · ${resource.amount} ${resource.unit}`,
      status,
      source: "lab_run_resource" as const,
      evidence: [
        dataFlowEvidence("lab_run_resource", `lab-run-resource:${resource.id}`, LAB_RUN_ROLE_META[resource.role].label, "selected", true),
        dataFlowEvidence("sample_inventory", `sample:${resource.sampleId}`, `${resource.sku} · ${resource.type}`, "current", false),
        dataFlowEvidence("run_plan_snapshot", run.snapshotHash, frozenPosition, "frozen", true),
        ...(resource.currentLocationId !== null
          ? [dataFlowEvidence("storage_location", `storage-location:${resource.currentLocationId}`, currentPosition, resource.currentLocationType, false)]
          : []),
        ...(resource.sampleRequestItemId ? [dataFlowEvidence("sample_request_item", `sample-request-item:${resource.sampleRequestItemId}`, "样本请求项", resource.requestItemStatus, false)] : []),
        ...(resource.inventoryReservationId ? [dataFlowEvidence("inventory_reservation", `inventory-reservation:${resource.inventoryReservationId}`, "库存预占", resource.reservationStatus, false)] : []),
        ...(resource.fulfillmentTaskId ? [dataFlowEvidence("fulfillment_task", `fulfillment-task:${resource.fulfillmentTaskId}`, "领料履约任务", resource.fulfillmentStatus, false)] : []),
      ],
    };
  });

  const executionNodes = input.nodes.map((node) => {
    const nodeBookings = input.bookings.filter((booking) => booking.equipmentId === node.equipmentId);
    return {
      id: `run-node:${node.nodeKey}`,
      phase: "execution" as const,
      kind: "run_node" as const,
      title: node.label,
      subtitle: node.equipmentName ?? node.type,
      status: node.status,
      source: "lab_run_node" as const,
      evidence: [
        dataFlowEvidence("lab_run_node", `lab-run-node:${node.id}`, node.nodeKey, node.status, false),
        dataFlowEvidence("run_plan_snapshot", run.snapshotHash, `节点 ${node.nodeKey}`, "frozen", true),
        ...(node.driverKey ? [dataFlowEvidence("lab_run_node", `driver:${node.driverKey}@${node.driverVersion ?? "unknown"}`, "冻结驱动版本", "frozen", true)] : []),
        ...nodeBookings.map((booking) => dataFlowEvidence("equipment_booking", `equipment-booking:${booking.id}`, node.equipmentName ?? `设备 #${booking.equipmentId}`, booking.status, false)),
      ],
    };
  });

  const executionNodeKeys = new Set(input.nodes.map((node) => node.nodeKey));
  const projectedNodeIds = new Set([
    planNodeId,
    ...resourceNodes.map((node) => node.id),
    ...lineageNodes.map((node) => node.id),
    ...executionNodes.map((node) => node.id),
  ]);
  const edges: LabRunDataFlowProjection["edges"] = [];
  for (const resource of input.resources) {
    edges.push({
      id: `plan-resource:${resource.id}`,
      source: planNodeId,
      target: `resource:${resource.id}`,
      relation: "selects",
      sourceType: "run_plan_snapshot",
      evidence: [planEvidence[0]],
    });
    // A resource belongs to the Run through the selects edge above. Only an
    // explicit node binding is strong enough to claim that it feeds a step.
    const targets = resource.nodeKey && executionNodeKeys.has(resource.nodeKey) ? [resource.nodeKey] : [];
    for (const target of targets) {
      edges.push({
        id: `resource-execution:${resource.id}:${target}`,
        source: `resource:${resource.id}`,
        target: `run-node:${target}`,
        relation: "feeds",
        sourceType: "lab_run_resource",
        evidence: [dataFlowEvidence("lab_run_resource", `lab-run-resource:${resource.id}`, resource.nodeKey ? "显式节点绑定" : "运行入口资源", "selected", true)],
      });
    }
  }
  for (const [index, edge] of input.workflowEdges.entries()) {
    if (!executionNodeKeys.has(edge.sourceKey) || !executionNodeKeys.has(edge.targetKey)) continue;
    edges.push({
      id: `workflow-edge:${index}:${edge.sourceKey}:${edge.targetKey}`,
      source: `run-node:${edge.sourceKey}`,
      target: `run-node:${edge.targetKey}`,
      relation: "precedes",
      sourceType: "run_plan_snapshot",
      evidence: [dataFlowEvidence("run_plan_snapshot", run.snapshotHash, `${edge.sourceKey} → ${edge.targetKey}`, "frozen", true)],
    });
  }
  for (const edge of input.lineageEdges) {
    const source = lineageNodeId(edge.parentKind, edge.parentId);
    const target = lineageNodeId(edge.childKind, edge.childId);
    if (!projectedNodeIds.has(source) || !projectedNodeIds.has(target)) continue;
    edges.push({
      id: `lineage-edge:${edge.id}`,
      source,
      target,
      relation: edge.relation,
      sourceType: "sample_lineage",
      evidence: [dataFlowEvidence("sample_lineage", `lineage-edge:${edge.id}`, edge.relation, "recorded", false)],
    });
  }

  return {
    schemaVersion: "1.0",
    phases: [
      { id: "plan", label: "运行计划", labelEn: "Run plan", status: input.integrityValid ? "locked" : "integrity_failed", source: "run_plan_snapshot", evidence: planEvidence },
      { id: "materials", label: "样本与物料", labelEn: "Samples & materials", status: run.executionMode === "simulation" ? "snapshot_only" : run.requestStatus ?? "not_reserved", source: run.sampleRequestId ? "sample_request" : "lab_run_resource", evidence: requestEvidence.length ? requestEvidence : resourceNodes.flatMap((node) => node.evidence.slice(0, 1)) },
      { id: "execution", label: "流程执行", labelEn: "Execution", status: run.status, source: "lab_run_node", evidence: [...executionNodes.flatMap((node) => node.evidence.slice(0, 1)), ...bookingEvidence] },
      { id: "results", label: "结果记录", labelEn: "Results", status: "not_recorded", source: "none", evidence: [] },
    ],
    nodes: [
      { id: planNodeId, phase: "plan", kind: "run_plan", title: run.name, subtitle: `${run.runNo} · ${run.workflowName}`, status: input.integrityValid ? "locked" : "integrity_failed", source: "run_plan_snapshot", evidence: planEvidence },
      ...lineageNodes,
      ...resourceNodes,
      ...executionNodes,
    ],
    edges,
    resultState: { status: "not_recorded", source: "none", evidence: [] },
  };
}
