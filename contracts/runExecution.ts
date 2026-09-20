import { z } from "zod";
import { stepRecordRowsSchema } from "./stepRecords";
import type { MethodNodeSpec } from "./method";
import { defaultMeasurement } from "./methodOutputs";
import { validateRunGraph, type LabRunNodeStatus } from "./labRun";

export type ExecutionNode = { nodeKey: string; type: string; status: LabRunNodeStatus };
export type ExecutionEdge = { sourceKey: string; targetKey: string; sourceHandle?: string | null };
/** AND dependency joins, with unselected decision branches explicitly excluded. */
export function settleExecutionGraph(nodes: ExecutionNode[], edges: ExecutionEdge[], decisions: Record<string, "yes" | "no">) {
  const graph = validateRunGraph(nodes, edges);
  if (!graph.valid) throw new Error(graph.error);
  if (nodes.some(node => node.type === "decision" && node.status === "completed" && !decisions[node.nodeKey])) throw new Error("已完成的判断步骤缺少分支结论");
  const status = new Map(nodes.map(node => [node.nodeKey, node.status]));
  const types = new Map(nodes.map(node => [node.nodeKey, node.type]));
  const started: string[] = [], skipped: string[] = [];
  for (const key of graph.order) {
    if (status.get(key) !== "pending") continue;
    const incoming = edges.filter(edge => edge.targetKey === key);
    if (!incoming.every(edge => ["completed", "skipped"].includes(status.get(edge.sourceKey) ?? ""))) continue;
    const reachable = !incoming.length || incoming.some(edge => {
      if (status.get(edge.sourceKey) === "skipped") return false;
      if (types.get(edge.sourceKey) !== "decision") return true;
      const outcome = decisions[edge.sourceKey];
      if (!outcome) throw new Error("已完成的判断步骤缺少分支结论");
      return edge.sourceHandle === outcome;
    });
    status.set(key, reachable ? "running" : "skipped");
    (reachable ? started : skipped).push(key);
  }
  return { status, started, skipped };
}

export const executionActionSchema = z.object({
  runId: z.number().int().positive(),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
  action: z.enum(["start", "complete_step", "save_step_record", "pause", "resume", "handoff", "submit_review", "approve_results", "return_results", "request_equipment", "approve_equipment"]),
  records: stepRecordRowsSchema.optional(),
  expectedRecordEventId: z.number().int().positive().nullable().optional(),
  nodeKey: z.string().min(1).max(64).optional(),
  equipmentId: z.number().int().positive().optional(),
  requestEventId: z.number().int().positive().optional(),
  note: z.string().trim().min(1).max(5000),
  decision: z.enum(["yes", "no"]).optional(),
  ownerId: z.number().int().positive().optional(),
  evidenceIds: z.array(z.number().int().positive()).max(20).default([]),
  reconcile: z.boolean().default(false),
  expectedExperimentRevision: z.number().int().positive().optional(),
});

export function missingRunResults(nodes: ExecutionNode[], edges: ExecutionEdge[], sampleIds: number[], requiredKeys: string[], results: { nodeKey: string; sampleId: number; metricKey?: string }[], rules: Record<string, MethodNodeSpec> = {}, outputs: { nodeKey: string; sampleId: number; status: string }[] = []) {
  const expected = nodes.filter(node => node.status === "completed" && (requiredKeys.length ? requiredKeys.includes(node.nodeKey) : !edges.some(edge => edge.sourceKey === node.nodeKey)));
  return expected.flatMap(node => {
    const rule = rules[node.nodeKey];
    const targets = rule?.resultsOn === "outputs" ? outputs.filter(output => output.nodeKey === node.nodeKey && output.status !== "voided").map(output => output.sampleId) : sampleIds;
    const metrics = rule?.measurements?.length ? rule.measurements.filter(metric => metric.required) : [defaultMeasurement];
    return targets.flatMap(sampleId => metrics.filter(metric => !results.some(result => result.nodeKey === node.nodeKey && result.sampleId === sampleId && (result.metricKey ?? "result") === metric.key)).map(metric => ({ nodeKey: node.nodeKey, sampleId, ...(metric.key === "result" ? {} : { metricKey: metric.key }) })));
  });
}
export const resultInputSchema = z.object({
  runId: z.number().int().positive(),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
  nodeKey: z.string().min(1).max(64),
  sampleId: z.number().int().positive(),
  metricKey: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/).default("result"),
  outcome: z.enum(["pass", "fail"]),
  value: z.string().trim().min(1).max(10000),
  unit: z.string().trim().max(50).default(""),
  evidenceId: z.number().int().positive(),
  note: z.string().trim().min(1).max(2000),
});
