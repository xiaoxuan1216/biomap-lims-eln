import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, eq, and, ne } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { samples, storageLocations } from "@db/schema";
import { logActivity } from "./queries/labHelpers";

const LOCATION_TYPES = ["lab", "freezer", "fridge", "shelf", "rack", "box"] as const;

export const storageRouter = createRouter({
  /** 全量位置列表（前端组装树） */
  tree: authedQuery.query(async () => {
    const db = getDb();
    const locations = await db
      .select()
      .from(storageLocations)
      .orderBy(asc(storageLocations.name));
    const smps = await db
      .select({ id: samples.id, locationId: samples.locationId })
      .from(samples);
    return locations.map((l) => ({
      ...l,
      sampleCount: smps.filter((s) => s.locationId === l.id).length,
    }));
  }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1, "名称不能为空").max(255),
        type: z.enum(LOCATION_TYPES),
        parentId: z.number().nullable().optional(),
        temperature: z.string().max(20).optional(),
        rows: z.number().min(1).max(26).optional(),
        cols: z.number().min(1).max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      if (input.type === "box" && (!input.rows || !input.cols)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "冻存盒必须指定行数和列数",
        });
      }
      const [{ id }] = await db
        .insert(storageLocations)
        .values({
          name: input.name,
          type: input.type,
          parentId: input.parentId ?? null,
          temperature: input.temperature ?? null,
          rows: input.type === "box" ? input.rows : null,
          cols: input.type === "box" ? input.cols : null,
        })
        .$returningId();
      await logActivity({
        userName: ctx.user.name,
        action: "创建了存储位置",
        entityType: "storage",
        entityId: id,
        entityName: input.name,
      });
      return { id };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        temperature: z.string().max(20).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb().update(storageLocations).set(data).where(eq(storageLocations.id, id));
      await logActivity({
        userName: ctx.user.name,
        action: "更新了存储位置",
        entityType: "storage",
        entityId: id,
        entityName: data.name,
      });
      return { ok: true };
    }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const children = await db
      .select({ id: storageLocations.id })
      .from(storageLocations)
      .where(eq(storageLocations.parentId, input.id))
      .limit(1);
    if (children.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "该位置下还有子位置，无法删除",
      });
    }
    const smps = await db
      .select({ id: samples.id })
      .from(samples)
      .where(eq(samples.locationId, input.id))
      .limit(1);
    if (smps.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "该位置内存有样本，无法删除",
      });
    }
    await db.delete(storageLocations).where(eq(storageLocations.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "删除了存储位置",
      entityType: "storage",
      entityId: input.id,
    });
    return { ok: true };
  }),

  /** 冻存盒详情（含格子占用情况） */
  boxDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const box = await db.query.storageLocations.findFirst({
        where: eq(storageLocations.id, input.id),
      });
      if (!box) throw new TRPCError({ code: "NOT_FOUND", message: "冻存盒不存在" });
      const placements = await db
        .select()
        .from(samples)
        .where(eq(samples.locationId, input.id))
        .orderBy(asc(samples.boxRow), asc(samples.boxCol));
      // 父链（面包屑）
      const path: { id: number; name: string; type: string }[] = [];
      let current = box;
      while (current.parentId) {
        const parent = await db.query.storageLocations.findFirst({
          where: eq(storageLocations.id, current.parentId),
        });
        if (!parent) break;
        path.unshift({ id: parent.id, name: parent.name, type: parent.type });
        current = parent;
      }
      return { ...box, placements, path };
    }),

  /** 将样本放入冻存盒指定格子 */
  placeSample: authedQuery
    .input(
      z.object({
        sampleId: z.number(),
        boxId: z.number(),
        row: z.number().min(1),
        col: z.number().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const box = await db.query.storageLocations.findFirst({
        where: eq(storageLocations.id, input.boxId),
      });
      if (!box || box.type !== "box") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "目标不是冻存盒" });
      }
      if (input.row > (box.rows ?? 0) || input.col > (box.cols ?? 0)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "位置超出冻存盒范围" });
      }
      const occupied = await db
        .select({ id: samples.id })
        .from(samples)
        .where(
          and(
            eq(samples.locationId, input.boxId),
            eq(samples.boxRow, input.row),
            eq(samples.boxCol, input.col),
            ne(samples.id, input.sampleId),
          ),
        )
        .limit(1);
      if (occupied.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "该格子已被占用",
        });
      }
      await db
        .update(samples)
        .set({ locationId: input.boxId, boxRow: input.row, boxCol: input.col })
        .where(eq(samples.id, input.sampleId));
      const sample = await db.query.samples.findFirst({
        where: eq(samples.id, input.sampleId),
      });
      await logActivity({
        userName: ctx.user.name,
        action: "调整了样本存储位置",
        entityType: "sample",
        entityId: input.sampleId,
        entityName: sample?.name,
        detail: `放入 ${box.name} 第 ${input.row} 行第 ${input.col} 列`,
      });
      return { ok: true };
    }),

  /** 移出冻存盒 */
  removePlacement: authedQuery
    .input(z.object({ sampleId: z.number() }))
    .mutation(async ({ input }) => {
      await getDb()
        .update(samples)
        .set({ locationId: null, boxRow: null, boxCol: null })
        .where(eq(samples.id, input.sampleId));
      return { ok: true };
    }),
});
