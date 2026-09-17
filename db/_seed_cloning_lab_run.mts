/**
 * 96 样本分子克隆·流程孔板联动 Run 演示数据（幂等）。
 *
 * 排板与 Run 都通过正式业务动作创建。该 Run 是 simulation，
 * 排板内的容器、孔位和 TGT 只是 planning_only 快照。
 */
import { and, asc, eq, isNull, like } from "drizzle-orm";
import { appRouter } from "../api/router";
import { getDb } from "../api/queries/connection";
import { DEFAULT_CLONING_CONFIG } from "../contracts/cloningLayout";
import { parseDriverTemplateKey } from "../contracts/deviceDriver";
import { cloningLayoutPlans, equipment, labRuns, samples, users } from "./schema";

const WORKFLOW_ID = 1;
const LAYOUT_KEY = "11111111-1111-4111-8111-111111111111";
const LEGACY_RUN_KEY = "seed:cloning-plate-run:v1";
const RUN_KEY = "seed:cloning-plate-run:v2";
const MOCK_SAMPLE_PREFIX = "[MOCK] Gibson 96 · TGT-";
const MOCK_SEQUENCER_NAME = "Sanger 测序仪（模拟）";

const db = getDb();
const actor = await db.query.users.findFirst({
  where: eq(users.role, "admin"),
  orderBy: [asc(users.id)],
});
if (!actor) throw new Error("No admin user is available for cloning Run seed data");

const caller = appRouter.createCaller({
  req: new Request("http://localhost/seed/cloning-run"),
  resHeaders: new Headers(),
  user: actor,
});

let layoutRecord = await db.query.cloningLayoutPlans.findFirst({
  where: eq(cloningLayoutPlans.idempotencyKey, LAYOUT_KEY),
});
if (!layoutRecord) {
  const versions = await caller.cloningLayout.list({ workflowId: WORKFLOW_ID });
  const saved = await caller.cloningLayout.save({
    workflowId: WORKFLOW_ID,
    nodeKey: "n3",
    name: "96样本分子克隆 · 流程孔板联动",
    config: DEFAULT_CLONING_CONFIG,
    mode: "recommended",
    expectedVersion: Math.max(0, ...versions.map((version) => version.version)),
    idempotencyKey: LAYOUT_KEY,
  });
  layoutRecord = await db.query.cloningLayoutPlans.findFirst({
    where: eq(cloningLayoutPlans.id, saved.id),
  });
}
if (!layoutRecord || layoutRecord.workflowId !== WORKFLOW_ID) {
  throw new Error("Unable to create or retrieve the intended cloning layout plan");
}
const layout = await caller.cloningLayout.byId({ id: layoutRecord.id });
if (layout.sampleCount !== 96 || layout.plateCount !== 19 || !layout.plan.planningOnly) {
  throw new Error("The fixed layout seed no longer resolves to the expected 96-target planning snapshot");
}
const projectId = layout.projectId;
if (!projectId) throw new Error("The fixed layout must belong to an active project");

let mockSequencer = await db.query.equipment.findFirst({
  where: eq(equipment.name, MOCK_SEQUENCER_NAME),
});
if (!mockSequencer) {
  const created = await caller.equipment.create({
    name: MOCK_SEQUENCER_NAME,
    category: "analytical",
    model: "Applied Biosystems 3500 Genetic Analyzer · Mock",
    serialNo: "MOCK-SANGER-3500-001",
    room: "模拟实验室",
    responsibleName: "自动化平台演示",
    specs: "24 毛细管 Sanger 测序仪模拟设备；仅用于 simulation Run，不代表真机已接入。",
    nextCalibrationDate: null,
  });
  mockSequencer = await db.query.equipment.findFirst({ where: eq(equipment.id, created.id) });
}
if (!mockSequencer) throw new Error("Unable to create or retrieve the mock Sanger sequencer");

const existingMockSamples = await db
  .select({ id: samples.id, name: samples.name })
  .from(samples)
  .where(and(
    like(samples.name, `${MOCK_SAMPLE_PREFIX}%`),
    eq(samples.projectId, projectId),
    isNull(samples.archivedAt),
  ));
const existingNames = new Set(existingMockSamples.map((sample) => sample.name));
for (let target = 1; target <= layout.sampleCount; target += 1) {
  const name = `${MOCK_SAMPLE_PREFIX}${String(target).padStart(3, "0")}`;
  if (existingNames.has(name)) continue;
  await caller.sample.create({
    name,
    type: "plasmid",
    quantity: 1,
    unit: "µg",
    alertThreshold: 0.1,
    locationId: null,
    boxRow: null,
    boxCol: null,
    projectId,
    expiryDate: null,
    notes: `mock-set:cloning96-v1; target:${String(target).padStart(3, "0")}; planning demo only`,
  });
}

const context = await caller.labRun.launchContext({ workflowId: WORKFLOW_ID });
if (context.workflow.projectId !== projectId) {
  throw new Error("The workflow project no longer matches the fixed layout project");
}
const mockSamples = context.resources
  .filter((resource) => resource.name.startsWith(MOCK_SAMPLE_PREFIX))
  .sort((left, right) => left.name.localeCompare(right.name));
if (mockSamples.length !== layout.sampleCount || mockSamples.some((sample) => Number(sample.availableQuantity) < 0.01)) {
  throw new Error(`Expected ${layout.sampleCount} available mock cloning samples, found ${mockSamples.length}`);
}

const legacyRun = await db.query.labRuns.findFirst({
  where: eq(labRuns.idempotencyKey, LEGACY_RUN_KEY),
});
if (legacyRun && ["draft", "preparing", "ready", "running"].includes(legacyRun.status)) {
  const legacyReadback = await caller.labRun.byId({ id: legacyRun.id });
  await caller.labRun.cancel({
    id: legacyRun.id,
    expectedRevision: legacyReadback.revision,
    idempotencyKey: "66666666-6666-4666-8666-666666666666",
    reason: "替换为 96 个样本与 96 个排板目标一一绑定的演示 Run",
  });
}

const existing = await db.query.labRuns.findFirst({
  where: eq(labRuns.idempotencyKey, RUN_KEY),
});
if (existing) {
  const savedRun = await caller.labRun.byId({ id: existing.id });
  if (
    !savedRun.integrityValid ||
    savedRun.workflowId !== WORKFLOW_ID ||
    savedRun.executionMode !== "simulation" ||
    savedRun.cloningLayoutPlan?.id !== layout.id ||
    savedRun.cloningLayoutPlan.targetBindings?.length !== layout.sampleCount ||
    savedRun.resources.length !== layout.sampleCount ||
    savedRun.nodes.some((node) => node.templateKey === "e_seq" && node.equipmentId !== mockSequencer.id)
  ) {
    throw new Error(`Existing cloning Run ${existing.id} does not match the fixed seed request`);
  }
  console.log(`[seed] cloning Run already exists and passed readback: ${existing.runNo} (${existing.id})`);
  process.exit(0);
}

const usableEquipment = context.equipment.filter(
  (device) => !["maintenance", "fault"].includes(device.status),
);
const nodeBindings = context.nodes
  .filter((node) => node.type === "equipment")
  .map((node) => {
    const driverRef = parseDriverTemplateKey(node.templateKey);
    const selected = driverRef
      ? usableEquipment.find((device) =>
          device.binding?.enabled &&
          device.binding.driverKey === driverRef.driverKey &&
          device.binding.driverVersion === driverRef.version &&
          device.binding.mode === "simulation" &&
          device.binding.status === "simulation_ready")
      : node.templateKey === "e_seq"
        ? usableEquipment.find((device) => device.id === mockSequencer.id)
        : usableEquipment.find((device) => device.id === node.equipmentId);
    if (!selected) throw new Error(`No explicitly compatible simulation instrument for node ${node.nodeKey}`);
    let params: Record<string, string | number | boolean> = {};
    if (node.params) {
      try {
        params = JSON.parse(node.params) as Record<string, string | number | boolean>;
      } catch {
        params = {};
      }
    }
    return { nodeKey: node.nodeKey, equipmentId: selected.id, params };
  });

const scheduledStart = new Date();
scheduledStart.setDate(scheduledStart.getDate() + 1);
scheduledStart.setHours(9, 0, 0, 0);
const scheduledEnd = new Date(scheduledStart.getTime() + 3 * 60 * 60 * 1_000);

const result = await caller.labRun.create({
  workflowId: WORKFLOW_ID,
  cloningLayoutPlanId: layout.id,
  name: "96样本分子克隆 · 孔板联动演示 Run",
  purpose: "演示从 BioFlow 选择已保存排板，绑定实验样本和设备参数，并将四阶段流程与 96 孔板完整冻结到 RunPlan。",
  projectId,
  executionMode: "simulation",
  scheduledStart,
  scheduledEnd,
  operatorName: "自动化平台演示",
  resources: mockSamples.map((sample) => ({ sampleId: sample.id, role: "sample" as const, amount: 0.01 })),
  nodeBindings,
  idempotencyKey: RUN_KEY,
});

console.log(`[seed] created cloning Run: ${result.runNo} (${result.id}), layout V${layout.version}`);
const readback = await caller.labRun.byId({ id: result.id });
if (
  !readback.integrityValid ||
  readback.executionMode !== "simulation" ||
  readback.cloningLayoutPlan?.targetBindings?.length !== layout.sampleCount ||
  readback.resources.length !== layout.sampleCount ||
  readback.nodes.some((node) => node.templateKey === "e_seq" && node.equipmentId !== mockSequencer.id)
) {
  throw new Error(`Created cloning Run ${result.id} failed deterministic readback`);
}
console.log(`[seed] readback passed: ${layout.sampleCount} target bindings, mock Sanger device ${mockSequencer.id}`);
