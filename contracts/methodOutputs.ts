import { z } from "zod";

export const methodStageSchema = z.enum(["cloning", "expression", "purification", "characterization"]);
export const outputTypeSchema = z.enum(["plasmid", "cell_line", "protein", "antibody", "other"]);
export const measurementSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/),
  label: z.string().trim().min(1).max(120),
  labelEn: z.string().trim().max(120).default(""),
  kind: z.enum(["number", "text"]).default("number"),
  unit: z.string().trim().max(30).default(""),
  required: z.boolean().default(true),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
}).refine(value => value.min === undefined || value.max === undefined || value.min <= value.max, "结果指标范围无效");
export const methodOutputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  labelEn: z.string().trim().max(120).default(""),
  type: outputTypeSchema,
  unit: z.string().trim().min(1).max(20),
  minCount: z.number().int().min(1).max(200).default(1),
  maxCount: z.number().int().min(1).max(200).default(200),
  relation: z.enum(["assembled_from", "expressed_from", "purified_from", "aliquoted_from"]),
  requireAllInputs: z.boolean().default(true),
  requiresSequence: z.boolean().default(false),
  parentPolicy: z.enum(["selected_inputs", "same_antibody", "paired_hc_lc"]).default("selected_inputs"),
  requiredMetadata: z.array(z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,49}$/), label: z.string().trim().min(1).max(120), labelEn: z.string().trim().max(120).default("") })).max(30).default([]),
}).refine(value => value.minCount <= value.maxCount, "产物数量范围无效").refine(value => new Set(value.requiredMetadata.map(field => field.key)).size === value.requiredMetadata.length, "产物记录字段不能重复");

export const recordOutputSchema = z.object({
  runId: z.number().int().positive(), expectedRevision: z.number().int().min(0), idempotencyKey: z.string().uuid(),
  nodeKey: z.string().min(1).max(64), name: z.string().trim().min(1).max(255),
  quantity: z.number().positive().max(1e8).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7, "产物数量最多保留三位小数"),
  parentSampleIds: z.array(z.number().int().positive()).min(1).max(200),
  antibodyId: z.string().trim().min(1).max(100),
  chain: z.enum(["HC", "LC", "single", "paired"]).default("single"),
  metadata: z.record(z.string().max(50), z.string().max(2000)).default({}),
  evidenceId: z.number().int().positive(), locationId: z.number().int().positive(),
  sequenceId: z.number().int().positive().optional(),
  boxRow: z.number().int().positive().optional(), boxCol: z.number().int().positive().optional(),
  note: z.string().trim().min(1).max(2000),
});

export type Measurement = z.infer<typeof measurementSchema>;
export type MethodOutput = z.infer<typeof methodOutputSchema>;
export type RecordedOutput = { sampleId: number; nodeKey: string; antibodyId: string; chain: string };
export const defaultMeasurement: Measurement = { key: "result", label: "结果", labelEn: "Result", kind: "text", unit: "", required: true };

export function measurementIssue(rule: Measurement, value: string, unit: string, outcome: "pass" | "fail"): string | null {
  if (rule.key !== "result" && unit !== rule.unit) return "结果单位与方法要求不一致";
  if (rule.kind !== "number") return null;
  const numeric = value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return "此指标需要填写有效数值";
  if (outcome === "pass" && ((rule.min !== undefined && numeric < rule.min) || (rule.max !== undefined && numeric > rule.max))) return "结果超出方法批准范围，请标记异常并处理";
  return null;
}

export function outputParentIssue(policy: MethodOutput["parentPolicy"], antibodyId: string, parents: Array<{ antibodyId: string; chain: string }>): string | null {
  if (policy === "selected_inputs") return null;
  if (!parents.length || parents.some(parent => parent.antibodyId !== antibodyId)) return "产物与来源样本的抗体编号不一致";
  if (policy === "paired_hc_lc" && (parents.length !== 2 || parents.filter(parent => parent.chain === "HC").length !== 1 || parents.filter(parent => parent.chain === "LC").length !== 1)) return "表达批次必须对应同一抗体的一份重链和一份轻链质粒";
  return null;
}

export const stageSourceSchema = z.object({ runId: z.number().int().positive() });
export const nextMethodStage = { cloning: "expression", expression: "purification", purification: "characterization" } as const;
export function isNextMethodStage(current: string | null | undefined, next: string | null | undefined): boolean {
  return !!current && nextMethodStage[current as keyof typeof nextMethodStage] === next;
}
