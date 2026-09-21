import { z } from "zod";

export const evidenceMetadataSchema = z.object({
  runId: z.coerce.number().int().positive(),
  nodeKey: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(255).refine(value => !/[\\/]/.test(value) && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), "Invalid file name"),
});

export type EvidenceMetadata = z.infer<typeof evidenceMetadataSchema>;
export const LEGACY_EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_EVIDENCE_MAX_MB = 100;
