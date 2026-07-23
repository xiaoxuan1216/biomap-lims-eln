import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { experiments, pipelines, pipelineStages, projects } from "@db/schema";
import { logActivity, nextExperimentCode } from "./queries/labHelpers";

const PIPELINE_TYPES = [
  "gibson_assembly",
  "golden_gate",
  "strain_engineering",
  "protein_expression",
  "dbtl_cycle",
  "custom",
] as const;

export const PIPELINE_TEMPLATES: Record<string, { label: string; stages: string[] }> = {
  gibson_assembly: {
    label: "载体构建（Gibson 组装）",
    stages: [
      "序列设计与密码子优化",
      "引物设计与合成",
      "基因片段 PCR 扩增",
      "载体酶切线性化",
      "Gibson 组装",
      "转化与克隆筛选",
      "Sanger 测序验证",
      "质粒保藏入库",
    ],
  },
  golden_gate: {
    label: "Golden Gate 多片段组装",
    stages: [
      "部件序列 Domestication（去除内部 BsaI/BsmBI 位点）",
      "引物设计与部件扩增",
      "IIS 酶切连接（BsaI/BsmBI）",
      "转化与蓝白斑/抗性筛选",
      "组装层级验证（菌落 PCR）",
      "测序验证与保藏",
    ],
  },
  strain_engineering: {
    label: "菌株基因组编辑（CRISPR）",
    stages: [
      "靶点选择与 gRNA 设计评估",
      "供体修复模板构建",
      "编辑质粒 / RNP 制备",
      "宿主转化与编辑",
      "阳性克隆筛选（菌落 PCR）",
      "基因型测序验证",
      "表型与生长曲线验证",
      "工程菌株保藏",
    ],
  },
  protein_expression: {
    label: "蛋白表达与纯化",
    stages: [
      "表达载体构建与转化",
      "小试表达条件优化（温度/诱导剂浓度）",
      "放大培养与诱导",
      "细胞破碎与粗提",
      "亲和纯化（Ni-NTA / Strep）",
      "纯度与浓度质控（SDS-PAGE / BCA）",
      "活性测定与入库",
    ],
  },
  dbtl_cycle: {
    label: "DBTL 工程循环",
    stages: ["Design · 设计", "Build · 构建", "Test · 测试", "Learn · 学习与建模"],
  },
  custom: { label: "自定义流程", stages: ["阶段 1"] },
};

async function getPipelineOrThrow(id: number) {
  const p = await getDb().query.pipelines.findFirst({ where: eq(pipelines.id, id) });
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline 不存在" });
  return p;
}

export const pipelineRouter = createRouter({
  templates: authedQuery.query(() =>
    Object.entries(PIPELINE_TEMPLATES).map(([key, t]) => ({
      key,
      label: t.label,
      stageCount: t.stages.length,
    })),
  ),

  list: authedQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        pipeline: pipelines,
        projectName: projects.name,
        projectColor: projects.color,
      })
      .from(pipelines)
      .leftJoin(projects, eq(pipelines.projectId, projects.id))
      .orderBy(desc(pipelines.updatedAt))
      .limit(100);
    const stages = await db.select().from(pipelineStages);
    return rows.map((r) => {
      const st = stages.filter((s) => s.pipelineId === r.pipeline.id);
      return {
        ...r.pipeline,
        projectName: r.projectName,
        projectColor: r.projectColor,
        totalStages: st.length,
        doneStages: st.filter((s) => s.status === "done").length,
        currentStage: st.find((s) => s.status === "in_progress")?.name ?? null,
      };
    });
  }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = getDb();
    const pipeline = await getPipelineOrThrow(input.id);
    const stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, input.id))
      .orderBy(asc(pipelineStages.orderIndex));
    const project = pipeline.projectId
      ? await db.query.projects.findFirst({ where: eq(projects.id, pipeline.projectId) })
      : null;
    const expIds = stages.map((s) => s.linkedExperimentId).filter((x): x is number => x != null);
    const linkedExps = expIds.length
      ? await Promise.all(
          expIds.map((id) => db.query.experiments.findFirst({ where: eq(experiments.id, id) })),
        )
      : [];
    const expMap = new Map(linkedExps.filter(Boolean).map((e) => [e!.id, e!]));
    return {
      ...pipeline,
      project,
      stages: stages.map((s) => ({
        ...s,
        linkedExperiment: s.linkedExperimentId ? expMap.get(s.linkedExperimentId) ?? null : null,
      })),
    };
  }),

  create: authedQuery
    .input(
      z.object({
        name: z.string().min(1, "名称不能为空").max(255),
        type: z.enum(PIPELINE_TYPES),
        projectId: z.number().nullable().optional(),
        description: z.string().optional(),
        customStages: z.array(z.string().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const template = PIPELINE_TEMPLATES[input.type];
      const stageNames =
        input.type === "custom" && input.customStages?.length
          ? input.customStages
          : template.stages;
      const [{ id }] = await db
        .insert(pipelines)
        .values({
          name: input.name,
          type: input.type,
          projectId: input.projectId ?? null,
          description: input.description ?? null,
          createdByName: ctx.user.name ?? null,
        })
        .$returningId();
      await db.insert(pipelineStages).values(
        stageNames.map((name, i) => ({
          pipelineId: id,
          name,
          orderIndex: i + 1,
          status: (i === 0 ? "in_progress" : "pending") as "in_progress" | "pending",
        })),
      );
      await logActivity({
        userName: ctx.user.name,
        action: "启动了合成生物学 Pipeline",
        entityType: "pipeline",
        entityId: id,
        entityName: input.name,
        detail: template.label,
      });
      return { id };
    }),

  /** 推进阶段状态 */
  updateStage: authedQuery
    .input(
      z.object({
        stageId: z.number(),
        status: z.enum(["pending", "in_progress", "done", "skipped"]),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const stage = await db.query.pipelineStages.findFirst({
        where: eq(pipelineStages.id, input.stageId),
      });
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "阶段不存在" });
      await db
        .update(pipelineStages)
        .set({
          status: input.status,
          notes: input.notes !== undefined ? input.notes : stage.notes,
          completedAt: input.status === "done" ? new Date() : null,
        })
        .where(eq(pipelineStages.id, input.stageId));
      // 若完成，自动激活下一阶段
      if (input.status === "done") {
        const next = await db.query.pipelineStages.findFirst({
          where: eq(pipelineStages.pipelineId, stage.pipelineId),
        });
        const all = await db
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.pipelineId, stage.pipelineId))
          .orderBy(asc(pipelineStages.orderIndex));
        const nextPending = all.find(
          (s) => s.orderIndex > stage.orderIndex && s.status === "pending",
        );
        if (nextPending && !all.some((s) => s.status === "in_progress")) {
          await db
            .update(pipelineStages)
            .set({ status: "in_progress" })
            .where(eq(pipelineStages.id, nextPending.id));
        }
        void next;
        // 全部完成 → pipeline 完成
        const remaining = all.filter(
          (s) => s.id !== stage.id && (s.status === "pending" || s.status === "in_progress"),
        );
        if (remaining.length === 0) {
          const pipeline = await getPipelineOrThrow(stage.pipelineId);
          if (pipeline.type === "dbtl_cycle") {
            // DBTL：自动进入下一轮迭代
            await db.insert(pipelineStages).values(
              PIPELINE_TEMPLATES.dbtl_cycle.stages.map((name, i) => ({
                pipelineId: stage.pipelineId,
                name: `${name}（迭代 ${pipeline.iteration + 1}）`,
                orderIndex: all.length + i + 1,
                status: (i === 0 ? "in_progress" : "pending") as "in_progress" | "pending",
              })),
            );
            await db
              .update(pipelines)
              .set({ iteration: pipeline.iteration + 1 })
              .where(eq(pipelines.id, stage.pipelineId));
            await logActivity({
              userName: ctx.user.name,
              action: "开启了新一轮 DBTL 迭代",
              entityType: "pipeline",
              entityId: stage.pipelineId,
              entityName: pipeline.name,
              detail: `第 ${pipeline.iteration + 1} 轮迭代`,
            });
          } else {
            await db
              .update(pipelines)
              .set({ status: "completed" })
              .where(eq(pipelines.id, stage.pipelineId));
            await logActivity({
              userName: ctx.user.name,
              action: "完成了 Pipeline",
              entityType: "pipeline",
              entityId: stage.pipelineId,
              entityName: pipeline.name,
            });
          }
        }
      }
      await db
        .update(pipelines)
        .set({ updatedAt: new Date() })
        .where(eq(pipelines.id, stage.pipelineId));
      return { ok: true };
    }),

  /** 为阶段创建关联实验 */
  createStageExperiment: authedQuery
    .input(
      z.object({
        stageId: z.number(),
        title: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const stage = await db.query.pipelineStages.findFirst({
        where: eq(pipelineStages.id, input.stageId),
      });
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "阶段不存在" });
      const pipeline = await getPipelineOrThrow(stage.pipelineId);
      if (!pipeline.projectId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "该 Pipeline 未关联项目，无法创建实验",
        });
      }
      const code = await nextExperimentCode();
      const [{ id: expId }] = await db
        .insert(experiments)
        .values({
          code,
          projectId: pipeline.projectId,
          title: input.title ?? `${pipeline.name} · ${stage.name}`,
          objective: `Pipeline 阶段任务：${stage.name}`,
          status: "in_progress",
          createdById: ctx.user.id,
          createdByName: ctx.user.name ?? null,
        })
        .$returningId();
      await db
        .update(pipelineStages)
        .set({ linkedExperimentId: expId, status: "in_progress" })
        .where(eq(pipelineStages.id, input.stageId));
      await logActivity({
        userName: ctx.user.name,
        action: "为 Pipeline 阶段创建了实验",
        entityType: "experiment",
        entityId: expId,
        entityName: `${code} ${stage.name}`,
      });
      return { experimentId: expId, code };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        status: z.enum(["active", "paused", "completed"]).optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await getDb().update(pipelines).set(data).where(eq(pipelines.id, id));
      return { ok: true };
    }),

  delete: authedQuery.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const pipeline = await getPipelineOrThrow(input.id);
    await db.delete(pipelineStages).where(eq(pipelineStages.pipelineId, input.id));
    await db.delete(pipelines).where(eq(pipelines.id, input.id));
    await logActivity({
      userName: ctx.user.name,
      action: "删除了 Pipeline",
      entityType: "pipeline",
      entityId: input.id,
      entityName: pipeline.name,
    });
    return { ok: true };
  }),
});
