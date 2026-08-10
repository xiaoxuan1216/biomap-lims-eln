import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, like, or } from "drizzle-orm";
import { adminQuery, authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  experimentSamples,
  projects,
  samples,
  stockTransactions,
  storageLocations,
} from "@db/schema";
import { appendActivity, nextSampleSku } from "./queries/labHelpers";
import { buildLineage } from "./queries/lineage";
import {
  changeInventory,
  InventoryError,
  type InventoryReason,
} from "./services/inventoryService";

const SAMPLE_TYPES = [
  "cell_line",
  "plasmid",
  "primer",
  "antibody",
  "reagent",
  "chemical",
  "protein",
  "virus",
  "tissue",
  "buffer",
  "enzyme",
  "competent_cell",
  "other",
] as const;

const sampleInput = z.object({
  name: z.string().min(1, "样本名称不能为空").max(255),
  type: z.enum(SAMPLE_TYPES).default("other"),
  quantity: z.number().min(0).default(0),
  unit: z.string().max(20).default("管"),
  alertThreshold: z.number().min(0).nullable().optional(),
  locationId: z.number().nullable().optional(),
  boxRow: z.number().nullable().optional(),
  boxCol: z.number().nullable().optional(),
  projectId: z.number().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  notes: z.string().optional(),
});

const sampleMetadataInput = sampleInput.omit({ quantity: true });

function toInventoryTrpcError(error: unknown): never {
  if (error instanceof InventoryError) {
    const code = error.kind === "not_found"
      ? "NOT_FOUND"
      : error.kind === "insufficient"
        ? "PRECONDITION_FAILED"
        : "BAD_REQUEST";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

export const sampleRouter = createRouter({
  list: authedQuery
    .input(
      z
        .object({
          type: z.enum(SAMPLE_TYPES).optional(),
          locationId: z.number().optional(),
          projectId: z.number().optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = [isNull(samples.archivedAt)];
      if (input?.type) conditions.push(eq(samples.type, input.type));
      if (input?.locationId) conditions.push(eq(samples.locationId, input.locationId));
      if (input?.projectId) conditions.push(eq(samples.projectId, input.projectId));
      if (input?.search) {
        conditions.push(
          or(
            like(samples.name, `%${input.search}%`),
            like(samples.sku, `%${input.search}%`),
          )!,
        );
      }
      const rows = await db
        .select({
          sample: samples,
          locationName: storageLocations.name,
          locationType: storageLocations.type,
          projectName: projects.name,
        })
        .from(samples)
        .leftJoin(storageLocations, eq(samples.locationId, storageLocations.id))
        .leftJoin(projects, eq(samples.projectId, projects.id))
        .where(and(...conditions)!)
        .orderBy(desc(samples.updatedAt))
        .limit(500);
      return rows.map((r) => ({
        ...r.sample,
        locationName: r.locationName,
        locationType: r.locationType,
        projectName: r.projectName,
      }));
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const sample = await db.query.samples.findFirst({
      where: and(eq(samples.id, input.id), isNull(samples.archivedAt)),
    });
    if (!sample) throw new TRPCError({ code: "NOT_FOUND", message: "样本不存在" });
    const location = sample.locationId
      ? await db.query.storageLocations.findFirst({
          where: eq(storageLocations.id, sample.locationId),
        })
      : null;
    const project = sample.projectId
      ? await db.query.projects.findFirst({ where: eq(projects.id, sample.projectId) })
      : null;
    const txs = await db
      .select()
      .from(stockTransactions)
      .where(eq(stockTransactions.sampleId, input.id))
      .orderBy(desc(stockTransactions.createdAt))
      .limit(100);
    const usage = await db
      .select()
      .from(experimentSamples)
      .where(eq(experimentSamples.sampleId, input.id))
      .orderBy(desc(experimentSamples.createdAt))
      .limit(50);
    return { ...sample, location, project, transactions: txs, experimentUsage: usage };
  }),

  /** 样本全生命周期追溯：自该样本向上（祖先方向）遍历谱系 DAG
   *  蛋白 → 表达体系 → 质粒（→其序列）→ 载体骨架 + 基因片段 */
  lineage: authedQuery
    .input(z.object({ id: z.number(), kind: z.enum(["sample", "sequence"]).default("sample") }))
    .query(async ({ input }) => {
      const result = await buildLineage(input.kind, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "样本不存在" });
      return result;
    }),

  create: writeQuery.input(sampleInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    return db.transaction(async (tx) => {
      const sku = await nextSampleSku(tx);
      const [{ id }] = await tx
        .insert(samples)
        .values({
          ...input,
          sku,
          createdById: ctx.user.id,
          createdByName: ctx.user.name ?? null,
        })
        .$returningId();
      if (input.quantity > 0) {
        await tx.insert(stockTransactions).values({
          sampleId: id,
          delta: input.quantity,
          quantityBefore: 0,
          quantityAfter: input.quantity,
          reason: "restock",
          note: "初始入库",
          userId: ctx.user.id,
          userName: ctx.user.name ?? null,
        });
      }
      await appendActivity(tx, {
        userId: ctx.user.id,
        userName: ctx.user.name,
        action: "登记了样本",
        entityType: "sample",
        entityId: id,
        entityName: `${sku} ${input.name}`,
        after: { ...input, id, sku },
      });
      return { id, sku };
    });
  }),

  update: writeQuery
    .input(z.object({ id: z.number() }).merge(sampleMetadataInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb().transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(samples)
          .where(and(eq(samples.id, id), isNull(samples.archivedAt)))
          .limit(1)
          .for("update");
        if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "样本不存在" });
        await tx.update(samples).set(data).where(eq(samples.id, id));
        await appendActivity(tx, {
          userId: ctx.user.id,
          userName: ctx.user.name,
          action: "更新了样本信息",
          entityType: "sample",
          entityId: id,
          entityName: data.name ?? before.name,
          before,
          after: { ...before, ...data },
        });
      });
      return { ok: true };
    }),

  delete: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const sample = await db.query.samples.findFirst({
      where: eq(samples.id, input.id),
    });
    if (!sample || sample.archivedAt) {
      throw new TRPCError({ code: "NOT_FOUND", message: "样本不存在" });
    }
    await db.transaction(async (tx) => {
      await tx
        .update(samples)
        .set({ archivedAt: new Date(), locationId: null, boxRow: null, boxCol: null })
        .where(eq(samples.id, input.id));
      await appendActivity(tx, {
        userId: ctx.user.id,
        userName: ctx.user.name,
        action: "归档了样本",
        entityType: "sample",
        entityId: input.id,
        entityName: `${sample.sku} ${sample.name}`,
        before: sample,
        after: { ...sample, archivedAt: new Date().toISOString() },
      });
    });
    return { ok: true };
  }),

  /** 入库 / 出库 / 调整 / 废弃 */
  transact: writeQuery
    .input(
      z.object({
        sampleId: z.number(),
        amount: z.number().positive("数量必须大于 0"),
        reason: z.enum(["restock", "consume", "adjust", "dispose"]),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isIn = input.reason === "restock" || input.reason === "adjust";
      const delta = isIn ? input.amount : -input.amount;
      try {
        const result = await changeInventory({
          sampleId: input.sampleId,
          delta,
          reason: input.reason as InventoryReason,
          note: input.note,
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          source: "web",
        });
        return { ok: true, newQuantity: result.quantityAfter };
      } catch (error) {
        return toInventoryTrpcError(error);
      }
    }),

  /** 样本下拉选项（实验登记消耗用） */
  options: authedQuery.query(async () => {
    return getDb()
      .select({
        id: samples.id,
        name: samples.name,
        sku: samples.sku,
        quantity: samples.quantity,
        unit: samples.unit,
      })
      .from(samples)
      .where(isNull(samples.archivedAt))
      .orderBy(asc(samples.name))
      .limit(500);
  }),
});
