import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq, like } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sequenceFeatures, sequences } from "@db/schema";
import { logActivity } from "./queries/labHelpers";
import {
  autoAnnotate,
  baseCounts,
  findOrfs,
  findRestrictionSites,
  gcContent,
  uniqueCutters,
} from "./queries/bioUtils";

export const sequenceRouter = createRouter({
  list: authedQuery
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(sequences)
        .where(input?.search ? like(sequences.name, `%${input.search}%`) : undefined)
        .orderBy(desc(sequences.createdAt))
        .limit(200);
    }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const seq = await db.query.sequences.findFirst({
      where: eq(sequences.id, input.id),
    });
    if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "序列不存在" });
    const features = await db
      .select()
      .from(sequenceFeatures)
      .where(eq(sequenceFeatures.sequenceId, input.id))
      .orderBy(asc(sequenceFeatures.start));
    return { ...seq, features };
  }),

  /** 添加特性注释 */
  addFeature: authedQuery
    .input(
      z.object({
        sequenceId: z.number(),
        name: z.string().min(1, "特性名称不能为空").max(255),
        type: z
          .enum([
            "promoter",
            "cds",
            "resistance",
            "origin",
            "terminator",
            "tag",
            "primer_bind",
            "restriction_site",
            "regulatory",
            "other",
          ])
          .default("other"),
        start: z.number().min(1),
        end: z.number().min(1),
        strand: z.union([z.literal(1), z.literal(-1)]).default(1),
        color: z.string().default("teal"),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const seq = await db.query.sequences.findFirst({
        where: eq(sequences.id, input.sequenceId),
      });
      if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "序列不存在" });
      if (input.start > input.end || input.end > seq.sequence.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `位置范围无效（序列长度 ${seq.sequence.length}）`,
        });
      }
      const [{ id }] = await db
        .insert(sequenceFeatures)
        .values({ ...input, note: input.note ?? null })
        .$returningId();
      return { id };
    }),

  updateFeature: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        type: z
          .enum([
            "promoter",
            "cds",
            "resistance",
            "origin",
            "terminator",
            "tag",
            "primer_bind",
            "restriction_site",
            "regulatory",
            "other",
          ])
          .optional(),
        start: z.number().min(1).optional(),
        end: z.number().min(1).optional(),
        strand: z.union([z.literal(1), z.literal(-1)]).optional(),
        color: z.string().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await getDb().update(sequenceFeatures).set(data).where(eq(sequenceFeatures.id, id));
      return { ok: true };
    }),

  deleteFeature: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await getDb().delete(sequenceFeatures).where(eq(sequenceFeatures.id, input.id));
      return { ok: true };
    }),

  /** 自动注释：扫描常见启动子/标签/酶切位点等元件 */
  autoAnnotate: authedQuery
    .input(z.object({ sequenceId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const seq = await db.query.sequences.findFirst({
        where: eq(sequences.id, input.sequenceId),
      });
      if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "序列不存在" });
      const found = autoAnnotate(seq.sequence);
      // 避免重复注释：取已有特性坐标集合
      const existing = await db
        .select()
        .from(sequenceFeatures)
        .where(eq(sequenceFeatures.sequenceId, input.sequenceId));
      const existingKeys = new Set(
        existing.map((f) => `${f.name}-${f.start}-${f.end}-${f.strand}`),
      );
      const fresh = found.filter(
        (f) => !existingKeys.has(`${f.name}-${f.start}-${f.end}-${f.strand}`),
      );
      if (fresh.length) {
        await db.insert(sequenceFeatures).values(
          fresh.map((f) => ({
            sequenceId: input.sequenceId,
            name: f.name,
            type: f.type as (typeof sequenceFeatures.$inferInsert)["type"],
            start: f.start,
            end: f.end,
            strand: f.strand,
            color: f.color,
          })),
        );
      }
      await logActivity({
        userName: ctx.user.name,
        action: "自动注释了序列",
        entityType: "sequence",
        entityId: input.sequenceId,
        entityName: seq.name,
        detail: `新增 ${fresh.length} 个特性`,
      });
      return { added: fresh.length, total: existing.length + fresh.length };
    }),

  /** 序列深度分析（Copilot 同款引擎） */
  analyze: authedQuery
    .input(z.object({ sequenceId: z.number() }))
    .query(async ({ input }) => {
      const seq = await getDb().query.sequences.findFirst({
        where: eq(sequences.id, input.sequenceId),
      });
      if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "序列不存在" });
      const s = seq.sequence;
      const isNucleic = seq.type !== "protein";
      return {
        length: s.length,
        type: seq.type,
        gc: isNucleic ? gcContent(s) : null,
        composition: baseCounts(s),
        orfs: isNucleic ? findOrfs(s, 30).slice(0, 8) : [],
        restrictionSites: isNucleic ? findRestrictionSites(s) : [],
        uniqueCutters: isNucleic ? uniqueCutters(s) : [],
      };
    }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1, "序列名称不能为空").max(255),
        type: z.enum(["dna", "rna", "protein"]).default("dna"),
        sequence: z.string().min(1, "序列内容不能为空"),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cleaned = input.sequence.replace(/[^A-Za-z]/g, "").toUpperCase();
      const [{ id }] = await getDb()
        .insert(sequences)
        .values({
          name: input.name,
          type: input.type,
          sequence: cleaned,
          description: input.description ?? null,
          createdByName: ctx.user.name ?? null,
        })
        .$returningId();
      await logActivity({
        userName: ctx.user.name,
        action: "添加了序列",
        entityType: "sequence",
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
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await getDb().update(sequences).set(data).where(eq(sequences.id, id));
      return { ok: true };
    }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const seq = await getDb().query.sequences.findFirst({
      where: eq(sequences.id, input.id),
    });
    await getDb().delete(sequences).where(eq(sequences.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "删除了序列",
      entityType: "sequence",
      entityId: input.id,
      entityName: seq?.name,
    });
    return { ok: true };
  }),
});
