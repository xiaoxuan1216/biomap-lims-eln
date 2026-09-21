import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { evidenceMetadataSchema } from "@contracts/runEvidence";
import { evidenceStorageConfig, readVerifiedEvidence, storeEvidence, type EvidenceStorageConfig } from "./evidenceStorage";

describe("streamed raw evidence", () => {
  let config: EvidenceStorageConfig;
  beforeEach(async () => { config = { root: await mkdtemp(path.join(tmpdir(), "biomap-evidence-test-")), namespace: "a".repeat(24), maxBytes: 8 * 1024 * 1024 }; });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(config.root, { recursive: true, force: true }); });
  it("supports a stable restore namespace while rejecting public directories and invalid limits", () => {
    vi.stubEnv("DATABASE_URL", "mysql://example:example@original/db");
    vi.stubEnv("BIOMAP_EVIDENCE_DIR", config.root);
    vi.stubEnv("BIOMAP_EVIDENCE_MAX_MB", "100");
    vi.stubEnv("BIOMAP_EVIDENCE_NAMESPACE", config.namespace);
    const original = evidenceStorageConfig();
    vi.stubEnv("DATABASE_URL", "mysql://example:example@restored/db_copy");
    expect(evidenceStorageConfig().namespace).toBe(original.namespace);
    vi.stubEnv("BIOMAP_EVIDENCE_DIR", "public/raw-data");
    expect(() => evidenceStorageConfig()).toThrow(/outside public/);
    vi.stubEnv("BIOMAP_EVIDENCE_DIR", "public/..private-data");
    expect(() => evidenceStorageConfig()).toThrow(/outside public/);
    vi.stubEnv("BIOMAP_EVIDENCE_DIR", config.root);
    vi.stubEnv("BIOMAP_EVIDENCE_MAX_MB", "0");
    expect(() => evidenceStorageConfig()).toThrow(/1 to 1024/);
  });
  it("round-trips a binary file larger than the old limit and detects same-size corruption", async () => {
    const bytes = Buffer.alloc(6 * 1024 * 1024, 137);
    const file = await storeEvidence(new Blob([bytes]).stream(), { config, expectedBytes: bytes.length });
    expect(file.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    const downloaded = await new Response(await readVerifiedEvidence({ ...file, contentBase64: null }, config)).arrayBuffer();
    expect(Buffer.from(downloaded).equals(bytes)).toBe(true);
    await writeFile(path.join(config.root, file.storageKey), Buffer.alloc(bytes.length, 42));
    await expect(readVerifiedEvidence({ ...file, contentBase64: null }, config)).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
  });
  it("enforces streamed size without trusting Content-Length and removes incomplete files", async () => {
    config.maxBytes = 4;
    await expect(storeEvidence(new Blob(["12345"]).stream(), { config })).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(await readdir(path.join(config.root, config.namespace))).toEqual([]);
    await expect(storeEvidence(new Blob(["abc"]).stream(), { config, expectedBytes: 4 })).rejects.toMatchObject({ code: "INVALID_FILE" });
    expect(await readdir(path.join(config.root, config.namespace))).toEqual([]);
    await expect(storeEvidence(new Blob([]).stream(), { config })).rejects.toMatchObject({ code: "INVALID_FILE" });
  });
  it("cancels an interrupted upload without exposing a partial final file", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ pull(stream) { stream.enqueue(new Uint8Array([1, 2, 3])); controller.abort(); } });
    await expect(storeEvidence(body, { config, signal: controller.signal })).rejects.toMatchObject({ code: "INTERRUPTED" });
    expect(await readdir(path.join(config.root, config.namespace))).toEqual([]);
  });
  it("preserves legacy files and rejects cross-workspace or traversal paths", async () => {
    const bytes = Buffer.from("existing signed evidence");
    const file = { storageKey: null, contentBase64: bytes.toString("base64"), byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    expect(await new Response(await readVerifiedEvidence(file, config)).text()).toBe(bytes.toString());
    for (const storageKey of ["../private.txt", `${"b".repeat(24)}/00000000-0000-0000-0000-000000000000.bin`]) {
      await expect(readVerifiedEvidence({ ...file, storageKey }, config)).rejects.toMatchObject({ code: "INTEGRITY_FAILED" });
    }
    expect(evidenceMetadataSchema.safeParse({ runId: 1, nodeKey: "identity", name: "../raw.txt" }).success).toBe(false);
    expect(evidenceMetadataSchema.safeParse({ runId: 1, nodeKey: "identity", name: "原始数据.csv" }).success).toBe(true);
  });
});
