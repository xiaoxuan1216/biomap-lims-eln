import { getDb } from "./connection";
import { activities, experiments, samples } from "@db/schema";
import { desc, sql } from "drizzle-orm";

/** 记录活动日志（审计追踪） */
export async function logActivity(params: {
  userName?: string | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  entityName?: string | null;
  detail?: string | null;
}) {
  await getDb().insert(activities).values({
    userName: params.userName ?? "系统",
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    entityName: params.entityName ?? null,
    detail: params.detail ?? null,
  });
}

/** 生成下一个实验编号 EXP-0001 */
export async function nextExperimentCode(): Promise<string> {
  const rows = await getDb()
    .select({ code: experiments.code })
    .from(experiments)
    .orderBy(desc(experiments.id))
    .limit(1);
  const last = rows[0]?.code;
  const num = last ? parseInt(last.replace("EXP-", ""), 10) + 1 : 1;
  return `EXP-${String(num).padStart(4, "0")}`;
}

/** 生成下一个样本编号 SMP-0001 */
export async function nextSampleSku(): Promise<string> {
  const [row] = await getDb()
    .select({ maxId: sql<number>`MAX(id)` })
    .from(samples);
  const num = (row?.maxId ?? 0) + 1;
  return `SMP-${String(num).padStart(4, "0")}`;
}
