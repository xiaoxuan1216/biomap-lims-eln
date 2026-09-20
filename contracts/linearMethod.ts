import { validateRunGraph } from "./labRun";

/** Fail closed for branching, parallel, child and conditional graphs. */
export function linearMethodOrder(nodes: { nodeKey: string; type: string; childWorkflowId?: number | null }[], edges: { sourceKey: string; targetKey: string; sourceHandle?: string | null; targetHandle?: string | null }[]): string[] | null {
  if (!nodes.length) return edges.length ? null : [];
  if (nodes.some(node => node.type === "decision" || node.childWorkflowId) || edges.some(edge => edge.sourceHandle || edge.targetHandle)) return null;
  const graph = validateRunGraph(nodes, edges);
  if (!graph.valid || edges.length !== nodes.length - 1) return null;
  if (!graph.order.slice(1).every((key, index) => edges.some(edge => edge.sourceKey === graph.order[index] && edge.targetKey === key))) return null;
  return graph.order;
}
