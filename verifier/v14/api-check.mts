import assert from "node:assert/strict";
import fs from "node:fs";
import { desc, eq } from "drizzle-orm";
import { appRouter } from "../../api/router";
import { getDb } from "../../api/queries/connection";
import { labRuns, users } from "../../db/schema";

const db = getDb();
const requestedRun = await db.query.labRuns.findFirst({ where: eq(labRuns.id, 4) });
const fallbackRun = requestedRun ?? (await db.select().from(labRuns).orderBy(desc(labRuns.id)).limit(1))[0];
assert(fallbackRun, "expected at least one persisted Lab Run");

const actor = await db.query.users.findFirst({
  where: fallbackRun.createdById ? eq(users.id, fallbackRun.createdById) : eq(users.role, "admin"),
});
assert(actor, "expected a Run owner or administrator");

const caller = appRouter.createCaller({
  req: new Request("http://localhost/verifier/v14"),
  resHeaders: new Headers(),
  user: actor,
});
const detail = await caller.labRun.byId({ id: fallbackRun.id });
const flow = detail.dataFlow;

assert.equal(flow.schemaVersion, "1.0");
assert.deepEqual(flow.phases.map((phase) => phase.id), ["plan", "materials", "execution", "results"]);
assert.equal(flow.resultState.status, "not_recorded");
assert.equal(flow.resultState.source, "none");
assert.deepEqual(flow.resultState.evidence, []);
assert.equal(flow.nodes.some((node) => node.phase === "results"), false, "no result node may be invented");
assert(flow.nodes.some((node) => node.id === `plan:${detail.id}`), "RunPlan node must be present");
assert.equal(flow.nodes.filter((node) => node.kind === "resource").length, detail.resources.length);
assert.equal(flow.nodes.filter((node) => node.kind === "run_node").length, detail.nodes.length);

const nodeIds = new Set(flow.nodes.map((node) => node.id));
for (const edge of flow.edges) {
  assert(nodeIds.has(edge.source), `missing data-flow source node: ${edge.source}`);
  assert(nodeIds.has(edge.target), `missing data-flow target node: ${edge.target}`);
  assert(edge.evidence.length > 0, `edge ${edge.id} must expose persisted evidence`);
}

const allowedSources = new Set([
  "run_plan_snapshot",
  "lab_run_resource",
  "sample_inventory",
  "storage_location",
  "sample_request",
  "sample_request_item",
  "inventory_reservation",
  "fulfillment_task",
  "sample_lineage",
  "lab_run_node",
  "equipment_booking",
  "none",
]);
const evidence = [
  ...flow.phases.flatMap((phase) => phase.evidence),
  ...flow.nodes.flatMap((node) => node.evidence),
  ...flow.edges.flatMap((edge) => edge.evidence),
];
assert(evidence.length > 0, "data flow must expose evidence");
for (const item of evidence) {
  assert(allowedSources.has(item.source), `unexpected evidence source: ${item.source}`);
  assert(item.ref.length > 0, "evidence references must not be empty");
}

for (const resource of detail.resources) {
  const node = flow.nodes.find((candidate) => candidate.id === `resource:${resource.id}`);
  assert(node, `resource projection missing for ${resource.id}`);
  assert(node.evidence.some((item) => item.source === "lab_run_resource"));
  assert(node.evidence.some((item) => item.source === "run_plan_snapshot"));
}

if (detail.executionMode === "simulation") {
  assert.equal(detail.sampleRequestId, null, "simulation must not create a production sample request");
  assert.equal(detail.bookings.length, 0, "simulation must not create production equipment bookings");
  assert.equal(flow.phases.find((phase) => phase.id === "materials")?.status, "snapshot_only");
}

const result = {
  passed: true,
  runId: detail.id,
  runNo: detail.runNo,
  executionMode: detail.executionMode,
  runStatus: detail.status,
  phaseCount: flow.phases.length,
  projectedObjectCount: flow.nodes.length,
  projectedEdgeCount: flow.edges.length,
  evidenceCount: evidence.length,
  resultState: flow.resultState.status,
  checks: [
    "four persisted data-flow phases",
    "RunPlan, resource and execution-node projections",
    "all edges resolve to projected objects",
    "evidence sources are allowlisted and referenced",
    "simulation remains isolated from production reservations",
    "no result or return record is fabricated",
  ],
};
const output = `${JSON.stringify(result, null, 2)}\n`;
fs.mkdirSync("verifier/v14", { recursive: true });
fs.mkdirSync("verifier/runs", { recursive: true });
fs.writeFileSync("verifier/v14/api-checks.json", output);
fs.writeFileSync("verifier/runs/v14-mosaic-data-flow.log", output);
console.log(JSON.stringify(result));
process.exit(0);
