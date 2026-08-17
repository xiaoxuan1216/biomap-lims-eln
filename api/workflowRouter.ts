import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { adminQuery, authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  externalOrderItems,
  externalOrders,
  projects,
  serviceProviders,
  workflows,
  workflowEdges,
  workflowNodes,
} from "@db/schema";
import { appendActivity, logActivity } from "./queries/labHelpers";
import { WORKFLOW_TEMPLATES, SUBFLOW_TEMPLATES, templateScenario } from "@contracts/workflow";
import { en } from "@/i18n/en";

/** 实例化模板时的英文翻译：优先 en 词典，其次人名映射，未命中保留原文 */
const OWNER_EN: Record<string, string> = {
  王工: "Wang",
  李工: "Li",
  张工: "Zhang",
  赵工: "Zhao",
  陈研究员: "Dr. Chen",
  公共: "Shared",
  演示用户: "Demo User",
};
export function trForLang(s: string, lang?: string): string {
  if (lang !== "en" || !s) return s;
  return en[s] ?? OWNER_EN[s] ?? s;
}
function trParams(params: Record<string, string | number> | undefined, lang?: string) {
  if (!params) return params;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === "string" ? trForLang(v, lang) : v;
  return out;
}

const NODE_TYPES = ["manual", "equipment", "decision", "data", "timer", "external"] as const;
const NODE_STATUS = ["pending", "in_progress", "done", "skipped"] as const;

const nodeInput = z.object({
  nodeKey: z.string().min(1).max(64),
  type: z.enum(NODE_TYPES),
  templateKey: z.string().max(64).nullish(),
  label: z.string().min(1).max(255),
  owner: z.string().max(255).nullish(),
  equipmentId: z.number().nullish(),
  externalOrderItemId: z.number().nullish(),
  config: z.string().nullish(),
  params: z.string().nullish(),
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

export async function instantiateTemplate(workflowId: number, templateKey: string, lang?: string) {
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
        label: trForLang(n.label, lang),
        owner: trForLang(n.owner ?? "", lang) || null,
        config: n.config ? trForLang(n.config, lang) : null,
        params: n.params ? JSON.stringify(trParams(n.params, lang)) : null,
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
        label: e.label ? trForLang(e.label, lang) : null,
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

  /** 业务流详情（含节点与边；附子流程摘要与父级面包屑） */
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
    const externalItemIds = [...new Set(nodes.map((node) => node.externalOrderItemId).filter(Boolean))] as number[];
    const externalRows = externalItemIds.length
      ? await db
          .select({
            itemId: externalOrderItems.id,
            itemName: externalOrderItems.name,
            itemStatus: externalOrderItems.status,
            orderId: externalOrders.id,
            orderNo: externalOrders.orderNo,
            orderTitle: externalOrders.title,
            expectedDeliveryDate: externalOrders.expectedDeliveryDate,
            providerName: serviceProviders.name,
          })
          .from(externalOrderItems)
          .innerJoin(externalOrders, eq(externalOrderItems.orderId, externalOrders.id))
          .innerJoin(serviceProviders, eq(externalOrders.providerId, serviceProviders.id))
          .where(inArray(externalOrderItems.id, externalItemIds))
      : [];
    const externalByItem = new Map(externalRows.map((row) => [row.itemId, row]));

    // 子流程摘要：节点 → 子业务流（名称 / 进度）
    const childIds = [...new Set(nodes.map((n) => n.childWorkflowId).filter(Boolean))] as number[];
    const subflows: Record<number, { id: number; name: string; nodeCount: number; doneCount: number }> = {};
    if (childIds.length) {
      const childWfs = await db.select().from(workflows);
      const childNodes = await db.select().from(workflowNodes);
      for (const cid of childIds) {
        const cw = childWfs.find((w) => w.id === cid);
        if (!cw) continue;
        const cns = childNodes.filter((n) => n.workflowId === cid);
        subflows[cid] = {
          id: cid,
          name: cw.name,
          nodeCount: cns.length,
          doneCount: cns.filter((n) => n.status === "done").length,
        };
      }
    }
    // 父级面包屑（当前流程是子流程时）
    let parent: { workflowId: number; workflowName: string; nodeLabel: string | null } | null = null;
    if (wf.parentWorkflowId) {
      const pw = await db.query.workflows.findFirst({ where: eq(workflows.id, wf.parentWorkflowId) });
      const pn = wf.parentNodeId
        ? await db.query.workflowNodes.findFirst({ where: eq(workflowNodes.id, wf.parentNodeId) })
        : null;
      if (pw) parent = { workflowId: pw.id, workflowName: pw.name, nodeLabel: pn?.label ?? null };
    }
    return {
      ...wf,
      projectName,
      nodes: nodes.map((node) => ({
        ...node,
        externalOrder: node.externalOrderItemId ? externalByItem.get(node.externalOrderItemId) ?? null : null,
      })),
      edges,
      subflows,
      parent,
    };
  }),

  /** 创建子流程：在指定节点下挂接一张物理执行层子 DAG（可按子流程模板预填） */
  createSubflow: writeQuery
    .input(
      z.object({
        nodeId: z.number(),
        name: z.string().max(255).optional(),
        lang: z.enum(["zh", "en"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async (db) => {
      const [node] = await db
        .select()
        .from(workflowNodes)
        .where(eq(workflowNodes.id, input.nodeId))
        .limit(1)
        .for("update");
      if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "节点不存在" });
      if (node.childWorkflowId) throw new TRPCError({ code: "BAD_REQUEST", message: "该节点已挂接子流程" });
      const parentWf = await db.query.workflows.findFirst({ where: eq(workflows.id, node.workflowId) });
      if (!parentWf) throw new TRPCError({ code: "NOT_FOUND", message: "父业务流不存在" });
      const tpl = node.templateKey ? SUBFLOW_TEMPLATES[node.templateKey] : undefined;
      const name =
        input.name?.trim() ||
        (tpl ? trForLang(tpl.name, input.lang) : `${node.label} · ${input.lang === "en" ? "Sub-flow" : "子流程"}`);
      const [{ id }] = await db
        .insert(workflows)
        .values({
          name,
          description: tpl ? trForLang(tpl.description, input.lang) : null,
          scenario: parentWf.scenario,
          status: "active",
          projectId: parentWf.projectId ?? null,
          parentWorkflowId: parentWf.id,
          parentNodeId: node.id,
          createdByName: ctx.user.name ?? "未知用户",
        })
        .$returningId();
      if (tpl) {
        await db.insert(workflowNodes).values(
          tpl.nodes.map((n) => ({
            workflowId: id,
            nodeKey: n.key,
            type: n.type,
            templateKey: n.templateKey ?? null,
            label: trForLang(n.label, input.lang),
            owner: trForLang(n.owner ?? "", input.lang) || null,
            config: n.config ? trForLang(n.config, input.lang) : null,
            params: n.params ? JSON.stringify(trParams(n.params, input.lang)) : null,
            posX: n.x,
            posY: n.y,
          })),
        );
        await db.insert(workflowEdges).values(
          tpl.edges.map((e, i) => ({
            workflowId: id,
            edgeKey: `e${i + 1}`,
            sourceKey: e.from,
            targetKey: e.to,
            sourceHandle: e.sourceHandle ?? null,
            label: e.label ? trForLang(e.label, input.lang) : null,
          })),
        );
      }
      await db.update(workflowNodes).set({ childWorkflowId: id }).where(eq(workflowNodes.id, node.id));
      await appendActivity(db, {
        userId: ctx.user.id,
        userName: ctx.user.name ?? "未知用户",
        action: "创建了子流程",
        entityType: "workflow",
        entityId: id,
        entityName: name,
        detail: `父流程「${parentWf.name}」节点「${node.label}」`,
      });
      return { id };
      });
    }),

  /** 节点是否有可用的子流程模板 */
  subflowTemplateFor: authedQuery.input(z.object({ nodeId: z.number() })).query(async ({ input }) => {
    const node = await getDb().query.workflowNodes.findFirst({ where: eq(workflowNodes.id, input.nodeId) });
    const tpl = node?.templateKey ? SUBFLOW_TEMPLATES[node.templateKey] : undefined;
    return tpl ? { key: tpl.key, name: tpl.name, nodeCount: tpl.nodes.length } : null;
  }),

  /** 预置模板清单 */
  templates: authedQuery.query(() =>
    WORKFLOW_TEMPLATES.map((t) => ({
      key: t.key,
      name: t.name,
      description: t.description,
      group: t.group,
      nodeCount: t.nodes.length,
    })),
  ),

  /** 创建业务流（可从模板实例化） */
  create: writeQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        projectId: z.number().nullish(),
        experimentId: z.number().nullish(),
        templateKey: z.string().nullish(),
        scenario: z.enum(["synbio", "antibody"]).optional(),
        lang: z.enum(["zh", "en"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const tpl = input.templateKey ? WORKFLOW_TEMPLATES.find((t) => t.key === input.templateKey) : undefined;
      const [{ id }] = await db
        .insert(workflows)
        .values({
          name: input.name,
          description: input.description ?? (tpl ? trForLang(tpl.description, input.lang) : null),
          projectId: input.projectId ?? null,
          experimentId: input.experimentId ?? null,
          scenario: input.scenario ?? (tpl ? templateScenario(tpl.group) : "synbio"),
          status: "draft",
          createdByName: ctx.user.name ?? "未知用户",
        })
        .$returningId();
      if (input.templateKey) await instantiateTemplate(id, input.templateKey, input.lang);
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
  update: writeQuery
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
  saveGraph: writeQuery
    .input(z.object({ id: z.number(), nodes: z.array(nodeInput), edges: z.array(edgeInput) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
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
      return db.transaction(async (tx) => {
        const [wf] = await tx
          .select()
          .from(workflows)
          .where(eq(workflows.id, input.id))
          .limit(1)
          .for("update");
        if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });

        const existingNodes = await tx
          .select()
          .from(workflowNodes)
          .where(eq(workflowNodes.workflowId, input.id));
        const nodesByKey = new Map(existingNodes.map((node) => [node.nodeKey, node]));
        const removedNodes = existingNodes.filter((node) => !keys.includes(node.nodeKey));
        const linkedRemovedNode = removedNodes.find((node) => node.childWorkflowId);
        if (linkedRemovedNode) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `节点“${linkedRemovedNode.label}”仍挂接子流程，不能从图中删除`,
          });
        }

        for (const node of input.nodes) {
          const values = {
            type: node.type,
            templateKey: node.templateKey ?? null,
            label: node.label,
            owner: node.owner || null,
            equipmentId: node.equipmentId ?? null,
            externalOrderItemId: node.externalOrderItemId ?? null,
            config: node.config ?? null,
            params: node.params ?? null,
            posX: Math.round(node.posX),
            posY: Math.round(node.posY),
          };
          const existing = nodesByKey.get(node.nodeKey);
          if (existing) {
            await tx.update(workflowNodes).set(values).where(eq(workflowNodes.id, existing.id));
          } else {
            await tx.insert(workflowNodes).values({
              workflowId: input.id,
              nodeKey: node.nodeKey,
              ...values,
              status: "pending",
            });
          }
        }

        const existingEdges = await tx
          .select()
          .from(workflowEdges)
          .where(eq(workflowEdges.workflowId, input.id));
        const edgesByKey = new Map(existingEdges.map((edge) => [edge.edgeKey, edge]));
        const edgeKeys = input.edges.map((edge) => edge.edgeKey);
        for (const edge of input.edges) {
          const values = {
            sourceKey: edge.sourceKey,
            targetKey: edge.targetKey,
            sourceHandle: edge.sourceHandle ?? null,
            label: edge.label ?? null,
          };
          const existing = edgesByKey.get(edge.edgeKey);
          if (existing) {
            await tx.update(workflowEdges).set(values).where(eq(workflowEdges.id, existing.id));
          } else {
            await tx.insert(workflowEdges).values({
              workflowId: input.id,
              edgeKey: edge.edgeKey,
              ...values,
            });
          }
        }

        const removedEdges = existingEdges.filter((edge) => !edgeKeys.includes(edge.edgeKey));
        if (removedEdges.length) {
          await tx.delete(workflowEdges).where(inArray(
            workflowEdges.id,
            removedEdges.map((edge) => edge.id),
          ));
        }
        if (removedNodes.length) {
          await tx.delete(workflowNodes).where(inArray(
            workflowNodes.id,
            removedNodes.map((node) => node.id),
          ));
        }
        await tx.update(workflows).set({ updatedAt: new Date() }).where(eq(workflows.id, input.id));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name ?? "未知用户",
          action: "更新了业务流图",
          entityType: "workflow",
          entityId: input.id,
          entityName: wf.name,
          detail: `${input.nodes.length} 个节点 · ${input.edges.length} 条连线`,
        });
        return { ok: true };
      });
    }),

  /** 更新单个节点执行状态 */
  updateNodeStatus: writeQuery
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

  /** 删除业务流（级联删除其下所有子流程，并解除父节点挂接） */
  remove: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = getDb();
    const deleteTree = async (wfId: number) => {
      const children = (await db.select().from(workflows)).filter((w) => w.parentWorkflowId === wfId);
      for (const c of children) await deleteTree(c.id);
      // 解除父节点上的挂接
      const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, wfId) });
      if (wf?.parentNodeId) {
        await db.update(workflowNodes).set({ childWorkflowId: null }).where(eq(workflowNodes.id, wf.parentNodeId));
      }
      await db.delete(workflowEdges).where(eq(workflowEdges.workflowId, wfId));
      await db.delete(workflowNodes).where(eq(workflowNodes.workflowId, wfId));
      await db.delete(workflows).where(eq(workflows.id, wfId));
    };
    await deleteTree(input.id);
    return { ok: true };
  }),
});
