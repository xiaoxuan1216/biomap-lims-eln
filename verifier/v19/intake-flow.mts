import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { users, labRunOutputs, lineageEdges, stockTransactions } from "../../db/schema.ts";
const url = new URL(process.env.DATABASE_URL!); url.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = url.toString();
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const db = getDb();
const fixture = JSON.parse(readFileSync("verifier/v19/intake-fixture.json", "utf8"));
const chain = JSON.parse(readFileSync("verifier/v16/chain-fixture.json", "utf8"));
async function caller(id: number) { const [user] = await db.select().from(users).where(eq(users.id, id)); assert.ok(user); return appRouter.createCaller({ user, req: new Request("http://127.0.0.1:3115"), resHeaders: new Headers() }); }
const writer = await caller(fixture.writerId), reviewer = await caller(fixture.reviewerId);
const note = fixture.note;
const inputs: number[] = fixture.incoming.map((row: { sampleId: number }) => row.sampleId);
const identities = await writer.sampleIdentity.resolve({ sampleIds: inputs });
assert.equal(identities.length, 2);
assert.ok(identities.every(identity => identity.origin === "external" && identity.sequenceSnapshot?.sha256));
assert.equal((await writer.sampleIdentity.history({ sampleId: inputs[0] })).records[0].reviewedBy, 54);
for (const sampleId of inputs) assert.equal((await db.select().from(labRunOutputs).where(eq(labRunOutputs.sampleId, sampleId))).length, 0);
const run = await writer.labRun.create({ ...fixture.createInput, scheduledStart: new Date(Date.now() - 60000), scheduledEnd: new Date(Date.now() + 3600000) });
// Persist the handle immediately so failures never lead to an accidental duplicate execution.
writeFileSync("verifier/v19/flow-handle.json", JSON.stringify({ runId: run.id, syntheticOnly: true }));
const revision = async () => (await writer.labRun.byId({ id: run.id })).revision;
const source = await writer.labRun.byId({ id: run.id });
assert.equal(source.stageSource, null);
assert.deepEqual(source.inputIdentities, identities);
await assert.rejects(reviewer.sampleIdentity.review({ id: fixture.incoming[0].identityId, decision: "retire", note, requestKey: randomUUID() }), /未结束或未复核/);
const request = await writer.sampleRequest.byId({ id: source.sampleRequestId! });
for (const task of request.tasks) { await writer.sampleRequest.claimTask({ taskId: task.id }); await writer.sampleRequest.completeTask({ taskId: task.id }); }
await writer.runExecution.act({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "start", note });
const method = await writer.workflow.byId({ id: fixture.methodId });
for (const node of source.nodes) {
  const rule = method.methodSpec.nodes[node.nodeKey];
  assert.ok(rule.record);
  const records = [{ id: randomUUID(), sampleIds: inputs, values: Object.fromEntries(rule.record.fields.map(field => [field.key, field.kind === "number" ? "1" : field.kind === "datetime" ? new Date().toISOString() : `QA-${field.key}-incoming`])) }];
  await writer.runExecution.act({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "complete_step", nodeKey: node.nodeKey, records, expectedRecordEventId: null, evidenceIds: [], note });
}
const [outputKey, outputRule] = Object.entries(method.methodSpec.nodes).find(([, rule]) => rule.produces)!;
const evidence = await writer.runExecution.uploadEvidence({ runId: run.id, nodeKey: outputKey, name: "QA-incoming-expression.txt", contentBase64: Buffer.from(note).toString("base64") });
const location = await writer.storage.create({ name: `QA incoming expression ${run.id}`, type: "fridge", temperature: "QA only" });
const registration = { runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), nodeKey: outputKey, name: `QA incoming expression harvest ${run.id}`, quantity: 10, parentSampleIds: inputs, antibodyId: identities[0].antibodyId, chain: "paired" as const, metadata: Object.fromEntries(outputRule.produces!.requiredMetadata.map(field => [field.key, `QA-${field.key}-incoming`])), evidenceId: evidence.id, locationId: location.id, note };
await assert.rejects(writer.runExecution.recordOutput({ ...registration, antibodyId: "wrong" }), /抗体编号/);
const output = await writer.runExecution.recordOutput(registration);
assert.ok(output.sampleId);
assert.equal((await writer.sample.byId({ id: output.sampleId })).quantity, 0);
for (const [nodeKey, rule] of Object.entries(method.methodSpec.nodes)) for (const metric of rule.measurements) {
  const raw = nodeKey === outputKey ? evidence : await writer.runExecution.uploadEvidence({ runId: run.id, nodeKey, name: `QA-${nodeKey}.txt`, contentBase64: Buffer.from(note).toString("base64") });
  await writer.runExecution.recordResult({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), nodeKey, sampleId: output.sampleId, metricKey: metric.key, value: metric.kind === "number" ? "1" : note, unit: metric.unit, outcome: "pass", evidenceId: raw.id, note });
}
await writer.runExecution.act({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "submit_review", note });
const review = await reviewer.runExecution.details({ runId: run.id });
await reviewer.runExecution.act({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "approve_results", expectedExperimentRevision: review.experiment!.revision, note });
const signed = await writer.runExecution.details({ runId: run.id });
assert.equal(signed.experiment?.status, "signed");
const eln = await writer.experiment.byId({ id: signed.experiment!.id });
for (const identity of identities) { assert.ok(eln.content?.includes(identity.lot)); assert.ok(eln.content?.includes(identity.sequenceSnapshot!.sha256)); }
assert.equal((await writer.sample.byId({ id: output.sampleId })).quantity, 10);
for (const sampleId of inputs) assert.equal((await writer.sample.byId({ id: sampleId })).quantity, 19);
const edges = await db.select().from(lineageEdges).where(and(eq(lineageEdges.childKind, "sample"), eq(lineageEdges.childId, output.sampleId)));
assert.deepEqual(edges.map(edge => edge.parentId).sort(), inputs.toSorted());
assert.equal((await db.select().from(stockTransactions).where(eq(stockTransactions.sampleId, output.sampleId))).length, 1);
const next = await writer.runExecution.prepareNextStage({ runId: run.id, workflowId: chain.methods[2].workflowId, outputs: [{ sampleId: output.sampleId, amount: 1 }], note, idempotencyKey: randomUUID() });
assert.equal((await writer.runDraft.byId({ id: next.draftId })).payload.stageSource?.runId, run.id);
const report = { status: "passed", runId: run.id, outputSampleId: output.sampleId, nextDraftId: next.draftId, sourceSampleIds: inputs, syntheticOnly: true };
writeFileSync("verifier/v19/flow-result.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2)); process.exit(0);
