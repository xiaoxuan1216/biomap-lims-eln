import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { workflows, workflowNodes, workflowEdges, projects } from "@db/schema";
import { logActivity } from "./queries/labHelpers";
import { WORKFLOW_TEMPLATES } from "@contracts/workflow";

const NODE_TYPES = ["manual", "equipment", "decision", "data"] as const;
const NODE_STATUS = ["pending", "in_progress", "done", "skipped"] as const;

const nodeInput = z.object({
  nodeKey: z.string().min(1).max(64),
  type: z.enum(NODE_TYPES),
  templateKey: z.string().max(64).nullish(),
  label: z.string().min(1).max(255),
  owner: z.string().max(255).nullish(),
  equipmentId: z.number().nullish(),
  config: z.string().nullish(),
  posX: z.number(),
  posY: z.number(),
});

const edgeInput = z.object({
  edgeKey: z.string().min(1).max(64),
  sourceKey: z.string().min(1),
  targetKey: z.string().min(1),
  sourceHandle: z.string().max(16).nullish(),
  label: z.string().max(64).nullish(),
});

/** Kahn 拓扑排序检测环：返回 true 表示存在环（非 DAG） */
function hasCycle(nodeKeys: string[], edges: { sourceKey: string; targetKey: string }[]) {
  const indeg = new Map<string, number>(nodeKeys.map((k) => [k, 0]));
  const adj = new Map<string, string[]>(nodeKeys.map((k) => [k, []]));
  for (const e of edges) {
    if (!indeg.has(e.sourceKey) || !indeg.has(e.targetKey)) continue;
    indeg.set(e.targetKey, (indeg.get(e.targetKey) ?? 0) + 1);
    adj.get(e.sourceKey)!.push(e.targetKey);
  }
  const queue = nodeKeys.filter((k) => indeg.get(k) === 0);
  let visited = 0;
  while (queue.length) {
    const k = queue.shift()!;
    visited++;
    for (const t of adj.get(k) ?? []) {
      const d = (indeg.get(t) ?? 0) - 1;
      indeg.set(t, d);
      if (d === 0) queue.push(t);
    }
  }
  return visited !== nodeKeys.length;
}

async function instantiateTemplate(workflowId: number, templateKey: string) {
  const tpl = WORKFLOW_TEMPLATES.find((t) => t.key === templateKey);
  if (!tpl) return;
  const db = getDb();
  if (tpl.nodes.length) {
    await db.insert(workflowNodes).values(
      tpl.nodes.map((n) => ({
        workflowId,
        nodeKey: n.key,
        type: n.type,
        templateKey: n.templateKey ?? null,
        label: n.label,
        owner: n.owner ?? null,
        config: n.config ?? null,
        posX: n.x,
        posY: n.y,
      })),
    );
  }
  if (tpl.edges.length) {
    await db.insert(workflowEdges).values(
      tpl.edges.map((e, i) => ({
        workflowId,
        edgeKey: `e${i + 1}`,
        sourceKey: e.from,
        targetKey: e.to,
        sourceHandle: e.sourceHandle ?? null,
        label: e.label ?? null,
      })),
    );
  }
}

export const workflowRouter = createRouter({
  /** 业务流列表（含节点统计） */
  list: authedQuery.query(async () => {
    const db = getDb();
    const wfs = await db.select().from(workflows).orderBy(asc(workflows.id));
    const allNodes = await db.select().from(workflowNodes);
    return wfs.map((w) => {
      const ns = allNodes.filter((n) => n.workflowId === w.id);
      const active = ns.filter((n) => n.status !== "skipped");
      return {
        ...w,
        nodeCount: ns.length,
        doneCount: active.filter((n) => n.status === "done").length,
        activeCount: active.length,
        owners: [...new Set(ns.map((n) => n.owner).filter(Boolean))] as string[],
      };
    });
  }),

  /** 业务流详情（含节点与边） */
  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, input.id) });
    if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });
    const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, input.id));
    const edges = await db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, input.id));
    let projectName: string | null = null;
    if (wf.projectId) {
      const p = await db.query.projects.findFirst({ where: eq(projects.id, wf.projectId) });
      projectName = p?.name ?? null;
    }
    return { ...wf, projectName, nodes, edges };
  }),

  /** 预置模板清单 */
  templates: authedQuery.query(() =>
    WORKFLOW_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      nodeCount: t.nodes.length,
    })),
  ),

  /** 创建业务流（可从模板实例化） */
  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        projectId: z.number().nullish(),
        templateKey: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [{ id }] = await db
        .insert(workflows)
        .values({
          name: input.name,
          description: input.description ?? null,
          projectId: input.projectId ?? null,
          status: "draft",
          createdByName: ctx.user.name ?? "未知用户",
        })
        .$returningId();
      if (input.templateKey) await instantiateTemplate(id, input.templateKey);
      await logActivity({
        userName: ctx.user.name ?? "未知用户",
        action: "创建了业务流",
        entityType: "workflow",
        entityId: id,
        entityName: input.name,
      });
      return { id };
    }),

  /** 更新基本信息 */
  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().nullish(),
        status: z.enum(["draft", "active", "completed", "archived"]).optional(),
        projectId: z.number().nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await getDb()
        .update(workflows)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(workflows.id, id));
      return { ok: true };
    }),

  /** 保存整张图（节点 + 边，全量替换；含 DAG 环校验，保留节点执行状态） */
  saveGraph: authedQuery
    .input(z.object({ id: z.number(), nodes: z.array(nodeInput), edges: z.array(edgeInput) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, input.id) });
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });

      const keys = input.nodes.map((n) => n.nodeKey);
      if (new Set(keys).size !== keys.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "节点标识重复" });
      }
      for (const e of input.edges) {
        if (!keys.includes(e.sourceKey) || !keys.includes(e.targetKey)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "存在指向未知节点的连线" });
        }
      }
      if (hasCycle(keys, input.edges)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "图中存在循环依赖，业务流必须是有向无环图（DAG）" });
      }

      // 保留各节点已有执行状态
      const existing = await db
        .select()
        .from(workflowNodes)
        .where(eq(workflowNodes.workflowId, input.id));
      const statusByKey = new Map(existing.map((n) => [n.nodeKey, n.status]));

      await db.delete(workflowEdges).where(eq(workflowEdges.workflowId, input.id));
      await db.delete(workflowNodes).where(eq(workflowNodes.workflowId, input.id));
      if (input.nodes.length) {
        await db.insert(workflowNodes).values(
          input.nodes.map((n) => ({
            workflowId: input.id,
            nodeKey: n.nodeKey,
            type: n.type,
            templateKey: n.templateKey ?? null,
            label: n.label,
            owner: n.owner || null,
            equipmentId: n.equipmentId ?? null,
            config: n.config ?? null,
            status: statusByKey.get(n.nodeKey) ?? "pending",
            posX: Math.round(n.posX),
            posY: Math.round(n.posY),
          })),
        );
      }
      if (input.edges.length) {
        await db.insert(workflowEdges).values(
          input.edges.map((e) => ({
            workflowId: input.id,
            edgeKey: e.edgeKey,
            sourceKey: e.sourceKey,
            targetKey: e.targetKey,
            sourceHandle: e.sourceHandle ?? null,
            label: e.label ?? null,
          })),
        );
      }
      await db.update(workflows).set({ updatedAt: new Date() }).where(eq(workflows.id, input.id));
      await logActivity({
        userName: ctx.user.name ?? "未知用户",
        action: "更新了业务流图",
        entityType: "workflow",
        entityId: input.id,
        entityName: wf.name,
        detail: `${input.nodes.length} 个节点 · ${input.edges.length} 条连线`,
      });
      return { ok: true };
    }),

  /** 更新单个节点执行状态 */
  updateNodeStatus: authedQuery
    .input(z.object({ nodeId: z.number(), status: z.enum(NODE_STATUS) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const node = await db.query.workflowNodes.findFirst({ where: eq(workflowNodes.id, input.nodeId) });
      if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "节点不存在" });
      await db.update(workflowNodes).set({ status: input.status }).where(eq(workflowNodes.id, input.nodeId));
      const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, node.workflowId) });
      await logActivity({
        userName: ctx.user.name ?? "未知用户",
        action: "更新了业务流节点状态",
        entityType: "workflow",
        entityId: node.workflowId,
        entityName: wf?.name ?? "",
        detail: `节点「${node.label}」→ ${input.status}`,
      });
      return { ok: true };
    }),

  /** 删除业务流 */
  remove: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    await db.delete(workflowEdges).where(eq(workflowEdges.workflowId, input.id));
    await db.delete(workflowNodes).where(eq(workflowNodes.workflowId, input.id));
    await db.delete(workflows).where(eq(workflows.id, input.id));
    return { ok: true };
  }),
});
