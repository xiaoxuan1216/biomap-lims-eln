/**
 * 一次性脚本：把库中现有演示数据完整复制一份英文版本（中文数据保留不动）。
 * 翻译校验全部通过后才会写入；重复执行会自动中止。
 */
import { getDb } from "../api/queries/connection";
import * as sch from "./schema";
import { eq, and, inArray } from "drizzle-orm";
import fs from "node:fs";

const MAP: Record<string, string> = JSON.parse(
  fs.readFileSync(new URL("./_en_map.json", import.meta.url), "utf8"),
);
const hasZh = (s: string) => /[一-鿿]/.test(s);
const missing = new Set<string>();

function tr<T>(s: T): T {
  if (typeof s !== "string" || s === "" || !hasZh(s)) return s;
  const v = MAP[s as string];
  if (v === undefined) {
    missing.add(s as string);
    return s;
  }
  return v as unknown as T;
}
function trDeep(x: any): any {
  if (typeof x === "string") return tr(x);
  if (Array.isArray(x)) return x.map(trDeep);
  if (x && typeof x === "object") {
    const o: any = {};
    for (const k of Object.keys(x)) o[k] = trDeep(x[k]);
    return o;
  }
  return x;
}
function trJson(s: string | null): string | null {
  if (!s) return s;
  try {
    return JSON.stringify(trDeep(JSON.parse(s)));
  } catch {
    return tr(s);
  }
}

const db = getDb();

// ── 防重复执行 ──────────────────────────────────────────────
const [dup] = await db
  .select({ id: sch.projects.id })
  .from(sch.projects)
  .where(eq(sch.projects.name, "CAR-T Cell Therapy Development"));
if (dup) {
  console.log("English copy already exists, aborting.");
  process.exit(0);
}

// ── 读取全部现有数据 ────────────────────────────────────────
const projects = await db.select().from(sch.projects);
const locations = await db.select().from(sch.storageLocations);
const samples = await db.select().from(sch.samples);
const txs = await db.select().from(sch.stockTransactions);
const experiments = await db.select().from(sch.experiments);
const expSamples = await db.select().from(sch.experimentSamples);
const sequences = await db.select().from(sch.sequences);
const seqFeatures = await db.select().from(sch.sequenceFeatures);
const equipment = await db.select().from(sch.equipment);
const bookings = await db.select().from(sch.equipmentBookings);
const maintenance = await db.select().from(sch.equipmentMaintenance);
const workflows = await db.select().from(sch.workflows);
const nodes = await db.select().from(sch.workflowNodes);
const edges = await db.select().from(sch.workflowEdges);
const activities = await db.select().from(sch.activities);

// ── 新编号（延续现有序列）─────────────────────────────────
let maxExp = 0;
for (const r of experiments) {
  const mm = /EXP-(\d+)/.exec(r.code);
  if (mm) maxExp = Math.max(maxExp, +mm[1]);
}
let maxSmp = 0;
for (const r of samples) {
  const mm = /SMP-(\d+)/.exec(r.sku);
  if (mm) maxSmp = Math.max(maxSmp, +mm[1]);
}
const expCode = new Map<number, string>();
[...experiments]
  .sort((a, b) => a.id - b.id)
  .forEach((r, i) => expCode.set(r.id, `EXP-${String(maxExp + 1 + i).padStart(4, "0")}`));
const smpSku = new Map<number, string>();
[...samples]
  .sort((a, b) => a.id - b.id)
  .forEach((r, i) => smpSku.set(r.id, `SMP-${String(maxSmp + 1 + i).padStart(4, "0")}`));

// ── 第一阶段：构建全部待插入行并校验翻译 ───────────────────
const projRows = projects.map((r) => ({
  src: r.id,
  v: {
    name: tr(r.name),
    description: tr(r.description),
    color: r.color,
    status: r.status,
    createdById: r.createdById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  },
}));
const locRows = [...locations]
  .sort((a, b) => a.id - b.id)
  .map((r) => ({
    src: r.id,
    parentSrc: r.parentId,
    v: {
      name: tr(r.name),
      type: r.type,
      parentId: null as number | null,
      temperature: r.temperature,
      rows: r.rows,
      cols: r.cols,
      createdAt: r.createdAt,
    },
  }));
const smpRows = samples.map((r) => ({
  src: r.id,
  locSrc: r.locationId,
  projSrc: r.projectId,
  v: {
    sku: smpSku.get(r.id)!,
    name: tr(r.name),
    type: r.type,
    quantity: r.quantity,
    unit: tr(r.unit),
    alertThreshold: r.alertThreshold,
    locationId: null as number | null,
    boxRow: r.boxRow,
    boxCol: r.boxCol,
    projectId: null as number | null,
    expiryDate: r.expiryDate,
    notes: tr(r.notes),
    createdById: r.createdById,
    createdByName: tr(r.createdByName),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  },
}));
const txRows = txs.map((r) => ({
  src: r.id,
  smpSrc: r.sampleId,
  v: {
    sampleId: 0,
    delta: r.delta,
    reason: r.reason,
    note: tr(r.note),
    userName: tr(r.userName),
    createdAt: r.createdAt,
  },
}));
const expRows = experiments.map((r) => ({
  src: r.id,
  projSrc: r.projectId,
  v: {
    code: expCode.get(r.id)!,
    projectId: 0,
    title: tr(r.title),
    objective: tr(r.objective),
    status: r.status,
    content: trJson(r.content),
    signedById: r.signedById,
    signedByName: tr(r.signedByName),
    signedAt: r.signedAt,
    createdById: r.createdById,
    createdByName: tr(r.createdByName),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  },
}));
const expSmpRows = expSamples.map((r) => ({
  src: r.id,
  expSrc: r.experimentId,
  smpSrc: r.sampleId,
  v: {
    experimentId: 0,
    sampleId: 0,
    amountUsed: r.amountUsed,
    note: tr(r.note),
    createdByName: tr(r.createdByName),
    createdAt: r.createdAt,
  },
}));
const seqRows = sequences.map((r) => ({
  src: r.id,
  v: {
    name: tr(r.name),
    type: r.type,
    sequence: r.sequence,
    description: tr(r.description),
    createdByName: tr(r.createdByName),
    createdAt: r.createdAt,
  },
}));
const seqFtRows = seqFeatures.map((r) => ({
  src: r.id,
  seqSrc: r.sequenceId,
  v: {
    sequenceId: 0,
    name: tr(r.name),
    type: r.type,
    start: r.start,
    end: r.end,
    strand: r.strand,
    color: r.color,
    note: tr(r.note),
    createdAt: r.createdAt,
  },
}));
const eqRows = equipment.map((r) => ({
  src: r.id,
  v: {
    name: tr(r.name),
    category: r.category,
    model: tr(r.model),
    serialNo: r.serialNo,
    status: r.status,
    room: tr(r.room),
    responsibleName: tr(r.responsibleName),
    specs: tr(r.specs),
    nextCalibrationDate: r.nextCalibrationDate,
    createdAt: r.createdAt,
  },
}));
const bkRows = bookings.map((r) => ({
  src: r.id,
  eqSrc: r.equipmentId,
  v: {
    equipmentId: 0,
    userName: tr(r.userName),
    purpose: tr(r.purpose),
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    createdAt: r.createdAt,
  },
}));
const mtRows = maintenance.map((r) => ({
  src: r.id,
  eqSrc: r.equipmentId,
  v: {
    equipmentId: 0,
    type: r.type,
    description: tr(r.description),
    performedBy: tr(r.performedBy),
    performedAt: r.performedAt,
    nextDueDate: r.nextDueDate,
    createdAt: r.createdAt,
  },
}));
const wfRows = workflows.map((r) => ({
  src: r.id,
  projSrc: r.projectId,
  v: {
    name: tr(r.name),
    description: tr(r.description),
    scenario: r.scenario,
    status: r.status,
    projectId: null as number | null,
    createdByName: tr(r.createdByName),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  },
}));
const nodeRows = nodes.map((r) => ({
  src: r.id,
  wfSrc: r.workflowId,
  eqSrc: r.equipmentId,
  v: {
    workflowId: 0,
    nodeKey: r.nodeKey,
    type: r.type,
    templateKey: r.templateKey,
    label: tr(r.label),
    owner: tr(r.owner),
    equipmentId: null as number | null,
    config: tr(r.config),
    status: r.status,
    posX: r.posX,
    posY: r.posY,
    createdAt: r.createdAt,
    params: trJson(r.params),
  },
}));
const edgeRows = edges.map((r) => ({
  src: r.id,
  wfSrc: r.workflowId,
  v: {
    workflowId: 0,
    edgeKey: r.edgeKey,
    sourceKey: r.sourceKey,
    targetKey: r.targetKey,
    sourceHandle: r.sourceHandle,
    label: tr(r.label),
    createdAt: r.createdAt,
  },
}));
// 活动日志：复制演示数据与真实用户的记录；QA 测试残留的孤儿记录（指向已删除业务流）不复制、直接清理
const QA_JUNK = activities.filter(
  (a) => a.userName === "QA Demo" && a.entityType === "workflow",
);
const actRows = activities
  .filter((a) => !QA_JUNK.includes(a))
  .map((r) => ({
    src: r.id,
    entityType: r.entityType,
    entitySrc: r.entityId,
    v: {
      userName: tr(r.userName),
      action: tr(r.action),
      entityType: r.entityType,
      entityId: null as number | null,
      entityName: tr(r.entityName),
      detail: tr(r.detail),
      createdAt: r.createdAt,
    },
  }));

if (missing.size) {
  console.log("MISSING TRANSLATIONS:");
  for (const s of missing) console.log(JSON.stringify(s));
  process.exit(1);
}
console.log("translation check passed");

// ── 第二阶段：按依赖顺序写入 ────────────────────────────────
async function ins(table: any, values: any): Promise<number> {
  const res: any = await db.insert(table).values(values);
  return Number(res[0].insertId);
}

const projMap = new Map<number, number>();
for (const r of projRows) projMap.set(r.src, await ins(sch.projects, r.v));

const locMap = new Map<number, number>();
for (const r of locRows) {
  r.v.parentId = r.parentSrc ? locMap.get(r.parentSrc)! : null;
  locMap.set(r.src, await ins(sch.storageLocations, r.v));
}

const smpMap = new Map<number, number>();
for (const r of smpRows) {
  r.v.locationId = r.locSrc ? locMap.get(r.locSrc)! : null;
  r.v.projectId = r.projSrc ? projMap.get(r.projSrc)! : null;
  smpMap.set(r.src, await ins(sch.samples, r.v));
}

for (const r of txRows) {
  r.v.sampleId = smpMap.get(r.smpSrc)!;
  await ins(sch.stockTransactions, r.v);
}

const expMap = new Map<number, number>();
for (const r of expRows) {
  r.v.projectId = projMap.get(r.projSrc)!;
  expMap.set(r.src, await ins(sch.experiments, r.v));
}

for (const r of expSmpRows) {
  r.v.experimentId = expMap.get(r.expSrc)!;
  r.v.sampleId = smpMap.get(r.smpSrc)!;
  await ins(sch.experimentSamples, r.v);
}

const seqMap = new Map<number, number>();
for (const r of seqRows) seqMap.set(r.src, await ins(sch.sequences, r.v));
for (const r of seqFtRows) {
  r.v.sequenceId = seqMap.get(r.seqSrc)!;
  await ins(sch.sequenceFeatures, r.v);
}

const eqMap = new Map<number, number>();
for (const r of eqRows) eqMap.set(r.src, await ins(sch.equipment, r.v));
for (const r of bkRows) {
  r.v.equipmentId = eqMap.get(r.eqSrc)!;
  await ins(sch.equipmentBookings, r.v);
}
for (const r of mtRows) {
  r.v.equipmentId = eqMap.get(r.eqSrc)!;
  await ins(sch.equipmentMaintenance, r.v);
}

const wfMap = new Map<number, number>();
for (const r of wfRows) {
  r.v.projectId = r.projSrc ? projMap.get(r.projSrc)! : null;
  wfMap.set(r.src, await ins(sch.workflows, r.v));
}
for (const r of nodeRows) {
  r.v.workflowId = wfMap.get(r.wfSrc)!;
  r.v.equipmentId = r.eqSrc ? eqMap.get(r.eqSrc)! : null;
  await ins(sch.workflowNodes, r.v);
}
for (const r of edgeRows) {
  r.v.workflowId = wfMap.get(r.wfSrc)!;
  await ins(sch.workflowEdges, r.v);
}

const entityMaps: Record<string, Map<number, number>> = {
  project: projMap,
  experiment: expMap,
  sample: smpMap,
  workflow: wfMap,
  equipment: eqMap,
  sequence: seqMap,
};
for (const r of actRows) {
  const mp = r.entityType ? entityMaps[r.entityType] : undefined;
  r.v.entityId = r.entitySrc && mp ? (mp.get(r.entitySrc) ?? null) : null;
  await ins(sch.activities, r.v);
}

// 清理 QA 测试残留的孤儿活动记录
if (QA_JUNK.length) {
  await db.delete(sch.activities).where(inArray(sch.activities.id, QA_JUNK.map((a) => a.id)));
}

console.log(
  JSON.stringify({
    projects: projRows.length,
    locations: locRows.length,
    samples: smpRows.length,
    transactions: txRows.length,
    experiments: expRows.length,
    experimentSamples: expSmpRows.length,
    sequences: seqRows.length,
    sequenceFeatures: seqFtRows.length,
    equipment: eqRows.length,
    bookings: bkRows.length,
    maintenance: mtRows.length,
    workflows: wfRows.length,
    nodes: nodeRows.length,
    edges: edgeRows.length,
    activities: actRows.length,
    qaJunkRemoved: QA_JUNK.length,
  }),
);
process.exit(0);
