/**
 * 具体仪器 seed：Hamilton STAR V / VANTAGE、Biomek i7、ONT MinION Mk1B、MGI G400
 * 并把演示子流程（134271 zh / 134272 en）的对应节点升级为具体仪器节点 + 新增 ONT 全长验证节点
 */
import { eq, and } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { equipment, workflowNodes, workflowEdges } from "./schema";

const db = getDb();

async function upsertEquip(name: string, row: Omit<typeof equipment.$inferInsert, "name">) {
  const exist = await db.query.equipment.findFirst({ where: eq(equipment.name, name) });
  if (exist) return exist.id;
  const [{ id }] = await db.insert(equipment).values({ name, ...row }).$returningId();
  return id;
}

// ─── 1. 设备注册表：具体型号（zh + en） ───
const starV = await upsertEquip("Hamilton 移液工作站 STAR V", {
  category: "automation", model: "Microlab STAR V · 8 通道", serialNo: "HAM-STV-2024-0117",
  status: "available", room: "自动化平台 A-201", responsibleName: "王工",
  specs: "8 通道独立移液 · CO-RE II 吸头 · 台面 12 板位 · VENUS 6.1",
  nextCalibrationDate: "2026-12-31",
});
const starVEn = await upsertEquip("Hamilton Liquid Handler STAR V", {
  category: "automation", model: "Microlab STAR V · 8-channel", serialNo: "HAM-STV-2024-0117",
  status: "available", room: "Automation Suite A-201", responsibleName: "Wang",
  specs: "8 independent channels · CO-RE II tips · 12 deck positions · VENUS 6.1",
  nextCalibrationDate: "2026-12-31",
});
const vantage = await upsertEquip("Hamilton 移液工作站 VANTAGE", {
  category: "automation", model: "Microlab VANTAGE", serialNo: "HAM-VTG-2023-0042",
  status: "available", room: "自动化平台 A-201", responsibleName: "王工",
  specs: "Span-8 + 96 通道 MPH · 台面制冷载台 4°C · 轨道机械臂 · VENUS 6.1",
  nextCalibrationDate: "2026-11-30",
});
const vantageEn = await upsertEquip("Hamilton Liquid Handler VANTAGE", {
  category: "automation", model: "Microlab VANTAGE", serialNo: "HAM-VTG-2023-0042",
  status: "available", room: "Automation Suite A-201", responsibleName: "Wang",
  specs: "Span-8 + 96-channel MPH · 4°C cooling carrier · on-deck gripper · VENUS 6.1",
  nextCalibrationDate: "2026-11-30",
});
const biomek = await upsertEquip("Biomek i7 自动化工作站", {
  category: "automation", model: "Biomek i7 Hybrid", serialNo: "BEC-BI7-2024-0208",
  status: "available", room: "自动化平台 A-202", responsibleName: "李工",
  specs: "Span-8 (P1000) + 多功能抓手 · Biomek Software 6.0 · 45 板位",
  nextCalibrationDate: "2027-01-31",
});
const biomekEn = await upsertEquip("Biomek i7 Automated Workstation", {
  category: "automation", model: "Biomek i7 Hybrid", serialNo: "BEC-BI7-2024-0208",
  status: "available", room: "Automation Suite A-202", responsibleName: "Li",
  specs: "Span-8 (P1000) + gripper · Biomek Software 6.0 · 45 deck positions",
  nextCalibrationDate: "2027-01-31",
});
const minion = await upsertEquip("ONT 纳米孔测序仪 MinION", {
  category: "analytical", model: "MinION Mk1B · R10.4.1", serialNo: "ONT-MIN-2024-0551",
  status: "available", room: "测序室 B-103", responsibleName: "张工",
  specs: "FLO-MIN114 芯片 · MinKNOW 24.06 · Dorado SUP v5 · 全长质粒测序",
  nextCalibrationDate: "2026-10-31",
});
const minionEn = await upsertEquip("ONT Nanopore Sequencer MinION", {
  category: "analytical", model: "MinION Mk1B · R10.4.1", serialNo: "ONT-MIN-2024-0551",
  status: "available", room: "Sequencing Room B-103", responsibleName: "Zhang",
  specs: "FLO-MIN114 flow cell · MinKNOW 24.06 · Dorado SUP v5 · full-length plasmid seq",
  nextCalibrationDate: "2026-10-31",
});
const g400 = await upsertEquip("MGI 高通量测序仪 G400", {
  category: "analytical", model: "DNBSEQ-G400 · FCL PE150", serialNo: "MGI-G400-2023-0088",
  status: "available", room: "测序室 B-103", responsibleName: "张工",
  specs: "2 lane FCL · PE50–PE300 · MGIEasy 文库体系 · ZLIMS 联动",
  nextCalibrationDate: "2026-09-30",
});
const g400En = await upsertEquip("MGI High-Throughput Sequencer G400", {
  category: "analytical", model: "DNBSEQ-G400 · FCL PE150", serialNo: "MGI-G400-2023-0088",
  status: "available", room: "Sequencing Room B-103", responsibleName: "Zhang",
  specs: "2-lane FCL · PE50–PE300 · MGIEasy library prep · ZLIMS integration",
  nextCalibrationDate: "2026-09-30",
});
console.log("equipment ids:", { starV, starVEn, vantage, vantageEn, biomek, biomekEn, minion, minionEn, g400, g400En });

// ─── 2. 升级演示子流程节点为具体仪器 ───
type Upd = { key: string; type: "equipment"; templateKey: string; label: string; equipmentId: number };
async function upgrade(wfId: number, upds: Upd[], ontLabel: string, ontEquip: number) {
  for (const u of upds) {
    await db
      .update(workflowNodes)
      .set({ type: u.type, templateKey: u.templateKey, label: u.label, equipmentId: u.equipmentId })
      .where(and(eq(workflowNodes.workflowId, wfId), eq(workflowNodes.nodeKey, u.key)));
  }
  // 新增 n16 ONT 全长验证（幂等）
  const has = await db.query.workflowNodes.findFirst({
    where: and(eq(workflowNodes.workflowId, wfId), eq(workflowNodes.nodeKey, "n16")),
  });
  if (!has) {
    await db.insert(workflowNodes).values({
      workflowId: wfId, nodeKey: "n16", type: "equipment", templateKey: "e_ont_minion",
      label: ontLabel, owner: wfId === 134271 ? "张工" : "Zhang", equipmentId: ontEquip,
      status: "pending", posX: 150, posY: 440,
    });
  }
  // 边：n13→n14 改为 n13→n16→n14
  const old = await db.query.workflowEdges.findFirst({
    where: and(
      eq(workflowEdges.workflowId, wfId),
      eq(workflowEdges.sourceKey, "n13"),
      eq(workflowEdges.targetKey, "n14"),
    ),
  });
  if (old) {
    await db.delete(workflowEdges).where(eq(workflowEdges.id, old.id));
    await db.insert(workflowEdges).values([
      { workflowId: wfId, edgeKey: "e-n13-n16", sourceKey: "n13", targetKey: "n16" },
      { workflowId: wfId, edgeKey: "e-n16-n14", sourceKey: "n16", targetKey: "n14" },
    ]);
  }
  console.log("upgraded wf", wfId);
}

await upgrade(
  134271,
  [
    { key: "n3", type: "equipment", templateKey: "e_hamilton_cleanup", label: "PCR 产物纯化定量（Hamilton STAR V）", equipmentId: starV },
    { key: "n4", type: "equipment", templateKey: "e_hamilton_gibson", label: "Gibson 连接体系构建（VANTAGE）", equipmentId: vantage },
    { key: "n8", type: "equipment", templateKey: "e_biomek_colony", label: "挑菌接种 96 深孔板（Biomek i7）", equipmentId: biomek },
    { key: "n9", type: "equipment", templateKey: "e_mgi_g400", label: "插入片段扩增子测序（MGI G400）", equipmentId: g400 },
  ],
  "质粒全长验证测序（ONT MinION）",
  minion,
);
await upgrade(
  134272,
  [
    { key: "n3", type: "equipment", templateKey: "e_hamilton_cleanup", label: "PCR Cleanup & Quant (Hamilton STAR V)", equipmentId: starVEn },
    { key: "n4", type: "equipment", templateKey: "e_hamilton_gibson", label: "Gibson Assembly Setup (VANTAGE)", equipmentId: vantageEn },
    { key: "n8", type: "equipment", templateKey: "e_biomek_colony", label: "Colony Inoculation 96-DW (Biomek i7)", equipmentId: biomekEn },
    { key: "n9", type: "equipment", templateKey: "e_mgi_g400", label: "Insert Amplicon Sequencing (MGI G400)", equipmentId: g400En },
  ],
  "Full-Length Plasmid Verification (ONT MinION)",
  minionEn,
);
console.log("Done.");
process.exit(0);
