/** v6 演示数据：BioFlow 节点关联 ELN（项目 → 业务流 → 节点 → ELN）。幂等。 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { activities, experiments, users, workflowNodes, workflows } from "./schema";

const db = getDb();
const workflowName = "重组抗体表达与表征 Pipeline";
const nodeKey = "n4";
const code = "EXP-0014";

const workflow = await db.query.workflows.findFirst({
  where: eq(workflows.name, workflowName),
});
if (!workflow?.projectId) throw new Error(`linked workflow missing: ${workflowName}`);

const node = await db.query.workflowNodes.findFirst({
  where: and(eq(workflowNodes.workflowId, workflow.id), eq(workflowNodes.nodeKey, nodeKey)),
});
if (!node) throw new Error(`workflow node missing: ${workflowName}/${nodeKey}`);

const actor = await db.query.users.findFirst({ where: eq(users.unionId, "local:admin") });
const content = JSON.stringify([
  { id: "b1", type: "heading", text: "实验目的" },
  {
    id: "b2",
    type: "text",
    text: "验证候选重组抗体在 HEK293F 细胞中的小试瞬时表达水平，为后续 Protein A 纯化与亲和力表征提供上清样品。",
  },
  { id: "b3", type: "heading", text: "实验步骤" },
  {
    id: "b4",
    type: "checklist",
    items: [
      { id: "s1", text: "HEK293F 细胞密度与活率确认", done: true },
      { id: "s2", text: "质粒转染与 37 °C 培养", done: true },
      { id: "s3", text: "第 5 天取样并测定表达量", done: false },
    ],
  },
  { id: "b5", type: "heading", text: "结果与结论" },
  { id: "b6", type: "text", text: "待完成表达量检测后填写。" },
]);

let experiment = await db.query.experiments.findFirst({ where: eq(experiments.code, code) });
if (!experiment) {
  const [{ id }] = await db.insert(experiments).values({
    code,
    projectId: workflow.projectId,
    workflowId: workflow.id,
    nodeKey,
    title: node.label,
    objective: "完成 HEK293F 小试瞬转表达并评估上清抗体表达量。",
    status: "in_progress",
    content,
    createdById: actor?.id ?? null,
    createdByName: actor?.name ?? "BioMap 管理员",
  }).$returningId();
  experiment = await db.query.experiments.findFirst({ where: eq(experiments.id, id) });
} else {
  await db.update(experiments).set({
    projectId: workflow.projectId,
    workflowId: workflow.id,
    nodeKey,
  }).where(eq(experiments.id, experiment.id));
}

const activityName = `${code} ${node.label}`;
const activity = await db.query.activities.findFirst({
  where: and(
    eq(activities.action, "创建了节点实验记录"),
    eq(activities.entityName, activityName),
  ),
});
if (!activity) {
  await db.insert(activities).values({
    userId: actor?.id ?? null,
    userName: actor?.name ?? "BioMap 管理员",
    action: "创建了节点实验记录",
    entityType: "experiment",
    entityId: experiment!.id,
    entityName: activityName,
    detail: `业务流「${workflow.name}」· 节点「${node.label}」`,
  });
}

console.log(`node ELN ready: ${code} -> workflow ${workflow.id}/${nodeKey}`);
process.exit(0);
