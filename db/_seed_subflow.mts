/** 一次性脚本：给 zh/en 重组抗体表达 Pipeline 的「抗体基因分子克隆」节点挂接物理执行层子流程 */
import { getDb } from "../api/queries/connection";
import { workflows, workflowNodes, workflowEdges, activities } from "./schema";
import { eq } from "drizzle-orm";
import { SUBFLOW_TEMPLATES } from "../contracts/workflow";
import { en } from "../src/i18n/en";

const OWNER_EN: Record<string, string> = { 王工: "Wang", 李工: "Li", 张工: "Zhang", 赵工: "Zhao", 陈研究员: "Dr. Chen", 公共: "Shared", 演示用户: "Demo User" };
const tr = (s: string, isEn: boolean) => (isEn ? en[s] ?? OWNER_EN[s] ?? s : s);
const DONE = ["n1", "n2", "n3", "n4", "n5"];
const CURRENT = "n6";

const db = await getDb();
const tpl = SUBFLOW_TEMPLATES["m_ab_cloning"];
if (!tpl) throw new Error("subflow template missing");

const PARENTS = [
  { name: "重组抗体表达与表征 Pipeline", isEn: false },
  { name: "Recombinant Antibody Expression & Characterization Pipeline", isEn: true },
] as const;

for (const spec of PARENTS) {
  const { isEn } = spec;
  const parent = await db.query.workflows.findFirst({ where: eq(workflows.name, spec.name) });
  if (!parent) throw new Error("parent workflow missing: " + spec.name);
  const parentId = parent.id;
  if (parent.name.includes("分子克隆物理执行")) continue;
  const existing = await db.select().from(workflows);
  if (existing.some((w) => w.parentWorkflowId === parentId)) { console.log("skip", parentId, "(subflow exists)"); continue; }
  const nodes = await db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, parentId));
  const anchor = nodes.find((n) => n.templateKey === "m_ab_cloning");
  if (!anchor) throw new Error("anchor node missing in " + parentId);

  const name = tr(tpl.name, isEn);
  const [{ id }] = await db.insert(workflows).values({
    name,
    description: tr(tpl.description, isEn),
    scenario: "antibody",
    status: "active",
    parentWorkflowId: parentId,
    parentNodeId: anchor.id,
    createdByName: isEn ? "Demo User" : "演示用户",
  }).$returningId();
  await db.insert(workflowNodes).values(
    tpl.nodes.map((n) => ({
      workflowId: id,
      nodeKey: n.key,
      type: n.type,
      templateKey: n.templateKey ?? null,
      label: tr(n.label, isEn),
      owner: tr(n.owner ?? "", isEn) || null,
      config: n.config ? tr(n.config, isEn) : null,
      params: n.params ? JSON.stringify(n.params) : null,
      status: DONE.includes(n.key) ? "done" as const : n.key === CURRENT ? "in_progress" as const : "pending" as const,
      posX: n.x,
      posY: n.y,
    })),
  );
  await db.insert(workflowEdges).values(
    tpl.edges.map((e, i) => ({
      workflowId: id,
      edgeKey: `e${i + 1}`,
      sourceKey: e.from,
      targetKey: e.to,
      sourceHandle: e.sourceHandle ?? null,
      label: e.label ? tr(e.label, isEn) : null,
    })),
  );
  await db.update(workflowNodes).set({ childWorkflowId: id }).where(eq(workflowNodes.id, anchor.id));
  await db.insert(activities).values({
    userName: isEn ? "Demo User" : "演示用户",
    action: isEn ? "created sub-flow" : "创建了子流程",
    entityType: "workflow",
    entityId: id,
    entityName: name,
    detail: isEn ? `Parent workflow "${parent.name}" · node "${anchor.label}"` : `父流程「${parent.name}」节点「${anchor.label}」`,
  });
  console.log("created subflow", id, "|", name, "| parent", parentId, "| anchor node", anchor.id);
}
process.exit(0);
