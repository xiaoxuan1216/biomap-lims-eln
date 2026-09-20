import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink, type FileHandle } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { DEFAULT_EVIDENCE_MAX_MB } from "@contracts/runEvidence";

export class EvidenceStorageError extends Error {
  code: "TOO_LARGE" | "INVALID_FILE" | "INTEGRITY_FAILED" | "INTERRUPTED";
  constructor(code: EvidenceStorageError["code"]) { super(code); this.code = code; }
}

export function evidenceStorageConfig() {
  const maxMB = Number(process.env.BIOMAP_EVIDENCE_MAX_MB ?? DEFAULT_EVIDENCE_MAX_MB);
  if (!Number.isInteger(maxMB) || maxMB < 1 || maxMB > 1024) throw new Error("BIOMAP_EVIDENCE_MAX_MB must be an integer from 1 to 1024");
  // Exclude credentials from the namespace. Main and QA databases may share a volume.
  const database = new URL(process.env.DATABASE_URL!);
  const namespace = process.env.BIOMAP_EVIDENCE_NAMESPACE?.trim() || createHash("sha256").update(`${database.host}${database.pathname}`).digest("hex").slice(0, 24);
  if (!/^[a-f0-9]{24}$/.test(namespace)) throw new Error("BIOMAP_EVIDENCE_NAMESPACE must contain 24 lowercase hexadecimal characters");
  const root = path.resolve(process.env.BIOMAP_EVIDENCE_DIR || ".data/run-evidence");
  for (const publicDirectory of ["public", "dist/public"]) {
    const relative = path.relative(path.resolve(publicDirectory), root);
    if (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error("Evidence storage must be outside public asset directories");
  }
  return { root, namespace, maxBytes: maxMB * 1024 * 1024 };
}

export type EvidenceStorageConfig = ReturnType<typeof evidenceStorageConfig>;
export type StoredEvidence = { storageKey: string; byteSize: number; sha256: string };

function storagePath(key: string, config: EvidenceStorageConfig) {
  if (!/^[a-f0-9]{24}\/[a-f0-9-]{36}\.bin$/.test(key) || !key.startsWith(`${config.namespace}/`)) throw new EvidenceStorageError("INTEGRITY_FAILED");
  return path.join(config.root, key);
}

/** Stream into an exclusively created temporary file, then publish it atomically.
 * Database references are written only after this function succeeds. A database
 * commit failure can leave an unreferenced file; never delete it on an ambiguous commit.
 */
export async function storeEvidence(body: ReadableStream<Uint8Array> | null, options: { config?: EvidenceStorageConfig; expectedBytes?: number; signal?: AbortSignal } = {}): Promise<StoredEvidence> {
  const config = options.config ?? evidenceStorageConfig();
  if (!body || options.expectedBytes === 0 || (options.expectedBytes != null && (!Number.isSafeInteger(options.expectedBytes) || options.expectedBytes < 0))) throw new EvidenceStorageError("INVALID_FILE");
  if ((options.expectedBytes ?? 0) > config.maxBytes) throw new EvidenceStorageError("TOO_LARGE");
  const storageKey = `${config.namespace}/${randomUUID()}.bin`;
  const destination = storagePath(storageKey, config);
  const temporary = `${destination}.upload`;
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const reader = body.getReader();
  const checksum = createHash("sha256");
  let byteSize = 0;
  let closed = false;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (options.signal?.aborted) throw new EvidenceStorageError("INTERRUPTED");
      const next = await reader.read();
      if (options.signal?.aborted) throw new EvidenceStorageError("INTERRUPTED");
      if (next.done) break;
      byteSize += next.value.byteLength;
      if (byteSize > config.maxBytes) throw new EvidenceStorageError("TOO_LARGE");
      checksum.update(next.value);
      let offset = 0;
      while (offset < next.value.byteLength) {
        const { bytesWritten } = await file.write(next.value, offset, next.value.byteLength - offset);
        if (!bytesWritten) throw new Error("Evidence file write made no progress");
        offset += bytesWritten;
      }
    }
    if (!byteSize || (options.expectedBytes != null && options.expectedBytes !== byteSize)) throw new EvidenceStorageError("INVALID_FILE");
    await file.sync();
    await file.close(); closed = true;
    await rename(temporary, destination);
    const directory = await open(path.dirname(destination), "r");
    try { await directory.sync(); } finally { await directory.close(); }
    return { storageKey, byteSize, sha256: checksum.digest("hex") };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (!closed) await file.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/** Only used for a newly uploaded duplicate after its database transaction succeeds. */
export async function removeUnusedEvidence(file: StoredEvidence, config = evidenceStorageConfig()) {
  await unlink(storagePath(file.storageKey, config));
}

export async function readVerifiedEvidence(file: { storageKey: string | null; contentBase64: string | null; byteSize: number; sha256: string }, config = evidenceStorageConfig()): Promise<NonNullable<ConstructorParameters<typeof Response>[0]>> {
  if (!file.storageKey) {
    const bytes = Buffer.from(file.contentBase64 ?? "", "base64");
    if (bytes.length !== file.byteSize || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new EvidenceStorageError("INTEGRITY_FAILED");
    return bytes;
  }
  let handle: FileHandle | undefined;
  try {
    handle = await open(storagePath(file.storageKey, config), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== file.byteSize) throw new EvidenceStorageError("INTEGRITY_FAILED");
    const checksum = createHash("sha256");
    const buffer = Buffer.alloc(256 * 1024);
    let position = 0;
    while (position < stat.size) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, stat.size - position), position);
      if (!bytesRead) throw new EvidenceStorageError("INTEGRITY_FAILED");
      checksum.update(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    if (checksum.digest("hex") !== file.sha256) throw new EvidenceStorageError("INTEGRITY_FAILED");
    // Read the same open file descriptor after verification. Auto-close on end/cancel.
    return Readable.toWeb(handle.createReadStream({ start: 0, autoClose: true })) as ReadableStream<Uint8Array>;
  } catch {
    await handle?.close().catch(() => undefined);
    throw new EvidenceStorageError("INTEGRITY_FAILED");
  }
}
