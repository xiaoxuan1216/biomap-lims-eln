import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { labRunDrafts, users, workflows } from "@db/schema";
import { runDraftPayloadSchema } from "@contracts/runDraft";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity } from "./queries/labHelpers";

export const runDraftRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb().select({ draft: labRunDrafts, workflowName: workflows.name }).from(labRunDrafts).innerJoin(workflows, eq(labRunDrafts.workflowId, workflows.id)).where(and(eq(labRunDrafts.ownerId, ctx.user.id), isNull(labRunDrafts.runId))).orderBy(desc(labRunDrafts.updatedAt));
    return rows.map(({ draft, workflowName }) => ({ ...draft, workflowName, payload: runDraftPayloadSchema.parse(JSON.parse(draft.payload)) }));
  }),
  byId: authedQuery.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [draft] = await getDb().select().from(labRunDrafts).where(and(eq(labRunDrafts.id, input.id), eq(labRunDrafts.ownerId, ctx.user.id))).limit(1);
    if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "草稿不存在或已交接给其他人" });
    return { ...draft, payload: runDraftPayloadSchema.parse(JSON.parse(draft.payload)) };
  }),
  operators: authedQuery.query(() => getDb().select({ id: users.id, name: users.name }).from(users).where(ne(users.role, "viewer"))),
  save: writeQuery.input(z.object({ id: z.string().uuid(), expectedRevision: z.number().int().min(0), payload: runDraftPayloadSchema })).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const [existing] = await tx.select().from(labRunDrafts).where(eq(labRunDrafts.id, input.id)).limit(1).for("update");
    const payload = JSON.stringify(input.payload);
    if (existing) {
      if (existing.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "草稿已交接，请刷新任务列表" });
      if (existing.workflowId !== input.payload.workflowId) throw new TRPCError({ code: "BAD_REQUEST", message: "不能更换已有草稿的方法，请另建草稿" });
      if (JSON.stringify(JSON.parse(existing.payload).reworkSource) !== JSON.stringify(input.payload.reworkSource)) throw new TRPCError({ code: "BAD_REQUEST", message: "重做来源必须保留，不能更换或移除" });
      if (JSON.stringify(JSON.parse(existing.payload).stageSource) !== JSON.stringify(input.payload.stageSource)) throw new TRPCError({ code: "BAD_REQUEST", message: "阶段来源必须保留，不能更换或移除" });
      if (existing.runId) throw new TRPCError({ code: "CONFLICT", message: "此草稿已生成实验任务" });
      if (existing.payload === payload) return { revision: existing.revision };
      if (existing.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "草稿已在其他窗口修改，请重新载入后继续" });
      await tx.update(labRunDrafts).set({ payload, revision: existing.revision + 1, updatedAt: new Date() }).where(eq(labRunDrafts.id, input.id));
      return { revision: existing.revision + 1 };
    }
    if (input.expectedRevision !== 0) throw new TRPCError({ code: "CONFLICT", message: "草稿不存在，无法覆盖保存" });
    await tx.insert(labRunDrafts).values({ id: input.id, workflowId: input.payload.workflowId, ownerId: ctx.user.id, ownerName: ctx.user.name ?? "用户", payload });
    return { revision: 1 };
  })),
  handoff: writeQuery.input(z.object({ id: z.string().uuid(), expectedRevision: z.number().int().positive(), ownerId: z.number().int().positive(), note: z.string().trim().min(1).max(1000) })).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const [draft] = await tx.select().from(labRunDrafts).where(eq(labRunDrafts.id, input.id)).limit(1).for("update");
    if (!draft || draft.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "只能交接自己负责的草稿" });
    if (draft.runId || draft.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "草稿已发生变化，请刷新后交接" });
    const [owner] = await tx.select().from(users).where(eq(users.id, input.ownerId)).limit(1);
    if (!owner || owner.role === "viewer") throw new TRPCError({ code: "BAD_REQUEST", message: "接收人没有实验准备权限" });
    const payload = runDraftPayloadSchema.parse(JSON.parse(draft.payload));
    payload.operatorName = owner.name ?? "";
    await tx.update(labRunDrafts).set({ ownerId: owner.id, ownerName: owner.name ?? "用户", payload: JSON.stringify(payload), revision: draft.revision + 1, updatedAt: new Date() }).where(eq(labRunDrafts.id, input.id));
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name ?? "用户", action: "交接了实验准备草稿", entityType: "workflow", entityId: draft.workflowId, entityName: payload.name ?? "草稿", detail: `${draft.id} → ${owner.name}：${input.note}` });
    return { ok: true };
  })),
});
