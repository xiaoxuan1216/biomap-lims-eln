/**
 * 一次性脚本：把 3 条抗体研发 Pipeline 模板实例化为演示业务流（中英各一份）。
 * 重复执行会自动中止。
 */
import { getDb } from "../api/queries/connection";
import { workflows, workflowNodes, workflowEdges, activities } from "./schema";
import { eq } from "drizzle-orm";
import { WORKFLOW_TEMPLATES } from "../contracts/workflow";
import { en } from "../src/i18n/en";

const OWNER_EN: Record<string, string> = {
  王工: "Wang",
  李工: "Li",
  张工: "Zhang",
  赵工: "Zhao",
  陈研究员: "Dr. Chen",
  公共: "Shared",
  演示用户: "Demo User",
};
const tr = (s: string) => en[s] ?? OWNER_EN[s] ?? s;
const trParams = (params: Record<string, string | number> | undefined) => {
  if (!params) return null;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === "string" ? tr(v) : v;
  return JSON.stringify(out);
};

// 每个模板预置进度：done 的 nodeKey 与 in_progress 的 nodeKey
const PROGRESS: Record<string, { done: string[]; current: string }> = {
  ab_recombinant: { done: ["n1", "n2"], current: "n3" },
  ab_phage_display: { done: ["n1", "n2", "n3"], current: "n4" },
  ab_yeast_display: { done: ["n1", "n2"], current: "n3" },
};

const db = getDb();
const [dup] = await db
  .select({ id: workflows.id })
  .from(workflows)
  .where(eq(workflows.name, "重组抗体表达与表征 Pipeline"));
if (dup) {
  console.log("antibody demo workflows already exist, aborting.");
  process.exit(0);
}

const tpls = WORKFLOW_TEMPLATES.filter((t) => t.group === "antibody");
if (tpls.length !== 3) throw new Error(`expect 3 antibody templates, got ${tpls.length}`);

let created = 0;
for (const tpl of tpls) {
  for (const lang of ["zh", "en"] as const) {
    const isEn = lang === "en";
    const name = isEn ? tr(tpl.name) : tpl.name;
    const [{ id }] = await db
      .insert(workflows)
      .values({
        name,
        description: isEn ? tr(tpl.description) : tpl.description,
        scenario: "antibody",
        status: "active",
        createdByName: isEn ? "Demo User" : "演示用户",
      })
      .$returningId();
    const prog = PROGRESS[tpl.key] ?? { done: [], current: "" };
    await db.insert(workflowNodes).values(
      tpl.nodes.map((n) => ({
        workflowId: id,
        nodeKey: n.key,
        type: n.type,
        templateKey: n.templateKey ?? null,
        label: isEn ? tr(n.label) : n.label,
        owner: n.owner ? (isEn ? tr(n.owner) : n.owner) : null,
        config: n.config ? (isEn ? tr(n.config) : n.config) : null,
        params: isEn ? trParams(n.params) : n.params ? JSON.stringify(n.params) : null,
        status: prog.done.includes(n.key)
          ? ("done" as const)
          : n.key === prog.current
            ? ("in_progress" as const)
            : ("pending" as const),
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
        label: e.label ? (isEn ? tr(e.label) : e.label) : null,
      })),
    );
    await db.insert(activities).values({
      userName: isEn ? "Demo User" : "演示用户",
      action: isEn ? "Created workflow" : "创建了业务流",
      entityType: "workflow",
      entityId: id,
      entityName: name,
    });
    created++;
    console.log(`${lang} ${tpl.key} -> workflow ${id}`);
  }
}
console.log("created:", created);
process.exit(0);
