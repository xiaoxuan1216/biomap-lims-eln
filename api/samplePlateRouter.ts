import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { samplePlatePlans, samples, workflows, workflowNodes } from "@db/schema";
import { buildSamplePlate, plateConfigSchema, savePlateSchema, type PlateSample, type SamplePlatePlan } from "@contracts/samplePlateLayout";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity, type DatabaseTransaction } from "./queries/labHelpers";
import { resolvedSampleIdentities } from "./services/sampleIdentityService";

export const plateHash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function plateCatalog(tx: DatabaseTransaction, ids: number[]): Promise<PlateSample[]> {
  const rows = await tx.select().from(samples).where(and(inArray(samples.id, ids), isNull(samples.archivedAt))).for("update");
  const identities = await resolvedSampleIdentities(tx, ids);
  return rows.map(row => { const identity = identities.find(i => i.sampleId === row.id); return { id: row.id, sku: row.sku, name: row.name, type: row.type, identity: identity ? { antibodyId: identity.antibodyId, chain: identity.chain, origin: identity.origin, originId: identity.originId } : null }; });
}
export function readPlate(record: typeof samplePlatePlans.$inferSelect) {
  if (plateHash(record.snapshot) !== record.snapshotHash) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "排板快照校验失败" });
  return { id: record.id, version: record.version, name: record.name, nodeKey: record.nodeKey, snapshotHash: record.snapshotHash, plan: JSON.parse(record.snapshot) as SamplePlatePlan };
}
export const samplePlateRouter = createRouter({
  candidates: authedQuery.input(z.object({ search: z.string().max(100) })).query(async ({ input }) => getDb().select({ id: samples.id, sku: samples.sku, name: samples.name, type: samples.type }).from(samples).where(and(isNull(samples.archivedAt), input.search ? or(like(samples.sku, `%${input.search}%`), like(samples.name, `%${input.search}%`)) : undefined)).orderBy(desc(samples.id)).limit(100)),
  list: authedQuery.input(z.object({ workflowId: z.number().int().positive() })).query(async ({ input }) => (await getDb().select().from(samplePlatePlans).where(eq(samplePlatePlans.workflowId, input.workflowId)).orderBy(desc(samplePlatePlans.version)).limit(100)).map(readPlate)),
  preview: authedQuery.input(plateConfigSchema).mutation(async ({ input }) => getDb().transaction(async tx => {
    try { return buildSamplePlate(input, await plateCatalog(tx, input.sampleIds)); }
    catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message }); }
  })),
  save: writeQuery.input(savePlateSchema).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const [workflow] = await tx.select().from(workflows).where(eq(workflows.id, input.workflowId)).for("update");
    if (!workflow) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });
    const requestHash = plateHash(JSON.stringify({ ...input, idempotencyKey: undefined }));
    const [prior] = await tx.select().from(samplePlatePlans).where(eq(samplePlatePlans.idempotencyKey, input.idempotencyKey));
    if (prior) {
      if (prior.createdById !== ctx.user.id || prior.requestHash !== requestHash) throw new TRPCError({ code: "CONFLICT", message: "排板保存请求标识已用于其他内容" });
      return readPlate(prior);
    }
    if (["completed", "archived"].includes(workflow.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "已完成或归档的流程不能新增排板方案" });
    const [latest] = await tx.select().from(samplePlatePlans).where(eq(samplePlatePlans.workflowId, input.workflowId)).orderBy(desc(samplePlatePlans.version)).limit(1);
    if ((latest?.version ?? 0) !== input.expectedVersion) throw new TRPCError({ code: "CONFLICT", message: "排板方案已有新版本，请刷新版本记录后重试" });
    if (input.nodeKey && !(await tx.select().from(workflowNodes).where(and(eq(workflowNodes.workflowId, input.workflowId), eq(workflowNodes.nodeKey, input.nodeKey)))).length) throw new TRPCError({ code: "BAD_REQUEST", message: "关联节点不存在，请先保存流程图" });
    let plan: SamplePlatePlan;
    try { plan = buildSamplePlate(input.config, await plateCatalog(tx, input.config.sampleIds)); }
    catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message }); }
    const snapshot = JSON.stringify(plan), version = input.expectedVersion + 1;
    const values = { workflowId: input.workflowId, nodeKey: input.nodeKey, name: input.name, stage: input.config.stage, version, snapshot, snapshotHash: plateHash(snapshot), requestHash, idempotencyKey: input.idempotencyKey, createdById: ctx.user.id };
    const [{ id }] = await tx.insert(samplePlatePlans).values(values).$returningId();
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "保存了样本孔板方案", entityType: "workflow", entityId: workflow.id, entityName: workflow.name, after: { planId: id, version, snapshotHash: values.snapshotHash, sampleIds: input.config.sampleIds } });
    return readPlate({ ...values, id, createdAt: new Date() });
  })),
});
