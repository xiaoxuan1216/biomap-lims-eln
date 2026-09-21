import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
import { methodSpecSchema, methodNodeSpecSchema } from "../../contracts/method.ts";
const url = new URL(process.env.DATABASE_URL!); url.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = url.toString();
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const { signSessionToken } = await import("../../api/security/session.ts");
const db = getDb(), suffix = randomUUID().slice(0, 6);
async function actor(role: "user" | "reviewer", name: string) {
 const unionId = `v15-ui-${role}-${suffix}`;
 const [row] = await db.insert(schema.users).values({ unionId, name, role }).$returningId();
 const [user] = await db.select().from(schema.users).where(eq(schema.users.id, row.id));
 const token = await signSessionToken({ unionId }); writeFileSync(`/tmp/v15-${role}-token`, token, { mode: 0o600 });
 return { user, api: appRouter.createCaller({ user, req: new Request("http://127.0.0.1:3115"), resHeaders: new Headers() }) };
}
const writer = await actor("user", "验收实验员"), reviewer = await actor("reviewer", "验收复核员");
async function methodGuard(id: number) {
  const method = await writer.api.workflow.byId({ id });
  return { expectedSpecHash: method.methodSpecHash, expectedGraphHash: method.graphHash };
}
const [project] = await db.insert(schema.projects).values({ name: `V15 客户任务验收 ${suffix}` }).$returningId();
const [sample] = await db.insert(schema.samples).values({ sku: `UI-S1-${suffix}`, name: "QA 样本 01", quantity: 20, unit: "管", type: "protein", projectId: project.id }).$returningId();
const [sample2] = await db.insert(schema.samples).values({ sku: `UI-S2-${suffix}`, name: "QA 样本 02", quantity: 20, unit: "管", type: "protein", projectId: project.id }).$returningId();
const materialSku = `UI-M-${suffix}`;
const [material] = await db.insert(schema.samples).values({ sku: materialSku, name: "QA 检测缓冲液", quantity: 100, unit: "mL", type: "buffer", projectId: project.id }).$returningId();
const [device] = await db.insert(schema.equipment).values({ name: `QA qPCR ${suffix}`, category: "analytical" }).$returningId();
const wf = await writer.api.workflow.create({ name: `QA 样本定量方法 ${suffix}`, projectId: project.id });
const rule = methodNodeSpecSchema.parse({ input: "核对样本编号及剩余量", output: "对应样本的检测记录", completion: "确认身份并保留原始文件" });
await writer.api.workflow.saveGraph({ id: wf.id, nodes: [{ nodeKey: "check", type: "manual", label: "核对本批样本", posX: 0, posY: 0 }, { nodeKey: "qpcr", type: "equipment", label: "采集定量结果", templateKey: "e_qpcr", params: JSON.stringify({ cycles: 40 }), posX: 250, posY: 0 }], edges: [{ edgeKey: "a", sourceKey: "check", targetKey: "qpcr" }] });
await writer.api.workflow.saveMethodSpec({ workflowId: wf.id, ...(await methodGuard(wf.id)), spec: methodSpecSchema.parse({ maxSamples: 10, materials: [{ name: "检测缓冲液", unit: "mL", perBatch: 1, perSample: 0.5, approvedSkus: [materialSku] }], nodes: { check: rule, qpcr: { ...rule, equipmentIds: [device.id], qualification: "QA fixture only; no physical qualification claimed", manualAllowed: true, resultRequired: true, parameters: { cycles: { adjustable: true, min: 35, max: 45 } } } } }) });
const release = await writer.api.workflow.submitMethod({ workflowId: wf.id, ...(await methodGuard(wf.id)) });
await reviewer.api.workflow.reviewMethod({ id: release.id, decision: "publish", note: "QA fixture publication for interface testing only" });
const base = { workflowId: wf.id, methodReleaseId: release.id, name: "QA 准备与结果验收", projectId: project.id, executionMode: "simulation" as const, scheduledStart: new Date(Date.now() - 60000), scheduledEnd: new Date(Date.now() + 3600000), resources: [{ sampleId: sample.id, role: "sample" as const, amount: 1 }], nodeBindings: [{ nodeKey: "qpcr", equipmentId: device.id, params: { cycles: 40 } }], idempotencyKey: randomUUID() };
await assert.rejects(writer.api.labRun.create(base), /缺少 1.5/);
await assert.rejects(writer.api.labRun.create({ ...base, resources: [...base.resources, { sampleId: material.id, role: "material", amount: 1 }] }), /缺少 0.5/);
const created = await writer.api.labRun.create({ ...base, resources: [...base.resources, { sampleId: material.id, role: "material", amount: 1.5 }] });
assert.ok(created.id);
// Compile a child into a decision/timer graph and exercise the exact frozen graph.
const parent = await writer.api.workflow.create({ name: `QA branching ${suffix}`, projectId: project.id });
const graph = { id: parent.id, nodes: [
 { nodeKey: "d", label: "判断", type: "decision" as const, posX: 0, posY: 0 },
 { nodeKey: "yes", label: "是分支", type: "manual" as const, posX: 100, posY: 0 },
 { nodeKey: "no", label: "否分支", type: "manual" as const, posX: 100, posY: 100 },
 { nodeKey: "wait", label: "等待", type: "timer" as const, posX: 200, posY: 0 },
 { nodeKey: "finish", label: "汇合", type: "manual" as const, posX: 300, posY: 0 },
], edges: [{ edgeKey: "1", sourceKey: "d", targetKey: "yes", sourceHandle: "yes" }, { edgeKey: "2", sourceKey: "d", targetKey: "no", sourceHandle: "no" }, { edgeKey: "3", sourceKey: "yes", targetKey: "wait" }, { edgeKey: "4", sourceKey: "wait", targetKey: "finish" }, { edgeKey: "5", sourceKey: "no", targetKey: "finish" }] };
await writer.api.workflow.saveGraph(graph);
const detail = await writer.api.workflow.byId({ id: parent.id });
const child = await writer.api.workflow.createSubflow({ nodeId: detail.nodes.find(n => n.nodeKey === "yes")!.id });
await writer.api.workflow.saveGraph({ id: child.id, nodes: [{ nodeKey: "child", label: "子方法步骤", type: "manual", posX: 0, posY: 0 }], edges: [] });
await writer.api.workflow.saveMethodSpec({ workflowId: child.id, ...(await methodGuard(child.id)), spec: methodSpecSchema.parse({ nodes: { child: rule } }) });
await writer.api.workflow.saveMethodSpec({ workflowId: parent.id, ...(await methodGuard(parent.id)), spec: methodSpecSchema.parse({ nodes: Object.fromEntries(graph.nodes.map(n => [n.nodeKey, { ...rule, ...(n.type === "timer" ? { waitMinutes: 10 } : {}) }])) }) });
const branchRelease = await writer.api.workflow.submitMethod({ workflowId: parent.id, ...(await methodGuard(parent.id)) });
await reviewer.api.workflow.reviewMethod({ id: branchRelease.id, decision: "publish", note: "QA explicit branching" });
const branchContext = await writer.api.labRun.launchContext({ workflowId: parent.id });
assert.ok(branchContext.nodes.some(n => n.nodeKey === "yes/child"));
const branchRun = await writer.api.labRun.create({ ...base, workflowId: parent.id, methodReleaseId: branchRelease.id, nodeBindings: [], idempotencyKey: randomUUID() });
async function advance(extra: { decisions?: Record<string, "yes" | "no">; skipWait?: boolean } = {}) { const run = await writer.api.labRun.byId({ id: branchRun.id }); return writer.api.labRun.advanceSimulation({ id: run.id, expectedRevision: run.revision, idempotencyKey: randomUUID(), ...extra }); }
await writer.api.labRun.startSimulation({ id: branchRun.id, expectedRevision: (await writer.api.labRun.byId({ id: branchRun.id })).revision, idempotencyKey: randomUUID() });
await assert.rejects(advance(), /判断结论/);
await advance({ decisions: { d: "yes" } });
let branchState = await writer.api.labRun.byId({ id: branchRun.id });
assert.equal(branchState.nodes.find(n => n.nodeKey === "no")!.status, "skipped");
assert.equal(branchState.nodes.find(n => n.nodeKey === "yes/child")!.status, "running");
await advance(); await assert.rejects(advance(), /快进等待/); await advance({ skipWait: true }); await advance();
branchState = await writer.api.labRun.byId({ id: branchRun.id }); assert.equal(branchState.status, "completed");
assert.equal(branchState.dataFlow.nodes.some(n => n.kind === "result"), false);
const [inventory] = await db.select().from(schema.samples).where(eq(schema.samples.id, material.id)); assert.equal(Number(inventory.quantity), 100);
const report = { status: "passed", cases: ["material quantity and approved inventory", "child method flattening", "explicit decision required", "unselected branch skipped", "explicit simulated wait fast-forward", "simulation has no scientific result", "simulation does not consume material"], workflowId: wf.id, releaseId: release.id, projectId: project.id, sampleIds: [sample.id, sample2.id], sampleSkus: [`UI-S1-${suffix}`, `UI-S2-${suffix}`], materialSku, deviceId: device.id, writerId: writer.user.id, reviewerId: reviewer.user.id, rehearsalId: created.id };
writeFileSync("verifier/v15/ui-fixture.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); process.exit(0);
