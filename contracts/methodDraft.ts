import { z } from "zod";
import { stepFieldSchema } from "./stepRecords";
import { measurementSchema, methodOutputSchema } from "./methodOutputs";
import { methodNodeSpecSchema, methodSpecSchema } from "./method";

// A recoverable draft may contain unfinished fields and temporarily inverted
// ranges. Execution/publication still use the strict methodSpecSchema.
export const methodRequirementsDraftSchema = z.object({
  format: z.literal(1),
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
  graphHash: z.string().regex(/^[a-f0-9]{64}$/),
  spec: z.object({
    schemaVersion: z.literal(1),
    stage: methodSpecSchema.shape.stage,
    protocol: z.object({ reference: z.string(), version: z.string(), sourceUrl: z.string().optional() }).nullable().default(null),
    inputTypes: methodSpecSchema.shape.inputTypes,
    layoutRequired: z.boolean(),
    minSamples: z.number().finite(),
    maxSamples: z.number().finite(),
    materials: z.array(z.object({
      name: z.string(), unit: z.string(), approvedSkus: z.array(z.string()),
      perBatch: z.number().finite(), perSample: z.number().finite(),
    })).max(100),
    nodes: z.record(z.string(), z.object({
      ...methodNodeSpecSchema.shape,
      record: z.object({ fields: z.array(z.object({ ...stepFieldSchema.shape, key: z.string(), label: z.string() })).max(24), requireAllSamples: z.boolean() }).nullable().default(null),
      measurements: z.array(z.object({ ...measurementSchema.shape, key: z.string(), label: z.string() })).max(30).default([]),
      produces: z.object({ ...methodOutputSchema.shape, label: z.string(), unit: z.string(), minCount: z.number().finite(), maxCount: z.number().finite(), requiredMetadata: z.array(z.object({ key: z.string(), label: z.string(), labelEn: z.string().default("") })).max(30).default([]) }).nullable().default(null),
      waitMinutes: z.number().finite().optional(),
      parameters: z.record(z.string(), z.object({
        adjustable: z.boolean(), min: z.number().finite().optional(), max: z.number().finite().optional(),
      })),
    })),
  }),
});
export type MethodRequirementsDraft = z.infer<typeof methodRequirementsDraftSchema>;

export function readMethodRequirementsDraft(raw: string | null): MethodRequirementsDraft | null {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const result = methodRequirementsDraftSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch { return null; }
}
