import { z } from "zod";

export const sampleIdentityInput = z.object({
  sampleId: z.number().int().positive(),
  source: z.enum(["external", "historical"]),
  sourceReference: z.string().trim().min(1).max(1000),
  lot: z.string().trim().min(1).max(200),
  antibodyId: z.string().trim().min(1).max(100),
  chain: z.enum(["HC", "LC", "single", "paired"]),
  sequenceId: z.number().int().positive().optional(),
  verification: z.string().trim().min(1).max(4000),
  requestKey: z.string().uuid(),
});
export const sampleIdentityReviewInput = z.object({
  id: z.number().int().positive(),
  decision: z.enum(["approve", "reject", "retire"]),
  note: z.string().trim().min(1).max(2000),
  requestKey: z.string().uuid(),
});
export type FrozenSampleIdentity = {
  sampleId: number; antibodyId: string; chain: string;
  origin: "run_output" | "external" | "historical";
  originId: number; sourceReference: string; lot: string;
  sequenceSnapshot?: { id: number; name: string; sha256: string; sequence: string } | null;
};
