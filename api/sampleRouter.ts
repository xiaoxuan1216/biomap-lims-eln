import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  experimentSamples,
  lineageEdges,
  projects,
  samples,
  sequenceFeatures,
  sequences,
  stockTransactions,
  storageLocations,
} from "@db/schema";
import { logActivity, nextSampleSku } from "./queries/labHelpers";

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
      const conditions = [];
      if (input?.type) conditions.push(eq(samples.type, input.type));
      if (input?.locationId) conditions.push(eq(samples.locationId, input.locationId));
      if (input?.projectId) conditions.push(eq(samples.projectId, input.projectId));
      if (input?.search) {
        conditions.push(
          or(
            like(samples.name, `%${input.search}%`),
            like(samples.sku, `%${input.search}%`),
          ),
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
        .where(conditions.length ? and(...conditions) : undefined)
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
      where: eq(samples.id, input.id),
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
      const db = getDb();
      type Key = string;
      const key = (kind: string, id: number): Key => `${kind}:${id}`;
      const visited = new Set<Key>();
      const nodeMap = new Map<Key, Record<string, unknown>>();
      const edgesOut: { childKey: Key; parentKey: Key; relation: string; note: string | null }[] = [];

      const loadNode = async (kind: "sample" | "sequence", id: number, depth: number) => {
        const k = key(kind, id);
        if (visited.has(k) || depth > 8) return;
        visited.add(k);
        if (kind === "sample") {
          const s = await db.query.samples.findFirst({ where: eq(samples.id, id) });
          if (!s) return;
          let seq: { id: number; name: string; type: string; len: number; pdbId: string | null; description: string | null } | null = null;
          if (s.sequenceId) {
            const q = await db.query.sequences.findFirst({ where: eq(sequences.id, s.sequenceId) });
            if (q) {
              const feats = await db.select().from(sequenceFeatures).where(eq(sequenceFeatures.sequenceId, q.id));
              seq = {
                id: q.id, name: q.name, type: q.type, len: q.sequence.length,
                pdbId: q.pdbId, description: q.description, text: q.sequence,
                features: feats.map((f) => ({ name: f.name, type: f.type, start: f.start, end: f.end, strand: f.strand, color: f.color, note: f.note })),
              };
            }
          }
          nodeMap.set(k, {
            key: k, kind, id, depth,
            name: s.name, sampleType: s.type, sku: s.sku,
            quantity: s.quantity, unit: s.unit, expiryDate: s.expiryDate,
            sequence: seq,
          });
        } else {
          const q = await db.query.sequences.findFirst({ where: eq(sequences.id, id) });
          if (!q) return;
          const feats = await db
            .select()
            .from(sequenceFeatures)
            .where(eq(sequenceFeatures.sequenceId, id));
          nodeMap.set(k, {
            key: k, kind, id, depth,
            name: q.name, seqType: q.type, len: q.sequence.length,
            pdbId: q.pdbId, description: q.description, text: q.sequence,
            features: feats.map((f) => ({
              name: f.name, type: f.type, start: f.start, end: f.end, strand: f.strand, color: f.color, note: f.note,
            })),
          });
        }
        /* 继续向上 */
        const ups = await db
          .select()
          .from(lineageEdges)
          .where(and(eq(lineageEdges.childKind, kind), eq(lineageEdges.childId, id)));
        for (const e of ups) {
          edgesOut.push({ childKey: k, parentKey: key(e.parentKind, e.parentId), relation: e.relation, note: e.note });
          await loadNode(e.parentKind, e.parentId, depth + 1);
        }
        /* 样本的分子定义序列也作为上游节点挂出 */
        if (kind === "sample") {
          const node = nodeMap.get(k) as { sequence?: { id: number } } | undefined;
          if (node?.sequence) {
            edgesOut.push({ childKey: k, parentKey: key("sequence", node.sequence.id), relation: "defined_by", note: null });
            await loadNode("sequence", node.sequence.id, depth + 1);
          }
        }
      };

      await loadNode(input.kind, input.id, 0);
      if (!visited.size) throw new TRPCError({ code: "NOT_FOUND", message: "样本不存在" });
      return {
        root: key(input.kind, input.id),
        nodes: [...nodeMap.values()],
        edges: edgesOut,
      };
    }),

  create: authedQuery.input(sampleInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const sku = await nextSampleSku();
    const [{ id }] = await db
      .insert(samples)
      .values({
        ...input,
        sku,
        createdById: ctx.user.id,
        createdByName: ctx.user.name ?? null,
      })
      .$returningId();
    if (input.quantity > 0) {
      await db.insert(stockTransactions).values({
        sampleId: id,
        delta: input.quantity,
        reason: "restock",
        note: "初始入库",
        userName: ctx.user.name ?? null,
      });
    }
    await logActivity({
      userName: ctx.user.name,
      action: "登记了样本",
      entityType: "sample",
      entityId: id,
      entityName: `${sku} ${input.name}`,
    });
    return { id, sku };
  }),

  update: authedQuery
    .input(z.object({ id: z.number() }).merge(sampleInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb().update(samples).set(data).where(eq(samples.id, id));
      await logActivity({
        userName: ctx.user.name,
        action: "更新了样本信息",
        entityType: "sample",
        entityId: id,
        entityName: data.name,
      });
      return { ok: true };
    }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const sample = await db.query.samples.findFirst({
      where: eq(samples.id, input.id),
    });
    await db.delete(experimentSamples).where(eq(experimentSamples.sampleId, input.id));
    await db.delete(stockTransactions).where(eq(stockTransactions.sampleId, input.id));
    await db.delete(samples).where(eq(samples.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "删除了样本",
      entityType: "sample",
      entityId: input.id,
      entityName: sample ? `${sample.sku} ${sample.name}` : null,
    });
    return { ok: true };
  }),

  /** 入库 / 出库 / 调整 / 废弃 */
  transact: authedQuery
    .input(
      z.object({
        sampleId: z.number(),
        amount: z.number().positive("数量必须大于 0"),
        reason: z.enum(["restock", "consume", "adjust", "dispose"]),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const sample = await db.query.samples.findFirst({
        where: eq(samples.id, input.sampleId),
      });
      if (!sample) throw new TRPCError({ code: "NOT_FOUND", message: "样本不存在" });
      const isIn = input.reason === "restock" || input.reason === "adjust";
      const delta = isIn ? input.amount : -input.amount;
      if (!isIn && sample.quantity < input.amount) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `库存不足：当前仅剩 ${sample.quantity} ${sample.unit}`,
        });
      }
      await db.transaction(async (tx) => {
        await tx
          .update(samples)
          .set({ quantity: sample.quantity + delta })
          .where(eq(samples.id, input.sampleId));
        await tx.insert(stockTransactions).values({
          sampleId: input.sampleId,
          delta,
          reason: input.reason,
          note: input.note ?? null,
          userName: ctx.user.name ?? null,
        });
      });
      const actionMap = {
        restock: "入库",
        consume: "领用出库",
        adjust: "调整库存",
        dispose: "废弃出库",
      } as const;
      await logActivity({
        userName: ctx.user.name,
        action: `对样本${actionMap[input.reason]}`,
        entityType: "sample",
        entityId: input.sampleId,
        entityName: `${sample.sku} ${sample.name}`,
        detail: `${delta > 0 ? "+" : ""}${delta} ${sample.unit}${input.note ? `（${input.note}）` : ""}`,
      });
      return { ok: true, newQuantity: sample.quantity + delta };
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
      .orderBy(asc(samples.name))
      .limit(500);
  }),
});
