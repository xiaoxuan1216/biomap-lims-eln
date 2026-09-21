import type { CloningEntity, CloningPlan, CloningStageKey } from "./cloningLayout";

export const MOCK_QC_VERSION = "mock-qc-v1";
export type MockQcStatus = "pass" | "review" | "fail" | "pending";
export const MOCK_QC_LABELS = { pass: "通过", review: "待复核", fail: "不通过", pending: "暂无检测结果" };
export type FragmentQc = { instrument: "Qsep"; expectedBp: number; measuredBp: number; concentration: number; mainPeakPercent: number; trace: { bp: number; rfu: number }[] };
export type SequenceQc = {
  total: number; reference: number; synonymous: number; aaMutation: number; unresolved: number;
  coveragePercent: number; q20Percent: number;
  variants: { nucleotide: string; codon: string; aminoAcid: string; kind: "synonymous" | "aaMutation"; count: number }[];
};
export type MockWellQc = { entity: CloningEntity; mock: true; status: MockQcStatus; assay: "fragment" | "sequence" | "concentration" | "control" | "none"; fragment?: FragmentQc; sequence?: SequenceQc; concentration?: { ngPerUl: number; ratio260280: number }; controlSignal?: number };
function seed(text: string) { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; }

// Pure presentation data. No LIMS result, release decision, inventory, or audit writes.
export function mockWellQc(entity: CloningEntity): MockWellQc {
  const base: MockWellQc = { entity, mock: true, status: "pending", assay: "none" };
  const hash = seed(`${MOCK_QC_VERSION}:${entity.id}`);
  if (entity.kind === "control") {
    const failed = hash % 13 === 0;
    const controlSignal = entity.control === "NTC" ? failed ? 180 : 8 : failed ? 30 : 850;
    return { ...base, status: failed ? "fail" : "pass", assay: "control", controlSignal };
  }
  if (["E", "F", "K"].includes(entity.stage)) {
    const expectedBp = 720 + 3 * (((entity.target ?? 1) - 1) % 9);
    const scenario = hash % 10;
    const measuredBp = expectedBp + (scenario === 0 ? 155 : (hash % 15) - 7);
    const mainPeakPercent = scenario === 0 ? 54 : scenario < 3 ? 82 : 94 + hash % 6;
    const concentration = scenario === 1 ? 3.2 : 15 + (hash % 550) / 10;
    const trace = Array.from({ length: 201 }, (_, i) => {
      const bp = i * 10;
      const peak = (center: number, width: number, height: number) => height * Math.exp(-0.5 * ((bp - center) / width) ** 2);
      return { bp, rfu: Math.round(8 + (seed(`${hash}:${i}`) % 8) + peak(100, 12, 210) + peak(measuredBp, 20, 1000 * mainPeakPercent / 100) + peak(measuredBp + 220, 30, (100 - mainPeakPercent) * 9) + peak(1800, 16, 230)) };
    });
    return { ...base, assay: "fragment", status: Math.abs(measuredBp - expectedBp) > 30 || mainPeakPercent < 70 ? "fail" : mainPeakPercent < 90 || concentration < 10 ? "review" : "pass", fragment: { instrument: "Qsep", expectedBp, measuredBp, concentration, mainPeakPercent, trace } };
  }
  if (entity.stage === "N") {
    // F and R wells share the same mock target-consensus composition, not independent molecules.
    const value = seed(`${MOCK_QC_VERSION}:consensus:${entity.target}`);
    // Presentation distribution v2: 90% pass, 5% synonymous review, 2% low-coverage
    // review, 3% AA failure per 100 targets. A permutation scatters exceptions and
    // remains stable across plate layouts. These are not empirical assay rates.
    const slot = ((entity.target ?? 1) * 37 + 13) % 100;
    const lowCoverage = slot >= 8 && slot < 10;
    const synonymous = slot >= 3 && slot < 8 ? 8 + value % 18 : 0;
    const aaMutation = slot < 3 ? 5 + value % 16 : 0;
    const unresolved = lowCoverage ? 25 : value % 4;
    const sequence: SequenceQc = { total: 100, reference: 100 - synonymous - aaMutation - unresolved, synonymous, aaMutation, unresolved, coveragePercent: lowCoverage ? 78 : 98 + value % 3, q20Percent: lowCoverage ? 72 : 94 + value % 7, variants: [] };
    if (synonymous) sequence.variants.push({ nucleotide: "c.303A>G", codon: "GAA → GAG", aminoAcid: "p.Glu101=", kind: "synonymous", count: synonymous });
    if (aaMutation) sequence.variants.push({ nucleotide: "c.452C>T", codon: "GCT → GTT", aminoAcid: "p.Ala151Val", kind: "aaMutation", count: aaMutation });
    return { ...base, assay: "sequence", status: aaMutation ? "fail" : synonymous || unresolved > 10 ? "review" : "pass", sequence };
  }
  if (entity.stage === "M") return { ...base, assay: "concentration", status: hash % 8 === 0 ? "review" : "pass", concentration: { ngPerUl: 80 + (hash % 1500) / 10, ratio260280: hash % 8 === 0 ? 1.52 : 1.8 + (hash % 15) / 100 } };
  return base;
}

export function mockStageQc(plan: CloningPlan, stage: CloningStageKey) {
  return (plan.stages.find(item => item.key === stage)?.plates ?? []).flatMap(plate => [...plate.samples, ...plate.controls].map(mockWellQc));
}

// N forward/reverse aliquots are a single target consensus in batch statistics.
export function mockSequenceSummary(plan: CloningPlan) {
  const rows = mockStageQc(plan, "N").filter(row => row.entity.branch === 1 && row.sequence);
  return { targets: rows.length, reference: rows.filter(row => !row.sequence!.synonymous && !row.sequence!.aaMutation && row.sequence!.unresolved <= 10).length, synonymous: rows.filter(row => row.sequence!.synonymous > 0).length, aaMutation: rows.filter(row => row.sequence!.aaMutation > 0).length, unresolved: rows.filter(row => row.sequence!.unresolved > 10).length };
}
