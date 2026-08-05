/** ELN 演示数据：典型实验任务「Trastuzumab scFv 重组表达与纯化」
 *  幂等：项目按 name upsert；实验按 code upsert（content/状态全量覆盖）；
 *  样本消耗：先撤销本实验旧的 experiment_samples + stock_transactions，再重插并同步库存；
 *  业务流关联：把 v3 演示 Pipeline 挂到本项目/本实验下（仅当其尚未关联时）。 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import {
  activities,
  experiments,
  experimentSamples,
  projects,
  samples,
  stockTransactions,
  workflows,
} from "./schema";

const db = getDb();
const __dir = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(__dir, "eln_experiment.json"), "utf-8"));
const E = D.experiment;

/* ── 1. 项目 ── */
let proj = await db.query.projects.findFirst({ where: eq(projects.name, D.project.name) });
if (!proj) {
  await db.insert(projects).values({
    name: D.project.name,
    description: D.project.description,
    color: D.project.color,
    status: D.project.status,
    createdById: 2000001,
  });
  proj = await db.query.projects.findFirst({ where: eq(projects.name, D.project.name) });
}
console.log("project id:", proj!.id);

/* ── 2. 实验（ELN 内容） ── */
const content = JSON.stringify(E.blocks);
let exp = await db.query.experiments.findFirst({ where: eq(experiments.code, E.code) });
const row = {
  projectId: proj!.id,
  title: E.title,
  objective: E.objective,
  status: E.status as "signed",
  content,
  signedById: 2000001,
  signedByName: E.signedByName,
  signedAt: new Date(E.signedAt),
  createdById: 2000001,
  createdByName: E.createdByName,
  createdAt: new Date(E.createdAt),
};
if (!exp) {
  await db.insert(experiments).values({ code: E.code, ...row });
  exp = await db.query.experiments.findFirst({ where: eq(experiments.code, E.code) });
} else {
  await db.update(experiments).set(row).where(eq(experiments.id, exp.id));
}
console.log("experiment id:", exp!.id, "blocks:", E.blocks.length);

/* ── 3. 样本消耗（先撤旧账，保持一致性） ── */
const oldCons = await db.query.experimentSamples.findMany({
  where: eq(experimentSamples.experimentId, exp!.id),
});
for (const c of oldCons) {
  // 回滚库存与流水
  const s = await db.query.samples.findFirst({ where: eq(samples.id, c.sampleId) });
  if (s) {
    await db.update(samples).set({ quantity: s.quantity + c.amountUsed }).where(eq(samples.id, s.id));
  }
  await db
    .delete(stockTransactions)
    .where(and(eq(stockTransactions.sampleId, c.sampleId), eq(stockTransactions.note, `Consumed by ${E.code}: ${c.note ?? ""}`)));
}
await db.delete(experimentSamples).where(eq(experimentSamples.experimentId, exp!.id));

for (const c of D.consume as { sampleId: number; amount: number; note: string }[]) {
  const s = await db.query.samples.findFirst({ where: eq(samples.id, c.sampleId) });
  if (!s) throw new Error(`sample ${c.sampleId} not found`);
  await db.insert(experimentSamples).values({
    experimentId: exp!.id,
    sampleId: c.sampleId,
    amountUsed: c.amount,
    note: c.note,
    createdByName: E.createdByName,
  });
  await db.insert(stockTransactions).values({
    sampleId: c.sampleId,
    delta: -c.amount,
    reason: "consume",
    note: `Consumed by ${E.code}: ${c.note}`,
    userName: E.createdByName,
  });
  await db.update(samples).set({ quantity: s.quantity - c.amount }).where(eq(samples.id, s.id));
  console.log(`consumed sample ${c.sampleId} x${c.amount} (${s.quantity} -> ${s.quantity - c.amount})`);
}

/* ── 4. 关联 v3 演示业务流到本项目/实验（仅未关联时） ── */
const wf = await db.query.workflows.findFirst({ where: eq(workflows.id, D.linkWorkflowId) });
if (wf && !wf.projectId && !wf.experimentId) {
  await db
    .update(workflows)
    .set({ projectId: proj!.id, experimentId: exp!.id })
    .where(eq(workflows.id, wf.id));
  console.log("linked workflow", wf.id, "-> project", proj!.id, "experiment", exp!.id);
} else {
  console.log("workflow link skipped:", wf ? `already ${wf.projectId}/${wf.experimentId}` : "not found");
}

/* ── 5. 活动日志（幂等：按 action+entityName+createdAt 去重） ── */
for (const a of D.activities as any[]) {
  const entityId = a.entityId ?? exp!.id;
  const entityName = a.entityName ?? `${E.code} ${E.title}`;
  const exist = await db.query.activities.findFirst({
    where: and(
      eq(activities.action, a.action),
      eq(activities.entityType, a.entityType),
      eq(activities.entityName, entityName),
    ),
  });
  if (exist) continue;
  await db.insert(activities).values({
    userName: E.createdByName,
    action: a.action,
    entityType: a.entityType,
    entityId,
    entityName,
    detail: a.detail ?? null,
    createdAt: new Date(a.createdAt),
  });
}
console.log("activities seeded");

/* ── 汇总 ── */
const finalExp = await db.query.experiments.findFirst({ where: eq(experiments.code, E.code) });
console.log("done:", finalExp!.code, finalExp!.status, "content bytes:", finalExp!.content!.length);
process.exit(0);
