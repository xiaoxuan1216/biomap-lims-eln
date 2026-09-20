import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
const url = new URL(process.env.DATABASE_URL!); url.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = url.toString();
const { getDb } = await import("../../api/queries/connection.ts"); const { appRouter } = await import("../../api/router.ts");
const fixture = JSON.parse(readFileSync("verifier/v16/chain-fixture.json", "utf8"));
const ui = JSON.parse(readFileSync("verifier/v16/ui-fixture.json", "utf8"));
const db = getDb(); const [user] = await db.select().from(schema.users).where(eq(schema.users.id, fixture.reviewerId));
const api = appRouter.createCaller({ user, req: new Request("http://127.0.0.1:3115"), resHeaders: new Headers() });
const details = await api.runExecution.details({ runId: ui.runId }); const run = await api.labRun.byId({ id: ui.runId });
assert.equal(details.execution?.resultState, "review"); assert.equal(details.outputs.length, 2); assert.equal(details.currentResults.length, 4); assert.notEqual(details.execution?.ownerId, user.id);
for (const output of details.outputs) { assert.equal(output.status, "pending_review"); assert.equal(output.antibodyId, "QA-UI-AB-001"); assert.equal(output.quantity, 8); assert.equal((await api.sample.byId({ id: output.sampleId })).quantity, 0); }
const record = await api.experiment.byId({ id: details.experiment!.id });
assert.match(record.content ?? "", /QA-UI-AB-001/); assert.match(record.content ?? "", /120 ng\/µL/); assert.match(record.content ?? "", /110 ng\/µL/);
await api.runExecution.act({ runId: run.id, expectedRevision: run.revision, idempotencyKey: randomUUID(), action: "approve_results", note: "QA ONLY: independent API review of browser-entered synthetic records; this does not certify a physical experiment", expectedExperimentRevision: details.experiment!.revision });
const approved = await api.runExecution.details({ runId: run.id }); assert.equal(approved.experiment?.status, "signed");
for (const output of approved.outputs) {
 assert.equal(output.status, "released"); assert.equal((await api.sample.byId({ id: output.sampleId })).quantity, 8);
 const ledger = await db.select().from(schema.stockTransactions).where(eq(schema.stockTransactions.sampleId, output.sampleId)); assert.equal(ledger.length, 1); assert.equal(ledger[0].quantityAfter, 8);
}
const report = { status: "passed", runId: run.id, experimentId: details.experiment!.id, outputSampleIds: approved.outputs.map(output => output.sampleId), UI: ["two output registrations with distinct parents", "four results with fixed units", "missing output/results blocks review", "review submission via UI"], API: ["independent approval of UI-saved records", "atomic stock ledger and signed ELN"], syntheticOnly: true };
writeFileSync("verifier/runs/v16-ui-acceptance.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); process.exit(0);
