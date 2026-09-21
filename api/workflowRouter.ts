import { antibodyMethodDraft } from "@contracts/antibodyMethods";
import { methodStageSchema } from "@contracts/methodOutputs";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { adminQuery, authedQuery, createRouter, reviewerQuery, writeQuery } from "./middleware";
import { methodSpecSchema, parseMethodSpec } from "@contracts/method";
import { compileMethod, methodHash, workflowGraphHash } from "./services/methodService";
import { getDb } from "./queries/connection";
import {
  cloningLayoutPlans,
  experiments,
  externalOrderItems,
  externalOrders,
  driverReleases,
  equipmentDriverBindings,
  labRunDrafts,
  labRuns,
  projects,
  samplePlatePlans,
  serviceProviders,
  workflows,
  methodReleases,
  workflowEdges,
  workflowNodes,
} from "@db/schema";
import { appendActivity, logActivity } from "./queries/labHelpers";
import { WORKFLOW_TEMPLATES, SUBFLOW_TEMPLATES, templateScenario } from "@contracts/workflow";
import {
  BUILTIN_DRIVER_MANIFESTS,
  driverManifestSchema,
  parseDriverTemplateKey,
  validateDriverActionForBinding,
  validateDriverValues,
} from "@contracts/deviceDriver";
import {
  bioViewVisualizationSpecSchema,
  parseBioViewVisualizationSpec,
} from "@contracts/bioView";
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
function trParams(params: Record<string, string | number | boolean> | undefined, lang?: string) {
  if (!params) return params;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === "string" ? trForLang(v, lang) : v;
  return out;
}

const NODE_TYPES = ["manual", "equipment", "decision", "data", "timer", "external"] as const;
const NODE_STATUS = ["pending", "in_progress", "done", "skipped"] as const;

export type WorkflowRemovalReferences = {
  cloningLayoutPlans: number;
  experiments: number;
  methodReleases: number;
  labRuns: number;
  labRunDrafts: number;
  samplePlatePlans: number;
};

export function workflowRemovalDisposition(
  references: WorkflowRemovalReferences,
): "archive" | "delete" {
  return Object.values(references).some((count) => count > 0) ? "archive" : "delete";
}

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
  createAntibodyMethod: writeQuery.input(z.object({ stage: methodStageSchema, projectId: z.number().int().positive().optional(), lang: z.enum(["zh", "en"]).default("zh") })).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const draft = antibodyMethodDraft(input.stage, input.lang);
    const [workflow] = await tx.insert(workflows).values({ name: draft.name, description: draft.description, projectId: input.projectId, scenario: "antibody", status: "draft", methodSpec: JSON.stringify(draft.spec), createdByName: ctx.user.name }).$returningId();
    await tx.insert(workflowNodes).values(draft.nodes.map(node => ({ ...node, workflowId: workflow.id })));
    await tx.insert(workflowEdges).values(draft.edges.map(edge => ({ ...edge, workflowId: workflow.id })));
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "创建抗体阶段方法草稿", entityType: "workflow", entityId: workflow.id, entityName: draft.name });
    return { id: workflow.id };
  })),
  releases: authedQuery.input(z.object({ workflowId: z.number().int().positive() })).query(async ({ input }) => {
    return getDb().select().from(methodReleases).where(eq(methodReleases.workflowId, input.workflowId)).orderBy(desc(methodReleases.version));
  }),
  saveMethodSpec: writeQuery.input(z.object({ workflowId: z.number().int().positive(), expectedSpecHash: z.string().length(64), expectedGraphHash: z.string().length(64), spec: methodSpecSchema })).mutation(async ({ ctx, input }) => {
    return getDb().transaction(async tx => {
      const [wf] = await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1).for("update");
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "方法不存在" });
      const nodes = await tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, wf.id));
      const edges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, wf.id));
      if (workflowGraphHash(wf, nodes, edges) !== input.expectedGraphHash) throw new TRPCError({ code: "CONFLICT", message: "方法步骤已在其他窗口更新，请刷新并核对执行要求后再保存" });
      const currentHash = methodHash(JSON.stringify(parseMethodSpec(wf.methodSpec)));
      const methodSpecHash = methodHash(JSON.stringify(input.spec));
      if (currentHash === methodSpecHash) return { ok: true, methodSpecHash, replayed: true };
      if (currentHash !== input.expectedSpecHash) throw new TRPCError({ code: "CONFLICT", message: "执行要求已在其他窗口更新，请核对最新版本后再保存" });
      await tx.update(workflows).set({ methodSpec: JSON.stringify(input.spec), updatedAt: new Date() }).where(eq(workflows.id, wf.id));
      await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name ?? "用户", action: "更新了方法执行要求", entityType: "workflow", entityId: wf.id, entityName: wf.name });
      return { ok: true, methodSpecHash, replayed: false };
    });
  }),
  submitMethod: writeQuery.input(z.object({ workflowId: z.number().int().positive(), expectedSpecHash: z.string().length(64), expectedGraphHash: z.string().length(64) })).mutation(async ({ ctx, input }) => {
    return getDb().transaction(async tx => {
      const [wf] = await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).limit(1).for("update");
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "方法不存在" });
      const nodes = await tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, wf.id));
      const edges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, wf.id));
      if (methodHash(JSON.stringify(parseMethodSpec(wf.methodSpec))) !== input.expectedSpecHash || workflowGraphHash(wf, nodes, edges) !== input.expectedGraphHash) throw new TRPCError({ code: "CONFLICT", message: "方法已在其他窗口更新，请核对最新要求后再提交复核" });
      const snapshot = await compileMethod(tx, input.workflowId);
      const [latest] = await tx.select().from(methodReleases).where(eq(methodReleases.workflowId, input.workflowId)).orderBy(desc(methodReleases.version)).limit(1);
      const raw = JSON.stringify(snapshot);
      const hash = methodHash(raw);
      if (latest?.snapshotHash === hash && latest.status !== "retired") return { id: latest.id, version: latest.version };
      const version = (latest?.version ?? 0) + 1;
      const [row] = await tx.insert(methodReleases).values({ workflowId: input.workflowId, version, snapshot: raw, snapshotHash: hash, submittedById: ctx.user.id, submittedByName: ctx.user.name ?? "用户" }).$returningId();
      await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name ?? "用户", action: "提交了方法版本复核", entityType: "workflow", entityId: input.workflowId, entityName: snapshot.workflow.name, detail: `V${version}` });
      return { id: row.id, version };
    });
  }),
  reviewMethod: reviewerQuery.input(z.object({ id: z.number().int().positive(), decision: z.enum(["publish", "retire"]), note: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    return getDb().transaction(async tx => {
      const [release] = await tx.select().from(methodReleases).where(eq(methodReleases.id, input.id)).limit(1).for("update");
      if (!release) throw new TRPCError({ code: "NOT_FOUND", message: "方法版本不存在" });
      if (input.decision === "publish" && release.status !== "review") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "仅待复核版本可以发布" });
      if (input.decision === "publish" && release.submittedById === ctx.user.id && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "请由另一位复核人发布；管理员例外须写明依据" });
      if (methodHash(release.snapshot) !== release.snapshotHash) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "方法版本完整性检查失败" });
      await tx.update(methodReleases).set({ status: input.decision === "publish" ? "published" : "retired", reviewedById: ctx.user.id, reviewedByName: ctx.user.name, reviewNote: input.note, reviewedAt: new Date() }).where(eq(methodReleases.id, release.id));
      await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name ?? "用户", action: input.decision === "publish" ? "发布了方法版本" : "停用了方法版本", entityType: "workflow", entityId: release.workflowId, entityName: `V${release.version}`, detail: input.note });
      return { ok: true };
    });
  }),
  /** 业务流列表（含节点统计） */
  list: authedQuery.query(async () => {
    const db = getDb();
    const wfs = await db.select().from(workflows).orderBy(asc(workflows.id));
    const allNodes = await db.select().from(workflowNodes);
    const releases = await db.select({ id: methodReleases.id, workflowId: methodReleases.workflowId, version: methodReleases.version, status: methodReleases.status, snapshot: methodReleases.snapshot }).from(methodReleases).orderBy(desc(methodReleases.version));
    return wfs.map((w) => {
      const ns = allNodes.filter((n) => n.workflowId === w.id);
      const active = ns.filter((n) => n.status !== "skipped");
      const published = w.status === "archived" ? undefined : releases.find(r => r.workflowId === w.id && r.status === "published");
      return {
        ...w,
        publishedRelease: published ? { id: published.id, workflowId: published.workflowId, version: published.version, status: published.status, stage: (JSON.parse(published.snapshot) as { spec: { stage?: string } }).spec.stage ?? null } : null,
        stage: parseMethodSpec(w.methodSpec).stage,
        methodState: w.status === "archived" ? "retired" : releases.find(r => r.workflowId === w.id)?.status ?? "draft",
        visualizationSpec: parseBioViewVisualizationSpec(w.visualizationSpec),
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
      graphHash: workflowGraphHash(wf, nodes, edges),
      methodSpec: parseMethodSpec(wf.methodSpec),
      methodSpecHash: methodHash(JSON.stringify(parseMethodSpec(wf.methodSpec))),
      visualizationSpec: parseBioViewVisualizationSpec(wf.visualizationSpec),
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

  /** Save the governed BioView blueprint independently from graph topology. */
  saveVisualizationSpec: writeQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        expectedGraphHash: z.string().length(64),
        visualizationSpec: bioViewVisualizationSpecSchema.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async (tx) => {
        const [workflow] = await tx
          .select()
          .from(workflows)
          .where(eq(workflows.id, input.id))
          .limit(1)
          .for("update");
        if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });

        const nodes = await tx
          .select()
          .from(workflowNodes)
          .where(eq(workflowNodes.workflowId, input.id));
        const edges = await tx
          .select()
          .from(workflowEdges)
          .where(eq(workflowEdges.workflowId, input.id));
        if (workflowGraphHash(workflow, nodes, edges) !== input.expectedGraphHash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "方法已在其他窗口更新，请刷新后再保存实验视图",
          });
        }
        const nodeKeys = new Set(nodes.map((node) => node.nodeKey));
        const unknownBinding = input.visualizationSpec?.semanticBindings.find(
          (binding) => !nodeKeys.has(binding.nodeKey),
        );
        if (unknownBinding) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `BioView 语义绑定指向了未知节点：${unknownBinding.nodeKey}`,
          });
        }

        const rawSpec = input.visualizationSpec ? JSON.stringify(input.visualizationSpec) : null;
        const updatedAt = new Date();
        await tx
          .update(workflows)
          .set({ visualizationSpec: rawSpec, updatedAt })
          .where(eq(workflows.id, input.id));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name ?? "未知用户",
          action: input.visualizationSpec ? "更新了 BioView 视图配置" : "恢复了 BioView 默认视图",
          entityType: "workflow",
          entityId: input.id,
          entityName: workflow.name,
          detail: input.visualizationSpec
            ? `${input.visualizationSpec.domainPack} · ${input.visualizationSpec.views.length} 个受控视图`
            : "运行实例将使用通用降级视图",
        });
        return {
          ok: true,
          visualizationSpec: input.visualizationSpec,
          graphHash: workflowGraphHash(
            { ...workflow, visualizationSpec: rawSpec, updatedAt },
            nodes,
            edges,
          ),
        };
      });
    }),

  /** 保存整张图（节点 + 边，全量替换；含 DAG 环校验，保留节点执行状态） */
  saveGraph: writeQuery
    .input(z.object({
      id: z.number(),
      expectedGraphHash: z.string().length(64).optional(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().nullish(),
      status: z.enum(["draft", "active", "completed", "archived"]).optional(),
      projectId: z.number().nullish(),
      nodes: z.array(nodeInput),
      edges: z.array(edgeInput),
    }))
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
        const hashEdges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, input.id));
        if (input.expectedGraphHash && input.expectedGraphHash !== workflowGraphHash(wf, existingNodes, hashEdges)) throw new TRPCError({ code: "CONFLICT", message: "方法已在其他窗口修改。请先保留本地草稿，再重新载入核对" });
        const nodesByKey = new Map(existingNodes.map((node) => [node.nodeKey, node]));
        const currentVisualizationSpec = parseBioViewVisualizationSpec(wf.visualizationSpec);
        const retainedSemanticBindings = currentVisualizationSpec?.semanticBindings.filter(
          (binding) => keys.includes(binding.nodeKey),
        );
        const prunedVisualizationSpec = currentVisualizationSpec && retainedSemanticBindings &&
          retainedSemanticBindings.length !== currentVisualizationSpec.semanticBindings.length
          ? { ...currentVisualizationSpec, semanticBindings: retainedSemanticBindings }
          : null;
        const removedNodes = existingNodes.filter((node) => !keys.includes(node.nodeKey));
        const linkedRemovedNode = removedNodes.find((node) => node.childWorkflowId);
        if (linkedRemovedNode) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `节点“${linkedRemovedNode.label}”仍挂接子流程，不能从图中删除`,
          });
        }

        for (const node of input.nodes) {
          const ref = parseDriverTemplateKey(node.templateKey);
          if (!ref) continue;
          if (node.type !== "equipment") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "设备驱动动作只能保存为设备节点" });
          }
          let manifest = BUILTIN_DRIVER_MANIFESTS.find(
            (item) => item.driverKey === ref.driverKey && item.version === ref.version,
          );
          let releaseStatus: "published" | "retired" | "draft" = "published";
          if (!manifest) {
            const release = await tx.query.driverReleases.findFirst({
              where: and(
                eq(driverReleases.driverKey, ref.driverKey),
                eq(driverReleases.version, ref.version),
              ),
            });
            if (!release) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `驱动版本不存在：${ref.driverKey}@${ref.version}` });
            }
            let rawManifest: unknown;
            try {
              rawManifest = JSON.parse(release.manifest);
            } catch {
              throw new TRPCError({ code: "BAD_REQUEST", message: "驱动 Manifest 已损坏，不能保存节点" });
            }
            const parsed = driverManifestSchema.safeParse(rawManifest);
            if (!parsed.success) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "驱动 Manifest 已损坏，不能保存节点" });
            }
            manifest = parsed.data;
            releaseStatus = release.status;
          }
          const existing = nodesByKey.get(node.nodeKey);
          if (releaseStatus !== "published" && existing?.templateKey !== node.templateKey) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "只能新增已发布驱动的 BioFlow 节点" });
          }
          if (
            releaseStatus !== "published" &&
            existing &&
            existing.equipmentId !== (node.equipmentId ?? null)
          ) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "已停用驱动的历史节点只能保留原设备绑定",
            });
          }
          const action = manifest.actions.find(
            (item) => item.key === ref.actionKey && item.exposeAsNode,
          );
          if (!action) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `驱动动作不可用于 BioFlow：${ref.actionKey}` });
          }
          let params: Record<string, unknown> = {};
          if (node.params) {
            try {
              const parsed = JSON.parse(node.params) as unknown;
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
              params = parsed as Record<string, unknown>;
            } catch {
              throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${node.label}”参数不是有效对象` });
            }
          }
          const issues = validateDriverValues(action.fields, params);
          if (issues.length) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `节点“${node.label}”：${issues.join("；")}` });
          }
          if (node.equipmentId) {
            const binding = await tx.query.equipmentDriverBindings.findFirst({
              where: eq(equipmentDriverBindings.equipmentId, node.equipmentId),
            });
            const expectedStatus = binding?.mode === "simulation" ? "simulation_ready" : "ready";
            if (
              !binding ||
              !binding.enabled ||
              binding.status !== expectedStatus ||
              binding.driverKey !== ref.driverKey ||
              binding.driverVersion !== ref.version
            ) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `节点“${node.label}”绑定的设备尚未通过该驱动版本的连接测试`,
              });
            }
            let connectionConfig: Record<string, unknown>;
            try {
              const raw = JSON.parse(binding.connectionConfig) as unknown;
              if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
              connectionConfig = raw as Record<string, unknown>;
            } catch {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `节点“${node.label}”绑定的设备连接配置已损坏`,
              });
            }
            const bindingIssues = validateDriverActionForBinding(
              manifest,
              action.key,
              params,
              binding.mode,
              connectionConfig,
            );
            if (bindingIssues.length) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `节点“${node.label}”：${bindingIssues.join("；")}`,
              });
            }
          }
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
        await tx
          .update(workflows)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
            ...(prunedVisualizationSpec
              ? { visualizationSpec: JSON.stringify(prunedVisualizationSpec) }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(workflows.id, input.id));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name ?? "未知用户",
          action: "更新了业务流图",
          entityType: "workflow",
          entityId: input.id,
          entityName: input.name ?? wf.name,
          detail: `${input.nodes.length} 个节点 · ${input.edges.length} 条连线`,
        });
        const [savedWorkflow] = await tx.select().from(workflows).where(eq(workflows.id, input.id));
        const savedNodes = await tx.select().from(workflowNodes).where(eq(workflowNodes.workflowId, input.id));
        const savedEdges = await tx.select().from(workflowEdges).where(eq(workflowEdges.workflowId, input.id));
        return { ok: true, graphHash: workflowGraphHash(savedWorkflow, savedNodes, savedEdges) };
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

  /**
   * 移除业务流。已被方法版本、ELN 记录、实验运行、实验草稿或排板方案引用的流程只能归档；
   * 整棵子流程一起归档，以保留运行来源与父子流程链接。仅完全无历史引用时物理删除。
   */
  remove: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    return getDb().transaction(async (tx) => {
      const allWorkflows = await tx.select().from(workflows).orderBy(asc(workflows.id)).for("update");
      const root = allWorkflows.find((workflow) => workflow.id === input.id);
      if (!root) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });

      const childrenByParent = new Map<number, number[]>();
      for (const workflow of allWorkflows) {
        if (!workflow.parentWorkflowId) continue;
        const children = childrenByParent.get(workflow.parentWorkflowId) ?? [];
        children.push(workflow.id);
        childrenByParent.set(workflow.parentWorkflowId, children);
      }
      const workflowIds: number[] = [];
      const pending = [root.id];
      while (pending.length) {
        const workflowId = pending.pop()!;
        workflowIds.push(workflowId);
        pending.push(...(childrenByParent.get(workflowId) ?? []));
      }

      const releaseReferences = await tx
        .select({ id: methodReleases.id })
        .from(methodReleases)
        .where(inArray(methodReleases.workflowId, workflowIds))
        .for("update");
      const experimentReferences = await tx
        .select({ id: experiments.id })
        .from(experiments)
        .where(inArray(experiments.workflowId, workflowIds))
        .for("update");
      const runReferences = await tx
        .select({ id: labRuns.id })
        .from(labRuns)
        .where(inArray(labRuns.workflowId, workflowIds))
        .for("update");
      const draftReferences = await tx
        .select({ id: labRunDrafts.id })
        .from(labRunDrafts)
        .where(inArray(labRunDrafts.workflowId, workflowIds))
        .for("update");
      const plateReferences = await tx
        .select({ id: samplePlatePlans.id })
        .from(samplePlatePlans)
        .where(inArray(samplePlatePlans.workflowId, workflowIds))
        .for("update");
      const cloningLayoutReferences = await tx
        .select({ id: cloningLayoutPlans.id })
        .from(cloningLayoutPlans)
        .where(inArray(cloningLayoutPlans.workflowId, workflowIds))
        .for("update");
      const references: WorkflowRemovalReferences = {
        cloningLayoutPlans: cloningLayoutReferences.length,
        experiments: experimentReferences.length,
        methodReleases: releaseReferences.length,
        labRuns: runReferences.length,
        labRunDrafts: draftReferences.length,
        samplePlatePlans: plateReferences.length,
      };

      if (workflowRemovalDisposition(references) === "archive") {
        const archivedAt = new Date();
        await tx
          .update(workflows)
          .set({ status: "archived", updatedAt: archivedAt })
          .where(inArray(workflows.id, workflowIds));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name ?? "未知用户",
          action: "归档了受历史记录保护的业务流",
          entityType: "workflow",
          entityId: root.id,
          entityName: root.name,
          detail: `保留 ${workflowIds.length} 个流程；方法版本 ${references.methodReleases}、ELN 实验记录 ${references.experiments}、实验运行 ${references.labRuns}、实验草稿 ${references.labRunDrafts}、分子克隆排板方案 ${references.cloningLayoutPlans}、样本孔板方案 ${references.samplePlatePlans}`,
          before: { workflowIds, statuses: allWorkflows.filter((workflow) => workflowIds.includes(workflow.id)).map((workflow) => ({ id: workflow.id, status: workflow.status })) },
          after: { workflowIds, status: "archived", references },
          reason: "流程树存在历史引用，禁止物理删除",
        });
        return { ok: true, disposition: "archived" as const, workflowIds, references };
      }

      if (root.parentNodeId) {
        await tx
          .update(workflowNodes)
          .set({ childWorkflowId: null })
          .where(eq(workflowNodes.id, root.parentNodeId));
      }
      await tx.delete(workflowEdges).where(inArray(workflowEdges.workflowId, workflowIds));
      await tx.delete(workflowNodes).where(inArray(workflowNodes.workflowId, workflowIds));
      await tx.delete(workflows).where(inArray(workflows.id, workflowIds));
      await appendActivity(tx, {
        userId: ctx.user.id,
        userName: ctx.user.name ?? "未知用户",
        action: "删除了无历史引用的业务流",
        entityType: "workflow",
        entityId: root.id,
        entityName: root.name,
        detail: `删除 ${workflowIds.length} 个流程`,
        before: { workflowIds },
        after: { deleted: true },
      });
      return { ok: true, disposition: "deleted" as const, workflowIds, references };
    });
  }),
});
