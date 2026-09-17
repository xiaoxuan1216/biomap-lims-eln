import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { appRouter } from "../../api/router";
import { getDb } from "../../api/queries/connection";
import {
  equipmentBookings,
  inventoryReservations,
  labRuns,
  users,
} from "../../db/schema";

type Primitive = string | number | boolean;
type FrozenRunPlan = {
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
  workflow: { id: number; name: string };
  nodes: Array<{ nodeKey: string; type: string }>;
  edges: Array<{ sourceKey: string; targetKey: string }>;
  resources: Array<{
    id: number;
    role: "sample" | "material" | "control";
    nodeKey?: string | null;
    plannedAmount: number;
  }>;
  executionNodes: Array<{
    nodeKey: string;
    equipmentId: number | null;
    parameters?: { overrides?: Record<string, Primitive>; overrideReason?: string | null };
  }>;
};

const db = getDb();
const [run] = await db
  .select()
  .from(labRuns)
  .where(eq(labRuns.idempotencyKey, "seed:lab-run-entry:v3"))
  .limit(1);
assert(run, "expected seed:lab-run-entry:v3");

const actor = await db.query.users.findFirst({
  where: run.createdById ? eq(users.id, run.createdById) : eq(users.role, "admin"),
});
assert(actor, "expected a Run owner or administrator");
const caller = appRouter.createCaller({
  req: new Request("http://localhost/verifier/v13"),
  resHeaders: new Headers(),
  user: actor,
});

const detail = await caller.labRun.byId({ id: run.id });
assert.equal(detail.executionMode, "simulation");
assert.equal(detail.sampleRequestId, null, "simulation Run must not create a production sample request");
assert.equal(detail.bookings.length, 0, "simulation Run must not reserve production equipment time");
assert.equal(detail.integrityValid, true, "immutable RunPlan projection must be intact");
assert.equal(detail.readiness.summary.blocking, 0, "demo Run must have no blocking readiness issue");
assert(detail.resources.length >= 1, "demo Run must freeze at least one selected sample");
assert(detail.nodes.length >= 1, "demo Run must freeze all workflow steps");
assert(detail.nodes.some((node) => node.type === "equipment"), "demo Run must include equipment steps");

const launchContext = await caller.labRun.launchContext({ workflowId: run.workflowId });
const launchNodeOrder = new Map(
  launchContext.nodes.map((node, index) => [node.nodeKey, index]),
);
assert(
  launchContext.edges.every(
    (edge) =>
      (launchNodeOrder.get(edge.sourceKey) ?? Number.MAX_SAFE_INTEGER) <
      (launchNodeOrder.get(edge.targetKey) ?? -1),
  ),
  "launch wizard nodes must be returned in topological order",
);

const digest = createHash("sha256").update(run.workflowSnapshot).digest("hex");
assert.equal(digest, run.snapshotHash, "stored snapshot hash must match the immutable payload");
const plan = JSON.parse(run.workflowSnapshot) as FrozenRunPlan;
assert.equal(plan.run.runNo, run.runNo);
assert.equal(plan.run.name, run.name);
assert.equal(plan.workflow.id, run.workflowId);
assert.equal(plan.workflow.name, run.workflowName);
assert.equal(plan.nodes.length, detail.nodes.length);
assert.equal(plan.executionNodes.length, detail.nodes.length);
assert.equal(plan.resources.length, detail.resources.length);
assert(plan.edges.every((edge) =>
  plan.nodes.some((node) => node.nodeKey === edge.sourceKey) &&
  plan.nodes.some((node) => node.nodeKey === edge.targetKey),
), "all frozen edges must point to frozen nodes");
assert(!/(?:password|apiKey|accessToken|secret)\s*\"?:/i.test(run.workflowSnapshot), "RunPlan must not store connection secrets");

const replayInput = {
  workflowId: run.workflowId,
  name: run.name,
  purpose: run.purpose,
  projectId: run.projectId,
  executionMode: "simulation" as const,
  scheduledStart: run.scheduledStart!,
  scheduledEnd: run.scheduledEnd!,
  operatorName: run.operatorName,
  resources: plan.resources.map((resource) => ({
    sampleId: resource.id,
    role: resource.role,
    amount: Number(resource.plannedAmount),
    nodeKey: resource.nodeKey ?? null,
  })),
  nodeBindings: plan.executionNodes
    .filter((execution) => plan.nodes.find((node) => node.nodeKey === execution.nodeKey)?.type === "equipment")
    .map((execution) => ({
      nodeKey: execution.nodeKey,
      equipmentId: execution.equipmentId,
      params: execution.parameters?.overrides ?? {},
      overrideReason: execution.parameters?.overrideReason ?? null,
    })),
  idempotencyKey: run.idempotencyKey,
};
const replay = await caller.labRun.create(replayInput);
assert.equal(replay.id, run.id);
assert.equal(replay.repeated, true);
await assert.rejects(
  caller.labRun.create({ ...replayInput, name: `${run.name} changed` }),
  (error: unknown) => (error as { code?: string }).code === "CONFLICT",
  "the same idempotency key with different content must be rejected",
);

for (const legacyKey of ["seed:lab-run-entry:v1", "seed:lab-run-entry:v2"]) {
  const legacy = await db.query.labRuns.findFirst({ where: eq(labRuns.idempotencyKey, legacyKey) });
  if (!legacy) continue;
  assert.equal(legacy.status, "cancelled", `${legacyKey} must be cancelled`);
  const activeBookings = await db
    .select({ id: equipmentBookings.id })
    .from(equipmentBookings)
    .where(and(eq(equipmentBookings.labRunId, legacy.id), eq(equipmentBookings.status, "active")));
  assert.equal(activeBookings.length, 0, `${legacyKey} must not retain active equipment bookings`);
  if (legacy.sampleRequestId) {
    const activeReservations = await db
      .select({ id: inventoryReservations.id })
      .from(inventoryReservations)
      .where(and(
        eq(inventoryReservations.requestId, legacy.sampleRequestId),
        eq(inventoryReservations.status, "active"),
      ));
    assert.equal(activeReservations.length, 0, `${legacyKey} must not retain active inventory reservations`);
  }
}

const audit = await caller.admin.verifyAuditTrail();
assert.equal(audit.valid, true, JSON.stringify(audit));

const result = {
  passed: true,
  runId: run.id,
  runNo: run.runNo,
  runStatus: detail.status,
  revision: detail.revision,
  resourceCount: detail.resources.length,
  nodeCount: detail.nodes.length,
  checks: [
    "simulation Run exists",
    "production inventory and equipment remain untouched",
    "immutable snapshot hash and relational projection",
    "frozen run and workflow headers",
    "complete edge references",
    "topological launch-wizard order",
    "no connection secrets in RunPlan",
    "same-content idempotent replay",
    "changed-content replay rejected",
    "legacy demo resources released",
    "activity hash chain",
  ],
};
const output = `${JSON.stringify(result, null, 2)}\n`;
fs.writeFileSync("verifier/v13/api-checks.json", output);
fs.writeFileSync("verifier/runs/v13-lab-run-api.log", output);
console.log(JSON.stringify(result));
process.exit(0);
