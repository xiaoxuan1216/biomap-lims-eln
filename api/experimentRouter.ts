import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  experimentSamples,
  experiments,
  projects,
  samples,
  stockTransactions,
} from "@db/schema";
import { logActivity, nextExperimentCode } from "./queries/labHelpers";

const DEFAULT_CONTENT = JSON.stringify([
  { id: "b1", type: "heading", text: "实验目的" },
  { id: "b2", type: "text", text: "" },
  { id: "b3", type: "heading", text: "实验步骤" },
  {
    id: "b4",
    type: "checklist",
    items: [
      { id: "s1", text: "", done: false },
    ],
  },
  { id: "b5", type: "heading", text: "结果与结论" },
  { id: "b6", type: "text", text: "" },
]);

export const experimentRouter = createRouter({
  list: authedQuery
    .input(
      z
        .object({
          projectId: z.number().optional(),
          status: z.enum(["planning", "in_progress", "completed", "signed"]).optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [];
      if (input?.projectId) conditions.push(eq(experiments.projectId, input.projectId));
      if (input?.status) conditions.push(eq(experiments.status, input.status));
      if (input?.search) {
        conditions.push(
          or(
            like(experiments.title, `%${input.search}%`),
            like(experiments.code, `%${input.search}%`),
          ),
        );
      }
      const rows = await db
        .select({
          experiment: experiments,
          projectName: projects.name,
          projectColor: projects.color,
        })
        .from(experiments)
        .leftJoin(projects, eq(experiments.projectId, projects.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(experiments.updatedAt))
        .limit(200);
      return rows.map((r) => ({
        ...r.experiment,
        projectName: r.projectName,
        projectColor: r.projectColor,
      }));
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const exp = await db.query.experiments.findFirst({
      where: eq(experiments.id, input.id),
    });
    if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, exp.projectId),
    });
    const usage = await db
      .select({
        usage: experimentSamples,
        sampleName: samples.name,
        sampleSku: samples.sku,
        sampleUnit: samples.unit,
      })
      .from(experimentSamples)
      .leftJoin(samples, eq(experimentSamples.sampleId, samples.id))
      .where(eq(experimentSamples.experimentId, input.id))
      .orderBy(desc(experimentSamples.createdAt));
    return {
      ...exp,
      project,
      usedSamples: usage.map((u) => ({
        ...u.usage,
        sampleName: u.sampleName,
        sampleSku: u.sampleSku,
        sampleUnit: u.sampleUnit,
      })),
    };
  }),

  create: authedQuery
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(1, "实验标题不能为空").max(255),
        objective: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const code = await nextExperimentCode();
      const [{ id }] = await db
        .insert(experiments)
        .values({
          code,
          projectId: input.projectId,
          title: input.title,
          objective: input.objective ?? null,
          content: DEFAULT_CONTENT,
          status: "planning",
          createdById: ctx.user.id,
          createdByName: ctx.user.name ?? null,
        })
        .$returningId();
      await logActivity({
        userName: ctx.user.name,
        action: "创建了实验",
        entityType: "experiment",
        entityId: id,
        entityName: `${code} ${input.title}`,
      });
      return { id, code };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        objective: z.string().nullable().optional(),
        status: z.enum(["planning", "in_progress", "completed"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const db = getDb();
      const exp = await db.query.experiments.findFirst({ where: eq(experiments.id, id) });
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
      if (exp.status === "signed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "实验已签署锁定，无法修改",
        });
      }
      await db.update(experiments).set(data).where(eq(experiments.id, id));
      return { ok: true };
    }),

  /** 保存实验内容（区块 JSON） */
  saveContent: authedQuery
    .input(z.object({ id: z.number(), content: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const exp = await db.query.experiments.findFirst({
        where: eq(experiments.id, input.id),
      });
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
      if (exp.status === "signed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "实验已签署锁定，无法修改",
        });
      }
      await db
        .update(experiments)
        .set({ content: input.content })
        .where(eq(experiments.id, input.id));
      return { ok: true, savedAt: new Date() };
    }),

  /** 签署并锁定（合规审计） */
  sign: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const exp = await db.query.experiments.findFirst({
      where: eq(experiments.id, input.id),
    });
    if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
    if (exp.status === "signed") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "实验已签署" });
    }
    await db
      .update(experiments)
      .set({
        status: "signed",
        signedById: ctx.user.id,
        signedByName: ctx.user.name ?? null,
        signedAt: new Date(),
      })
      .where(eq(experiments.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "签署锁定了实验",
      entityType: "experiment",
      entityId: input.id,
      entityName: `${exp.code} ${exp.title}`,
    });
    return { ok: true };
  }),

  /** 撤销签署（仅签署人或管理员） */
  unsign: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const exp = await db.query.experiments.findFirst({
      where: eq(experiments.id, input.id),
    });
    if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
    if (exp.signedById !== ctx.user.id && ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "仅签署人或管理员可以撤销签署",
      });
    }
    await db
      .update(experiments)
      .set({ status: "in_progress", signedById: null, signedByName: null, signedAt: null })
      .where(eq(experiments.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "撤销了实验签署",
      entityType: "experiment",
      entityId: input.id,
      entityName: `${exp.code} ${exp.title}`,
    });
    return { ok: true };
  }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const exp = await db.query.experiments.findFirst({
      where: eq(experiments.id, input.id),
    });
    if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
    if (exp.status === "signed") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "已签署的实验无法删除",
      });
    }
    await db.delete(experimentSamples).where(eq(experimentSamples.experimentId, input.id));
    await db.delete(experiments).where(eq(experiments.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "删除了实验",
      entityType: "experiment",
      entityId: input.id,
      entityName: `${exp.code} ${exp.title}`,
    });
    return { ok: true };
  }),

  /** 登记实验消耗的样本（自动扣减库存） */
  addSampleUsage: authedQuery
    .input(
      z.object({
        experimentId: z.number(),
        sampleId: z.number(),
        amountUsed: z.number().positive("用量必须大于 0"),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const exp = await db.query.experiments.findFirst({
        where: eq(experiments.id, input.experimentId),
      });
      if (!exp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
      if (exp.status === "signed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "实验已签署锁定" });
      }
      const sample = await db.query.samples.findFirst({
        where: eq(samples.id, input.sampleId),
      });
      if (!sample) throw new TRPCError({ code: "NOT_FOUND", message: "样本不存在" });
      if (sample.quantity < input.amountUsed) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `库存不足：当前仅剩 ${sample.quantity} ${sample.unit}`,
        });
      }
      await db.transaction(async (tx) => {
        await tx.insert(experimentSamples).values({
          experimentId: input.experimentId,
          sampleId: input.sampleId,
          amountUsed: input.amountUsed,
          note: input.note ?? null,
          createdByName: ctx.user.name ?? null,
        });
        await tx
          .update(samples)
          .set({ quantity: sample.quantity - input.amountUsed })
          .where(eq(samples.id, input.sampleId));
        await tx.insert(stockTransactions).values({
          sampleId: input.sampleId,
          delta: -input.amountUsed,
          reason: "consume",
          note: `实验 ${exp.code} 消耗${input.note ? `：${input.note}` : ""}`,
          userName: ctx.user.name ?? null,
        });
      });
      await logActivity({
        userName: ctx.user.name,
        action: "登记了样本消耗",
        entityType: "sample",
        entityId: input.sampleId,
        entityName: sample.name,
        detail: `实验 ${exp.code} 使用 ${input.amountUsed} ${sample.unit}`,
      });
      return { ok: true };
    }),

  /** 移除消耗记录（回补库存） */
  removeSampleUsage: authedQuery
    .input(z.object({ usageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const usage = await db.query.experimentSamples.findFirst({
        where: eq(experimentSamples.id, input.usageId),
      });
      if (!usage) throw new TRPCError({ code: "NOT_FOUND", message: "记录不存在" });
      const exp = await db.query.experiments.findFirst({
        where: eq(experiments.id, usage.experimentId),
      });
      if (exp?.status === "signed") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "实验已签署锁定" });
      }
      const sample = await db.query.samples.findFirst({
        where: eq(samples.id, usage.sampleId),
      });
      await db.transaction(async (tx) => {
        await tx.delete(experimentSamples).where(eq(experimentSamples.id, input.usageId));
        if (sample) {
          await tx
            .update(samples)
            .set({ quantity: sample.quantity + usage.amountUsed })
            .where(eq(samples.id, sample.id));
          await tx.insert(stockTransactions).values({
            sampleId: sample.id,
            delta: usage.amountUsed,
            reason: "adjust",
            note: "撤销实验消耗记录，回补库存",
            userName: ctx.user.name ?? null,
          });
        }
      });
      return { ok: true };
    }),
});
