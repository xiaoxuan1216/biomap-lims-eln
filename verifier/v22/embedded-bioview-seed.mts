import "dotenv/config";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  defaultBioViewVisualizationSpec,
  type BioViewSemanticBinding,
} from "../../contracts/bioView.ts";
import { methodSpecSchema } from "../../contracts/method.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
database.pathname = "/biomap_v15_qa";
process.env.DATABASE_URL = database.toString();

const { migrateDatabase } = await import("../../api/queries/migrate.ts");
await migrateDatabase();
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const {
  equipment,
  labRuns,
  projects,
  samples,
  users,
  workflows,
} = await import("../../db/schema.ts");

const db = getDb();
const [databaseRows] = (await db.execute(sql`SELECT DATABASE() AS currentDatabase`)) as unknown as [
  Array<{ currentDatabase: string }>,
  unknown,
];
assert.equal(databaseRows[0]?.currentDatabase, "biomap_v15_qa", "BioView fixture must never write outside the QA database");

const actor = await db.query.users.findFirst({
  where: eq(users.role, "admin"),
  orderBy: [asc(users.id)],
});
if (!actor) throw new Error("No QA administrator is available");
const api = appRouter.createCaller({
  user: actor,
  req: new Request("http://127.0.0.1:3115/verifier/v22"),
  resHeaders: new Headers(),
});

const METHOD_NAME = "[QA] BioView 8样本分子克隆联动";
const RUN_KEY = "qa:embedded-bioview:v1";
const FIXTURE_PATH = "verifier/v22/embedded-bioview-fixture.json";
const QA_NOTE = "QA ONLY - synthetic BioView integration data; not a physical experiment";

const writeFixture = (value: Record<string, unknown>) => {
  mkdirSync("verifier/v22", { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify({ ...value, syntheticOnly: true }, null, 2) + "\n");
};

const existingRun = await db.query.labRuns.findFirst({
  where: eq(labRuns.idempotencyKey, RUN_KEY),
});
if (existingRun) {
  const run = await api.labRun.byId({ id: existingRun.id });
  assert.equal(run.integrityValid, true);
  assert.equal(run.bioView?.readiness.level, "complete");
  assert.ok(run.bioView?.views.some((view) => view.rendererRef === "cloning-plate-flow@1"));
  writeFixture({ runId: run.id, runNo: run.runNo, workflowId: run.workflowId });
  console.log(JSON.stringify({ status: "already-ready", runId: run.id, runNo: run.runNo }));
  process.exit(0);
}

const project = await db.query.projects.findFirst({
  where: eq(projects.status, "active"),
  orderBy: [asc(projects.id)],
});
if (!project) throw new Error("No active QA project is available");

const availableEquipment = await db
  .select()
  .from(equipment)
  .where(eq(equipment.status, "available"))
  .orderBy(asc(equipment.id));
const liquidHandler =
  availableEquipment.find((device) => /Hamilton|liquid|\u6db2\u4f53/i.test(`${device.name} ${device.model}`)) ??
  availableEquipment[0];
const plateReader =
  availableEquipment.find((device) =>
    device.id !== liquidHandler?.id && /plate|reader|\u9176\u6807/i.test(`${device.name} ${device.model}`),
  ) ?? availableEquipment.find((device) => device.id !== liquidHandler?.id);
if (!liquidHandler || !plateReader) throw new Error("Two available QA instruments are required");

let workflow = await db.query.workflows.findFirst({ where: eq(workflows.name, METHOD_NAME) });
if (!workflow) {
  const created = await api.workflow.create({
    name: METHOD_NAME,
    description: `${QA_NOTE}; embedded in the existing method, Run, sample and equipment modules`,
    projectId: project.id,
    scenario: "synbio",
    lang: "zh",
  });
  workflow = await db.query.workflows.findFirst({ where: eq(workflows.id, created.id) });
}
if (!workflow) throw new Error("Unable to create the QA BioView method");

const initial = await api.workflow.byId({ id: workflow.id });
const graph = await api.workflow.saveGraph({
  id: workflow.id,
  expectedGraphHash: initial.graphHash,
  name: METHOD_NAME,
  description: `${QA_NOTE}; BioView is a governed view of this method, not a standalone workbench`,
  status: "active",
  projectId: project.id,
  nodes: [
    {
      nodeKey: "sample_intake",
      type: "manual",
      label: "样本与物料确认",
      owner: "QA 实验员",
      posX: 80,
      posY: 180,
    },
    {
      nodeKey: "liquid_handling",
      type: "equipment",
      label: "液体工作站加样",
      owner: "自动化平台",
      equipmentId: liquidHandler.id,
      params: JSON.stringify({ transferVolumeUl: 25, mixCycles: 3 }),
      posX: 390,
      posY: 180,
    },
    {
      nodeKey: "plate_read",
      type: "equipment",
      label: "酶标仪读数",
      owner: "分析平台",
      equipmentId: plateReader.id,
      params: JSON.stringify({ wavelengthNm: 450, readMode: "endpoint" }),
      posX: 700,
      posY: 180,
    },
    {
      nodeKey: "review",
      type: "data",
      label: "数据复核与产物确认",
      owner: "QA 复核人",
      posX: 1010,
      posY: 180,
    },
  ],
  edges: [
    { edgeKey: "e1", sourceKey: "sample_intake", targetKey: "liquid_handling" },
    { edgeKey: "e2", sourceKey: "liquid_handling", targetKey: "plate_read" },
    { edgeKey: "e3", sourceKey: "plate_read", targetKey: "review" },
  ],
});

const methodSpec = methodSpecSchema.parse({
  schemaVersion: 1,
  layoutRequired: true,
  minSamples: 8,
  maxSamples: 8,
  materials: [],
  nodes: {
    sample_intake: {
      input: "8 个合成 QA 质粒样本与 1 项模拟试剂",
      output: "已确认的本次实验资源集",
      completion: "样本、物料、用量与库存对象均已锁定",
    },
    liquid_handling: {
      input: "已确认样本与排板方案",
      output: "已完成加样的实验板",
      completion: "本次转移体积与混匀次数已按 RunPlan 执行",
      equipmentIds: [liquidHandler.id],
      qualification: `${QA_NOTE}; device selected from BioMapOS equipment registry`,
      parameters: {
        transferVolumeUl: { adjustable: true, min: 5, max: 100 },
        mixCycles: { adjustable: true, min: 1, max: 10 },
      },
    },
    plate_read: {
      input: "已完成加样的实验板",
      output: "原始读数文件与结构化结果占位",
      completion: "设备参数与原始文件关联字段已记录",
      equipmentIds: [plateReader.id],
      qualification: `${QA_NOTE}; device selected from BioMapOS equipment registry`,
      parameters: {
        wavelengthNm: { adjustable: true, min: 300, max: 800 },
        readMode: { adjustable: false },
      },
    },
    review: {
      input: "设备原始数据与执行记录",
      output: "待复核的实验结果",
      completion: "仅确认数据齐备性，不生成任何真实实验结论",
    },
  },
});
const afterGraph = await api.workflow.byId({ id: workflow.id });
await api.workflow.saveMethodSpec({
  workflowId: workflow.id,
  expectedSpecHash: afterGraph.methodSpecHash,
  expectedGraphHash: graph.graphHash,
  spec: methodSpec,
});

const semanticBindings: BioViewSemanticBinding[] = [
  { nodeKey: "sample_intake", semanticRole: "input", artifactType: "lims-resource-set" },
  { nodeKey: "liquid_handling", semanticRole: "process", artifactType: "plate-transfer" },
  { nodeKey: "plate_read", semanticRole: "measurement", artifactType: "instrument-result" },
  { nodeKey: "review", semanticRole: "output", artifactType: "reviewed-result" },
];
const baseView = defaultBioViewVisualizationSpec();
const viewSave = await api.workflow.saveVisualizationSpec({
  id: workflow.id,
  expectedGraphHash: graph.graphHash,
  visualizationSpec: {
    ...baseView,
    domainPack: "molecular-cloning@1.0.0",
    views: [
      {
        id: "cloning-layout",
        title: "流程与孔板",
        rendererRef: "cloning-plate-flow@1",
        scope: "run",
        binding: "cloning-layout",
      },
      ...baseView.views,
      {
        id: "lineage",
        title: "样本谱系",
        rendererRef: "sample-lineage@1",
        scope: "run",
        binding: "resources",
      },
    ],
    semanticBindings,
  },
});

const readyMethod = await api.workflow.byId({ id: workflow.id });
assert.equal(readyMethod.graphHash, viewSave.graphHash);
const release = await api.workflow.submitMethod({
  workflowId: workflow.id,
  expectedSpecHash: readyMethod.methodSpecHash,
  expectedGraphHash: readyMethod.graphHash,
});
const releases = await api.workflow.releases({ workflowId: workflow.id });
const releaseRow = releases.find((item) => item.id === release.id);
if (releaseRow?.status === "review") {
  await api.workflow.reviewMethod({
    id: release.id,
    decision: "publish",
    note: `${QA_NOTE}; admin QA exception used only in the isolated preview database`,
  });
}

const layoutVersions = await api.cloningLayout.list({ workflowId: workflow.id });
const savedLayout = await api.cloningLayout.save({
  workflowId: workflow.id,
  nodeKey: "liquid_handling",
  name: "[QA] 8样本分子克隆精细排板",
  config: { samples: 8, clones: 2, controls: 2, edge: false, group: true, column: false, balance: true },
  mode: "recommended",
  expectedVersion: Math.max(0, ...layoutVersions.map((item) => item.version)),
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
});
const layout = await api.cloningLayout.byId({ id: savedLayout.id });
assert.equal(layout.sampleCount, 8);
assert.equal(layout.plan.planningOnly, true);

const targetSamples: Array<{ id: number; name: string }> = [];
for (let target = 1; target <= 8; target += 1) {
  const name = `[QA BioView] TGT-${String(target).padStart(3, "0")}`;
  let sample = await db.query.samples.findFirst({
    where: and(eq(samples.name, name), eq(samples.projectId, project.id), isNull(samples.archivedAt)),
  });
  if (!sample) {
    const created = await api.sample.create({
      name,
      type: "plasmid",
      quantity: 10,
      unit: "µg",
      alertThreshold: 1,
      projectId: project.id,
      notes: QA_NOTE,
    });
    sample = await db.query.samples.findFirst({ where: eq(samples.id, created.id) });
  }
  if (!sample) throw new Error(`Unable to create ${name}`);
  targetSamples.push({ id: sample.id, name: sample.name });
}

const materialName = "[QA BioView] 分子克隆反应液";
let material = await db.query.samples.findFirst({
  where: and(eq(samples.name, materialName), eq(samples.projectId, project.id), isNull(samples.archivedAt)),
});
if (!material) {
  const created = await api.sample.create({
    name: materialName,
    type: "reagent",
    quantity: 100,
    unit: "µL",
    alertThreshold: 10,
    projectId: project.id,
    notes: QA_NOTE,
  });
  material = await db.query.samples.findFirst({ where: eq(samples.id, created.id) });
}
if (!material) throw new Error("Unable to create the QA material");

const scheduledStart = new Date();
scheduledStart.setDate(scheduledStart.getDate() + 30);
scheduledStart.setHours(9, 0, 0, 0);
const scheduledEnd = new Date(scheduledStart.getTime() + 3 * 60 * 60 * 1_000);
const run = await api.labRun.create({
  workflowId: workflow.id,
  methodReleaseId: release.id,
  cloningLayoutPlanId: layout.id,
  name: "[QA] BioView 内嵌式实验运行",
  purpose: `${QA_NOTE}; demonstrates the original BioMapOS Run detail with governed BioView`,
  projectId: project.id,
  executionMode: "simulation",
  scheduledStart,
  scheduledEnd,
  operatorName: "QA 自动化平台",
  resources: [
    ...targetSamples.map((sample) => ({ sampleId: sample.id, role: "sample" as const, amount: 0.01 })),
    { sampleId: material.id, role: "material" as const, amount: 1 },
  ],
  nodeBindings: [
    {
      nodeKey: "liquid_handling",
      equipmentId: liquidHandler.id,
      params: { transferVolumeUl: 25, mixCycles: 3 },
    },
    {
      nodeKey: "plate_read",
      equipmentId: plateReader.id,
      params: { wavelengthNm: 450, readMode: "endpoint" },
    },
  ],
  idempotencyKey: RUN_KEY,
});

const readback = await api.labRun.byId({ id: run.id });
assert.equal(readback.integrityValid, true);
assert.equal(readback.bioView?.readiness.level, "complete");
assert.equal(readback.bioView?.readiness.score, 100);
assert.ok(readback.bioView?.views.some((view) => view.rendererRef === "cloning-plate-flow@1"));
assert.equal(readback.resources.filter((resource) => resource.role === "sample").length, 8);
assert.equal(readback.resources.filter((resource) => resource.role === "material").length, 1);
assert.equal(readback.cloningLayoutPlan?.targetBindings?.length, 8);
assert.equal(readback.nodes.find((node) => node.nodeKey === "liquid_handling")?.equipmentId, liquidHandler.id);
assert.equal(readback.nodes.find((node) => node.nodeKey === "plate_read")?.equipmentId, plateReader.id);

writeFixture({
  runId: readback.id,
  runNo: readback.runNo,
  workflowId: workflow.id,
  releaseId: release.id,
  layoutId: layout.id,
  sampleIds: targetSamples.map((sample) => sample.id),
  materialId: material.id,
  equipmentIds: [liquidHandler.id, plateReader.id],
  bioViewReadiness: readback.bioView?.readiness,
  link: `http://127.0.0.1:3115/runs/${readback.id}?tab=bio-view`,
});
console.log(JSON.stringify({
  status: "ready",
  runId: readback.id,
  runNo: readback.runNo,
  workflowId: workflow.id,
  releaseId: release.id,
  bioView: readback.bioView?.readiness,
}));
process.exit(0);
