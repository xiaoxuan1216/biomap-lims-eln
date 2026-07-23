import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq, or } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { experiments, projects, samples } from "@db/schema";
import { logActivity } from "./queries/labHelpers";

const projectInput = z.object({
  name: z.string().min(1, "项目名称不能为空").max(255),
  description: z.string().optional(),
  color: z.string().default("teal"),
  status: z.enum(["active", "on_hold", "completed"]).default("active"),
});

export const projectRouter = createRouter({
  /** 项目列表（含实验数/样本数统计） */
  list: authedQuery.query(async () => {
    const db = getDb();
    const all = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    const exps = await db
      .select({ projectId: experiments.projectId, id: experiments.id, status: experiments.status })
      .from(experiments);
    const smps = await db
      .select({ projectId: samples.projectId, id: samples.id })
      .from(samples);
    return all.map((p) => ({
      ...p,
      experimentCount: exps.filter((e) => e.projectId === p.id).length,
      activeExperimentCount: exps.filter(
        (e) => e.projectId === p.id && (e.status === "in_progress" || e.status === "planning"),
      ).length,
      sampleCount: smps.filter((s) => s.projectId === p.id).length,
    }));
  }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, input.id),
    });
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
    const exps = await db
      .select()
      .from(experiments)
      .where(eq(experiments.projectId, input.id))
      .orderBy(desc(experiments.updatedAt));
    const smps = await db
      .select()
      .from(samples)
      .where(eq(samples.projectId, input.id))
      .orderBy(asc(samples.name));
    return { ...project, experiments: exps, samples: smps };
  }),

  create: authedQuery.input(projectInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [{ id }] = await db
      .insert(projects)
      .values({ ...input, createdById: ctx.user.id })
      .$returningId();
    await logActivity({
      userName: ctx.user.name,
      action: "创建了项目",
      entityType: "project",
      entityId: id,
      entityName: input.name,
    });
    return { id };
  }),

  update: authedQuery
    .input(z.object({ id: z.number() }).merge(projectInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await getDb().update(projects).set(data).where(eq(projects.id, id));
      await logActivity({
        userName: ctx.user.name,
        action: "更新了项目",
        entityType: "project",
        entityId: id,
        entityName: data.name,
      });
      return { ok: true };
    }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const expCount = await db
      .select({ id: experiments.id })
      .from(experiments)
      .where(eq(experiments.projectId, input.id))
      .limit(1);
    if (expCount.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "项目下仍有实验记录，无法删除。请先删除或转移实验。",
      });
    }
    await db.update(samples).set({ projectId: null }).where(eq(samples.projectId, input.id));
    await db.delete(projects).where(eq(projects.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "删除了项目",
      entityType: "project",
      entityId: input.id,
    });
    return { ok: true };
  }),

  /** 项目下拉选项 */
  options: authedQuery.query(async () => {
    return getDb()
      .select({ id: projects.id, name: projects.name, color: projects.color })
      .from(projects)
      .where(or(eq(projects.status, "active"), eq(projects.status, "on_hold")))
      .orderBy(asc(projects.name));
  }),
});
