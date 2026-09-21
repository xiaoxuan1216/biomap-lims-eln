import { z } from "zod";
import { stepRecordSpecSchema } from "./stepRecords";
import { measurementSchema, methodOutputSchema, methodStageSchema, outputTypeSchema } from "./methodOutputs";
import { parseDriverTemplateKey } from "./deviceDriver";
import { validateRunGraph } from "./labRun";
import { precedingSteps } from "./stepRecordReuse";

const parameterPolicySchema = z.object({
  adjustable: z.boolean().default(false),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
}).refine(value => value.min === undefined || value.max === undefined || value.min <= value.max, "参数上下限无效");
export const methodNodeSpecSchema = z.object({
  input: z.string().trim().max(2000).default(""),
  output: z.string().trim().max(2000).default(""),
  completion: z.string().trim().max(2000).default(""),
  record: stepRecordSpecSchema.nullable().default(null),
  evidenceRequired: z.boolean().default(true),
  equipmentIds: z.array(z.number().int().positive()).max(100).default([]),
  qualification: z.string().trim().max(2000).default(""),
  manualAllowed: z.boolean().default(false),
  resultRequired: z.boolean().default(false),
  resultsOn: z.enum(["inputs", "outputs"]).default("inputs"),
  measurements: z.array(measurementSchema).max(30).default([]).refine(rows => new Set(rows.map(row => row.key)).size === rows.length, "结果指标键不能重复"),
  produces: methodOutputSchema.nullable().default(null),
  parameters: z.record(z.string(), parameterPolicySchema).default({}),
  waitMinutes: z.number().min(0).max(10080).optional(),
});
export const methodSpecSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  stage: methodStageSchema.nullable().default(null),
  protocol: z.object({ reference: z.string().trim().min(1).max(200), version: z.string().trim().min(1).max(80), sourceUrl: z.string().url().optional() }).nullable().default(null),
  inputTypes: z.array(outputTypeSchema).default([]),
  layoutRequired: z.boolean().default(false),
  minSamples: z.number().int().min(1).max(200).default(1),
  maxSamples: z.number().int().min(1).max(200).default(200),
  materials: z.array(z.object({
    name: z.string().trim().min(1).max(255),
    approvedSkus: z.array(z.string().trim().min(1).max(30)).min(1).max(100),
    unit: z.string().trim().min(1).max(20),
    perBatch: z.number().min(0).max(1e6),
    perSample: z.number().min(0).max(1e6),
  }).refine(rule => rule.perBatch + rule.perSample > 0, "物料用量必须大于零")).max(100).default([]),
  nodes: z.record(z.string().min(1).max(64), methodNodeSpecSchema).default({}),
}).refine(value => value.minSamples <= value.maxSamples, "样本数量范围无效").refine(value => {
  const skus = value.materials.flatMap(rule => rule.approvedSkus);
  return new Set(skus).size === skus.length;
}, "物料要求不能重复使用同一库存编号，请合并用量");
export type MethodSpec = z.infer<typeof methodSpecSchema>;
export type MethodNodeSpec = z.infer<typeof methodNodeSpecSchema>;
export function methodMaterialDemand(spec: MethodSpec, sampleCount: number, selected: { sku: string; unit: string; role: string; amount: number }[]) {
  return (spec.materials ?? []).map(rule => {
    const required = Math.ceil((rule.perBatch + rule.perSample * sampleCount) * 1000) / 1000;
    const allocated = selected.filter(item => item.role === "material" && item.unit === rule.unit && rule.approvedSkus.includes(item.sku)).reduce((sum, item) => sum + item.amount, 0);
    return { ...rule, required, allocated, missing: Math.max(0, Math.round((required - allocated) * 1000) / 1000) };
  });
}
export function parseMethodSpec(raw: string | null | undefined): MethodSpec {
  if (!raw) return methodSpecSchema.parse({});
  // Corruption is an error, never an implicit permissive policy.
  return methodSpecSchema.parse(JSON.parse(raw));
}

type Candidate = { id: number; status: string; binding?: {
  enabled: boolean; driverKey: string; driverVersion: string; mode: string; status: string;
} | null };
export function assessMethodEquipment(
  node: { templateKey: string | null }, device: Candidate,
  spec: MethodNodeSpec | undefined, mode: "simulation" | "edge" | "manual",
): { compatible: boolean; reason: string } {
  if (["maintenance", "fault"].includes(device.status)) return { compatible: false, reason: "设备当前不可用" };
  if (!spec?.equipmentIds.includes(device.id) || !spec.qualification.trim()) {
    return { compatible: false, reason: "此设备尚未通过本方法的适配确认" };
  }
  if (mode === "manual" && !spec.manualAllowed) return { compatible: false, reason: "本步骤未批准人工执行" };
  const ref = parseDriverTemplateKey(node.templateKey);
  if (mode !== "manual" && ref) {
    const binding = device.binding;
    if (!binding?.enabled || binding.driverKey !== ref.driverKey || binding.driverVersion !== ref.version ||
      binding.mode !== mode || binding.status !== (mode === "simulation" ? "simulation_ready" : "ready")) {
      return { compatible: false, reason: "设备连接尚未满足本次执行要求" };
    }
  }
  if (mode === "edge" && !ref) return { compatible: false, reason: "本步骤尚未配置自动执行能力" };
  return { compatible: true, reason: "已通过方法适配确认" };
}

export function methodParameterIssues(
  baseline: Record<string, string | number | boolean>,
  submitted: Record<string, string | number | boolean>, spec: MethodNodeSpec | undefined,
): string[] {
  const issues: string[] = [];
  for (const [key, value] of Object.entries(submitted)) {
    const policy = spec?.parameters[key];
    if (value !== baseline[key] && !policy?.adjustable) issues.push(`固定参数不可修改：${key}`);
    if (policy?.adjustable && typeof value === "number" &&
      ((policy.min !== undefined && value < policy.min) || (policy.max !== undefined && value > policy.max))) {
      issues.push(`参数超出方法允许范围：${key}`);
    }
  }
  return issues;
}

export function methodPublicationIssues(
  nodes: readonly { nodeKey: string; label: string; type: string; templateKey: string | null; childWorkflowId?: number | null }[],
  edges: readonly { sourceKey: string; targetKey: string; sourceHandle?: string | null }[], spec: MethodSpec,
): string[] {
  const graph = validateRunGraph(nodes, edges);
  const issues = graph.valid ? [] : [graph.error];
  if (spec.stage && !spec.protocol) issues.push("请填写该研发阶段使用的 SOP 编号和版本");
  for (const node of nodes) {
    const rule = spec.nodes[node.nodeKey];
    const preceding = precedingSteps(node.nodeKey, edges);
    for (const field of rule?.record?.fields ?? []) {
      const source = field.reuse;
      if (source?.kind === "step" && (!preceding.has(source.nodeKey) || !spec.nodes[source.nodeKey]?.record?.fields.some(candidate => candidate.key === source.fieldKey && candidate.kind === "text"))) issues.push(`${node.label}：批次信息来源必须是前序步骤的文字字段`);
    }
    if (rule && !rule.evidenceRequired && !rule.record && ["data", "equipment"].includes(node.type)) issues.push(`${node.label}：请配置步骤记录或要求原始文件`);
    if (rule?.resultsOn === "outputs" && !rule.produces) issues.push(`${node.label}：产物结果必须声明产物要求`);
    if (rule?.produces && rule.measurements.length && !rule.measurements.some(metric => metric.required)) issues.push(`${node.label}：产物至少需要一个必填结果指标`);
    if (rule?.produces && (!rule.resultRequired || rule.resultsOn !== "outputs")) issues.push(`${node.label}：产物必须有逐产物结果复核要求`);
    if (!rule?.input || !rule.output || !rule.completion) issues.push(`${node.label}：请填写输入、输出和完成标准`);
    if (node.type === "equipment" && (!rule?.equipmentIds.length || !rule.qualification)) {
      issues.push(`${node.label}：请确认适配设备及验证依据`);
    }
    if (node.type === "timer" && rule?.waitMinutes === undefined) issues.push(`${node.label}：请设置等待时长`);
    if (node.type === "decision") {
      const branches = edges.filter(edge => edge.sourceKey === node.nodeKey).map(edge => edge.sourceHandle);
      if (!branches.includes("yes") || !branches.includes("no") || branches.some(b => b !== "yes" && b !== "no")) {
        issues.push(`${node.label}：判断步骤必须包含明确的是/否分支`);
      }
    }
  }
  return issues;
}
