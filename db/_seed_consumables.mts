/**
 * v6 #6 — 耗材追踪：扩展 samples.type 枚举（buffer/enzyme/competent_cell）
 * 并播种典型实验室耗材（含 2 个低库存样本以触发预警链路）。幂等。
 */
import { getDb } from "../api/queries/connection";
import { samples, storageLocations, stockTransactions } from "./schema";
import { sql, eq, and } from "drizzle-orm";

const db = getDb();

/* 1) ALTER enum（若尚未包含 buffer 则执行） */
const cols = await db.execute(sql`SHOW COLUMNS FROM samples LIKE 'type'`);
const colType = String((cols as any)[0]?.[0]?.Type ?? (cols as any)[0]?.Type ?? "");
if (!colType.includes("buffer")) {
  await db.execute(sql`ALTER TABLE samples MODIFY COLUMN type ENUM('cell_line','plasmid','primer','antibody','reagent','chemical','protein','virus','tissue','buffer','enzyme','competent_cell','other') NOT NULL DEFAULT 'other'`);
  console.log("ALTER: samples.type enum extended");
} else {
  console.log("ALTER: enum already extended, skip");
}

/* 2) 耗材存储位：工具酶盒 / 感受态细胞盒（挂在 -80°C 第 2 层下），幂等 */
async function ensureBox(name: string, parentId: number): Promise<number> {
  const hit = await db.select().from(storageLocations).where(eq(storageLocations.name, name)).limit(1);
  if (hit[0]) return hit[0].id;
  const [{ id }] = await db.insert(storageLocations).values({ type: "box", name, parentId }).$returningId();
  console.log("BOX created:", name, id);
  return id;
}
const shelfM80 = await db.query.storageLocations.findFirst({
  where: eq(storageLocations.name, "1 号冰箱 · 第 2 层"),
});
const fridge4C = await db.query.storageLocations.findFirst({
  where: eq(storageLocations.name, "4°C 冷藏柜"),
});
if (!shelfM80 || !fridge4C) throw new Error("base storage locations are missing");
const SHELF_M80 = shelfM80.id;
const FRIDGE_4C = fridge4C.id;
const enzymeBox = await ensureBox("工具酶盒", SHELF_M80);
const compBox = await ensureBox("感受态细胞盒", SHELF_M80);

/* 3) 耗材样本，幂等（按 name 去重） */
const USER = { id: 2000001, name: "Xiaoxuan" };
const ITEMS: {
  sku: string; name: string; type: "buffer" | "enzyme" | "competent_cell";
  quantity: number; unit: string; alertThreshold: number;
  locationId: number | null; boxRow?: number; boxCol?: number;
  expiryDate?: string; notes: string;
}[] = [
  { sku: "BUF-LB-500", name: "LB 液体培养基（500 mL）", type: "buffer", quantity: 4, unit: "瓶", alertThreshold: 2, locationId: FRIDGE_4C, notes: "高压灭菌，4°C 保存；用于大肠杆菌摇菌扩培" },
  { sku: "BUF-PBS-1X", name: "PBS 缓冲液 pH 7.4（1×）", type: "buffer", quantity: 3, unit: "瓶", alertThreshold: 2, locationId: FRIDGE_4C, notes: "细胞洗涤/蛋白稀释通用" },
  { sku: "BUF-TRIS-1M", name: "Tris-HCl 1 M pH 8.0", type: "buffer", quantity: 1, unit: "瓶", alertThreshold: 1, locationId: FRIDGE_4C, notes: "蛋白纯化缓冲液母液" },
  { sku: "ENZ-T4LIG", name: "T4 DNA 连接酶（400 U/μL）", type: "enzyme", quantity: 2, unit: "支", alertThreshold: 1, locationId: enzymeBox, boxRow: 1, boxCol: 1, expiryDate: "2027-03-01", notes: "NEB M0202；-20°C 存放于 -80°C 冰箱分层盒（短期）" },
  { sku: "ENZ-Q5-HF", name: "Q5 高保真 DNA 聚合酶", type: "enzyme", quantity: 1, unit: "支", alertThreshold: 2, locationId: enzymeBox, boxRow: 1, boxCol: 2, expiryDate: "2026-12-01", notes: "NEB M0491；低库存——需补货" },
  { sku: "ENZ-ECORI", name: "限制性内切酶 EcoRI-HF", type: "enzyme", quantity: 3, unit: "支", alertThreshold: 1, locationId: enzymeBox, boxRow: 1, boxCol: 3, expiryDate: "2027-06-01", notes: "NEB R3101" },
  { sku: "ENZ-GIBSON", name: "Gibson Assembly 预混液（2×）", type: "enzyme", quantity: 2, unit: "支", alertThreshold: 1, locationId: enzymeBox, boxRow: 1, boxCol: 4, expiryDate: "2026-11-15", notes: "NEBuilder HiFi；与序列库 Gibson 工具配套" },
  { sku: "CC-DH5A", name: "DH5α 化学感受态细胞", type: "competent_cell", quantity: 18, unit: "管", alertThreshold: 10, locationId: compBox, boxRow: 1, boxCol: 1, expiryDate: "2027-01-01", notes: "克隆用；50 μL/管" },
  { sku: "CC-BL21", name: "BL21(DE3) 化学感受态细胞", type: "competent_cell", quantity: 8, unit: "管", alertThreshold: 10, locationId: compBox, boxRow: 1, boxCol: 2, expiryDate: "2027-01-01", notes: "表达用；低库存——需补货" },
];

let inserted = 0;
for (const it of ITEMS) {
  const dup = await db.select({ id: samples.id }).from(samples).where(eq(samples.name, it.name)).limit(1);
  if (dup[0]) continue;
  const [{ id }] = await db.insert(samples).values({
    sku: it.sku, name: it.name, type: it.type, quantity: it.quantity, unit: it.unit,
    alertThreshold: it.alertThreshold, locationId: it.locationId,
    boxRow: it.boxRow ?? null, boxCol: it.boxCol ?? null,
    expiryDate: it.expiryDate ?? null, notes: it.notes,
    createdById: USER.id, createdByName: USER.name,
  }).$returningId();
  await db.insert(stockTransactions).values({
    sampleId: id, delta: it.quantity, reason: "restock",
    note: "初始入库（耗材播种）", userName: USER.name,
  });
  inserted++;
  console.log("SAMPLE:", it.sku, it.name, "id", id);
}
console.log(`DONE: ${inserted} inserted, ${ITEMS.length - inserted} skipped (already exist)`);
process.exit(0);
