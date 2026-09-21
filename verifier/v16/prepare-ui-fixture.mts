import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
const url = new URL(process.env.DATABASE_URL!); url.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = url.toString();
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const fixture = JSON.parse(readFileSync("verifier/v16/chain-fixture.json", "utf8"));
const db = getDb();
// Existing QA browser actor; do not create or elevate a production identity.
const [user] = await db.select().from(schema.users).where(eq(schema.users.id, 54));
if (!user || user.name !== "验收复核员" || user.role !== "reviewer") throw new Error("Expected isolated QA browser identity is unavailable");
const api = appRouter.createCaller({ user, req: new Request("http://127.0.0.1:3115"), resHeaders: new Headers() });
const source = await api.labRun.byId({ id: fixture.runs[0] });
const note = "QA UI output registration test; synthetic input, no physical experiment";
const run = await api.labRun.create({ workflowId: source.workflowId, methodReleaseId: source.method!.id, name: "QA 界面产物登记与结果验收", purpose: note, projectId: source.projectId, executionMode: "manual", scheduledStart: new Date(Date.now() - 60000), scheduledEnd: new Date(Date.now() + 3600000), resources: source.resources.map(resource => ({ sampleId: resource.sampleId, role: resource.role, amount: 1 })), nodeBindings: source.nodes.filter(node => node.type === "equipment").map(node => ({ nodeKey: node.nodeKey, equipmentId: node.equipmentId, params: {} })), idempotencyKey: randomUUID() });
let current = await api.labRun.byId({ id: run.id });
const request = await api.sampleRequest.byId({ id: current.sampleRequestId! });
for (const task of request.tasks) { await api.sampleRequest.claimTask({ taskId: task.id }); await api.sampleRequest.completeTask({ taskId: task.id }); }
await api.runExecution.act({ runId: run.id, expectedRevision: current.revision, idempotencyKey: randomUUID(), action: "start", note });
const files = [];
while (true) {
 current = await api.labRun.byId({ id: run.id });
 const node = current.nodes.find(node => node.status === "running"); if (!node) break;
 const file = await api.runExecution.uploadEvidence({ runId: run.id, nodeKey: node.nodeKey, name: `QA-UI-${node.nodeKey}.txt`, contentBase64: Buffer.from(`${note}\n${node.nodeKey}`).toString("base64") }); files.push({ nodeKey: node.nodeKey, evidenceId: file.id });
 await api.runExecution.act({ runId: run.id, expectedRevision: current.revision, idempotencyKey: randomUUID(), action: "complete_step", nodeKey: node.nodeKey, evidenceIds: [file.id], note });
}
const parents = await api.runExecution.details({ runId: fixture.runs[0] });
const outputs = parents.outputs.filter(output => output.status === "released").map(output => ({ ...JSON.parse(output.sampleSnapshot), chain: output.chain }));
const report = { runId: run.id, workflowId: source.workflowId, projectId: source.projectId, inputSamples: source.resources.map(resource => ({ id: resource.sampleId, sku: resource.sku, name: resource.sampleName })), locationId: outputs[0].locationId, sequenceIds: outputs.map(output => ({ chain: output.chain, sequenceId: output.sequenceId, sequenceName: output.sequence?.name })), files, evidenceKind: note };
writeFileSync("verifier/v16/ui-fixture.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); process.exit(0);
