import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { methodReleases, workflows, workflowNodes, workflowEdges } from "@db/schema";
import { methodPublicationIssues, parseMethodSpec, type MethodSpec } from "@contracts/method";
import type { DatabaseTransaction } from "../queries/labHelpers";

export type MethodSnapshot = {
  workflow: typeof workflows.$inferSelect;
  nodes: Array<typeof workflowNodes.$inferSelect>;
  edges: Array<typeof workflowEdges.$inferSelect>;
  spec: MethodSpec;
  origins: Record<string, { workflowId: number; nodeKey: string; path: string }>;
};
export const methodHash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Compile child methods once at submission; later edits can never drift a release. */
export async function compileMethod(tx: DatabaseTransaction, workflowId: number): Promise<MethodSnapshot> {
  const origins: MethodSnapshot["origins"] = {};
  async function expand(id: number, prefix: string, ancestors: number[]): Promise<MethodSnapshot> {
    if (ancestors.includes(id) || ancestors.length > 8) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "子方法循环引用或层级过深" });
    const [workflow] = await tx.select().from(workflows).where(eq(workflows.id, id)).limit(1).for("update");
    if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "方法不存在" });
    const sourceNodes = await tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, id));
    const sourceEdges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, id));
    const spec = parseMethodSpec(workflow.methodSpec);
    const nodes: MethodSnapshot["nodes"] = [];
    const edges: MethodSnapshot["edges"] = [];
    const compiledSpec: MethodSpec = { ...spec, materials: [...spec.materials], nodes: {} };
    const ports = new Map<string, { starts: string[]; ends: string[] }>();
    for (const node of sourceNodes) {
      const key = `${prefix}${node.nodeKey}`;
      if (key.length > 64) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "子方法步骤路径超过长度限制" });
      if (node.childWorkflowId) {
        if (node.type === "decision" || node.type === "timer") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "判断或等待步骤不能同时作为子方法容器，请拆分为独立步骤" });
        const child = await expand(node.childWorkflowId, `${key}/`, [...ancestors, id]);
        nodes.push(...child.nodes);
        edges.push(...child.edges);
        Object.assign(compiledSpec.nodes, child.spec.nodes);
        for (const requirement of child.spec.materials) {
          const same = compiledSpec.materials.find(rule => rule.unit === requirement.unit && [...rule.approvedSkus].sort().join(",") === [...requirement.approvedSkus].sort().join(","));
          if (same) { same.perBatch += requirement.perBatch; same.perSample += requirement.perSample; }
          else compiledSpec.materials.push({ ...requirement });
        }
        compiledSpec.layoutRequired ||= child.spec.layoutRequired;
        compiledSpec.minSamples = Math.max(compiledSpec.minSamples, child.spec.minSamples);
        compiledSpec.maxSamples = Math.min(compiledSpec.maxSamples, child.spec.maxSamples);
        ports.set(node.nodeKey, {
          starts: child.nodes.filter(n => !child.edges.some(e => e.targetKey === n.nodeKey)).map(n => n.nodeKey),
          ends: child.nodes.filter(n => !child.edges.some(e => e.sourceKey === n.nodeKey)).map(n => n.nodeKey),
        });
      } else {
        nodes.push({ ...node, nodeKey: key, status: "pending" });
        if (spec.nodes[node.nodeKey]) compiledSpec.nodes[key] = spec.nodes[node.nodeKey];
        origins[key] = { workflowId: id, nodeKey: node.nodeKey, path: key };
        ports.set(node.nodeKey, { starts: [key], ends: [key] });
      }
    }
    for (const edge of sourceEdges) {
      const from = ports.get(edge.sourceKey), to = ports.get(edge.targetKey);
      if (!from || !to) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "方法连线缺少步骤" });
      for (const sourceKey of from.ends) for (const targetKey of to.starts) {
        edges.push({ ...edge, edgeKey: `e${edges.length + 1}`, sourceKey, targetKey });
      }
    }
    if (nodes.length > 200) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "编译后的方法不能超过 200 步" });
    parseMethodSpec(JSON.stringify(compiledSpec));
    const issues = methodPublicationIssues(nodes, edges, compiledSpec);
    if (compiledSpec.minSamples > compiledSpec.maxSamples) issues.push("子方法样本数量范围不兼容");
    if (issues.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: issues.join("；") });
    return { workflow, nodes, edges: edges.map((edge, index) => ({ ...edge, edgeKey: `e${index + 1}` })), spec: compiledSpec, origins };
  }
  return expand(workflowId, "", []);
}

export async function publishedMethod(tx: Pick<DatabaseTransaction, "select">, workflowId: number, releaseId?: number | null, lock = false) {
  const query = tx.select().from(methodReleases).where(and(
    eq(methodReleases.workflowId, workflowId), eq(methodReleases.status, "published"),
    releaseId ? eq(methodReleases.id, releaseId) : undefined,
  )).orderBy(desc(methodReleases.version)).limit(1);
  const [release] = await (lock ? query.for("update") : query);
  if (!release) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "本方法尚无已发布版本，请由方法负责人检查并发布" });
  if (methodHash(release.snapshot) !== release.snapshotHash) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "方法版本完整性检查失败" });
  const snapshot = JSON.parse(release.snapshot) as MethodSnapshot;
  snapshot.workflow.updatedAt = new Date(snapshot.workflow.updatedAt);
  snapshot.spec = parseMethodSpec(JSON.stringify(snapshot.spec));
  const issues = methodPublicationIssues(snapshot.nodes, snapshot.edges, snapshot.spec);
  if (issues.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "方法版本无法执行：" + issues.join("；") });
  return { release, snapshot };
}

export function workflowGraphHash(workflow: typeof workflows.$inferSelect, nodes: Array<typeof workflowNodes.$inferSelect>, edges: Array<typeof workflowEdges.$inferSelect>) {
  return methodHash(JSON.stringify({ name: workflow.name, description: workflow.description, status: workflow.status, projectId: workflow.projectId,
    visualizationSpec: workflow.visualizationSpec,
    nodes: [...nodes].sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)).map(({ nodeKey, type, templateKey, label, owner, equipmentId, externalOrderItemId, config, params, posX, posY, childWorkflowId }) => ({ nodeKey, type, templateKey, label, owner, equipmentId, externalOrderItemId, config, params, posX, posY, childWorkflowId })),
    edges: [...edges].sort((a, b) => a.edgeKey.localeCompare(b.edgeKey)).map(({ edgeKey, sourceKey, targetKey, sourceHandle, label }) => ({ edgeKey, sourceKey, targetKey, sourceHandle, label })) }));
}
