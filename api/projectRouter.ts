import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { adminQuery, authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { activities, experiments, externalOrders, projects, samples, workflowNodes, workflows } from "@db/schema";
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

  create: writeQuery.input(projectInput).mutation(async ({ ctx, input }) => {
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

  update: writeQuery
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

  delete: adminQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
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
    const externalOrderCount = await db
      .select({ id: externalOrders.id })
      .from(externalOrders)
      .where(eq(externalOrders.projectId, input.id))
      .limit(1);
    if (externalOrderCount.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "项目下仍有外部委托，无法删除。请先完成或迁移相关委托。",
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

  /** 项目专属仪表盘：业务流进度（含逐节点状态）+ 实验状态分布 + 最近动态 */
  dashboard: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const project = await db.query.projects.findFirst({ where: eq(projects.id, input.id) });
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });

    const wfs = await db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, input.id))
      .orderBy(desc(workflows.updatedAt));
    const wfIds = wfs.map((w) => w.id);
    const nodes = wfIds.length
      ? await db.select().from(workflowNodes).where(inArray(workflowNodes.workflowId, wfIds))
      : [];

    const wfSummaries = wfs.map((w) => {
      const ns = nodes
        .filter((n) => n.workflowId === w.id)
        .sort((a, b) => a.id - b.id);
      const active = ns.filter((n) => n.status !== "skipped");
      const done = ns.filter((n) => n.status === "done").length;
      return {
        id: w.id,
        name: w.name,
        status: w.status,
        experimentId: w.experimentId,
        parentWorkflowId: w.parentWorkflowId,
        parentNodeId: w.parentNodeId,
        updatedAt: w.updatedAt,
        total: active.length,
        done,
        inProgress: ns.filter((n) => n.status === "in_progress").length,
        progress: active.length ? Math.round((done / active.length) * 100) : 0,
        nodes: ns.map((n) => ({
          id: n.id,
          label: n.label,
          status: n.status,
          type: n.type,
        })),
      };
    });

    const expRows = await db
      .select({ id: experiments.id, status: experiments.status })
      .from(experiments)
      .where(eq(experiments.projectId, input.id));
    const expIds = expRows.map((e) => e.id);
    const externalOrderIds = (
      await db
        .select({ id: externalOrders.id })
        .from(externalOrders)
        .where(eq(externalOrders.projectId, input.id))
    ).map((order) => order.id);
    const expByStatus: Record<string, number> = {};
    for (const e of expRows) expByStatus[e.status] = (expByStatus[e.status] ?? 0) + 1;

    const actWhere = [
      and(eq(activities.entityType, "project"), eq(activities.entityId, input.id)),
      ...(expIds.length
        ? [and(eq(activities.entityType, "experiment"), inArray(activities.entityId, expIds))]
        : []),
      ...(wfIds.length
        ? [and(eq(activities.entityType, "workflow"), inArray(activities.entityId, wfIds))]
        : []),
      ...(externalOrderIds.length
        ? [and(eq(activities.entityType, "external_order"), inArray(activities.entityId, externalOrderIds))]
        : []),
    ];
    const recentActs = await db
      .select()
      .from(activities)
      .where(or(...actWhere))
      .orderBy(desc(activities.createdAt))
      .limit(12);

    return { project, workflows: wfSummaries, expByStatus, expTotal: expRows.length, activities: recentActs };
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
