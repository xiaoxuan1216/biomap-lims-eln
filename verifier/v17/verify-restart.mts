import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
import { Session } from "../../contracts/constants.ts";
const database = new URL(process.env.DATABASE_URL!); database.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = database.toString();
const { getDb } = await import("../../api/queries/connection.ts");
const { signSessionToken } = await import("../../api/security/session.ts");
const fixture = JSON.parse(readFileSync("verifier/v17/raw-files-fixture.json", "utf8"));
const boundary = JSON.parse(readFileSync("verifier/runs/v17-file-boundary.json", "utf8"));
const db = getDb(); const [user] = await db.select().from(schema.users).where(eq(schema.users.id, fixture.ownerId));
const cookie = `${Session.cookieName}=${await signSessionToken({ unionId: user.unionId })}`;
const evidence = await db.select().from(schema.labRunEvidence).where(eq(schema.labRunEvidence.runId, fixture.runId));
assert.ok(evidence.some(file => file.id === boundary.boundaryEvidenceId));
assert.ok(evidence.some(file => file.id === boundary.uiEvidenceId));
for (const file of evidence) {
  const response = await fetch(`http://127.0.0.1:3000/api/run-files/${file.id}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200); let size = 0; const hash = createHash("sha256");
  for await (const bytes of response.body!) { size += bytes.length; hash.update(bytes); }
  assert.equal(size, file.byteSize); assert.equal(hash.digest("hex"), file.sha256);
}
assert.equal((await fetch("http://127.0.0.1:3000/api/trpc/workspace")).status, 200);
assert.equal((await fetch("http://127.0.0.1:3000/api/v1/health")).status, 401);
console.log(JSON.stringify({ status: "passed", readAfterRestart: evidence.map(file => ({ id: file.id, bytes: file.byteSize, storage: file.storageKey ? "file" : "legacy" })) }, null, 2)); process.exit(0);
