/**
 * 实验运行入口演示数据（幂等）。
 *
 * 通过正式 labRun.create 业务动作创建，确保 Run 与不可变快照按真实入口落库。
 * 当前仅创建 simulation 计划，不占用生产库存，也不预约真实设备时段。
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { appRouter } from "../api/router";
import { getDb } from "../api/queries/connection";
import { appendActivity } from "../api/queries/labHelpers";
import { parseDriverTemplateKey } from "../contracts/deviceDriver";
import { labRuns, projects, users, workflowNodes, workflows } from "./schema";

const db = getDb();
const IDEMPOTENCY_KEY = "seed:lab-run-entry:v3";

const existing = await db.query.labRuns.findFirst({ where: eq(labRuns.idempotencyKey, IDEMPOTENCY_KEY) });
if (existing) {
  console.log(`[seed] lab run already exists: ${existing.runNo} (${existing.id})`);
  process.exit(0);
}

const actor = await db.query.users.findFirst({
  where: eq(users.role, "admin"),
  orderBy: [asc(users.id)],
});
if (!actor) throw new Error("No admin user is available for lab-run seed data");

let preferred = await db.query.workflows.findFirst({ where: eq(workflows.id, 21) });
if (preferred?.scenario === "device-driver-demo" && preferred.status === "draft") {
  const updatedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(workflows)
      .set({ status: "active", updatedAt })
      .where(eq(workflows.id, preferred!.id));
    await appendActivity(tx, {
      userId: actor.id,
      userName: actor.name,
      source: "seed",
      action: "启用了实验运行演示流程",
      entityType: "workflow",
      entityId: preferred!.id,
      entityName: preferred!.name,
      before: { status: "draft" },
      after: { status: "active", purpose: "lab-run-demo" },
    });
  });
  preferred = { ...preferred, status: "active", updatedAt };
}
const workflow = preferred?.status === "active" && !preferred.parentWorkflowId
  ? preferred
  : await db.query.workflows.findFirst({
      where: and(eq(workflows.status, "active"), isNull(workflows.parentWorkflowId)),
      orderBy: [asc(workflows.id)],
    });
if (!workflow) throw new Error("No active top-level workflow is available for lab-run seed data");

const caller = appRouter.createCaller({
  req: new Request("http://localhost/seed/lab-run"),
  resHeaders: new Headers(),
  user: actor,
});
for (const legacyKey of ["seed:lab-run-entry:v1", "seed:lab-run-entry:v2"]) {
  const legacySimulationRun = await db.query.labRuns.findFirst({
    where: eq(labRuns.idempotencyKey, legacyKey),
  });
  if (legacySimulationRun && ["draft", "preparing", "ready", "running"].includes(legacySimulationRun.status)) {
    await caller.labRun.cancel({
      id: legacySimulationRun.id,
      reason: "升级为具备完整性校验和幂等状态推进的模拟 Run",
    });
  }
}
const context = await caller.labRun.launchContext({ workflowId: workflow.id });
const sourceNodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, workflow.id));

const inputSample = context.resources.find(
  (resource) =>
    !["reagent", "chemical", "buffer", "enzyme", "competent_cell"].includes(resource.type) &&
    Number(resource.availableQuantity) >= 0.1,
);
const material = context.resources.find(
  (resource) =>
    resource.id !== inputSample?.id &&
    ["reagent", "chemical", "buffer", "enzyme", "competent_cell"].includes(resource.type) &&
    Number(resource.availableQuantity) >= 0.1,
);
if (!inputSample) throw new Error("No available experiment sample is available for lab-run seed data");

const nodeBindings = sourceNodes
  .filter((node) => node.type === "equipment")
  .map((node) => {
    const ref = parseDriverTemplateKey(node.templateKey);
    const usableEquipment = context.equipment.filter(
      (device) => !["maintenance", "fault"].includes(device.status),
    );
    const selected = ref
      ? usableEquipment.find(
          (device) =>
            device.binding?.enabled &&
            device.binding.driverKey === ref.driverKey &&
            device.binding.driverVersion === ref.version &&
            device.binding.mode === "simulation" &&
            device.binding.status === "simulation_ready",
        )
      : usableEquipment.find((device) => device.id === node.equipmentId) ?? usableEquipment[0];
    if (!selected) throw new Error(`No simulation-ready instrument for node ${node.nodeKey}`);
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

const projectId = workflow.projectId ?? (await db.query.projects.findFirst({
  where: eq(projects.status, "active"),
  orderBy: [asc(projects.id)],
}))?.id;
if (!projectId) throw new Error("No active project is available for lab-run seed data");

const scheduledStart = new Date();
scheduledStart.setDate(scheduledStart.getDate() + 14);
scheduledStart.setHours(9, 0, 0, 0);
const scheduledEnd = new Date(scheduledStart.getTime() + 3 * 60 * 60 * 1000);
const resources: Array<{
  sampleId: number;
  role: "sample" | "material";
  amount: number;
}> = [
  { sampleId: inputSample.id, role: "sample", amount: Math.min(1, Number(inputSample.availableQuantity)) },
];
if (material) {
  resources.push({ sampleId: material.id, role: "material", amount: Math.min(1, Number(material.availableQuantity)) });
}

const result = await caller.labRun.create({
  workflowId: workflow.id,
  name: workflow.scenario === "device-driver-demo" ? "多厂商设备联调 · 演示批次 01" : `${workflow.name} · 演示批次 01`,
  purpose: "演示从 BioFlow 选择流程、绑定样本与物料、确认 Hamilton、Octet 等设备参数并形成不可变 RunPlan。",
  projectId,
  executionMode: "simulation",
  scheduledStart,
  scheduledEnd,
  operatorName: "自动化平台演示",
  resources,
  nodeBindings,
  idempotencyKey: IDEMPOTENCY_KEY,
});

console.log(`[seed] created lab run: ${result.runNo} (${result.id})`);
