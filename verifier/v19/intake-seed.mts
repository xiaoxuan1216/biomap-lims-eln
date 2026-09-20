import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { users, stockTransactions, labRunOutputs } from "../../db/schema.ts";
const url = new URL(process.env.DATABASE_URL!); url.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = url.toString();
const { migrateDatabase } = await import("../../api/queries/migrate.ts"); await migrateDatabase();
const { getDb } = await import("../../api/queries/connection.ts"); const { appRouter } = await import("../../api/router.ts");
const chainFixture = JSON.parse(readFileSync("verifier/v16/chain-fixture.json", "utf8"));
const db = getDb(), suffix = randomUUID().slice(0, 8), note = "QA ONLY - synthetic incoming material; not a real sample or experiment";
async function caller(id: number) { const [user] = await db.select().from(users).where(eq(users.id, id)); return appRouter.createCaller({ user, req: new Request("http://127.0.0.1:3115"), resHeaders: new Headers() }); }
const writer = await caller(chainFixture.writerId), reviewer = await caller(chainFixture.reviewerId);
const methods = await writer.workflow.byId({ id: chainFixture.methods[1].workflowId });
const incoming = [];
for (const chain of ["HC", "LC"] as const) {
  const sequence = await writer.sequence.create({ name: `QA incoming ${chain} ${suffix}`, sequence: chain === "HC" ? "ATGGCCTAA" : "ATGCCCTAA", description: note });
  const sample = await writer.sample.create({ name: `QA 来样 ${chain} ${suffix}`, type: "plasmid", quantity: 20, unit: "µg", projectId: chainFixture.projectId, notes: note });
  const input = { sampleId: sample.id, source: "external" as const, sourceReference: `QA supplier record ${suffix}`, lot: `QA-${chain}-${suffix}`, antibodyId: `QA-INCOMING-${suffix}`, chain, sequenceId: sequence.id, verification: note, requestKey: randomUUID() };
  await assert.rejects(writer.sampleIdentity.submit({ ...input, sequenceId: undefined }), /DNA/);
  const submitted = await writer.sampleIdentity.submit(input);
  assert.deepEqual(await writer.sampleIdentity.submit(input), submitted);
  await assert.rejects(writer.sampleIdentity.submit({ ...input, antibodyId: "different" }), /其他内容/);
  await assert.rejects(writer.sampleIdentity.review({ id: submitted.id, decision: "approve", note, requestKey: randomUUID() }), /复核权限/);
  assert.equal((await writer.sampleIdentity.resolve({ sampleIds: [sample.id] })).length, 0);
  const ledgerBefore = await db.select().from(stockTransactions).where(eq(stockTransactions.sampleId, sample.id));
  if (chain === "LC") {
    const review = { id: submitted.id, decision: "approve" as const, note, requestKey: randomUUID() };
    const accepted = await reviewer.sampleIdentity.review(review); assert.deepEqual(await reviewer.sampleIdentity.review(review), accepted);
    assert.equal((await writer.sampleIdentity.resolve({ sampleIds: [sample.id] }))[0].origin, "external");
    await assert.rejects(writer.sample.update({ id: sample.id, unit: "mL" }), /类型或计量单位/);
  }
  assert.equal((await writer.sample.byId({ id: sample.id })).quantity, 20);
  assert.deepEqual(await db.select().from(stockTransactions).where(eq(stockTransactions.sampleId, sample.id)), ledgerBefore);
  assert.equal((await db.select().from(labRunOutputs).where(eq(labRunOutputs.sampleId, sample.id))).length, 0);
  incoming.push({ sampleId: sample.id, identityId: submitted.id, sequenceId: sequence.id, chain });
}
const createInput = { workflowId: methods.id, methodReleaseId: chainFixture.methods[1].releaseId, projectId: chainFixture.projectId, name: `QA 来样直接转染表达 ${suffix}`, purpose: note, executionMode: "manual" as const, scheduledStart: new Date(Date.now() - 60000), scheduledEnd: new Date(Date.now() + 6 * 3600000), resources: incoming.map(row => ({ sampleId: row.sampleId, role: "sample" as const, amount: 1 })), nodeBindings: Object.entries(methods.methodSpec.nodes).filter(([, rule]) => rule.equipmentIds.length).map(([nodeKey, rule]) => ({ nodeKey, equipmentId: rule.equipmentIds[0], params: {} })), idempotencyKey: randomUUID() };
await assert.rejects(writer.labRun.create(createInput), /已复核抗体身份/);
writeFileSync("verifier/v19/intake-fixture.json", JSON.stringify({ incoming, createInput, writerId: chainFixture.writerId, reviewerId: chainFixture.reviewerId, projectId: chainFixture.projectId, note, methodId: methods.id, releaseId: chainFixture.methods[1].releaseId, syntheticOnly: true }, null, 2));
console.log(JSON.stringify({ status: "seeded", incoming, HC: "awaiting independent UI review", LC: "approved by API reviewer", syntheticOnly: true }));
process.exit(0);
