import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asc, eq, sql } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
database.pathname = "/biomap_v15_qa";
process.env.DATABASE_URL = database.toString();

const { migrateDatabase } = await import("../../api/queries/migrate.ts");
await migrateDatabase();
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const { labRuns, users, workflows } = await import("../../db/schema.ts");

const db = getDb();
const [databaseRows] = (await db.execute(
  sql`SELECT DATABASE() AS currentDatabase`
)) as unknown as [Array<{ currentDatabase: string }>, unknown];
assert.equal(databaseRows[0]?.currentDatabase, "biomap_v15_qa");

const actor = await db.query.users.findFirst({
  where: eq(users.role, "admin"),
  orderBy: [asc(users.id)],
});
if (!actor) throw new Error("No QA administrator is available");
const api = appRouter.createCaller({
  user: actor,
  req: new Request("http://127.0.0.1:3115/verifier/v23"),
  resHeaders: new Headers(),
});

const source = JSON.parse(
  readFileSync("verifier/v22/embedded-bioview-fixture.json", "utf8")
) as {
  workflowId: number;
  releaseId: number;
  sampleIds: number[];
  materialId: number;
  equipmentIds: number[];
};
const workflow = await db.query.workflows.findFirst({
  where: eq(workflows.id, source.workflowId),
});
if (!workflow?.projectId)
  throw new Error("QA BioView workflow or project is unavailable");
assert.equal(source.sampleIds.length, 8);
assert.equal(source.equipmentIds.length, 2);

const RUN_KEY = "qa:embedded-bioview:generic-plate:v1";
const QA_NOTE =
  "QA ONLY - synthetic generic plate BioView data; not a physical experiment";
const existingRun = await db.query.labRuns.findFirst({
  where: eq(labRuns.idempotencyKey, RUN_KEY),
});
if (existingRun) {
  const readback = await api.labRun.byId({ id: existingRun.id });
  assert.equal(readback.integrityValid, true);
  assert.equal(readback.samplePlatePlans.length, 1);
  assert.ok(
    readback.bioView?.views.some(
      view => view.rendererRef === "sample-plate-layout@1"
    )
  );
  assert.ok(
    readback.bioView?.views.some(view => view.rendererRef === "run-data-flow@1")
  );
  console.log(
    JSON.stringify({
      status: "already-ready",
      runId: readback.id,
      runNo: readback.runNo,
      platePlanId: readback.samplePlatePlans[0]?.id,
      link: `http://127.0.0.1:3115/runs/${readback.id}?tab=bio-view`,
    })
  );
  process.exit(0);
}

const priorPlans = await api.samplePlate.list({
  workflowId: source.workflowId,
});
const platePlan = await api.samplePlate.save({
  workflowId: source.workflowId,
  nodeKey: "liquid_handling",
  name: "[QA] BioView 通用96孔板样本布局",
  config: {
    stage: "cloning",
    format: "96",
    sampleIds: source.sampleIds,
    copies: 1,
    avoidEdges: false,
    order: "row",
    pairChains: false,
    controls: ["NTC", "Positive control"],
  },
  expectedVersion: Math.max(0, ...priorPlans.map(plan => plan.version)),
  idempotencyKey: "23232323-2323-4232-8232-232323232323",
});

const scheduledStart = new Date();
scheduledStart.setDate(scheduledStart.getDate() + 31);
scheduledStart.setHours(9, 0, 0, 0);
const scheduledEnd = new Date(scheduledStart.getTime() + 3 * 60 * 60 * 1_000);
const run = await api.labRun.create({
  workflowId: source.workflowId,
  methodReleaseId: source.releaseId,
  samplePlatePlanIds: [platePlan.id],
  name: "[QA] BioView 通用孔板集成运行",
  purpose: `${QA_NOTE}; validates a non-domain-specific plate renderer inside the original Run detail`,
  projectId: workflow.projectId,
  executionMode: "simulation",
  scheduledStart,
  scheduledEnd,
  operatorName: "QA 自动化平台",
  resources: [
    ...source.sampleIds.map(sampleId => ({
      sampleId,
      role: "sample" as const,
      amount: 0.01,
    })),
    { sampleId: source.materialId, role: "material" as const, amount: 1 },
  ],
  nodeBindings: [
    {
      nodeKey: "liquid_handling",
      equipmentId: source.equipmentIds[0],
      params: { transferVolumeUl: 25, mixCycles: 3 },
    },
    {
      nodeKey: "plate_read",
      equipmentId: source.equipmentIds[1],
      params: { wavelengthNm: 450, readMode: "endpoint" },
    },
  ],
  idempotencyKey: RUN_KEY,
});

const readback = await api.labRun.byId({ id: run.id });
assert.equal(readback.integrityValid, true);
assert.equal(readback.samplePlatePlans.length, 1);
assert.equal(readback.samplePlatePlans[0]?.id, platePlan.id);
assert.ok(
  readback.bioView?.views.some(
    view => view.rendererRef === "sample-plate-layout@1"
  )
);
assert.ok(
  readback.bioView?.views.some(view => view.rendererRef === "run-data-flow@1")
);
assert.equal(readback.bioView?.bindings.samplePlatePlanIds?.[0], platePlan.id);
assert.equal(
  readback.bioView?.provenance.samplePlateSnapshotHashes?.[0],
  platePlan.snapshotHash
);

console.log(
  JSON.stringify({
    status: "ready",
    runId: readback.id,
    runNo: readback.runNo,
    workflowId: source.workflowId,
    releaseId: source.releaseId,
    platePlanId: platePlan.id,
    plateSnapshotHash: platePlan.snapshotHash,
    bioViewReadiness: readback.bioView?.readiness,
    link: `http://127.0.0.1:3115/runs/${readback.id}?tab=bio-view`,
  })
);
process.exit(0);
