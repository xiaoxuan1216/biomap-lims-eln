import { z } from "zod";
import { stageSourceSchema } from "./methodOutputs";
import { reworkSourceSchema } from "./runRecovery";
import { LAB_RUN_MODES, LAB_RUN_RESOURCE_ROLES, labRunParamValueSchema } from "./labRun";

export const runDraftPayloadSchema = z.object({
  workflowId: z.number().int().positive(),
  reworkSource: reworkSourceSchema.optional(),
  stageSource: stageSourceSchema.optional(),
  methodReleaseId: z.number().int().positive(),
  step: z.number().int().min(0).max(4),
  name: z.string().max(255).nullable(),
  purpose: z.string().max(10000),
  projectId: z.string().max(30).nullable(),
  operatorName: z.string().max(255),
  executionMode: z.enum(LAB_RUN_MODES),
  scheduledStart: z.string().max(40),
  scheduledEnd: z.string().max(40),
  selectedResources: z.record(z.string().regex(/^\d+$/), z.object({ role: z.enum(LAB_RUN_RESOURCE_ROLES), amount: z.number().min(0).max(1e9) })),
  sampleOrder: z.array(z.number().int().positive()).max(200).default([]),
  samplePlatePlanIds: z.array(z.number().int().positive()).max(20).optional(),
  cloningLayoutPlanId: z.number().int().positive().nullable(),
  skipCloningLayout: z.boolean(),
  nodeSetups: z.record(z.string().max(64), z.object({ equipmentId: z.string().max(30), params: z.record(z.string().max(100), labRunParamValueSchema), overrideReason: z.string().max(500) })),
  idempotencyKey: z.string().uuid(),
});
export type RunDraftPayload = z.infer<typeof runDraftPayloadSchema>;
