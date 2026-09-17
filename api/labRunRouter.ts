import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import {
  cancelLabRunInputSchema,
  buildLabRunDataFlow,
  createLabRunInputSchema,
  labRunTransitionInputSchema,
  labRunTransitionResultSchema,
  readinessSummary,
  terminalRunStatus,
  validateRunGraph,
  type CreateLabRunInput,
  type LabRunStatus,
  type LabRunTransitionResult,
  type RunReadinessIssue,
} from "@contracts/labRun";
import {
  EQUIP_PARAM_SCHEMAS,
  INSTRUMENT_PROFILES,
  type ParamField,
} from "@contracts/workflow";
import type { CloningPlan } from "@contracts/cloningLayout";
import {
  BUILTIN_DRIVER_MANIFESTS,
  driverManifestSchema,
  parseDriverTemplateKey,
  validateDriverActionForBinding,
  validateDriverValues,
  type DriverField,
  type DriverManifest,
} from "@contracts/deviceDriver";
import {
  driverReleases,
  equipment,
  equipmentBookings,
  equipmentDriverBindings,
  fulfillmentTasks,
  inventoryReservations,
  lineageEdges,
  cloningLayoutPlans,
  labRunNodes,
  labRunResources,
  labRunTransitions,
  labRuns,
  projects,
  sampleRequestItems,
  sampleRequests,
  samples,
  sequences,
  storageLocations,
  workflowEdges,
  workflowNodes,
  workflows,
} from "@db/schema";
import { getAvailableQuantity, roundRequestQuantity } from "@contracts/sampleRequest";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity, type DatabaseTransaction } from "./queries/labHelpers";

type JsonRecord = Record<string, string | number | boolean>;

export type FrozenCloningTargetBinding = {
  target: number;
  sampleId: number;
  sku: string;
  name: string;
  type: string;
};

export type FrozenCloningTargetResource = {
  id: number;
  role: string;
  sku: string;
  name: string;
  type: string;
};

type FrozenCloningLayoutPlan = {
  id: number;
  name: string;
  version: number;
  nodeKey: string | null;
  nodeLabel: string | null;
  sampleCount: number;
  plateCount: number;
  engineVersion: string;
  snapshotHash: string;
  plan: CloningPlan;
  /** Missing only on Runs created before physical target binding was introduced. */
  targetBindings?: FrozenCloningTargetBinding[];
};

/**
 * Validate the physical target mapping embedded in a Run snapshot.
 * Missing bindings are accepted only for backward compatibility; when present,
 * they must form an ordered 1..N bijection over the frozen sample resources.
 */
export function frozenCloningTargetBindingsAreValid(
  sampleCount: number,
  bindings: unknown,
  resources: readonly FrozenCloningTargetResource[],
) {
  if (bindings === undefined) return true;
  if (!Array.isArray(bindings) || bindings.length !== sampleCount) return false;

  const sampleResources = resources.filter((resource) => resource.role === "sample");
  const resourceById = new Map(sampleResources.map((resource) => [resource.id, resource]));
  if (sampleResources.length !== sampleCount || resourceById.size !== sampleResources.length) return false;

  const targets = new Set<number>();
  const sampleIds = new Set<number>();
  for (const [index, rawBinding] of bindings.entries()) {
    if (!rawBinding || typeof rawBinding !== "object" || Array.isArray(rawBinding)) return false;
    const binding = rawBinding as Partial<FrozenCloningTargetBinding>;
    const target = binding.target;
    const sampleId = binding.sampleId;
    if (
      typeof target !== "number" ||
      !Number.isInteger(target) ||
      target !== index + 1 ||
      targets.has(target) ||
      typeof sampleId !== "number" ||
      !Number.isInteger(sampleId) ||
      sampleId <= 0 ||
      sampleIds.has(sampleId)
    ) return false;
    const resource = resourceById.get(sampleId);
    if (
      !resource ||
      binding.sku !== resource.sku ||
      binding.name !== resource.name ||
      binding.type !== resource.type
    ) return false;
    targets.add(target);
    sampleIds.add(sampleId);
  }

  return targets.size === sampleCount && sampleIds.size === sampleResources.length;
}

function parseRecord(raw: string | null | undefined, nodeLabel: string): JsonRecord {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed);
    if (entries.some(([, value]) => !["string", "number", "boolean"].includes(typeof value))) throw new Error();
    return Object.fromEntries(entries) as JsonRecord;
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `节点“${nodeLabel}”的模板参数已损坏` });
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isFrozenCloningLayoutPlan(value: unknown): value is FrozenCloningLayoutPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<FrozenCloningLayoutPlan>;
  const plan = candidate.plan as Partial<CloningPlan> | undefined;
  return Number.isInteger(candidate.id) && Number(candidate.id) > 0 &&
    typeof candidate.name === "string" && candidate.name.length > 0 &&
    Number.isInteger(candidate.version) && Number(candidate.version) > 0 &&
    (candidate.nodeKey === null || typeof candidate.nodeKey === "string") &&
    (candidate.nodeLabel === null || typeof candidate.nodeLabel === "string") &&
    Number.isInteger(candidate.sampleCount) && Number(candidate.sampleCount) > 0 &&
    Number.isInteger(candidate.plateCount) && Number(candidate.plateCount) > 0 &&
    typeof candidate.engineVersion === "string" && candidate.engineVersion.length > 0 &&
    typeof candidate.snapshotHash === "string" && candidate.snapshotHash.length === 64 &&
    !!plan && typeof plan === "object" && !Array.isArray(plan) &&
    plan.planningOnly === true &&
    plan.engineVersion === candidate.engineVersion &&
    plan.config?.samples === candidate.sampleCount &&
    plan.summary?.plates === candidate.plateCount &&
    Array.isArray(plan.stages) &&
    sha256(JSON.stringify(plan)) === candidate.snapshotHash;
}

function freezeCloningLayoutPlan(record: typeof cloningLayoutPlans.$inferSelect): FrozenCloningLayoutPlan {
  if (sha256(record.snapshot) !== record.snapshotHash) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "排板方案快照完整性校验失败" });
  }
  let plan: CloningPlan;
  try {
    plan = JSON.parse(record.snapshot) as CloningPlan;
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "排板方案快照无法解析" });
  }
  const frozen: FrozenCloningLayoutPlan = {
    id: record.id,
    name: record.name,
    version: record.version,
    nodeKey: record.nodeKey,
    nodeLabel: record.nodeLabel,
    sampleCount: record.sampleCount,
    plateCount: record.plateCount,
    engineVersion: record.engineVersion,
    snapshotHash: record.snapshotHash,
    plan,
  };
  if (!isFrozenCloningLayoutPlan(frozen)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "排板方案快照内容与摘要不一致" });
  }
  return frozen;
}

/** MySQL timestamp columns in this model use second precision. */
function storedTimestamp(value: Date) {
  return new Date(Math.floor(value.getTime() / 1_000) * 1_000);
}

function frozenTimestampMatches(value: string, current: Date | null) {
  const parsed = Date.parse(value);
  return !!current && Number.isFinite(parsed) && Math.floor(parsed / 1_000) === Math.floor(current.getTime() / 1_000);
}

type FrozenRunPlan = {
  schemaVersion: string;
  /** Optional for backward compatibility with Run snapshots created before plate-plan freezing. */
  cloningLayoutPlan?: FrozenCloningLayoutPlan | null;
  run: {
    runNo: string;
    name: string;
    purpose: string | null;
    projectId: number | null;
    executionMode: "simulation" | "edge";
    scheduledStart: string;
    scheduledEnd: string;
    operatorName: string | null;
  };
  workflow: {
    id: number;
    name: string;
    description: string | null;
    scenario: string;
    updatedAt: string;
  };
  nodes: Array<{
    id: number;
    nodeKey: string;
    type: string;
    label: string;
    templateKey: string | null;
    config: string | null;
  }>;
  edges: Array<{ sourceKey: string; targetKey: string }>;
  resources: Array<{
    id: number;
    sku: string;
    name: string;
    type: string;
    role: string;
    nodeKey?: string | null;
    plannedAmount: number;
    unit: string;
    quantityAtFreeze: number;
    locationId: number | null;
    boxRow: string | null;
    boxCol: number | null;
    projectId: number | null;
    sequenceId: number | null;
    expiryDate: string | null;
  }>;
  executionNodes: Array<{
    nodeKey: string;
    sourceNodeId: number;
    equipmentId: number | null;
    equipmentSnapshot: unknown;
    driverKey: string | null;
    driverVersion: string | null;
    driverMode: string | null;
    parameters: unknown;
  }>;
};

function parseFrozenRunPlan(run: typeof labRuns.$inferSelect): FrozenRunPlan | null {
  if (sha256(run.workflowSnapshot) !== run.snapshotHash) return null;
  try {
    const parsed = JSON.parse(run.workflowSnapshot) as Partial<FrozenRunPlan>;
    if (
      !parsed.run ||
      typeof parsed.run !== "object" ||
      !parsed.workflow ||
      typeof parsed.workflow !== "object" ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges) ||
      !Array.isArray(parsed.resources) ||
      !Array.isArray(parsed.executionNodes)
    ) return null;
    const plan = parsed as FrozenRunPlan;
    if (
      plan.cloningLayoutPlan !== undefined &&
      plan.cloningLayoutPlan !== null &&
      !isFrozenCloningLayoutPlan(plan.cloningLayoutPlan)
    ) return null;
    if (
      plan.cloningLayoutPlan &&
      !frozenCloningTargetBindingsAreValid(
        plan.cloningLayoutPlan.sampleCount,
        plan.cloningLayoutPlan.targetBindings,
        plan.resources,
      )
    ) return null;
    const graph = validateRunGraph(plan.nodes, plan.edges);
    if (!graph.valid) return null;
    const nodeKeys = new Set(plan.nodes.map((node) => node.nodeKey));
    const executionNodeKeys = plan.executionNodes.map((node) => node.nodeKey);
    if (
      executionNodeKeys.some((nodeKey) => typeof nodeKey !== "string" || !nodeKeys.has(nodeKey)) ||
      new Set(executionNodeKeys).size !== plan.nodes.length ||
      executionNodeKeys.length !== plan.nodes.length
    ) return null;
    return plan;
  } catch {
    return null;
  }
}

function jsonSnapshotMatches(raw: string | null, expected: unknown) {
  if (raw === null) return expected === null;
  try {
    return JSON.stringify(JSON.parse(raw)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function runProjectionIntegrity(
  run: typeof labRuns.$inferSelect,
  plan: FrozenRunPlan,
  nodes: Array<typeof labRunNodes.$inferSelect>,
  resources: Array<typeof labRunResources.$inferSelect>,
) {
  const headerValid =
    plan.schemaVersion === "1.0" &&
    plan.run.runNo === run.runNo &&
    plan.run.name === run.name &&
    plan.run.purpose === run.purpose &&
    plan.run.projectId === run.projectId &&
    plan.run.executionMode === run.executionMode &&
    frozenTimestampMatches(plan.run.scheduledStart, run.scheduledStart) &&
    frozenTimestampMatches(plan.run.scheduledEnd, run.scheduledEnd) &&
    plan.run.operatorName === run.operatorName &&
    plan.workflow.id === run.workflowId &&
    plan.workflow.name === run.workflowName;
  if (
    !headerValid ||
    plan.nodes.length !== nodes.length ||
    plan.executionNodes.length !== nodes.length ||
    plan.resources.length !== resources.length
  ) return false;
  const sourceNodes = new Map(plan.nodes.map((node) => [node.nodeKey, node]));
  const executionNodes = new Map(plan.executionNodes.map((node) => [node.nodeKey, node]));
  const resourcePlans = new Map(plan.resources.map((resource) => [resource.id, resource]));
  if (
    sourceNodes.size !== plan.nodes.length ||
    executionNodes.size !== plan.executionNodes.length ||
    resourcePlans.size !== plan.resources.length ||
    new Set(nodes.map((node) => node.nodeKey)).size !== nodes.length ||
    new Set(resources.map((resource) => resource.sampleId)).size !== resources.length
  ) return false;
  const nodesValid = nodes.every((node) => {
    const source = sourceNodes.get(node.nodeKey);
    const execution = executionNodes.get(node.nodeKey);
    return !!source && !!execution &&
      source.id === node.sourceNodeId &&
      source.type === node.type &&
      source.label === node.label &&
      source.templateKey === node.templateKey &&
      source.config === node.configSnapshot &&
      execution.sourceNodeId === node.sourceNodeId &&
      execution.equipmentId === node.equipmentId &&
      execution.driverKey === node.driverKey &&
      execution.driverVersion === node.driverVersion &&
      execution.driverMode === node.driverMode &&
      jsonSnapshotMatches(node.equipmentSnapshot, execution.equipmentSnapshot) &&
      jsonSnapshotMatches(node.parameterSnapshot, execution.parameters);
  });
  const resourcesValid = resources.every((resource) => {
    const expected = resourcePlans.get(resource.sampleId);
    return !!expected &&
      expected.role === resource.role &&
      (expected.nodeKey ?? null) === resource.nodeKey &&
      Number(expected.plannedAmount) === Number(resource.amount) &&
      expected.unit === resource.unit &&
      jsonSnapshotMatches(resource.sampleSnapshot, {
        id: expected.id,
        sku: expected.sku,
        name: expected.name,
        type: expected.type,
        quantityAtFreeze: expected.quantityAtFreeze,
        unit: expected.unit,
        locationId: expected.locationId,
        boxRow: expected.boxRow,
        boxCol: expected.boxCol,
        projectId: expected.projectId,
        sequenceId: expected.sequenceId,
        expiryDate: expected.expiryDate,
      });
  });
  return nodesValid && resourcesValid;
}

function topologicalNodeOrder(plan: FrozenRunPlan) {
  const graph = validateRunGraph(plan.nodes, plan.edges);
  return graph.valid ? graph.order : [];
}

function nextRunNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `RUN-${date}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function nextRequestNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `REQ-${date}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function hasDatabaseCode(error: unknown, code: string, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && hasDatabaseCode(error.cause, code, depth + 1);
}

function sortedRecord(values: JsonRecord) {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

function labRunRequestHash(input: CreateLabRunInput, includeTargetOrder = true) {
  return sha256(JSON.stringify({
    workflowId: input.workflowId,
    // Preserve the pre-layout canonical payload when no plan is selected so
    // retries of Runs created before this field existed remain idempotent.
    ...(input.cloningLayoutPlanId != null
      ? {
          cloningLayoutPlanId: input.cloningLayoutPlanId,
          ...(includeTargetOrder
            ? {
                cloningTargetSampleIds: input.resources
                  .filter((resource) => resource.role === "sample")
                  .map((resource) => resource.sampleId),
              }
            : {}),
        }
      : {}),
    name: input.name,
    purpose: input.purpose ?? null,
    projectId: input.projectId ?? null,
    executionMode: input.executionMode,
    scheduledStart: storedTimestamp(input.scheduledStart).toISOString(),
    scheduledEnd: storedTimestamp(input.scheduledEnd).toISOString(),
    operatorName: input.operatorName ?? null,
    resources: [...input.resources]
      .map((resource) => ({ ...resource, nodeKey: resource.nodeKey ?? null }))
      .sort((left, right) => left.sampleId - right.sampleId),
    nodeBindings: [...input.nodeBindings]
      .map((binding) => ({
        ...binding,
        equipmentId: binding.equipmentId ?? null,
        overrideReason: binding.overrideReason ?? null,
        params: sortedRecord(binding.params),
      }))
      .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)),
  }));
}

type LabRunTransitionAction = "start" | "advance" | "cancel";

function transitionRequestHash(payload: unknown) {
  return sha256(JSON.stringify(payload));
}

async function findTransitionReplay(
  tx: DatabaseTransaction,
  params: {
    runId: number;
    action: LabRunTransitionAction;
    idempotencyKey: string;
    requestHash: string;
    createdById: number;
  },
): Promise<(LabRunTransitionResult & { replayed: true }) | null> {
  const [existing] = await tx
    .select()
    .from(labRunTransitions)
    .where(
      and(
        eq(labRunTransitions.runId, params.runId),
        eq(labRunTransitions.action, params.action),
        eq(labRunTransitions.idempotencyKey, params.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) return null;
  if (existing.requestHash !== params.requestHash || existing.createdById !== params.createdById) {
    throw new TRPCError({ code: "CONFLICT", message: "该运行动作请求标识已用于其他内容" });
  }
  try {
    const result = labRunTransitionResultSchema.parse(JSON.parse(existing.resultJson));
    return { ...result, replayed: true };
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "运行动作幂等记录已损坏" });
  }
}

async function recordTransition(
  tx: DatabaseTransaction,
  params: {
    runId: number;
    action: LabRunTransitionAction;
    idempotencyKey: string;
    requestHash: string;
    result: LabRunTransitionResult;
    statusBefore: LabRunStatus;
    statusAfter: LabRunStatus;
    revisionBefore: number;
    revisionAfter: number;
    createdById: number;
    createdByName: string | null;
  },
) {
  await tx.insert(labRunTransitions).values({
    runId: params.runId,
    action: params.action,
    idempotencyKey: params.idempotencyKey,
    requestHash: params.requestHash,
    resultJson: JSON.stringify(params.result),
    statusBefore: params.statusBefore,
    statusAfter: params.statusAfter,
    revisionBefore: params.revisionBefore,
    revisionAfter: params.revisionAfter,
    createdById: params.createdById,
    createdByName: params.createdByName,
  });
}

function assertExecutionChannelAvailable(mode: string) {
  if (mode === "edge") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "现场设备运行尚未开放：需要先完成 Edge 心跳、设备租约、命令账本与回执闭环",
    });
  }
}

async function resolveDriver(
  tx: DatabaseTransaction,
  driverKey: string,
  version: string,
): Promise<{ manifest: DriverManifest; releaseStatus: "draft" | "published" | "retired"; checksum: string }> {
  const builtin = BUILTIN_DRIVER_MANIFESTS.find(
    (item) => item.driverKey === driverKey && item.version === version,
  );
  if (builtin) {
    return {
      manifest: builtin,
      releaseStatus: "published",
      checksum: sha256(JSON.stringify(builtin)),
    };
  }
  const [release] = await tx
    .select()
    .from(driverReleases)
    .where(and(eq(driverReleases.driverKey, driverKey), eq(driverReleases.version, version)))
    .limit(1);
  if (!release) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `驱动版本不存在：${driverKey}@${version}` });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(release.manifest);
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `驱动版本已损坏：${driverKey}@${version}` });
  }
  const parsed = driverManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `驱动版本已损坏：${driverKey}@${version}` });
  }
  return { manifest: parsed.data, releaseStatus: release.status, checksum: release.checksum };
}

function defaultsFromFields(fields: Array<DriverField | ParamField>): JsonRecord {
  return Object.fromEntries(
    fields
      .filter((field) => field.default !== undefined)
      .map((field) => [field.key, field.default as string | number | boolean]),
  );
}

function validateStaticParams(fields: ParamField[], values: JsonRecord, nodeLabel: string) {
  const known = new Set(fields.map((field) => field.key));
  const unknown = Object.keys(values).find((key) => !known.has(key));
  if (unknown) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${nodeLabel}”包含未声明参数：${unknown}` });
  }
  for (const field of fields) {
    const value = values[field.key];
    if (field.required && (value === undefined || value === "")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${nodeLabel}”的${field.label}不能为空` });
    }
    if (value === undefined) continue;
    if (field.type === "number" && typeof value !== "number") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${nodeLabel}”的${field.label}必须是数字` });
    }
    if ((field.type === "text" || field.type === "select") && typeof value !== "string") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${nodeLabel}”的${field.label}格式不正确` });
    }
    if (field.type === "select" && field.options && !field.options.includes(String(value))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${nodeLabel}”的${field.label}不在允许范围内` });
    }
    if (field.type === "number" && typeof value === "number") {
      if (field.min !== undefined && value < field.min) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${nodeLabel}”的${field.label}不能小于 ${field.min}` });
      }
      if (field.max !== undefined && value > field.max) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${nodeLabel}”的${field.label}不能大于 ${field.max}` });
      }
    }
  }
}

async function currentReadiness(
  run: typeof labRuns.$inferSelect,
  tx: DatabaseTransaction,
  options: {
    nodes?: Array<typeof labRunNodes.$inferSelect>;
    lockEquipment?: boolean;
  } = {},
): Promise<{ issues: RunReadinessIssue[]; summary: ReturnType<typeof readinessSummary> }> {
  const issues: RunReadinessIssue[] = [];
  if (run.sampleRequestId) {
    const [request] = await tx
      .select({ status: sampleRequests.status })
      .from(sampleRequests)
      .where(eq(sampleRequests.id, run.sampleRequestId))
      .limit(1);
    if (!request || request.status === "cancelled") {
      issues.push({
        code: "sample_request",
        level: "blocking",
        label: "关联的样本与物料请求已取消或不存在",
        labelEn: "The linked sample and material request is cancelled or missing",
      });
    } else if (!["reserved", "in_fulfillment", "fulfilled"].includes(request.status)) {
      issues.push({
        code: "sample_request",
        level: "blocking",
        label: "样本与物料尚未完成预占",
        labelEn: "Samples and materials have not been reserved",
      });
    } else if (request.status !== "fulfilled") {
      issues.push({
        code: "sample_request",
        level: "warning",
        label: "样本与物料已预占，现场仍需完成领料",
        labelEn: "Samples and materials are reserved; physical issue is still pending",
      });
    }
  }

  const nodes = options.nodes ?? await tx.select().from(labRunNodes).where(eq(labRunNodes.runId, run.id));
  const equipmentNodes = nodes.filter((node) => node.type === "equipment");
  const equipmentIds = ([...new Set(equipmentNodes.map((node) => node.equipmentId).filter(Boolean))] as number[])
    .sort((left, right) => left - right);
  let equipmentRows: Array<typeof equipment.$inferSelect> = [];
  let bindings: Array<typeof equipmentDriverBindings.$inferSelect> = [];
  if (equipmentIds.length && options.lockEquipment) {
    equipmentRows = await tx
      .select()
      .from(equipment)
      .where(inArray(equipment.id, equipmentIds))
      .orderBy(equipment.id)
      .for("update");
    bindings = await tx
      .select()
      .from(equipmentDriverBindings)
      .where(inArray(equipmentDriverBindings.equipmentId, equipmentIds))
      .orderBy(equipmentDriverBindings.equipmentId)
      .for("update");
  } else if (equipmentIds.length) {
    [equipmentRows, bindings] = await Promise.all([
      tx.select().from(equipment).where(inArray(equipment.id, equipmentIds)),
      tx.select().from(equipmentDriverBindings).where(inArray(equipmentDriverBindings.equipmentId, equipmentIds)),
    ]);
  }
  for (const node of equipmentNodes) {
    if (!node.equipmentId) {
      issues.push({
        code: "equipment",
        level: "blocking",
        label: `设备节点“${node.label}”未绑定设备`,
        labelEn: `Instrument node “${node.label}” has no assigned instrument`,
        nodeKey: node.nodeKey,
      });
      continue;
    }
    const device = equipmentRows.find((row) => row.id === node.equipmentId);
    if (!device || ["maintenance", "fault"].includes(device.status)) {
      issues.push({
        code: "equipment",
        level: "blocking",
        label: `设备“${node.label}”当前不可用`,
        labelEn: `The instrument for “${node.label}” is currently unavailable`,
        nodeKey: node.nodeKey,
      });
      continue;
    }
    if (node.driverKey) {
      const binding = bindings.find((row) => row.equipmentId === node.equipmentId);
      const expectedStatus = run.executionMode === "simulation" ? "simulation_ready" : "ready";
      if (
        !binding ||
        !binding.enabled ||
        binding.mode !== run.executionMode ||
        binding.status !== expectedStatus ||
        binding.driverKey !== node.driverKey ||
        binding.driverVersion !== node.driverVersion
      ) {
        issues.push({
          code: "driver",
          level: "blocking",
          label: `设备节点“${node.label}”的当前驱动状态与运行快照不一致`,
          labelEn: `The current driver state for “${node.label}” no longer matches the run snapshot`,
          nodeKey: node.nodeKey,
        });
      } else if (node.equipmentSnapshot) {
        try {
          const snapshot = JSON.parse(node.equipmentSnapshot) as {
            driver?: { bindingId?: number; bindingUpdatedAt?: string; connectionConfigChecksum?: string };
          };
          if (
            snapshot.driver?.bindingId !== binding.id ||
            snapshot.driver?.bindingUpdatedAt !== binding.updatedAt.toISOString() ||
            snapshot.driver?.connectionConfigChecksum !== sha256(binding.connectionConfig)
          ) {
            issues.push({
              code: "driver",
              level: "blocking",
              label: `设备节点“${node.label}”的驱动配置已在运行计划锁定后发生变化`,
              labelEn: `The driver configuration for “${node.label}” changed after the run plan was locked`,
              nodeKey: node.nodeKey,
            });
          }
        } catch {
          issues.push({
            code: "driver",
            level: "blocking",
            label: `设备节点“${node.label}”的设备快照已损坏`,
            labelEn: `The instrument snapshot for “${node.label}” is corrupted`,
            nodeKey: node.nodeKey,
          });
        }
      }
    }
  }
  if (run.scheduledEnd && run.scheduledEnd < new Date()) {
    issues.push({
      code: "schedule",
      level: "warning",
      label: "计划运行时段已结束，请重新确认排程",
      labelEn: "The planned run window has ended; confirm the schedule again",
    });
  }
  return { issues, summary: readinessSummary(issues) };
}

export const labRunRouter = createRouter({
  list: authedQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({ run: labRuns, projectName: projects.name, requestStatus: sampleRequests.status })
      .from(labRuns)
      .leftJoin(projects, eq(labRuns.projectId, projects.id))
      .leftJoin(sampleRequests, eq(labRuns.sampleRequestId, sampleRequests.id))
      .orderBy(desc(labRuns.createdAt));
    if (!rows.length) return [];
    const ids = rows.map(({ run }) => run.id);
    const [resources, nodes] = await Promise.all([
      db.select({ runId: labRunResources.runId, role: labRunResources.role }).from(labRunResources).where(inArray(labRunResources.runId, ids)),
      db.select({ runId: labRunNodes.runId, type: labRunNodes.type, status: labRunNodes.status }).from(labRunNodes).where(inArray(labRunNodes.runId, ids)),
    ]);
    return rows.map(({ run, projectName, requestStatus }) => ({
      ...run,
      projectName,
      requestStatus,
      sampleCount: resources.filter((resource) => resource.runId === run.id && resource.role === "sample").length,
      materialCount: resources.filter((resource) => resource.runId === run.id && resource.role !== "sample").length,
      nodeCount: nodes.filter((node) => node.runId === run.id).length,
      completedNodeCount: nodes.filter((node) => node.runId === run.id && node.status === "completed").length,
    }));
  }),

  launchContext: authedQuery
    .input(z.object({ workflowId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [workflow] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, input.workflowId))
        .limit(1);
      if (!workflow || workflow.parentWorkflowId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "流程模板不存在" });
      }
      const [nodes, edges, sampleRows, reservations, equipmentRows, bindings, projectRows, layoutPlans] = await Promise.all([
        db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id)),
        db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)),
        db.select().from(samples).where(isNull(samples.archivedAt)).orderBy(samples.name),
        db.select({ sampleId: inventoryReservations.sampleId, amount: inventoryReservations.amount })
          .from(inventoryReservations)
          .where(eq(inventoryReservations.status, "active")),
        db.select().from(equipment).orderBy(equipment.name),
        db.select({
          equipmentId: equipmentDriverBindings.equipmentId,
          driverKey: equipmentDriverBindings.driverKey,
          driverVersion: equipmentDriverBindings.driverVersion,
          mode: equipmentDriverBindings.mode,
          status: equipmentDriverBindings.status,
          enabled: equipmentDriverBindings.enabled,
          lastTestAt: equipmentDriverBindings.lastTestAt,
        }).from(equipmentDriverBindings),
        db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects).orderBy(projects.name),
        db.select({
          id: cloningLayoutPlans.id,
          name: cloningLayoutPlans.name,
          version: cloningLayoutPlans.version,
          nodeKey: cloningLayoutPlans.nodeKey,
          nodeLabel: cloningLayoutPlans.nodeLabel,
          sampleCount: cloningLayoutPlans.sampleCount,
          plateCount: cloningLayoutPlans.plateCount,
          engineVersion: cloningLayoutPlans.engineVersion,
          mode: cloningLayoutPlans.mode,
          snapshotHash: cloningLayoutPlans.snapshotHash,
          createdAt: cloningLayoutPlans.createdAt,
          createdByName: cloningLayoutPlans.createdByName,
        })
          .from(cloningLayoutPlans)
          .where(eq(cloningLayoutPlans.workflowId, workflow.id))
          .orderBy(desc(cloningLayoutPlans.version)),
      ]);
      const graph = validateRunGraph(nodes, edges);
      const nodeOrder = graph.valid
        ? new Map(graph.order.map((nodeKey, index) => [nodeKey, index]))
        : null;
      const orderedNodes = nodeOrder
        ? [...nodes].sort(
            (left, right) =>
              (nodeOrder.get(left.nodeKey) ?? 0) - (nodeOrder.get(right.nodeKey) ?? 0),
          )
        : nodes;
      return {
        workflow,
        nodes: orderedNodes,
        edges,
        cloningLayoutPlans: layoutPlans,
        projects: projectRows,
        resources: sampleRows.map((sample) => {
          const activeReserved = roundRequestQuantity(
            reservations
              .filter((reservation) => reservation.sampleId === sample.id)
              .reduce((sum, reservation) => sum + Number(reservation.amount), 0),
          );
          return {
            ...sample,
            activeReserved,
            availableQuantity: getAvailableQuantity(Number(sample.quantity), activeReserved),
          };
        }),
        equipment: equipmentRows.map((device) => ({
          ...device,
          binding: bindings.find((binding) => binding.equipmentId === device.id) ?? null,
        })),
      };
    }),

  byId: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = getDb();
    const [row] = await db
      .select({ run: labRuns, projectName: projects.name, requestNo: sampleRequests.requestNo, requestStatus: sampleRequests.status })
      .from(labRuns)
      .leftJoin(projects, eq(labRuns.projectId, projects.id))
      .leftJoin(sampleRequests, eq(labRuns.sampleRequestId, sampleRequests.id))
      .where(eq(labRuns.id, input.id))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "实验运行不存在" });
    const frozenPlan = parseFrozenRunPlan(row.run);
    const [resourceRows, nodeRows, bookings, readiness] = await Promise.all([
      db
        .select({
          resource: labRunResources,
          sku: samples.sku,
          sampleName: samples.name,
          sampleType: samples.type,
          currentQuantity: samples.quantity,
          currentLocationId: samples.locationId,
          currentLocationName: storageLocations.name,
          currentLocationType: storageLocations.type,
          currentBoxRow: samples.boxRow,
          currentBoxCol: samples.boxCol,
        })
        .from(labRunResources)
        .innerJoin(samples, eq(labRunResources.sampleId, samples.id))
        .leftJoin(storageLocations, eq(samples.locationId, storageLocations.id))
        .where(eq(labRunResources.runId, input.id))
        .orderBy(labRunResources.id),
      db
        .select({ node: labRunNodes, equipmentName: equipment.name, equipmentModel: equipment.model })
        .from(labRunNodes)
        .leftJoin(equipment, eq(labRunNodes.equipmentId, equipment.id))
        .where(eq(labRunNodes.runId, input.id))
        .orderBy(labRunNodes.id),
      db.select().from(equipmentBookings).where(eq(equipmentBookings.labRunId, input.id)),
      db.transaction((tx) => currentReadiness(row.run, tx)),
    ]);
    const sampleIds = resourceRows.map(({ resource }) => resource.sampleId);
    const [requestItems, reservations, fulfillmentRows, lineageRows] = await Promise.all([
      row.run.sampleRequestId
        ? db.select().from(sampleRequestItems).where(eq(sampleRequestItems.requestId, row.run.sampleRequestId))
        : Promise.resolve([]),
      row.run.sampleRequestId
        ? db.select().from(inventoryReservations).where(eq(inventoryReservations.requestId, row.run.sampleRequestId))
        : Promise.resolve([]),
      row.run.sampleRequestId
        ? db.select().from(fulfillmentTasks).where(eq(fulfillmentTasks.requestId, row.run.sampleRequestId))
        : Promise.resolve([]),
      sampleIds.length
        ? db.select().from(lineageEdges).where(and(eq(lineageEdges.childKind, "sample"), inArray(lineageEdges.childId, sampleIds)))
        : Promise.resolve([]),
    ]);
    const lineageParentSampleIds = lineageRows
      .filter((edge) => edge.parentKind === "sample")
      .map((edge) => edge.parentId);
    const lineageParentSequenceIds = lineageRows
      .filter((edge) => edge.parentKind === "sequence")
      .map((edge) => edge.parentId);
    const [lineageSamples, lineageSequences] = await Promise.all([
      lineageParentSampleIds.length
        ? db.select({ id: samples.id, sku: samples.sku, name: samples.name, type: samples.type })
            .from(samples)
            .where(inArray(samples.id, lineageParentSampleIds))
        : Promise.resolve([]),
      lineageParentSequenceIds.length
        ? db.select({ id: sequences.id, name: sequences.name, type: sequences.type })
            .from(sequences)
            .where(inArray(sequences.id, lineageParentSequenceIds))
        : Promise.resolve([]),
    ]);
    const order = frozenPlan
      ? new Map(topologicalNodeOrder(frozenPlan).map((nodeKey, index) => [nodeKey, index]))
      : null;
    const orderedNodeRows = order
      ? [...nodeRows].sort(
          (left, right) =>
            (order.get(left.node.nodeKey) ?? 0) - (order.get(right.node.nodeKey) ?? 0),
        )
      : nodeRows;
    const integrityValid = !!frozenPlan && runProjectionIntegrity(
      row.run,
      frozenPlan,
      nodeRows.map(({ node }) => node),
      resourceRows.map(({ resource }) => resource),
    );
    const frozenResourceBySampleId = new Map(
      (frozenPlan?.resources ?? []).map((resource) => [resource.id, resource]),
    );
    const dataFlow = buildLabRunDataFlow({
      run: {
        id: row.run.id,
        runNo: row.run.runNo,
        name: row.run.name,
        status: row.run.status,
        executionMode: row.run.executionMode,
        workflowId: row.run.workflowId,
        workflowName: row.run.workflowName,
        snapshotHash: row.run.snapshotHash,
        sampleRequestId: row.run.sampleRequestId,
        requestNo: row.requestNo,
        requestStatus: row.requestStatus,
      },
      integrityValid,
      workflowEdges: frozenPlan?.edges ?? [],
      resources: resourceRows.map(({ resource, sku, sampleName, sampleType, currentLocationId, currentLocationName, currentLocationType, currentBoxRow, currentBoxCol }) => {
        const frozen = frozenResourceBySampleId.get(resource.sampleId);
        const requestItem = requestItems.find((item) => item.id === resource.sampleRequestItemId);
        const reservation = reservations.find((item) => item.id === resource.inventoryReservationId);
        const fulfillment = fulfillmentRows.find((item) => item.requestItemId === resource.sampleRequestItemId);
        return {
          id: resource.id,
          sampleId: resource.sampleId,
          role: resource.role,
          nodeKey: resource.nodeKey,
          amount: Number(resource.amount),
          unit: resource.unit,
          sku: frozen?.sku ?? sku,
          name: frozen?.name ?? sampleName,
          type: frozen?.type ?? sampleType,
          frozenLocationId: frozen?.locationId ?? null,
          frozenBoxRow: typeof frozen?.boxRow === "number" ? frozen.boxRow : null,
          frozenBoxCol: frozen?.boxCol ?? null,
          currentLocationId,
          currentLocationName,
          currentLocationType,
          currentBoxRow,
          currentBoxCol,
          sampleRequestItemId: resource.sampleRequestItemId,
          requestItemStatus: requestItem?.status ?? null,
          inventoryReservationId: resource.inventoryReservationId,
          reservationStatus: reservation?.status ?? null,
          fulfillmentTaskId: fulfillment?.id ?? null,
          fulfillmentStatus: fulfillment?.status ?? null,
        };
      }),
      nodes: orderedNodeRows.map(({ node, equipmentName }) => ({
        id: node.id,
        nodeKey: node.nodeKey,
        type: node.type,
        label: node.label,
        status: node.status,
        equipmentId: node.equipmentId,
        equipmentName,
        driverKey: node.driverKey,
        driverVersion: node.driverVersion,
      })),
      bookings,
      lineageNodes: [
        ...lineageSamples.map((sample) => ({ kind: "sample" as const, id: sample.id, title: sample.name, subtitle: `${sample.sku} · ${sample.type}` })),
        ...lineageSequences.map((sequence) => ({ kind: "sequence" as const, id: sequence.id, title: sequence.name, subtitle: sequence.type })),
      ],
      lineageEdges: lineageRows.map((edge) => ({
        id: edge.id,
        childKind: edge.childKind,
        childId: edge.childId,
        parentKind: edge.parentKind,
        parentId: edge.parentId,
        relation: edge.relation,
      })),
    });
    return {
      ...row.run,
      projectName: row.projectName,
      requestNo: row.requestNo,
      requestStatus: row.requestStatus,
      resources: resourceRows.map(({ resource, ...current }) => ({ ...resource, ...current })),
      nodes: orderedNodeRows.map(({ node, ...device }) => ({ ...node, ...device })),
      bookings,
      readiness,
      integrityValid,
      cloningLayoutPlan: frozenPlan?.cloningLayoutPlan ?? null,
      dataFlow,
    };
  }),

  create: writeQuery.input(createLabRunInputSchema).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const requestHash = labRunRequestHash(input);
    // Layout-aware hashes added ordered target identities. Accept the earlier
    // plan hash only when replaying a Run created before target bindings existed.
    const legacyRequestHash = input.cloningLayoutPlanId != null
      ? labRunRequestHash(input, false)
      : requestHash;
    const scheduledStart = storedTimestamp(input.scheduledStart);
    const scheduledEnd = storedTimestamp(input.scheduledEnd);
    const existing = await db.query.labRuns.findFirst({ where: eq(labRuns.idempotencyKey, input.idempotencyKey) });
    if (existing) {
      if (
        existing.createdById !== ctx.user.id ||
        (existing.requestHash !== requestHash && existing.requestHash !== legacyRequestHash)
      ) {
        throw new TRPCError({ code: "CONFLICT", message: "该运行请求标识已用于其他内容" });
      }
      return { id: existing.id, runNo: existing.runNo, repeated: true };
    }

    try {
      return await db.transaction(async (tx) => {
        const [workflow] = await tx
          .select()
          .from(workflows)
          .where(eq(workflows.id, input.workflowId))
          .limit(1)
          .for("update");
        if (!workflow || workflow.parentWorkflowId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "流程模板不存在" });
        }
        if (workflow.status !== "active") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "只有已启用的流程模板可以发起实验运行" });
        }
        assertExecutionChannelAvailable(input.executionMode);
        const [sourceNodes, sourceEdges] = await Promise.all([
          tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id)),
          tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, workflow.id)),
        ]);
        const graph = validateRunGraph(sourceNodes, sourceEdges);
        if (!graph.valid) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: graph.error });
        }
        let cloningLayoutPlan: FrozenCloningLayoutPlan | null = null;
        let cloningLayoutProjectId: number | null = null;
        if (input.cloningLayoutPlanId != null) {
          const [layoutRecord] = await tx
            .select()
            .from(cloningLayoutPlans)
            .where(eq(cloningLayoutPlans.id, input.cloningLayoutPlanId))
            .limit(1)
            .for("update");
          if (!layoutRecord) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "所选排板方案不存在" });
          }
          if (layoutRecord.workflowId !== workflow.id) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "所选排板方案不属于当前业务流" });
          }
          cloningLayoutPlan = freezeCloningLayoutPlan(layoutRecord);
          cloningLayoutProjectId = layoutRecord.projectId;
          if (
            cloningLayoutPlan.nodeKey &&
            !sourceNodes.some((node) => node.nodeKey === cloningLayoutPlan?.nodeKey)
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `排板方案的来源节点已不在当前流程中：${cloningLayoutPlan.nodeKey}`,
            });
          }
          const selectedSampleCount = input.resources.filter((resource) => resource.role === "sample").length;
          if (selectedSampleCount !== cloningLayoutPlan.sampleCount) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `所选排板方案需要 ${cloningLayoutPlan.sampleCount} 个实验样本，当前已选 ${selectedSampleCount} 个`,
            });
          }
        }
        const nestedNode = sourceNodes.find((node) => node.childWorkflowId);
        if (nestedNode) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `节点“${nestedNode.label}”包含子流程；当前版本请先将子流程展平后再发起运行`,
          });
        }
        const unknownResourceNode = input.resources.find(
          (resource) => resource.nodeKey && !sourceNodes.some((node) => node.nodeKey === resource.nodeKey),
        );
        if (unknownResourceNode) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `资源关联节点不存在：${unknownResourceNode.nodeKey}` });
        }
        const effectiveProjectId = input.projectId ?? workflow.projectId;
        if (!effectiveProjectId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "实验运行必须关联项目" });
        }
        if (cloningLayoutProjectId != null && cloningLayoutProjectId !== effectiveProjectId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "所选排板方案不属于本次运行项目" });
        }
        const [project] = await tx.select().from(projects).where(eq(projects.id, effectiveProjectId)).limit(1);
        if (!project || project.status !== "active") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "所选项目不存在或已结束" });
        }

        const bindingByNode = new Map(input.nodeBindings.map((binding) => [binding.nodeKey, binding]));
        const unknownBinding = input.nodeBindings.find(
          (binding) => !sourceNodes.some((node) => node.nodeKey === binding.nodeKey && node.type === "equipment"),
        );
        if (unknownBinding) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `设备节点不存在：${unknownBinding.nodeKey}` });
        }

        const equipmentNodes = sourceNodes.filter((node) => node.type === "equipment");
        const equipmentIds = equipmentNodes.map((node) => bindingByNode.get(node.nodeKey)?.equipmentId ?? node.equipmentId);
        if (equipmentIds.some((id) => !id)) {
          const node = equipmentNodes.find((candidate) => !(bindingByNode.get(candidate.nodeKey)?.equipmentId ?? candidate.equipmentId));
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: `设备节点“${node?.label ?? "未知"}”尚未绑定具体设备` });
        }
        const uniqueEquipmentIds = [...new Set(equipmentIds as number[])].sort((a, b) => a - b);
        const equipmentRows = uniqueEquipmentIds.length
          ? await tx.select().from(equipment).where(inArray(equipment.id, uniqueEquipmentIds)).for("update")
          : [];
        if (equipmentRows.length !== uniqueEquipmentIds.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "部分设备不存在" });
        }
        for (const device of equipmentRows) {
          if (["maintenance", "fault"].includes(device.status)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `设备“${device.name}”当前不可用于实验运行` });
          }
          if (
            input.executionMode === "edge" &&
            device.nextCalibrationDate &&
            device.nextCalibrationDate < scheduledEnd.toISOString().slice(0, 10)
          ) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `设备“${device.name}”的校准有效期不能覆盖计划结束时间` });
          }
          if (input.executionMode === "edge") {
            const conflicts = await tx
              .select()
              .from(equipmentBookings)
              .where(
                and(
                  eq(equipmentBookings.equipmentId, device.id),
                  eq(equipmentBookings.status, "active"),
                  lt(equipmentBookings.startTime, scheduledEnd),
                  gte(equipmentBookings.endTime, scheduledStart),
                ),
              )
              .for("update");
            if (conflicts.length) {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: `设备“${device.name}”在计划时段已有预约` });
            }
          }
        }

        const driverBindings = uniqueEquipmentIds.length
          ? await tx
              .select()
              .from(equipmentDriverBindings)
              .where(inArray(equipmentDriverBindings.equipmentId, uniqueEquipmentIds))
              .for("update")
          : [];
        const preparedNodes: Array<{
          source: (typeof sourceNodes)[number];
          equipmentId: number | null;
          equipmentSnapshot: string | null;
          driverKey: string | null;
          driverVersion: string | null;
          driverMode: "simulation" | "edge" | null;
          parameterSnapshot: string;
        }> = [];

        for (const node of sourceNodes) {
          const override = bindingByNode.get(node.nodeKey);
          const selectedEquipmentId = node.type === "equipment" ? (override?.equipmentId ?? node.equipmentId ?? null) : null;
          const device = selectedEquipmentId ? equipmentRows.find((row) => row.id === selectedEquipmentId) : null;
          const templateValues = parseRecord(node.params, node.label);
          const overrides = override?.params ?? {};
          let fields: Array<DriverField | ParamField> = node.templateKey ? (EQUIP_PARAM_SCHEMAS[node.templateKey] ?? []) : [];
          let driverKey: string | null = null;
          let driverVersion: string | null = null;
          let driverMode: "simulation" | "edge" | null = null;
          let driverSnapshot: Record<string, unknown> | null = null;

          const ref = parseDriverTemplateKey(node.templateKey);
          if (ref) {
            driverKey = ref.driverKey;
            driverVersion = ref.version;
            const resolved = await resolveDriver(tx, ref.driverKey, ref.version);
            if (resolved.releaseStatus !== "published") {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: `节点“${node.label}”使用的驱动版本未发布或已停用` });
            }
            const action = resolved.manifest.actions.find((candidate) => candidate.key === ref.actionKey && candidate.exposeAsNode);
            if (!action) {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: `节点“${node.label}”的驱动动作不存在` });
            }
            fields = action.fields;
            const binding = driverBindings.find((candidate) => candidate.equipmentId === selectedEquipmentId);
            const expectedStatus = input.executionMode === "simulation" ? "simulation_ready" : "ready";
            if (
              !binding ||
              !binding.enabled ||
              binding.driverKey !== ref.driverKey ||
              binding.driverVersion !== ref.version ||
              binding.mode !== input.executionMode ||
              binding.status !== expectedStatus
            ) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `节点“${node.label}”需要 ${ref.driverKey}@${ref.version} 的${input.executionMode === "edge" ? "真机" : "模拟"}就绪设备`,
              });
            }
            driverMode = binding.mode;
            let connectionConfig: Record<string, unknown>;
            try {
              const parsed = JSON.parse(binding.connectionConfig) as unknown;
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
              connectionConfig = parsed as Record<string, unknown>;
            } catch {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: `设备“${device?.name ?? node.label}”的驱动配置已损坏` });
            }
            const effectiveForValidation = { ...defaultsFromFields(fields), ...templateValues, ...overrides };
            const valueIssues = validateDriverValues(action.fields, effectiveForValidation);
            const bindingIssues = validateDriverActionForBinding(
              resolved.manifest,
              action.key,
              effectiveForValidation,
              binding.mode,
              connectionConfig,
            );
            if (valueIssues.length || bindingIssues.length) {
              throw new TRPCError({ code: "PRECONDITION_FAILED", message: `节点“${node.label}”：${[...valueIssues, ...bindingIssues].join("；")}` });
            }
            driverSnapshot = {
              key: ref.driverKey,
              version: ref.version,
              actionKey: ref.actionKey,
              manifestChecksum: resolved.checksum,
              bindingId: binding.id,
              bindingMode: binding.mode,
              bindingStatus: binding.status,
              lastTestAt: binding.lastTestAt,
              bindingUpdatedAt: binding.updatedAt.toISOString(),
              connectionConfigChecksum: sha256(binding.connectionConfig),
            };
          }

          const effectiveValues = { ...defaultsFromFields(fields), ...templateValues, ...overrides };
          if (!ref && node.type === "equipment" && fields.length) {
            validateStaticParams(fields as ParamField[], effectiveValues, node.label);
          }
          preparedNodes.push({
            source: node,
            equipmentId: selectedEquipmentId,
            equipmentSnapshot: device
              ? JSON.stringify({
                  id: device.id,
                  name: device.name,
                  model: device.model,
                  serialNo: device.serialNo,
                  room: device.room,
                  status: device.status,
                  nextCalibrationDate: device.nextCalibrationDate,
                  driver: driverSnapshot,
                })
              : null,
            driverKey,
            driverVersion,
            driverMode,
            parameterSnapshot: JSON.stringify({
              templateValues,
              overrides,
              effectiveValues,
              units: Object.fromEntries(fields.filter((field) => field.unit).map((field) => [field.key, field.unit])),
              overrideReason: override?.overrideReason || null,
              methodRef: node.templateKey ? INSTRUMENT_PROFILES[node.templateKey]?.methodFile ?? null : null,
            }),
          });
        }

        const sampleIds = [...new Set(input.resources.map((resource) => resource.sampleId))].sort((a, b) => a - b);
        const sampleRows = await tx
          .select()
          .from(samples)
          .where(and(inArray(samples.id, sampleIds), isNull(samples.archivedAt)))
          .for("update");
        if (sampleRows.length !== sampleIds.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "部分样本或物料不存在，或已归档" });
        }
        const activeReservations = await tx
          .select()
          .from(inventoryReservations)
          .where(and(inArray(inventoryReservations.sampleId, sampleIds), eq(inventoryReservations.status, "active")))
          .for("update");
        for (const resource of input.resources) {
          const sample = sampleRows.find((row) => row.id === resource.sampleId)!;
          const activeReserved = activeReservations
            .filter((reservation) => reservation.sampleId === resource.sampleId)
            .reduce((sum, reservation) => sum + Number(reservation.amount), 0);
          const available = getAvailableQuantity(Number(sample.quantity), activeReserved);
          if (available < resource.amount) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `${sample.sku} 可用量不足：可用 ${available} ${sample.unit}，本次需要 ${resource.amount} ${sample.unit}`,
            });
          }
          if (sample.expiryDate && sample.expiryDate < scheduledEnd.toISOString().slice(0, 10)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${sample.sku} 在计划运行结束前已过期` });
          }
        }
        if (cloningLayoutPlan) {
          cloningLayoutPlan = {
            ...cloningLayoutPlan,
            targetBindings: input.resources
              .filter((resource) => resource.role === "sample")
              .map((resource, index) => {
                const sample = sampleRows.find((row) => row.id === resource.sampleId)!;
                return {
                  target: index + 1,
                  sampleId: sample.id,
                  sku: sample.sku,
                  name: sample.name,
                  type: sample.type,
                };
              }),
          };
        }

        const runNo = nextRunNo();
        const workflowSnapshot = JSON.stringify({
          schemaVersion: "1.0",
          frozenAt: new Date().toISOString(),
          cloningLayoutPlan,
          run: {
            runNo,
            name: input.name,
            purpose: input.purpose || null,
            projectId: effectiveProjectId,
            executionMode: input.executionMode,
            scheduledStart,
            scheduledEnd,
            operatorName: input.operatorName || ctx.user.name,
          },
          workflow: {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            scenario: workflow.scenario,
            updatedAt: workflow.updatedAt,
          },
          nodes: sourceNodes.map((node) => ({ ...node, status: "pending" })),
          edges: sourceEdges,
          resources: input.resources.map((resource) => {
            const sample = sampleRows.find((row) => row.id === resource.sampleId)!;
            return {
              id: sample.id,
              sku: sample.sku,
              name: sample.name,
              type: sample.type,
              role: resource.role,
              nodeKey: resource.nodeKey ?? null,
              plannedAmount: roundRequestQuantity(resource.amount),
              unit: sample.unit,
              quantityAtFreeze: Number(sample.quantity),
              locationId: sample.locationId,
              boxRow: sample.boxRow,
              boxCol: sample.boxCol,
              projectId: sample.projectId,
              sequenceId: sample.sequenceId,
              expiryDate: sample.expiryDate,
            };
          }),
          executionNodes: preparedNodes.map((node) => ({
            nodeKey: node.source.nodeKey,
            sourceNodeId: node.source.id,
            equipmentId: node.equipmentId,
            equipmentSnapshot: node.equipmentSnapshot ? JSON.parse(node.equipmentSnapshot) : null,
            driverKey: node.driverKey,
            driverVersion: node.driverVersion,
            driverMode: node.driverMode,
            parameters: JSON.parse(node.parameterSnapshot),
          })),
        });
        const [{ id: runId }] = await tx
          .insert(labRuns)
          .values({
            runNo,
            name: input.name,
            purpose: input.purpose || null,
            workflowId: workflow.id,
            workflowName: workflow.name,
            workflowSnapshot,
            snapshotHash: sha256(workflowSnapshot),
            projectId: effectiveProjectId,
            executionMode: input.executionMode,
            status: "ready",
            scheduledStart,
            scheduledEnd,
            operatorName: input.operatorName || ctx.user.name,
            requestHash,
            idempotencyKey: input.idempotencyKey,
            createdById: ctx.user.id,
            createdByName: ctx.user.name,
          })
          .$returningId();

        let requestId: number | null = null;
        let itemIds: Array<{ id: number }> = [];
        let reservationIds: Array<{ id: number }> = [];
        if (input.executionMode === "edge") {
          const requestNo = nextRequestNo();
          const now = new Date();
          [{ id: requestId }] = await tx
            .insert(sampleRequests)
            .values({
              requestNo,
              title: `${runNo} · ${input.name}`,
              purpose: input.purpose || `实验运行 ${runNo} 的样本与物料准备`,
              projectId: effectiveProjectId,
              requesterId: ctx.user.id,
              requesterName: ctx.user.name,
              priority: "normal",
              status: "reserved",
              submittedAt: now,
              reservedAt: now,
            })
            .$returningId();
          itemIds = await tx
            .insert(sampleRequestItems)
            .values(
              input.resources.map((resource) => {
                const sample = sampleRows.find((row) => row.id === resource.sampleId)!;
                return {
                  requestId: requestId!,
                  sampleId: resource.sampleId,
                  requestedAmount: roundRequestQuantity(resource.amount),
                  reservedAmount: roundRequestQuantity(resource.amount),
                  unit: sample.unit,
                  targetFormat: resource.role === "sample" ? "实验输入" : resource.role === "control" ? "标准/对照" : "运行物料",
                  note: `由 ${runNo} 自动创建`,
                  status: "reserved" as const,
                };
              }),
            )
            .$returningId();
          reservationIds = await tx
            .insert(inventoryReservations)
            .values(
              input.resources.map((resource, index) => ({
                requestId: requestId!,
                requestItemId: itemIds[index].id,
                sampleId: resource.sampleId,
                amount: roundRequestQuantity(resource.amount),
                idempotencyKey: `lab-run:${sha256(input.idempotencyKey).slice(0, 32)}:${index}`,
              })),
            )
            .$returningId();
          await tx.insert(fulfillmentTasks).values(
            input.resources.map((resource, index) => {
              const sample = sampleRows.find((row) => row.id === resource.sampleId)!;
              return {
                requestId: requestId!,
                requestItemId: itemIds[index].id,
                type: "issue" as const,
                instruction: `为 ${runNo} 核对并发放 ${sample.sku} ${resource.amount} ${sample.unit}`,
              };
            }),
          );
        }
        await tx.insert(labRunResources).values(
          input.resources.map((resource, index) => {
            const sample = sampleRows.find((row) => row.id === resource.sampleId)!;
            return {
              runId,
              sampleId: sample.id,
              role: resource.role,
              amount: roundRequestQuantity(resource.amount),
              unit: sample.unit,
              nodeKey: resource.nodeKey || null,
              sampleSnapshot: JSON.stringify({
                id: sample.id,
                sku: sample.sku,
                name: sample.name,
                type: sample.type,
                quantityAtFreeze: Number(sample.quantity),
                unit: sample.unit,
                locationId: sample.locationId,
                boxRow: sample.boxRow,
                boxCol: sample.boxCol,
                projectId: sample.projectId,
                sequenceId: sample.sequenceId,
                expiryDate: sample.expiryDate,
              }),
              sampleRequestItemId: itemIds[index]?.id ?? null,
              inventoryReservationId: reservationIds[index]?.id ?? null,
            };
          }),
        );
        await tx.insert(labRunNodes).values(
          preparedNodes.map((node) => ({
            runId,
            sourceNodeId: node.source.id,
            nodeKey: node.source.nodeKey,
            type: node.source.type,
            label: node.source.label,
            templateKey: node.source.templateKey,
            equipmentId: node.equipmentId,
            equipmentSnapshot: node.equipmentSnapshot,
            driverKey: node.driverKey,
            driverVersion: node.driverVersion,
            driverMode: node.driverMode,
            configSnapshot: node.source.config,
            parameterSnapshot: node.parameterSnapshot,
            status: "pending" as const,
          })),
        );
        if (input.executionMode === "edge" && uniqueEquipmentIds.length) {
          await tx.insert(equipmentBookings).values(
            uniqueEquipmentIds.map((equipmentId) => ({
              equipmentId,
              userName: input.operatorName || ctx.user.name || "未知用户",
              purpose: `${runNo} · ${input.name}`,
              startTime: scheduledStart,
              endTime: scheduledEnd,
              labRunId: runId,
            })),
          );
        }
        if (requestId) {
          await tx.update(labRuns).set({ sampleRequestId: requestId }).where(eq(labRuns.id, runId));
        }
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "锁定并发起了实验运行",
          entityType: "lab_run",
          entityId: runId,
          entityName: runNo,
          after: {
            status: "ready",
            executionMode: input.executionMode,
            workflowId: workflow.id,
            snapshotHash: sha256(workflowSnapshot),
            cloningLayoutPlanId: cloningLayoutPlan?.id ?? null,
            cloningLayoutPlanVersion: cloningLayoutPlan?.version ?? null,
            cloningLayoutSnapshotHash: cloningLayoutPlan?.snapshotHash ?? null,
            resourceCount: input.resources.length,
            equipmentCount: uniqueEquipmentIds.length,
            sampleRequestId: requestId,
            resourceCommitment: input.executionMode === "simulation" ? "snapshot_only" : "reserved",
          },
        });
        return { id: runId, runNo, repeated: false };
      });
    } catch (error) {
      if (hasDatabaseCode(error, "ER_DUP_ENTRY")) {
        const repeated = await db.query.labRuns.findFirst({ where: eq(labRuns.idempotencyKey, input.idempotencyKey) });
        if (repeated) {
          if (
            repeated.createdById !== ctx.user.id ||
            (repeated.requestHash !== requestHash && repeated.requestHash !== legacyRequestHash)
          ) {
            throw new TRPCError({ code: "CONFLICT", message: "该运行请求标识已用于其他内容" });
          }
          return { id: repeated.id, runNo: repeated.runNo, repeated: true };
        }
      }
      throw error;
    }
  }),

  startSimulation: writeQuery
    .input(labRunTransitionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(labRuns)
          .where(eq(labRuns.id, input.id))
          .limit(1)
          .for("update");
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "实验运行不存在" });
        const requestHash = transitionRequestHash({ expectedRevision: input.expectedRevision });
        const replay = await findTransitionReplay(tx, {
          runId: run.id,
          action: "start",
          idempotencyKey: input.idempotencyKey,
          requestHash,
          createdById: ctx.user.id,
        });
        if (replay) return replay;
        const transitionKey = `start:${input.idempotencyKey}`;
        if (run.revision !== input.expectedRevision) {
          throw new TRPCError({ code: "CONFLICT", message: "运行状态已更新，请刷新后重试" });
        }
        if (run.executionMode !== "simulation") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "该入口只用于受控模拟运行" });
        }
        if (run.status !== "ready") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "只有计划就绪的模拟 Run 可以启动" });
        }
        if (run.sampleRequestId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "该历史模拟 Run 占用了真实资源，请取消后从当前入口重新创建",
          });
        }
        const [nodes, resources] = await Promise.all([
          tx.select().from(labRunNodes).where(eq(labRunNodes.runId, run.id)).for("update"),
          tx.select().from(labRunResources).where(eq(labRunResources.runId, run.id)),
        ]);
        const frozenPlan = parseFrozenRunPlan(run);
        if (!frozenPlan || !runProjectionIntegrity(run, frozenPlan, nodes, resources)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "运行快照完整性校验失败" });
        }
        const readiness = await currentReadiness(run, tx, { nodes, lockEquipment: true });
        if (!readiness.summary.ready) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: readiness.issues.filter((issue) => issue.level === "blocking").map((issue) => issue.label).join("；"),
          });
        }
        const incoming = new Set(frozenPlan.edges.map((edge) => edge.targetKey));
        const roots = nodes.filter((node) => node.status === "pending" && !incoming.has(node.nodeKey));
        if (!roots.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "运行快照中没有可启动的入口节点" });
        }
        await tx
          .update(labRunNodes)
          .set({ status: "running" })
          .where(inArray(labRunNodes.id, roots.map((node) => node.id)));
        const now = new Date();
        await tx
          .update(labRuns)
          .set({
            status: "running",
            startedAt: now,
            revision: run.revision + 1,
            lastTransitionKey: transitionKey,
          })
          .where(eq(labRuns.id, run.id));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "启动了模拟实验运行",
          entityType: "lab_run",
          entityId: run.id,
          entityName: run.runNo,
          detail: `启动入口节点：${roots.map((node) => node.label).join("、")}`,
          before: { status: "ready" },
          after: { status: "running", simulation: true, runningNodeKeys: roots.map((node) => node.nodeKey) },
        });
        const result: LabRunTransitionResult = {
          ok: true,
          status: "running",
          revision: run.revision + 1,
        };
        await recordTransition(tx, {
          runId: run.id,
          action: "start",
          idempotencyKey: input.idempotencyKey,
          requestHash,
          result,
          statusBefore: run.status,
          statusAfter: result.status,
          revisionBefore: run.revision,
          revisionAfter: result.revision,
          createdById: ctx.user.id,
          createdByName: ctx.user.name,
        });
        return { ...result, replayed: false };
      });
    }),

  advanceSimulation: writeQuery
    .input(labRunTransitionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(labRuns)
          .where(eq(labRuns.id, input.id))
          .limit(1)
          .for("update");
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "实验运行不存在" });
        const requestHash = transitionRequestHash({ expectedRevision: input.expectedRevision });
        const replay = await findTransitionReplay(tx, {
          runId: run.id,
          action: "advance",
          idempotencyKey: input.idempotencyKey,
          requestHash,
          createdById: ctx.user.id,
        });
        if (replay) return replay;
        const transitionKey = `advance:${input.idempotencyKey}`;
        if (run.revision !== input.expectedRevision) {
          throw new TRPCError({ code: "CONFLICT", message: "运行状态已更新，请刷新后重试" });
        }
        if (run.executionMode !== "simulation") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "该入口只用于受控模拟运行" });
        }
        if (run.status !== "running") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "模拟 Run 尚未启动" });
        }
        const [nodes, resources] = await Promise.all([
          tx.select().from(labRunNodes).where(eq(labRunNodes.runId, run.id)).for("update"),
          tx.select().from(labRunResources).where(eq(labRunResources.runId, run.id)),
        ]);
        const frozenPlan = parseFrozenRunPlan(run);
        if (!frozenPlan || !runProjectionIntegrity(run, frozenPlan, nodes, resources)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "运行快照完整性校验失败" });
        }
        const active = nodes.filter((node) => node.status === "running");
        if (!active.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "当前没有可推进的模拟节点" });
        }
        const statusAfter = new Map(nodes.map((node) => [node.nodeKey, node.status]));
        active.forEach((node) => statusAfter.set(node.nodeKey, "completed"));
        const hasFailed = [...statusAfter.values()].some((status) => status === "failed");
        const predecessors = new Map<string, string[]>();
        for (const edge of frozenPlan.edges) {
          predecessors.set(edge.targetKey, [...(predecessors.get(edge.targetKey) ?? []), edge.sourceKey]);
        }
        const next = hasFailed ? [] : nodes.filter((node) => {
          if (node.status !== "pending") return false;
          const required = predecessors.get(node.nodeKey) ?? [];
          return required.every((nodeKey) => ["completed", "skipped"].includes(statusAfter.get(nodeKey) ?? ""));
        });
        next.forEach((node) => statusAfter.set(node.nodeKey, "running"));
        const pendingWithoutSuccessor = nodes.some(
          (node) => statusAfter.get(node.nodeKey) === "pending",
        );
        if (!hasFailed && !next.length && pendingWithoutSuccessor) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "仍有节点无法满足前置依赖，请检查运行快照" });
        }
        await tx
          .update(labRunNodes)
          .set({ status: "completed" })
          .where(inArray(labRunNodes.id, active.map((node) => node.id)));
        const skippedAfterFailure = hasFailed
          ? nodes.filter((node) => node.status === "pending")
          : [];
        if (skippedAfterFailure.length) {
          skippedAfterFailure.forEach((node) => statusAfter.set(node.nodeKey, "skipped"));
          await tx
            .update(labRunNodes)
            .set({ status: "skipped" })
            .where(inArray(labRunNodes.id, skippedAfterFailure.map((node) => node.id)));
        }
        if (next.length) {
          await tx
            .update(labRunNodes)
            .set({ status: "running" })
            .where(inArray(labRunNodes.id, next.map((node) => node.id)));
        }
        const terminalStatus = terminalRunStatus([...statusAfter.values()]);
        const status = terminalStatus ?? "running";
        if (terminalStatus) {
          await tx
            .update(labRuns)
            .set({
              status: terminalStatus,
              completedAt: terminalStatus === "completed" ? new Date() : null,
              revision: run.revision + 1,
              lastTransitionKey: transitionKey,
            })
            .where(eq(labRuns.id, run.id));
        } else {
          await tx
            .update(labRuns)
            .set({ revision: run.revision + 1, lastTransitionKey: transitionKey })
            .where(eq(labRuns.id, run.id));
        }
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: status === "completed"
            ? "完成了模拟实验运行"
            : status === "failed"
              ? "将模拟实验运行标记为异常"
              : "推进了模拟实验运行",
          entityType: "lab_run",
          entityId: run.id,
          entityName: run.runNo,
          detail: `完成：${active.map((node) => node.label).join("、")}${next.length ? `；进入：${next.map((node) => node.label).join("、")}` : ""}${skippedAfterFailure.length ? `；异常后跳过：${skippedAfterFailure.map((node) => node.label).join("、")}` : ""}`,
          before: { status: "running", runningNodeKeys: active.map((node) => node.nodeKey) },
          after: { status, runningNodeKeys: next.map((node) => node.nodeKey) },
        });
        const result: LabRunTransitionResult = {
          ok: true,
          status,
          revision: run.revision + 1,
        };
        await recordTransition(tx, {
          runId: run.id,
          action: "advance",
          idempotencyKey: input.idempotencyKey,
          requestHash,
          result,
          statusBefore: run.status,
          statusAfter: result.status,
          revisionBefore: run.revision,
          revisionAfter: result.revision,
          createdById: ctx.user.id,
          createdByName: ctx.user.name,
        });
        return { ...result, replayed: false };
      });
    }),

  cancel: writeQuery
    .input(cancelLabRunInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      return db.transaction(async (tx) => {
        const [run] = await tx.select().from(labRuns).where(eq(labRuns.id, input.id)).limit(1).for("update");
        if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "实验运行不存在" });
        const idempotencyKey = input.idempotencyKey ?? `legacy:${transitionRequestHash({
          runId: input.id,
          reason: input.reason,
        })}`;
        const requestHash = transitionRequestHash({
          reason: input.reason,
          expectedRevision: input.expectedRevision ?? null,
        });
        const replay = await findTransitionReplay(tx, {
          runId: run.id,
          action: "cancel",
          idempotencyKey,
          requestHash,
          createdById: ctx.user.id,
        });
        if (replay) return replay;
        if (input.expectedRevision !== undefined && run.revision !== input.expectedRevision) {
          throw new TRPCError({ code: "CONFLICT", message: "运行状态已更新，请刷新后重试" });
        }
        if (run.status === "cancelled") {
          return {
            ok: true,
            replayed: true,
            releasedResources: false,
            status: "cancelled" as const,
            revision: run.revision,
          };
        }
        if (!["draft", "preparing", "ready"].includes(run.status) && !(run.executionMode === "simulation" && run.status === "running")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "当前状态不能直接取消运行" });
        }
        let releasedResources = false;
        if (run.sampleRequestId) {
          const [request] = await tx
            .select()
            .from(sampleRequests)
            .where(eq(sampleRequests.id, run.sampleRequestId))
            .limit(1)
            .for("update");
          const tasks = await tx
            .select()
            .from(fulfillmentTasks)
            .where(eq(fulfillmentTasks.requestId, run.sampleRequestId))
            .for("update");
          if (tasks.some((task) => task.status === "succeeded")) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "已有样品或物料完成发放，不能直接取消；请先进入人工对账或退料流程",
            });
          }
          if (request && request.status !== "fulfilled") {
            await tx
              .update(inventoryReservations)
              .set({ status: "released", releasedAt: new Date() })
              .where(and(eq(inventoryReservations.requestId, run.sampleRequestId), eq(inventoryReservations.status, "active")));
            await tx
              .update(sampleRequestItems)
              .set({ status: "cancelled", reservedAmount: 0 })
              .where(eq(sampleRequestItems.requestId, run.sampleRequestId));
            await tx
              .update(fulfillmentTasks)
              .set({ status: "cancelled", completedAt: new Date() })
              .where(eq(fulfillmentTasks.requestId, run.sampleRequestId));
            await tx
              .update(sampleRequests)
              .set({ status: "cancelled", cancellationReason: input.reason, cancelledAt: new Date() })
              .where(eq(sampleRequests.id, run.sampleRequestId));
            releasedResources = true;
          }
        }
        await tx
          .update(equipmentBookings)
          .set({ status: "cancelled" })
          .where(and(eq(equipmentBookings.labRunId, run.id), eq(equipmentBookings.status, "active")));
        if (run.executionMode === "simulation" && run.status === "running") {
          await tx
            .update(labRunNodes)
            .set({ status: "skipped" })
            .where(
              and(
                eq(labRunNodes.runId, run.id),
                inArray(labRunNodes.status, ["pending", "running"]),
              ),
            );
        }
        const revision = run.revision + 1;
        await tx
          .update(labRuns)
          .set({
            status: "cancelled",
            revision,
            lastTransitionKey: `cancel:${idempotencyKey}`,
          })
          .where(eq(labRuns.id, run.id));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "取消了实验运行",
          entityType: "lab_run",
          entityId: run.id,
          entityName: run.runNo,
          before: { status: run.status },
          after: { status: "cancelled", revision },
          reason: input.reason,
        });
        const result: LabRunTransitionResult = {
          ok: true,
          status: "cancelled",
          revision,
          releasedResources,
        };
        await recordTransition(tx, {
          runId: run.id,
          action: "cancel",
          idempotencyKey,
          requestHash,
          result,
          statusBefore: run.status,
          statusAfter: result.status,
          revisionBefore: run.revision,
          revisionAfter: result.revision,
          createdById: ctx.user.id,
          createdByName: ctx.user.name,
        });
        return { ...result, replayed: false };
      });
    }),
});
