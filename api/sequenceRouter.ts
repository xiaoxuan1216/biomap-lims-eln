import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq, like } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { sequences } from "@db/schema";
import { logActivity } from "./queries/labHelpers";

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
    const seq = await getDb().query.sequences.findFirst({
      where: eq(sequences.id, input.id),
    });
    if (!seq) throw new TRPCError({ code: "NOT_FOUND", message: "序列不存在" });
    return seq;
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
