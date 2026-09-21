import { z } from "zod";

export const stepFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,49}$/),
  label: z.string().trim().min(1).max(120),
  labelEn: z.string().trim().max(160).default(""),
  kind: z.enum(["text", "number", "datetime"]).default("text"),
  unit: z.string().trim().max(30).default(""),
  required: z.boolean().default(true),
  reuse: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("step"), nodeKey: z.string().min(1).max(64), fieldKey: z.string().min(1).max(50) }),
    z.object({ kind: z.literal("identity"), field: z.enum(["antibodyId", "chain", "lot"]), chain: z.enum(["HC", "LC"]).optional() }),
  ]).optional(),
}).refine(field => !field.reuse || field.kind === "text", "仅文字字段可以沿用身份或批次信息");
export const stepRecordSpecSchema = z.object({
  fields: z.array(stepFieldSchema).min(1).max(24).refine(fields => new Set(fields.map(field => field.key)).size === fields.length, "步骤记录字段标识不能重复"),
  requireAllSamples: z.boolean().default(true),
});
export const stepRecordRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  sampleIds: z.array(z.number().int().positive()).max(200),
  values: z.record(z.string().max(50), z.string().max(2000)),
})).max(200).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "步骤记录条目标识不能重复");
export type StepRecordSpec = z.infer<typeof stepRecordSpecSchema>;
export type StepRecordRow = z.infer<typeof stepRecordRowsSchema>[number];

export function validRecordTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) return false;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
}

/** Drafts can be incomplete, but may never refer to another run's samples or fields. */
export function stepRecordIssues(spec: StepRecordSpec, rows: StepRecordRow[], sampleIds: number[], complete: boolean) {
  const issues: string[] = [];
  const keys = new Set(spec.fields.map(field => field.key));
  if (complete && !rows.length) issues.push("请至少填写一条步骤记录");
  rows.forEach((row, index) => {
    if (new Set(row.sampleIds).size !== row.sampleIds.length || row.sampleIds.some(id => !sampleIds.includes(id))) issues.push("步骤记录只能关联本批输入样本，且不能重复");
    if (Object.keys(row.values).some(key => !keys.has(key))) issues.push("步骤记录包含方法未定义的字段");
    if (!complete) return;
    if (!row.sampleIds.length) issues.push(`第 ${index + 1} 条：请选择关联样本`);
    for (const field of spec.fields) {
      const value = (row.values[field.key] ?? "").trim();
      if (field.required && !value) issues.push(`第 ${index + 1} 条：请填写${field.label}`);
      if (value && field.kind === "number" && (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value)))) issues.push(`第 ${index + 1} 条：${field.label}必须是有效数值`);
      // ISO timestamps include the timezone so records from different sites remain comparable.
      if (value && field.kind === "datetime" && !validRecordTime(value)) issues.push(`第 ${index + 1} 条：${field.label}必须包含有效日期、时间和时区`);
    }
  });
  if (complete && spec.requireAllSamples && sampleIds.some(id => !rows.some(row => row.sampleIds.includes(id)))) issues.push("仍有本批样本未关联步骤记录");
  return issues;
}

export function latestStepRecord(events: { id: number; action: string; nodeKey: string | null; payload: string }[], nodeKey: string) {
  const event = [...events].reverse().find(event => event.nodeKey === nodeKey && ["save_step_record", "complete_step"].includes(event.action));
  const rows = event ? stepRecordRowsSchema.parse(JSON.parse(event.payload).records ?? []) : [];
  return { eventId: event?.id ?? null, rows };
}

export function stepRecordText(spec: StepRecordSpec, rows: StepRecordRow[], sampleName: (id: number) => string) {
  return rows.map((row, index) => [`#${index + 1} · ${row.sampleIds.map(sampleName).join(", ")}`, ...spec.fields.map(field => `${field.label}${field.labelEn ? ` / ${field.labelEn}` : ""}: ${row.values[field.key] || "—"}${field.unit ? ` ${field.unit}` : ""}`)].join("\n")).join("\n\n");
}
