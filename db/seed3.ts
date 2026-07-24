import { getDb } from "../api/queries/connection";
import {
  workflows,
  workflowNodes,
  workflowEdges,
  equipment,
  projects,
} from "./schema";
import { sql, eq } from "drizzle-orm";
import { WORKFLOW_TEMPLATES } from "../contracts/workflow";

async function seed() {
  const db = getDb();
  console.log("Seeding v3 data (业务流 DAG)...");

  const [wfCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(workflows);
  if (Number(wfCount?.n ?? 0) > 0) {
    console.log("Workflows already seeded, skipping.");
    process.exit(0);
  }

  // 设备名称 → id（用于设备节点绑定）
  const equipList = await db.select().from(equipment);
  const eqId = (kw: string) => equipList.find((e) => e.name.includes(kw))?.id ?? null;

  const projList = await db.select().from(projects);
  const projId = (kw: string) => projList.find((p) => p.name.includes(kw))?.id ?? null;

  // 模板实例化 + 设备绑定 + 部分节点状态（演示进行中态）
  const EQUIP_BIND: Record<string, string> = {
    e_flow: "流式细胞仪",
    e_qpcr: "荧光定量 PCR",
    e_plate_reader: "酶标仪",
    e_liquid: "液体处理工作站",
    e_incubate: "培养箱",
    e_purify: "蛋白纯化",
    e_seq: "测序仪",
  };
  // 每条业务流的节点状态演示（nodeKey → status）
  const STATUS_DEMO: Record<string, Record<string, "pending" | "in_progress" | "done">> = {
    crispr_strain: { n1: "done", n2: "done", n3: "done", n4: "in_progress" },
    cart_killing: { n1: "done", n2: "done", n3: "in_progress" },
  };

  for (const tpl of WORKFLOW_TEMPLATES.slice(0, 2)) {
    const [{ id: wfId }] = await db
      .insert(workflows)
      .values({
        name: tpl.name,
        description: tpl.description,
        status: "active",
        projectId: tpl.key === "cart_killing" ? projId("CAR-T") : projId("AAV"),
        createdByName: "演示用户",
      })
      .$returningId();

    const statuses = STATUS_DEMO[tpl.key] ?? {};
    await db.insert(workflowNodes).values(
      tpl.nodes.map((n) => ({
        workflowId: wfId,
        nodeKey: n.key,
        type: n.type,
        templateKey: n.templateKey ?? null,
        label: n.label,
        owner: n.owner ?? null,
        equipmentId:
          n.type === "equipment" && n.templateKey && EQUIP_BIND[n.templateKey]
            ? eqId(EQUIP_BIND[n.templateKey])
            : null,
        config: n.config ?? null,
        status: statuses[n.key] ?? "pending",
        posX: n.x,
        posY: n.y,
      })),
    );
    await db.insert(workflowEdges).values(
      tpl.edges.map((e, i) => ({
        workflowId: wfId,
        edgeKey: `e${i + 1}`,
        sourceKey: e.from,
        targetKey: e.to,
        sourceHandle: e.sourceHandle ?? null,
        label: e.label ?? null,
      })),
    );
    console.log(`  workflow: ${tpl.name} (${tpl.nodes.length} nodes, ${tpl.edges.length} edges)`);
  }

  console.log("Done. Seed v3 inserted.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
