import type { MethodSpec } from "./method";

type Definition = {
  workflow?: { visualizationSpec?: string | null };
  nodes: { nodeKey: string; label: string; type: string; params?: string | null; templateKey: string | null }[];
  edges: { sourceKey: string; targetKey: string; sourceHandle?: string | null }[];
  spec: MethodSpec;
};

function visualizationSignature(definition: Definition) {
  const raw = definition.workflow?.visualizationSpec;
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}
/** Compare scientific/execution meaning, excluding canvas positions and runtime state. */
export function methodDifferences(before: Definition | undefined, after: Definition) {
  const changes: { kind: "added" | "removed" | "changed" | "routing" | "batch" | "view"; label: string }[] = [];
  const signature = (node: Definition["nodes"][number], spec: MethodSpec) => JSON.stringify({ label: node.label, type: node.type, templateKey: node.templateKey, params: node.params, requirements: spec.nodes[node.nodeKey] });
  for (const node of after.nodes) {
    const previous = before?.nodes.find(n => n.nodeKey === node.nodeKey);
    if (!previous) changes.push({ kind: "added", label: node.label });
    else if (signature(previous, before!.spec) !== signature(node, after.spec)) changes.push({ kind: "changed", label: node.label });
  }
  for (const node of before?.nodes ?? []) if (!after.nodes.some(n => n.nodeKey === node.nodeKey)) changes.push({ kind: "removed", label: node.label });
  const routes = (definition: Definition) => definition.edges.map(e => `${e.sourceKey}:${e.sourceHandle ?? ""}>${e.targetKey}`).sort().join("|");
  if (before && routes(before) !== routes(after)) changes.push({ kind: "routing", label: "" });
  if (before && JSON.stringify({ ...before.spec, nodes: {} }) !== JSON.stringify({ ...after.spec, nodes: {} })) changes.push({ kind: "batch", label: "" });
  if (before && visualizationSignature(before) !== visualizationSignature(after)) {
    changes.push({ kind: "view", label: "" });
  }
  return changes;
}
