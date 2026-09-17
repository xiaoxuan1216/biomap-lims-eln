import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import {
  adminQuery,
  authedQuery,
  createRouter,
  reviewerQuery,
  writeQuery,
} from "./middleware";
import { getDb } from "./queries/connection";
import {
  externalOrderExperiments,
  externalOrderItems,
  externalOrders,
  externalResults,
  experimentRevisions,
  experimentSamples,
  experimentSignatures,
  experiments,
  projects,
  samples,
  serviceProviders,
  workflowNodes,
  workflows,
} from "@db/schema";
import {
  appendActivity,
  logActivity,
  nextExperimentCode,
} from "./queries/labHelpers";
import {
  changeInventoryInTransaction,
  InventoryError,
} from "./services/inventoryService";
import {
  appendExperimentRevision,
  createExperimentAmendment,
  ElnError,
  normalizeElnContent,
  reviseExperiment,
  signExperiment,
  verifySignedExperiment,
} from "./services/elnService";

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

function throwElnError(error: unknown): never {
  if (error instanceof ElnError) {
    const code = error.kind === "not_found"
      ? "NOT_FOUND"
      : error.kind === "conflict"
        ? "CONFLICT"
        : error.kind === "locked"
          ? "PRECONDITION_FAILED"
          : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

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
    /* 来源业务流 / 节点（若该 ELN 由 BioFlow 节点创建） */
    let sourceWorkflow: { id: number; name: string } | null = null;
    let sourceNodeLabel: string | null = null;
    if (exp.workflowId) {
      const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, exp.workflowId) });
      if (wf) sourceWorkflow = { id: wf.id, name: wf.name };
      if (exp.nodeKey) {
        const node = await db.query.workflowNodes.findFirst({
          where: and(eq(workflowNodes.workflowId, exp.workflowId), eq(workflowNodes.nodeKey, exp.nodeKey)),
        });
        sourceNodeLabel = node?.label ?? exp.nodeKey;
      }
    }
    const integrity = await db.transaction((tx) =>
      verifySignedExperiment(tx, exp),
    );
    const original = exp.amendsExperimentId
      ? await db.query.experiments.findFirst({
          where: eq(experiments.id, exp.amendsExperimentId),
          columns: { id: true, code: true, title: true },
        })
      : null;
    const amendment = await db.query.experiments.findFirst({
      where: eq(experiments.amendsExperimentId, exp.id),
      columns: { id: true, code: true, title: true, status: true },
    });
    const externalLinks = await db
      .select({
        link: externalOrderExperiments,
        order: externalOrders,
        itemName: externalOrderItems.name,
        providerName: serviceProviders.name,
      })
      .from(externalOrderExperiments)
      .innerJoin(externalOrders, eq(externalOrderExperiments.orderId, externalOrders.id))
      .leftJoin(externalOrderItems, eq(externalOrderExperiments.orderItemId, externalOrderItems.id))
      .leftJoin(serviceProviders, eq(externalOrders.providerId, serviceProviders.id))
      .where(eq(externalOrderExperiments.experimentId, input.id))
      .orderBy(desc(externalOrderExperiments.createdAt));
    const externalOrderIds = [...new Set(externalLinks.map((row) => row.order.id))];
    const linkedResults = externalOrderIds.length
      ? await db
          .select({ result: externalResults, sampleName: samples.name, sampleSku: samples.sku })
          .from(externalResults)
          .leftJoin(samples, eq(externalResults.sampleId, samples.id))
          .where(inArray(externalResults.orderId, externalOrderIds))
          .orderBy(desc(externalResults.createdAt))
      : [];
    return {
      ...exp,
      project,
      sourceWorkflow,
      sourceNodeLabel,
      integrity,
      original,
      amendment: amendment ?? null,
      externalWork: externalLinks.map(({ link, order, ...meta }) => ({
        ...link,
        order,
        ...meta,
        results: linkedResults
          .filter((row) => row.result.orderId === order.id && (!link.orderItemId || row.result.orderItemId === link.orderItemId))
          .map(({ result, ...sampleMeta }) => ({ ...result, ...sampleMeta })),
      })),
      usedSamples: usage.map((u) => ({
        ...u.usage,
        sampleName: u.sampleName,
        sampleSku: u.sampleSku,
        sampleUnit: u.sampleUnit,
      })),
    };
  }),

  history: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const revisions = await db
        .select({
          id: experimentRevisions.id,
          revision: experimentRevisions.revision,
          contentHash: experimentRevisions.contentHash,
          changeReason: experimentRevisions.changeReason,
          createdByName: experimentRevisions.createdByName,
          createdAt: experimentRevisions.createdAt,
        })
        .from(experimentRevisions)
        .where(eq(experimentRevisions.experimentId, input.id))
        .orderBy(desc(experimentRevisions.revision));
      const signatures = await db
        .select()
        .from(experimentSignatures)
        .where(eq(experimentSignatures.experimentId, input.id));
      return { revisions, signatures };
    }),

  /** 某业务流节点下关联的 ELN 条目 */
  forNode: authedQuery
    .input(z.object({ workflowId: z.number(), nodeKey: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select({
          id: experiments.id,
          code: experiments.code,
          title: experiments.title,
          status: experiments.status,
          updatedAt: experiments.updatedAt,
        })
        .from(experiments)
        .where(and(eq(experiments.workflowId, input.workflowId), eq(experiments.nodeKey, input.nodeKey)))
        .orderBy(desc(experiments.updatedAt));
    }),

  /** 从业务流节点一键创建关联 ELN（项目 → 业务流 → 节点 → ELN 四级链） */
  createForNode: writeQuery
    .input(z.object({ workflowId: z.number(), nodeKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, input.workflowId) });
      if (!wf) throw new TRPCError({ code: "NOT_FOUND", message: "业务流不存在" });
      const node = await db.query.workflowNodes.findFirst({
        where: and(eq(workflowNodes.workflowId, input.workflowId), eq(workflowNodes.nodeKey, input.nodeKey)),
      });
      if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "节点不存在，请先保存流程图" });

      /* 无项目归属的业务流 → 归入系统项目「BioFlow 执行记录」 */
      let projectId = wf.projectId;
      if (!projectId) {
        const SYSTEM_PROJECT = "BioFlow 执行记录";
        let sp = await db.query.projects.findFirst({ where: eq(projects.name, SYSTEM_PROJECT) });
        if (!sp) {
          await db.insert(projects).values({
            name: SYSTEM_PROJECT,
            description: "由 BioFlow 节点自动创建的 ELN 执行记录汇总（系统项目）",
            color: "slate",
            status: "active",
            createdById: ctx.user.id,
          });
          sp = await db.query.projects.findFirst({ where: eq(projects.name, SYSTEM_PROJECT) });
        }
        projectId = sp!.id;
      }

      const title = `${wf.name} · ${node.label}`;
      return db.transaction(async (tx) => {
        const code = await nextExperimentCode(tx);
        const [{ id }] = await tx
          .insert(experiments)
          .values({
            code,
            projectId,
            title,
            objective: `本记录由 BioFlow 业务流「${wf.name}」节点「${node.label}」创建，用于记录该节点的执行过程、原始数据与结论。`,
            content: DEFAULT_CONTENT,
            status: "planning",
            workflowId: wf.id,
            nodeKey: node.nodeKey,
            createdById: ctx.user.id,
            createdByName: ctx.user.name ?? null,
          })
          .$returningId();
        const [created] = await tx.select().from(experiments).where(eq(experiments.id, id));
        await appendExperimentRevision(tx, created, {
          id: ctx.user.id,
          name: ctx.user.name,
        }, "创建实验记录");
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "创建了实验",
          entityType: "experiment",
          entityId: id,
          entityName: `${code} ${title}`,
          detail: `来源：业务流「${wf.name}」节点「${node.label}」`,
        });
        return { id, code };
      });
    }),

  create: writeQuery
    .input(
      z.object({
        projectId: z.number(),
        title: z.string().min(1, "实验标题不能为空").max(255),
        objective: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return getDb().transaction(async (tx) => {
        const code = await nextExperimentCode(tx);
        const [{ id }] = await tx
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
        const [created] = await tx.select().from(experiments).where(eq(experiments.id, id));
        await appendExperimentRevision(tx, created, {
          id: ctx.user.id,
          name: ctx.user.name,
        }, "创建实验记录");
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "创建了实验",
          entityType: "experiment",
          entityId: id,
          entityName: `${code} ${input.title}`,
        });
        return { id, code };
      });
    }),

  update: writeQuery
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        objective: z.string().nullable().optional(),
        status: z.enum(["planning", "in_progress", "completed"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      try {
        const result = await getDb().transaction((tx) =>
          reviseExperiment(
            tx,
            id,
            data,
            { id: ctx.user.id, name: ctx.user.name },
            "更新实验元数据",
          ),
        );
        return { ok: true, revision: result.revision };
      } catch (error) {
        throwElnError(error);
      }
    }),

  /** 保存实验内容（区块 JSON） */
  saveContent: writeQuery
    .input(z.object({ id: z.number(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const content = normalizeElnContent(input.content);
        const result = await getDb().transaction((tx) =>
          reviseExperiment(
            tx,
            input.id,
            { content },
            { id: ctx.user.id, name: ctx.user.name },
            "保存实验内容",
          ),
        );
        return { ok: true, savedAt: new Date(), revision: result.revision };
      } catch (error) {
        throwElnError(error);
      }
    }),

  /** 复核签署后永久锁定；不存在“撤销签署”路径。 */
  sign: reviewerQuery
    .input(
      z.object({
        id: z.number(),
        meaning: z.literal("reviewed_and_approved"),
        confirmation: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const current = await getDb().query.experiments.findFirst({
          where: eq(experiments.id, input.id),
        });
        if (!current) throw new ElnError("not_found", "实验不存在");
        if (current.createdById === ctx.user.id && ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "复核签名必须由记录创建者之外的复核人完成",
          });
        }
        const result = await getDb().transaction((tx) =>
          signExperiment(tx, input.id, {
            id: ctx.user.id,
            name: ctx.user.name,
          }),
        );
        return { ok: true, ...result };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throwElnError(error);
      }
    }),

  createAmendment: writeQuery
    .input(z.object({ id: z.number(), reason: z.string().min(10).max(500) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await getDb().transaction((tx) =>
          createExperimentAmendment(
            tx,
            input.id,
            { id: ctx.user.id, name: ctx.user.name },
            input.reason,
          ),
        );
      } catch (error) {
        throwElnError(error);
      }
    }),

  delete: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
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
  addSampleUsage: writeQuery
    .input(
      z.object({
        experimentId: z.number(),
        sampleId: z.number(),
        amountUsed: z.number().positive("用量必须大于 0"),
        note: z.string().optional(),
        idempotencyKey: z.string().min(8).max(128).optional(),
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
      try {
        return await db.transaction(async (tx) => {
          const [lockedExp] = await tx
            .select()
            .from(experiments)
            .where(eq(experiments.id, input.experimentId))
            .limit(1)
            .for("update");
          if (!lockedExp) throw new TRPCError({ code: "NOT_FOUND", message: "实验不存在" });
          if (lockedExp.status === "signed") {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "实验已签署锁定" });
          }
          const inventory = await changeInventoryInTransaction(tx, {
            sampleId: input.sampleId,
            delta: -input.amountUsed,
            reason: "consume",
            note: `实验 ${lockedExp.code} 消耗${input.note ? `：${input.note}` : ""}`,
            actorId: ctx.user.id,
            actorName: ctx.user.name,
            source: "web",
            idempotencyKey: input.idempotencyKey,
          });
          if (!inventory.replayed) {
            await tx.insert(experimentSamples).values({
              experimentId: input.experimentId,
              sampleId: input.sampleId,
              amountUsed: input.amountUsed,
              note: input.note ?? null,
              createdByName: ctx.user.name ?? null,
            });
            const revision = await appendExperimentRevision(
              tx,
              lockedExp,
              { id: ctx.user.id, name: ctx.user.name },
              "登记实验样本消耗",
            );
            await appendActivity(tx, {
              userId: ctx.user.id,
              userName: ctx.user.name,
              action: "登记了实验样本消耗",
              entityType: "experiment",
              entityId: lockedExp.id,
              entityName: `${lockedExp.code} ${lockedExp.title}`,
              after: {
                revision: revision.revision,
                sampleId: input.sampleId,
                amountUsed: input.amountUsed,
              },
              reason: input.note,
            });
          }
          return { ok: true, replayed: inventory.replayed };
        });
      } catch (error) {
        if (error instanceof InventoryError) {
          throw new TRPCError({
            code: error.kind === "not_found" ? "NOT_FOUND" : "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        throw error;
      }
    }),

  /** 移除消耗记录（回补库存） */
  removeSampleUsage: writeQuery
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
      await db.transaction(async (tx) => {
        const [lockedExp] = exp
          ? await tx
              .select()
              .from(experiments)
              .where(eq(experiments.id, exp.id))
              .limit(1)
              .for("update")
          : [];
        if (lockedExp?.status === "signed") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "实验已签署锁定" });
        }
        await changeInventoryInTransaction(tx, {
          sampleId: usage.sampleId,
          delta: usage.amountUsed,
          reason: "adjust",
          note: `撤销实验 ${exp?.code ?? usage.experimentId} 的消耗记录`,
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          source: "web",
          idempotencyKey: `remove-usage-${usage.id}`,
        });
        await tx.delete(experimentSamples).where(eq(experimentSamples.id, input.usageId));
        if (lockedExp) {
          const revision = await appendExperimentRevision(
            tx,
            lockedExp,
            { id: ctx.user.id, name: ctx.user.name },
            "撤销实验样本消耗",
          );
          await appendActivity(tx, {
            userId: ctx.user.id,
            userName: ctx.user.name,
            action: "撤销了实验样本消耗",
            entityType: "experiment",
            entityId: lockedExp.id,
            entityName: `${lockedExp.code} ${lockedExp.title}`,
            after: { revision: revision.revision, removedUsageId: usage.id },
          });
        }
      });
      return { ok: true };
    }),
});
