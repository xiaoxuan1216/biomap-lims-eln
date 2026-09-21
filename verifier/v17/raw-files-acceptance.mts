import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
import { Session } from "../../contracts/constants.ts";

const database = new URL(process.env.DATABASE_URL!); database.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = database.toString();
process.env.PUBLIC_BASE_URL = "http://127.0.0.1:3115";
process.env.NODE_ENV = "development";
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const { signSessionToken } = await import("../../api/security/session.ts");
const { evidenceStorageConfig } = await import("../../api/services/evidenceStorage.ts");
const { runFilesApp } = await import("../../api/runFiles.ts");
const db = getDb();
const chain = JSON.parse(readFileSync("verifier/v16/chain-fixture.json", "utf8"));
const [owner] = await db.select().from(schema.users).where(eq(schema.users.id, 54));
const [other] = await db.select().from(schema.users).where(eq(schema.users.id, chain.writerId));
const [viewer] = await db.select().from(schema.users).where(eq(schema.users.role, "viewer")).limit(1);
assert.equal(owner.name, "验收复核员"); assert.equal(owner.role, "reviewer"); assert.ok(other); assert.ok(viewer);
const apiFor = (user: typeof owner) => appRouter.createCaller({ user, req: new Request(process.env.PUBLIC_BASE_URL!), resHeaders: new Headers() });
const api = apiFor(owner), otherApi = apiFor(other);
const cookie = async (user: typeof owner) => `${Session.cookieName}=${await signSessionToken({ unionId: user.unionId })}`;
const ownerCookie = await cookie(owner), otherCookie = await cookie(other), viewerCookie = await cookie(viewer);
const source = await api.labRun.byId({ id: chain.runs[0] });
const note = "QA synthetic raw-file transport acceptance only; no physical experiment";
const run = await api.labRun.create({ workflowId: source.workflowId, methodReleaseId: source.method!.id, name: "QA 大文件原始证据验收", purpose: note, projectId: source.projectId, executionMode: "manual", scheduledStart: new Date(Date.now() - 60000), scheduledEnd: new Date(Date.now() + 3600000), resources: source.resources.map(resource => ({ sampleId: resource.sampleId, role: resource.role, amount: 0.1 })), nodeBindings: source.nodes.filter(node => node.type === "equipment").map(node => ({ nodeKey: node.nodeKey, equipmentId: node.equipmentId, params: {} })), idempotencyKey: randomUUID() });
const current = await api.labRun.byId({ id: run.id });
const request = await api.sampleRequest.byId({ id: current.sampleRequestId! });
for (const task of request.tasks) { await api.sampleRequest.claimTask({ taskId: task.id }); await api.sampleRequest.completeTask({ taskId: task.id }); }
const act = async (actor: typeof api, action: "start" | "pause" | "handoff" | "resume", ownerId?: number) => actor.runExecution.act({ runId: run.id, expectedRevision: (await actor.labRun.byId({ id: run.id })).revision, action, ownerId, reconcile: true, idempotencyKey: randomUUID(), note });
await act(api, "start");
const nodeKey = (await api.labRun.byId({ id: run.id })).nodes.find(node => node.status === "running")!.nodeKey;
const fileName = `QA_原始导出_${randomUUID().slice(0, 8)}.csv`;
const line = "QA_ONLY,0.001,0.002,0.003\n";
const bytes = Buffer.from("scope,value_a,value_b,value_c\n" + line.repeat(Math.ceil(6 * 1024 * 1024 / line.length)));
const sha256 = createHash("sha256").update(bytes).digest("hex");
const origin = process.env.PUBLIC_BASE_URL!;
const endpoint = (name = fileName, key = nodeKey, id = run.id) => `/api/run-files/upload?${new URLSearchParams({ runId: String(id), nodeKey: key, name })}`;
const post = (body = bytes, session = ownerCookie, requestOrigin = origin, route = endpoint()) => fetch(`http://127.0.0.1:3000${route}`, { method: "POST", headers: { Cookie: session, Origin: requestOrigin, "Content-Type": "application/octet-stream" }, body });
const response = await post(); assert.equal(response.status, 201, await response.clone().text());
const saved = await response.json() as { id: number; byteSize: number; sha256: string };
assert.equal(saved.byteSize, bytes.length); assert.equal(saved.sha256, sha256);
const downloads = await fetch(`http://127.0.0.1:3000/api/run-files/${saved.id}`, { headers: { Cookie: ownerCookie } });
assert.equal(downloads.status, 200); assert.equal(downloads.headers.get("X-Content-SHA256"), sha256);
assert.ok(Buffer.from(await downloads.arrayBuffer()).equals(bytes));
for (const duplicate of await Promise.all([post(), post(), post()])) { assert.equal(duplicate.status, 200); assert.equal((await duplicate.json() as { id: number }).id, saved.id); }
const records = await db.select().from(schema.labRunEvidence).where(and(eq(schema.labRunEvidence.runId, run.id), eq(schema.labRunEvidence.sha256, sha256)));
assert.equal(records.length, 1); assert.equal(records[0].contentBase64, null); assert.ok(records[0].storageKey);
assert.equal((await post(Buffer.from("small"), "")).status, 401);
assert.equal((await post(Buffer.from("small"), ownerCookie, "https://untrusted.invalid")).status, 403);
assert.equal((await post(Buffer.from("small"), viewerCookie)).status, 403);
assert.equal((await post(Buffer.from("small"), otherCookie)).status, 403);
assert.equal((await post(Buffer.from("small"), ownerCookie, origin, endpoint("../bad.csv"))).status, 400);
assert.equal((await post(Buffer.from("small"), ownerCookie, origin, endpoint(fileName, "assembly"))).status, 409);
assert.equal((await post(Buffer.from("small"), otherCookie, origin, endpoint(fileName, "identity", chain.runs[0]))).status, 409);
assert.equal((await fetch(`http://127.0.0.1:3000/api/run-files/${saved.id}`)).status, 401);

const config = evidenceStorageConfig();
const storedPath = path.join(config.root, records[0].storageKey!);
for (const route of [`/.data/run-evidence/${records[0].storageKey}`, `/@fs${storedPath}`]) {
  const direct = await fetch(`http://127.0.0.1:3000${route}`);
  assert.notEqual(direct.status, 200, `Private evidence exposed through ${route}`);
}
const broken = Buffer.from(bytes); broken[0] ^= 1;
writeFileSync(storedPath, broken);
try { assert.equal((await fetch(`http://127.0.0.1:3000/api/run-files/${saved.id}`, { headers: { Cookie: ownerCookie } })).status, 409); }
finally { writeFileSync(storedPath, bytes); }

// A readable with no prefetch changes ownership only after the upload preflight.
let handedOff = false;
const changedOwnerBody = new ReadableStream<Uint8Array>({ async pull(controller) {
  await act(api, "pause"); await act(api, "handoff", other.id); handedOff = true;
  controller.enqueue(Buffer.from("QA ownership changed during upload")); controller.close();
} }, { highWaterMark: 0 });
const race = await runFilesApp.request(new Request(`${origin}${endpoint("QA-owner-race.txt").replace("/api/run-files", "")}`, { method: "POST", headers: { Cookie: ownerCookie, Origin: origin }, body: changedOwnerBody, duplex: "half" } as RequestInit));
assert.ok(handedOff); assert.equal(race.status, 403, await race.text());
assert.equal((await db.select().from(schema.labRunEvidence).where(eq(schema.labRunEvidence.runId, run.id))).length, 1);
await act(otherApi, "handoff", owner.id); await act(api, "resume");

const legacy = await api.runExecution.uploadEvidence({ runId: run.id, nodeKey, name: "QA-legacy.txt", contentBase64: Buffer.from("QA legacy compatibility").toString("base64") });
assert.equal(await (await fetch(`http://127.0.0.1:3000/api/run-files/${legacy.id}`, { headers: { Cookie: ownerCookie } })).text(), "QA legacy compatibility");
const tooLarge = await runFilesApp.request(`/upload?${new URLSearchParams({ runId: String(run.id), nodeKey, name: "QA-oversize.bin" })}`, { method: "POST", headers: { Cookie: ownerCookie, Origin: origin, "Content-Length": String(config.maxBytes + 1) }, body: "small" });
assert.equal(tooLarge.status, 413);
mkdirSync("tmp", { recursive: true }); writeFileSync("tmp/QA-instrument-export-6MB.csv", bytes);
const result = { status: "passed", syntheticOnly: true, runId: run.id, nodeKey, evidenceId: saved.id, byteSize: saved.byteSize, sha256, ownerId: owner.id, maxBytes: config.maxBytes, UIUploadFile: "tmp/QA-instrument-export-6MB.csv", cases: ["6 MB HTTP round-trip with checksum", "three concurrent retries reuse one record", "authentication, origin, viewer and owner gates", "pending steps and signed runs reject evidence", "private files denied through Vite and fs URLs", "same-size corruption detected", "ownership rechecked after streaming", "legacy files remain readable", "declared oversize rejected"] };
writeFileSync("verifier/v17/raw-files-fixture.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2)); process.exit(0);
