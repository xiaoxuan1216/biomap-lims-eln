import { Hono } from "hono";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { labRunEvidence } from "@db/schema";
import { evidenceMetadataSchema } from "@contracts/runEvidence";
import { authenticateRequest } from "./security/session";
import { isTrustedOrigin } from "./security/origin";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { assertEvidenceUpload, saveRunEvidence } from "./services/runEvidenceService";
import { evidenceStorageConfig, EvidenceStorageError, readVerifiedEvidence, removeUnusedEvidence, storeEvidence } from "./services/evidenceStorage";

export const runFilesApp = new Hono();
runFilesApp.post("/upload", async c => {
  if (!isTrustedOrigin(c.req.raw, env.publicBaseUrl)) return c.json({ error: "FORBIDDEN", message: "请求来源校验失败" }, 403);
  let user;
  try { user = await authenticateRequest(c.req.raw.headers); } catch { return c.json({ error: "UNAUTHORIZED", message: "请重新登录后上传文件" }, 401); }
  const parsed = evidenceMetadataSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "INVALID_FILE", message: "文件名或步骤信息无效" }, 400);
  try {
    const config = evidenceStorageConfig();
    const lengthHeader = c.req.header("Content-Length");
    const expectedBytes = lengthHeader == null ? undefined : /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : -1;
    // Do not hold database locks while bytes are in transit. Recheck after upload.
    await getDb().transaction(tx => assertEvidenceUpload(tx, user, parsed.data));
    const stored = await storeEvidence(c.req.raw.body, { config, expectedBytes, signal: c.req.raw.signal });
    const result = await getDb().transaction(tx => saveRunEvidence(tx, user, { ...parsed.data, ...stored }));
    if (result.reused) await removeUnusedEvidence(stored, config).catch(() => undefined);
    return c.json({ ...result, byteSize: stored.byteSize, sha256: stored.sha256 }, result.reused ? 200 : 201);
  } catch (error) {
    if (error instanceof TRPCError) return c.json({ error: error.code, message: error.message }, error.code === "FORBIDDEN" ? 403 : 409);
    if (error instanceof EvidenceStorageError) return c.json({ error: error.code }, error.code === "TOO_LARGE" ? 413 : 400);
    console.error("Evidence upload failed", error);
    return c.json({ error: "SAVE_FAILED", message: "原始文件保存失败，请重试" }, 500);
  }
});
runFilesApp.get("/:id", async c => {
  try { await authenticateRequest(c.req.raw.headers); } catch { return c.json({ error: "Unauthorized" }, 401); }
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: "Not found" }, 404);
  const [file] = await getDb().select().from(labRunEvidence).where(eq(labRunEvidence.id, id)).limit(1);
  if (!file) return c.json({ error: "Not found" }, 404);
  try {
    const body = await readVerifiedEvidence(file);
    return new Response(body, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, "Content-Length": String(file.byteSize), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Content-SHA256": file.sha256 } });
  } catch {
    return c.json({ error: "Evidence integrity check failed" }, 409);
  }
});
