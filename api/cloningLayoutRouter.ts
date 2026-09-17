import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { cloningLayoutPlans, workflowNodes, workflows } from "@db/schema";
import { buildCloningPlan, cloningSaveSchema, type CloningPlan } from "@contracts/cloningLayout";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity } from "./queries/labHelpers";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const listFields = {
  id: cloningLayoutPlans.id, workflowId: cloningLayoutPlans.workflowId, nodeKey: cloningLayoutPlans.nodeKey,
  projectId: cloningLayoutPlans.projectId, workflowName: cloningLayoutPlans.workflowName, nodeLabel: cloningLayoutPlans.nodeLabel,
  name: cloningLayoutPlans.name, version: cloningLayoutPlans.version, mode: cloningLayoutPlans.mode,
  sampleCount: cloningLayoutPlans.sampleCount, plateCount: cloningLayoutPlans.plateCount,
  snapshotHash: cloningLayoutPlans.snapshotHash, createdAt: cloningLayoutPlans.createdAt, createdByName: cloningLayoutPlans.createdByName,
};

export const cloningLayoutRouter = createRouter({
  list: authedQuery.input(z.object({ workflowId: z.number().int().positive().optional(), projectId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => {
    return getDb().select(listFields).from(cloningLayoutPlans).where(and(
      input?.workflowId ? eq(cloningLayoutPlans.workflowId, input.workflowId) : undefined,
      input?.projectId ? eq(cloningLayoutPlans.projectId, input.projectId) : undefined,
    )).orderBy(desc(cloningLayoutPlans.id)).limit(100);
  }),
  byId: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const record = await getDb().query.cloningLayoutPlans.findFirst({ where: eq(cloningLayoutPlans.id, input.id) });
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "排板方案不存在" });
    if (hash(record.snapshot) !== record.snapshotHash) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "排板快照校验失败" });
    const { snapshot, requestHash: _requestHash, idempotencyKey: _idempotencyKey, ...meta } = record;
    void _requestHash; void _idempotencyKey;
    return { ...meta, plan: JSON.parse(snapshot) as CloningPlan };
  }),
  save: writeQuery.input(cloningSaveSchema).mutation(async ({ ctx, input }) => {
    const requestHash = hash(JSON.stringify({ workflowId: input.workflowId, nodeKey: input.nodeKey, name: input.name, config: input.config, mode: input.mode, expectedVersion: input.expectedVersion }));
    const db = getDb();
    return db.transaction(async tx => {
      // Serialize revisions per workflow, independently of DAG saveGraph and node params.
      const [workflow] = await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).for("update");
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });
      const [previous] = await tx.select().from(cloningLayoutPlans).where(eq(cloningLayoutPlans.idempotencyKey, input.idempotencyKey));
      if (previous) {
        if (previous.createdById !== ctx.user.id || previous.requestHash !== requestHash) throw new TRPCError({ code: "CONFLICT", message: "排板保存请求标识已用于其他内容" });
        return { id: previous.id, version: previous.version, replayed: true };
      }
      if (["completed", "archived"].includes(workflow.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "已完成或归档的流程不能新增排板方案" });
      const [latest] = await tx.select({ version: cloningLayoutPlans.version }).from(cloningLayoutPlans).where(eq(cloningLayoutPlans.workflowId, input.workflowId)).orderBy(desc(cloningLayoutPlans.version)).limit(1);
      if ((latest?.version ?? 0) !== input.expectedVersion) throw new TRPCError({ code: "CONFLICT", message: "排板方案已有新版本，请刷新版本记录后重试" });
      const node = input.nodeKey ? (await tx.select().from(workflowNodes).where(and(eq(workflowNodes.workflowId, input.workflowId), eq(workflowNodes.nodeKey, input.nodeKey))))[0] : null;
      if (input.nodeKey && !node) throw new TRPCError({ code: "BAD_REQUEST", message: "关联节点不存在，请先保存流程图" });
      const plan = buildCloningPlan(input.config, input.mode), snapshot = JSON.stringify(plan), version = input.expectedVersion + 1;
      const [{ id }] = await tx.insert(cloningLayoutPlans).values({
        workflowId: workflow.id, projectId: workflow.projectId, nodeKey: input.nodeKey, nodeLabel: node?.label ?? null,
        workflowName: workflow.name, name: input.name, version, engineVersion: plan.engineVersion, mode: input.mode,
        sampleCount: input.config.samples, plateCount: plan.summary.plates, snapshot, snapshotHash: hash(snapshot), requestHash,
        idempotencyKey: input.idempotencyKey, createdById: ctx.user.id, createdByName: ctx.user.name ?? "未知用户",
      }).$returningId();
      await appendActivity(tx, {
        userId: ctx.user.id, userName: ctx.user.name, action: "保存了分子克隆排板方案", entityType: "workflow", entityId: workflow.id,
        entityName: workflow.name, detail: `${input.name} · V${version} · ${input.config.samples} / ${plan.summary.plates}`,
        after: { planId: id, version, workflowId: workflow.id, nodeKey: input.nodeKey, planningOnly: true, config: input.config, mode: input.mode, snapshotHash: hash(snapshot), summary: plan.summary },
      });
      return { id, version, replayed: false };
    });
  }),
});
