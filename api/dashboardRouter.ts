import { z } from "zod";
import { and, desc, eq, gte, isNotNull, like, lte, or, sql } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  activities,
  experiments,
  projects,
  samples,
  sequences,
  storageLocations,
} from "@db/schema";

function datePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const dashboardRouter = createRouter({
  /** 仪表盘统计数据 */
  stats: authedQuery.query(async () => {
    const db = getDb();
    const [projActive] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(projects)
      .where(eq(projects.status, "active"));
    const [expTotal] = await db.select({ n: sql<number>`COUNT(*)` }).from(experiments);
    const [expInProgress] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(experiments)
      .where(eq(experiments.status, "in_progress"));
    const [expSigned] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(experiments)
      .where(eq(experiments.status, "signed"));
    const [sampleTotal] = await db.select({ n: sql<number>`COUNT(*)` }).from(samples);
    const [seqTotal] = await db.select({ n: sql<number>`COUNT(*)` }).from(sequences);
    const [locTotal] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(storageLocations);

    const today = datePlus(0);
    const soon = datePlus(30);
    const [expiring] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(samples)
      .where(
        and(
          isNotNull(samples.expiryDate),
          gte(samples.expiryDate, today),
          lte(samples.expiryDate, soon),
        ),
      );
    const [expired] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(samples)
      .where(and(isNotNull(samples.expiryDate), lte(samples.expiryDate, today)));

    const lowStockRows = await db
      .select({ id: samples.id })
      .from(samples)
      .where(
        and(
          isNotNull(samples.alertThreshold),
          sql`${samples.quantity} <= ${samples.alertThreshold}`,
        ),
      );

    return {
      activeProjects: Number(projActive?.n ?? 0),
      totalExperiments: Number(expTotal?.n ?? 0),
      inProgressExperiments: Number(expInProgress?.n ?? 0),
      signedExperiments: Number(expSigned?.n ?? 0),
      totalSamples: Number(sampleTotal?.n ?? 0),
      totalSequences: Number(seqTotal?.n ?? 0),
      totalLocations: Number(locTotal?.n ?? 0),
      expiringSoon: Number(expiring?.n ?? 0),
      expired: Number(expired?.n ?? 0),
      lowStock: lowStockRows.length,
    };
  }),

  /** 最近活动 */
  recentActivity: authedQuery
    .input(z.object({ limit: z.number().default(30) }).optional())
    .query(async ({ input }) => {
      return getDb()
        .select()
        .from(activities)
        .orderBy(desc(activities.createdAt))
        .limit(input?.limit ?? 30);
    }),

  /** 临期 / 过期样本 */
  expiringSamples: authedQuery.query(async () => {
    const db = getDb();
    const soon = datePlus(30);
    return db
      .select()
      .from(samples)
      .where(and(isNotNull(samples.expiryDate), lte(samples.expiryDate, soon)))
      .orderBy(samples.expiryDate)
      .limit(50);
  }),

  /** 低库存样本 */
  lowStockSamples: authedQuery.query(async () => {
    const db = getDb();
    return db
      .select()
      .from(samples)
      .where(
        and(
          isNotNull(samples.alertThreshold),
          sql`${samples.quantity} <= ${samples.alertThreshold}`,
        ),
      )
      .orderBy(samples.quantity)
      .limit(50);
  }),

  /** 全局搜索 */
  search: authedQuery
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = getDb();
      const q = `%${input.q}%`;
      const exps = await db
        .select({
          id: experiments.id,
          code: experiments.code,
          title: experiments.title,
          status: experiments.status,
          updatedAt: experiments.updatedAt,
        })
        .from(experiments)
        .where(or(like(experiments.title, q), like(experiments.code, q)))
        .limit(20);
      const smps = await db
        .select({
          id: samples.id,
          sku: samples.sku,
          name: samples.name,
          type: samples.type,
          quantity: samples.quantity,
          unit: samples.unit,
        })
        .from(samples)
        .where(or(like(samples.name, q), like(samples.sku, q)))
        .limit(20);
      const projs = await db
        .select({
          id: projects.id,
          name: projects.name,
          status: projects.status,
          color: projects.color,
        })
        .from(projects)
        .where(like(projects.name, q))
        .limit(10);
      const seqs = await db
        .select({ id: sequences.id, name: sequences.name, type: sequences.type })
        .from(sequences)
        .where(like(sequences.name, q))
        .limit(10);
      const locs = await db
        .select({ id: storageLocations.id, name: storageLocations.name, type: storageLocations.type })
        .from(storageLocations)
        .where(like(storageLocations.name, q))
        .limit(10);
      return { experiments: exps, samples: smps, projects: projs, sequences: seqs, locations: locs };
    }),
});
