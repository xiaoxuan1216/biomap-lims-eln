/** v3 seed：
 * 1) 中英文重组抗体演示流程的分子克隆节点 → 全自动克隆岛模板（a_auto_cloning）
 * 2) 其分子克隆子流程内容整体替换为 25 节点机械臂串联版，并设置演示进度
 * 3) 建立「实验任务 ↔ 业务流」演示关联（workflows.experimentId），供项目仪表盘追踪
 * 幂等：可重复执行 */
import { eq, and } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { workflows, workflowNodes, workflowEdges, experiments } from "./schema";
import { SUBFLOW_TEMPLATES } from "../contracts/workflow";
import { trForLang } from "../api/workflowRouter";

const db = getDb();
const tpl = SUBFLOW_TEMPLATES.a_auto_cloning;

async function rebuildSubflow(wfId: number, parentWfId: number, lang: "zh" | "en") {
  // 父流程 n2 节点 → 全自动模板
  await db
    .update(workflowNodes)
    .set({ templateKey: "a_auto_cloning" })
    .where(and(eq(workflowNodes.workflowId, parentWfId), eq(workflowNodes.nodeKey, "n2")));

  // 重建子流程内容
  await db.delete(workflowEdges).where(eq(workflowEdges.workflowId, wfId));
  await db.delete(workflowNodes).where(eq(workflowNodes.workflowId, wfId));
  await db
    .update(workflows)
    .set({
      name: trForLang(tpl.name, lang),
      description: trForLang(tpl.description, lang),
    })
    .where(eq(workflows.id, wfId));
  await db.insert(workflowNodes).values(
    tpl.nodes.map((n, i) => ({
      workflowId: wfId,
      nodeKey: n.key,
      type: n.type,
      templateKey: n.templateKey ?? null,
      label: trForLang(n.label, lang),
      owner: trForLang(n.owner ?? "", lang) || null,
      config: n.config ? trForLang(n.config, lang) : null,
      params: n.params ? JSON.stringify(n.params) : null,
      posX: n.x,
      posY: n.y,
      /* 演示进度：前 7 个节点完成（出库→纯化定量），第 8 个转运进行中 */
      status: i < 7 ? "done" as const : i === 7 ? "in_progress" as const : "pending" as const,
    })),
  );
  await db.insert(workflowEdges).values(
    tpl.edges.map((e, i) => ({
      workflowId: wfId,
      edgeKey: `e${i + 1}`,
      sourceKey: e.from,
      targetKey: e.to,
      sourceHandle: e.sourceHandle ?? null,
      label: e.label ? trForLang(e.label, lang) : null,
    })),
  );
  console.log(`subflow ${wfId} rebuilt (${lang}), 25 nodes / 24 edges`);
}

for (const spec of [
  { name: "重组抗体表达与表征 Pipeline", lang: "zh" },
  { name: "Recombinant Antibody Expression & Characterization Pipeline", lang: "en" },
] as const) {
  const parent = await db.query.workflows.findFirst({ where: eq(workflows.name, spec.name) });
  if (!parent) throw new Error(`parent workflow missing: ${spec.name}`);
  const child = await db.query.workflows.findFirst({
    where: eq(workflows.parentWorkflowId, parent.id),
  });
  if (!child) throw new Error(`child workflow missing for: ${spec.name}`);
  await rebuildSubflow(child.id, parent.id, spec.lang);
}

/* ── 实验任务 ↔ 业务流演示关联（按名称匹配，中英双语库） ── */
const links: [string, string][] = [
  // [workflow 名, experiment 名]
  ["CD19-CAR-4G 慢病毒载体构建（Gibson）", "CAR 载体测序验证"],
  ["CAR-T 杀伤评估自动化业务流", "CAR-T 体外杀伤实验（效靶比梯度）"],
  ["CAR-T 杀伤活性优化 DBTL（第 2 轮迭代）", "CAR-T 杀伤活性优化 DBTL · Build · 构建（迭代 2）"],
  ["菌株基因组编辑 Pipeline（CRISPR）", "AAV9 三质粒瞬转条件摸索"],
  ["CD19-CAR-4G Lentiviral Vector Construction (Gibson)", "CAR Vector Sequencing Verification"],
  ["Automated CAR-T Killing Assessment Workflow", "CAR-T In Vitro Killing Assay (E:T Ratio Gradient)"],
];
for (const [wfName, expTitle] of links) {
  const wf = await db.query.workflows.findFirst({ where: eq(workflows.name, wfName) });
  const exp = await db.query.experiments.findFirst({ where: eq(experiments.title, expTitle) });
  if (wf && exp) {
    await db.update(workflows).set({ experimentId: exp.id }).where(eq(workflows.id, wf.id));
    console.log(`linked: ${wfName} -> exp ${exp.id}`);
  } else {
    console.log(`skip (not found): ${wfName} / ${expTitle}`);
  }
}
console.log("Done.");
process.exit(0);
