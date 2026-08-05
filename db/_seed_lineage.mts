/** v4 seed：蛋白全生命周期谱系
 *  读取 db/lineage.json（由 plasmids.json 中的真实序列推导：翻译 / 骨架切割 / 坐标平移）
 *  幂等：序列与样本按 name upsert；涉及的谱系边先删后插 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { lineageEdges, samples, sequenceFeatures, sequences } from "./schema";
import { nextSampleSku } from "../api/queries/labHelpers";

const db = getDb();
const __dir = dirname(fileURLToPath(import.meta.url));
const L = JSON.parse(readFileSync(join(__dir, "lineage.json"), "utf-8"));

/* ── 1. 序列（含蛋白 AA / 载体骨架 / 基因片段） ── */
const seqIdByKey = new Map<string, number>();
const seqIdByName = new Map<string, number>();
for (const s of L.sequences) {
  const exist = await db.query.sequences.findFirst({ where: eq(sequences.name, s.name) });
  let id: number;
  if (exist) {
    id = exist.id;
    await db.update(sequences).set({ sequence: s.sequence, description: s.description, pdbId: s.pdbId ?? null, type: s.type }).where(eq(sequences.id, id));
    await db.delete(sequenceFeatures).where(eq(sequenceFeatures.sequenceId, id));
  } else {
    const [{ id: nid }] = await db.insert(sequences)
      .values({ name: s.name, type: s.type, sequence: s.sequence, pdbId: s.pdbId ?? null, description: s.description, createdByName: "演示用户" })
      .$returningId();
    id = nid;
  }
  if (s.features?.length) {
    await db.insert(sequenceFeatures).values(
      s.features.map((f: { name: string; type: string; start: number; end: number; strand: number; color: string; note?: string | null }) => ({
        sequenceId: id, name: f.name,
        type: f.type as "promoter" | "cds" | "resistance" | "origin" | "terminator" | "tag" | "primer_bind" | "restriction_site" | "regulatory" | "other",
        start: f.start, end: f.end, strand: f.strand, color: f.color, note: f.note ?? null,
      })),
    );
  }
  seqIdByKey.set(s.key, id);
  seqIdByName.set(s.name, id);
  console.log(`seq: ${s.name} -> ${id}`);
}
/* 已有质粒序列 id */
for (const n of ["pET-28a-antiHER2-scFv（trastuzumab）", "pET-28a-EGFR-KD（激酶域表达构建）", "pET-28a-EGFP（表达构建）"]) {
  const q = await db.query.sequences.findFirst({ where: eq(sequences.name, n) });
  if (q) seqIdByName.set(n, q.id);
}

/* ── 2. 样本 ── */
const sampIdByKey = new Map<string, number>();
for (const s of L.samples) {
  const seqId = s.seqKey ? seqIdByKey.get(s.seqKey)! : s.seqName ? seqIdByName.get(s.seqName)! : null;
  const exist = await db.query.samples.findFirst({ where: eq(samples.name, s.name) });
  let id: number;
  if (exist) {
    id = exist.id;
    await db.update(samples).set({ sequenceId: seqId, notes: s.notes, quantity: s.quantity, unit: s.unit, type: s.type }).where(eq(samples.id, id));
  } else {
    const [{ id: nid }] = await db.insert(samples)
      .values({ sku: await nextSampleSku(), name: s.name, type: s.type, quantity: s.quantity, unit: s.unit, sequenceId: seqId, notes: s.notes, createdByName: "演示用户" })
      .$returningId();
    id = nid;
  }
  sampIdByKey.set(s.key, id);
  console.log(`sample: ${s.name} -> ${id}`);
}

/* ── 3. 谱系边（先清后插） ── */
const sampIds = [...sampIdByKey.values()];
const plasmidSeqIds = ["pET-28a-antiHER2-scFv（trastuzumab）", "pET-28a-EGFR-KD（激酶域表达构建）", "pET-28a-EGFP（表达构建）"].map((n) => seqIdByName.get(n)!);
const vecSeqIds = L.sequences.map((s: { key: string }) => seqIdByKey.get(s.key)!);
await db.delete(lineageEdges).where(
  or(
    and(eq(lineageEdges.childKind, "sample"), inArray(lineageEdges.childId, sampIds)),
    and(eq(lineageEdges.childKind, "sequence"), inArray(lineageEdges.childId, [...plasmidSeqIds, ...vecSeqIds])),
  ),
);
for (const e of L.edges) {
  const childKind = e.child ? "sample" : "sequence";
  const childId = e.child ? sampIdByKey.get(e.child)! : seqIdByName.get(e.childSeq)!;
  const parentKind = e.parent ? "sample" : "sequence";
  const parentId = e.parent ? sampIdByKey.get(e.parent)! : seqIdByKey.get(e.parentSeqKey)!;
  await db.insert(lineageEdges).values({ childKind, childId, parentKind, parentId, relation: e.relation, note: e.note });
  console.log(`edge: ${childKind}:${childId} <-${e.relation}- ${parentKind}:${parentId}`);
}
console.log("Done.");
process.exit(0);
