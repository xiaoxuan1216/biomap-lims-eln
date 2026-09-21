import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
import { Session } from "../../contracts/constants.ts";
const database = new URL(process.env.DATABASE_URL!); database.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = database.toString();
const { getDb } = await import("../../api/queries/connection.ts");
const { signSessionToken } = await import("../../api/security/session.ts");
const { evidenceStorageConfig } = await import("../../api/services/evidenceStorage.ts");
const fixture = JSON.parse(readFileSync("verifier/v17/raw-files-fixture.json", "utf8"));
const db = getDb(); const [user] = await db.select().from(schema.users).where(eq(schema.users.id, fixture.ownerId));
const cookie = `${Session.cookieName}=${await signSessionToken({ unionId: user.unionId })}`;
const base = "http://127.0.0.1:3000", headers = { Cookie: cookie };
const uiFiles = await db.select().from(schema.labRunEvidence).where(eq(schema.labRunEvidence.runId, fixture.runId));
const ui = uiFiles.find(file => file.nodeKey === "assembly" && file.name === "QA-instrument-export-6MB.csv");
assert.ok(ui, "Browser-entered file record is missing"); assert.equal(ui.sha256, fixture.sha256); assert.equal(ui.byteSize, fixture.byteSize); assert.equal(ui.contentBase64, null);
const downloadHash = async (id: number) => {
  const response = await fetch(`${base}/api/run-files/${id}`, { headers }); assert.equal(response.status, 200);
  let bytes = 0; const checksum = createHash("sha256");
  for await (const chunk of response.body!) { bytes += chunk.byteLength; checksum.update(chunk); }
  return { bytes, sha256: checksum.digest("hex") };
};
assert.deepEqual(await downloadHash(ui.id), { bytes: ui.byteSize, sha256: ui.sha256 });
const maxBytes = evidenceStorageConfig().maxBytes;
assert.equal(maxBytes, 100 * 1024 * 1024, "This acceptance expects the local default of 100 MiB");
const checksum = createHash("sha256"), chunk = Buffer.alloc(64 * 1024, 81);
async function* data() { for (let sent = 0; sent < maxBytes; sent += chunk.length) { checksum.update(chunk); yield chunk; } }
const started = Date.now();
const upload = await fetch(`${base}/api/run-files/upload?${new URLSearchParams({ runId: String(fixture.runId), nodeKey: "assembly", name: "QA-exact-100MiB.bin" })}`, { method: "POST", headers: { ...headers, Origin: "http://127.0.0.1:3115", "Content-Type": "application/octet-stream", "Content-Length": String(maxBytes) }, body: Readable.toWeb(Readable.from(data())), duplex: "half" } as RequestInit);
assert.equal(upload.status, 201, await upload.clone().text());
const saved = await upload.json() as { id: number; byteSize: number; sha256: string };
const uploadMilliseconds = Date.now() - started;
assert.equal(saved.byteSize, maxBytes); assert.equal(saved.sha256, checksum.digest("hex"));
const downloadStarted = Date.now(); assert.deepEqual(await downloadHash(saved.id), { bytes: maxBytes, sha256: saved.sha256 });
const report = { status: "passed", syntheticOnly: true, runId: fixture.runId, uiEvidenceId: ui.id, uiBytes: ui.byteSize, boundaryEvidenceId: saved.id, boundaryBytes: saved.byteSize, boundarySha256: saved.sha256, localHttpUploadMilliseconds: uploadMilliseconds, localHttpDownloadMilliseconds: Date.now() - downloadStarted, scope: "Local HTTP transport only; not customer instrument or usability timing" };
writeFileSync("verifier/runs/v17-file-boundary.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); process.exit(0);
