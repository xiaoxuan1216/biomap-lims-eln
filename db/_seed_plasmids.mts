/** 科学正确的质粒 seed：pET-28a-EGFP / pET-28a-EGFR-KD / pET-28a-antiHER2-scFv / pUC19-EGFP
 *  序列由经核实的真实元件拼接（SnapGene pET-28a(+) 表达盒、RefSeq EGFR-KD、U55762 EGFP、
 *  PDB 1N8Z scFv 密码子优化、J01636 lacI、J01749 rop/ori、V00359 KanR、X52328 f1 ori、L09137 pUC19） */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { sequences, sequenceFeatures } from "./schema";

const db = getDb();
/* 质粒数据已纳入版本控制：db/plasmids.json（相对本脚本解析，保证 seed 可复现） */
const __dir = dirname(fileURLToPath(import.meta.url));
const plasmids = JSON.parse(readFileSync(join(__dir, "plasmids.json"), "utf-8")) as {
  name: string; type: string; sequence: string; description: string;
  features: { name: string; type: string; start: number; end: number; strand: number; color: string; note?: string }[];
}[];

for (const p of plasmids) {
  const exist = await db.query.sequences.findFirst({ where: eq(sequences.name, p.name) });
  let seqId: number;
  if (exist) {
    seqId = exist.id;
    await db.update(sequences).set({ sequence: p.sequence, description: p.description }).where(eq(sequences.id, seqId));
    await db.delete(sequenceFeatures).where(eq(sequenceFeatures.sequenceId, seqId));
    console.log("updated:", p.name, seqId);
  } else {
    const [{ id }] = await db
      .insert(sequences)
      .values({ name: p.name, type: "dna", sequence: p.sequence, description: p.description, createdByName: "演示用户" })
      .$returningId();
    seqId = id;
    console.log("inserted:", p.name, seqId);
  }
  await db.insert(sequenceFeatures).values(
    p.features.map((f) => ({
      sequenceId: seqId, name: f.name,
      type: f.type as "promoter" | "cds" | "resistance" | "origin" | "terminator" | "tag" | "primer_bind" | "restriction_site" | "regulatory" | "other",
      start: f.start, end: f.end, strand: f.strand, color: f.color, note: f.note ?? null,
    })),
  );
  console.log(`  features: ${p.features.length}, length: ${p.sequence.length} bp`);
}
console.log("Done.");
process.exit(0);
