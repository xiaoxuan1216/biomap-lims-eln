import { getDb } from "../api/queries/connection";
import {
  workflows,
  workflowNodes,
  workflowEdges,
  equipment,
  projects,
} from "./schema";
import { sql } from "drizzle-orm";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../contracts/workflow";

export async function seed() {
  const db = getDb();
  console.log("Seeding v3 data (SynFlow 合成流)...");

  const [wfCount] = await db.select({ n: sql<number>`COUNT(*)` }).from(workflows);
  if (Number(wfCount?.n ?? 0) > 0) {
    console.log("Workflows already seeded, skipping.");
    return;
  }

  // 设备名称 → id（用于设备节点绑定）
  const equipList = await db.select().from(equipment);
  const eqId = (kw: string) => equipList.find((e) => e.name.includes(kw))?.id ?? null;

  const projList = await db.select().from(projects);
  const projId = (kw: string) => projList.find((p) => p.name.includes(kw))?.id ?? null;

  const EQUIP_BIND: Record<string, string> = {
    e_flow: "流式细胞仪",
    e_qpcr: "荧光定量 PCR",
    e_plate_reader: "酶标仪",
    e_liquid: "液体处理工作站",
    e_incubate: "培养箱",
    e_purify: "蛋白纯化",
    e_seq: "测序仪",
  };

  type NodeStatus = "pending" | "in_progress" | "done";
  const SEED_FLOWS: {
    key: string;
    name?: string;
    description?: string;
    projKw?: string;
    statuses: Record<string, NodeStatus>;
  }[] = [
    {
      key: "gibson_assembly",
      name: "CD19-CAR-4G 慢病毒载体构建（Gibson）",
      description: "将第四代 CAR（CD28+4-1BB 双共刺激）组装进 pLenti 骨架，用于慢病毒包装。",
      projKw: "CAR-T",
      statuses: { n1: "done", n2: "done", n3: "done", n4: "done", n5: "in_progress" },
    },
    {
      key: "crispr_strain",
      projKw: "AAV",
      statuses: { n1: "done", n2: "done", n3: "done", n4: "in_progress" },
    },
    {
      key: "cart_killing",
      projKw: "CAR-T",
      statuses: { n1: "done", n2: "done", n3: "in_progress" },
    },
    {
      key: "dbtl_cycle",
      name: "CAR-T 杀伤活性优化 DBTL（第 2 轮迭代）",
      description: "以杀伤率为指标的工程迭代：第一轮发现 4-1BB 构型更优（提升 23%），第二轮优化启动子强度。",
      projKw: "CAR-T",
      statuses: { n1: "done", n2: "in_progress" },
    },
  ];

  for (const sf of SEED_FLOWS) {
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.key === sf.key) as WorkflowTemplate;
    const [{ id: wfId }] = await db
      .insert(workflows)
      .values({
        name: sf.name ?? tpl.name,
        description: sf.description ?? tpl.description,
        status: "active",
        projectId: sf.projKw ? projId(sf.projKw) : null,
        createdByName: "演示用户",
      })
      .$returningId();

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
        status: sf.statuses[n.key] ?? "pending",
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
    console.log(`  workflow: ${sf.name ?? tpl.name} (${tpl.nodes.length} nodes, ${tpl.edges.length} edges)`);
  }

  console.log("Done. Seed v3 inserted.");
}

// CLI 入口：直接运行该脚本时执行（被 import 时不执行）
const isMain = process.argv[1]?.endsWith("seed3.ts") ?? false;
if (isMain) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
