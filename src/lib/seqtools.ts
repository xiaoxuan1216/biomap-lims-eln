/** 序列工具：密码子优化 / 酶切位点扫描 / Gibson 组装设计（纯函数，无副作用） */

/* ── 标准密码子表 ── */
export const CODON_AA: Record<string, string> = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L", CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M", GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S", AGT: "S", AGC: "S",
  CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T",
  GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*", TGA: "*",
  CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K",
  GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  TGT: "C", TGC: "C", TGG: "W",
  CGT: "R", CGC: "R", CGA: "R", CGG: "R", AGA: "R", AGG: "R",
  GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

/** 宿主密码子使用频率（‰）：E. coli K12 / Homo sapiens（HEK293） */
export const CODON_USAGE: Record<string, Record<string, number>> = {
  ecoli: {
    TTT: 22.1, TTC: 16.6, TTA: 13.9, TTG: 13.0, CTT: 11.9, CTC: 10.7, CTA: 3.8, CTG: 52.6,
    ATT: 30.1, ATC: 25.1, ATA: 4.4, ATG: 27.8,
    GTT: 18.3, GTC: 15.3, GTA: 11.6, GTG: 26.4,
    TCT: 8.6, TCC: 8.9, TCA: 7.1, TCG: 8.9, AGT: 8.8, AGC: 16.1,
    CCT: 7.0, CCC: 5.5, CCA: 8.4, CCG: 23.2,
    ACT: 8.9, ACC: 23.6, ACA: 7.6, ACG: 14.5,
    GCT: 16.1, GCC: 27.7, GCA: 21.2, GCG: 33.6,
    TAT: 16.2, TAC: 12.2, TAA: 2.0, TAG: 0.3, TGA: 1.0,
    CAT: 12.8, CAC: 9.8, CAA: 15.3, CAG: 29.5,
    AAT: 17.7, AAC: 21.9, AAA: 33.2, AAG: 12.1,
    GAT: 32.1, GAC: 19.1, GAA: 39.3, GAG: 17.9,
    TGT: 5.2, TGC: 6.5, TGG: 15.2,
    CGT: 21.6, CGC: 22.9, CGA: 3.6, CGG: 5.5, AGA: 4.1, AGG: 2.3,
    GGT: 24.4, GGC: 26.9, GGA: 8.4, GGG: 11.4,
  },
  human: {
    TTT: 17.6, TTC: 20.3, TTA: 7.7, TTG: 12.9, CTT: 13.2, CTC: 19.6, CTA: 7.2, CTG: 39.6,
    ATT: 16.0, ATC: 20.8, ATA: 7.5, ATG: 22.0,
    GTT: 11.0, GTC: 14.5, GTA: 7.1, GTG: 28.1,
    TCT: 15.2, TCC: 17.7, TCA: 12.2, TCG: 4.4, AGT: 12.1, AGC: 19.5,
    CCT: 17.5, CCC: 19.8, CCA: 16.9, CCG: 6.9,
    ACT: 13.1, ACC: 18.9, ACA: 15.1, ACG: 6.1,
    GCT: 18.4, GCC: 27.7, GCA: 15.8, GCG: 7.4,
    TAT: 12.2, TAC: 15.3, TAA: 1.0, TAG: 0.4, TGA: 1.6,
    CAT: 10.9, CAC: 15.1, CAA: 12.3, CAG: 34.2,
    AAT: 17.0, AAC: 19.1, AAA: 24.4, AAG: 31.9,
    GAT: 21.8, GAC: 25.1, GAA: 29.0, GAG: 39.6,
    TGT: 10.6, TGC: 12.6, TGG: 13.2,
    CGT: 4.5, CGC: 10.4, CGA: 6.2, CGG: 11.4, AGA: 12.2, AGG: 12.0,
    GGT: 10.8, GGC: 22.2, GGA: 16.5, GGG: 16.5,
  },
};

export const HOSTS: Record<string, { zh: string; en: string }> = {
  ecoli: { zh: "E. coli K12（BL21）", en: "E. coli K12 (BL21)" },
  human: { zh: "人源（HEK293）", en: "Human (HEK293)" },
};

export function revcomp(s: string): string {
  const m: Record<string, string> = { A: "T", T: "A", G: "C", C: "G", N: "N" };
  return s.toUpperCase().split("").reverse().map((c) => m[c] ?? "N").join("");
}

export function translate(dna: string, frame = 0): string {
  const s = dna.toUpperCase().replace(/[^ACGT]/g, "");
  let out = "";
  for (let i = frame; i + 3 <= s.length; i += 3) out += CODON_AA[s.slice(i, i + 3)] ?? "X";
  return out;
}

export function gcPercent(s: string): number {
  const clean = s.toUpperCase().replace(/[^ACGT]/g, "");
  if (!clean.length) return 0;
  const gc = (clean.match(/[GC]/g) ?? []).length;
  return Math.round((gc / clean.length) * 1000) / 10;
}

/** CAI（密码子适应指数）：各密码子相对适应度 w 的几何平均 */
export function cai(dna: string, host: string, frame = 0): number {
  const usage = CODON_USAGE[host];
  if (!usage) return 0;
  const maxByAa = new Map<string, number>();
  for (const [codon, aa] of Object.entries(CODON_AA)) {
    maxByAa.set(aa, Math.max(maxByAa.get(aa) ?? 0, usage[codon] ?? 0));
  }
  const s = dna.toUpperCase().replace(/[^ACGT]/g, "");
  const ws: number[] = [];
  for (let i = frame; i + 3 <= s.length; i += 3) {
    const codon = s.slice(i, i + 3);
    const aa = CODON_AA[codon];
    if (!aa || aa === "*") continue;
    const max = maxByAa.get(aa) ?? 1;
    ws.push((usage[codon] ?? 0.1) / max);
  }
  if (!ws.length) return 0;
  const logSum = ws.reduce((a, w) => a + Math.log(Math.max(w, 1e-6)), 0);
  return Math.round(Math.exp(logSum / ws.length) * 1000) / 1000;
}

/** 同义密码子中频率最高者（确定性最大化 CAI） */
const bestCodonCache = new Map<string, string>();
function bestCodon(aa: string, host: string): string {
  const key = `${host}:${aa}`;
  const hit = bestCodonCache.get(key);
  if (hit) return hit;
  const usage = CODON_USAGE[host];
  let best = "", bestU = -1;
  for (const [codon, a] of Object.entries(CODON_AA)) {
    if (a === aa && (usage[codon] ?? 0) > bestU) {
      best = codon;
      bestU = usage[codon] ?? 0;
    }
  }
  bestCodonCache.set(key, best);
  return best;
}

export interface CodonOptResult {
  optimized: string;
  proteinBefore: string;
  proteinAfter: string;
  identical: boolean;
  caiBefore: number;
  caiAfter: number;
  gcBefore: number;
  gcAfter: number;
  changedCodons: number;
  totalCodons: number;
}

export function codonOptimize(dna: string, host: string, frame = 0): CodonOptResult {
  const s = dna.toUpperCase().replace(/[^ACGT]/g, "");
  const head = s.slice(0, frame);
  const body = s.slice(frame);
  let optimized = head;
  let changed = 0;
  for (let i = 0; i + 3 <= body.length; i += 3) {
    const codon = body.slice(i, i + 3);
    const aa = CODON_AA[codon];
    const next = aa ? bestCodon(aa, host) : codon;
    if (next !== codon) changed++;
    optimized += next;
  }
  const proteinBefore = translate(s, frame);
  const proteinAfter = translate(optimized, frame);
  return {
    optimized,
    proteinBefore,
    proteinAfter,
    identical: proteinBefore === proteinAfter,
    caiBefore: cai(s, host, frame),
    caiAfter: cai(optimized, host, frame),
    gcBefore: gcPercent(s),
    gcAfter: gcPercent(optimized),
    changedCodons: changed,
    totalCodons: Math.floor(body.length / 3),
  };
}

/* ── 限制性内切酶库（识别序列 5'→3'；pal = 回文，非回文需同时扫反链） ── */
export interface Enzyme { name: string; site: string; pal: boolean; note: string }
export const ENZYMES: Enzyme[] = [
  { name: "EcoRI", site: "GAATTC", pal: true, note: "G^AATTC" },
  { name: "BamHI", site: "GGATCC", pal: true, note: "G^GATCC" },
  { name: "HindIII", site: "AAGCTT", pal: true, note: "A^AGCTT" },
  { name: "NdeI", site: "CATATG", pal: true, note: "CA^TATG" },
  { name: "NcoI", site: "CCATGG", pal: true, note: "C^CATGG" },
  { name: "XhoI", site: "CTCGAG", pal: true, note: "C^TCGAG" },
  { name: "XbaI", site: "TCTAGA", pal: true, note: "T^CTAGA" },
  { name: "SacI", site: "GAGCTC", pal: true, note: "GAGCT^C" },
  { name: "SalI", site: "GTCGAC", pal: true, note: "G^TCGAC" },
  { name: "KpnI", site: "GGTACC", pal: true, note: "GGTAC^C" },
  { name: "PstI", site: "CTGCAG", pal: true, note: "CTGCA^G" },
  { name: "SphI", site: "GCATGC", pal: true, note: "GCATG^C" },
  { name: "BglII", site: "AGATCT", pal: true, note: "A^GATCT" },
  { name: "SpeI", site: "ACTAGT", pal: true, note: "A^CTAGT" },
  { name: "NheI", site: "GCTAGC", pal: true, note: "G^CTAGC" },
  { name: "AgeI", site: "ACCGGT", pal: true, note: "A^CCGGT" },
  { name: "NotI", site: "GCGGCCGC", pal: true, note: "GC^GGCCGC" },
  { name: "PacI", site: "TTAATTAA", pal: true, note: "TTAAT^TAA" },
  { name: "SmaI", site: "CCCGGG", pal: true, note: "CCC^GGG（平末端）" },
  { name: "EcoRV", site: "GATATC", pal: true, note: "GAT^ATC（平末端）" },
  { name: "MluI", site: "ACGCGT", pal: true, note: "A^CGCGT" },
  { name: "BsaI", site: "GGTCTC", pal: false, note: "GGTCTC(N1)（IIS 型，Golden Gate）" },
  { name: "BsmBI", site: "CGTCTC", pal: false, note: "CGTCTC(N1)（IIS 型，Golden Gate）" },
];

export interface RestrictionHit { enzyme: Enzyme; positions: number[] }
export function restrictionScan(dna: string): RestrictionHit[] {
  const s = dna.toUpperCase().replace(/[^ACGT]/g, "");
  const hits: RestrictionHit[] = [];
  for (const ez of ENZYMES) {
    const positions = new Set<number>();
    for (const probe of ez.pal ? [ez.site] : [ez.site, revcomp(ez.site)]) {
      let idx = s.indexOf(probe);
      while (idx !== -1) {
        positions.add(idx + 1);
        idx = s.indexOf(probe, idx + 1);
      }
    }
    hits.push({ enzyme: ez, positions: [...positions].sort((a, b) => a - b) });
  }
  return hits;
}

/* ── Gibson 组装设计 ── */
export interface GibsonFragment { id: number; name: string; sequence: string }
export interface GibsonPlan {
  fragments: {
    id: number;
    name: string;
    length: number;
    leftOverlap: string | null;
    rightOverlap: string | null;
    primerF: string;
    primerR: string;
  }[];
  totalLength: number;
  overlapLen: number;
  annealLen: number;
}

export function gibsonDesign(frags: GibsonFragment[], overlapLen = 20, annealLen = 20): GibsonPlan {
  const clean = frags.map((f) => ({ ...f, sequence: f.sequence.toUpperCase().replace(/[^ACGT]/g, "") }));
  const total = clean.reduce((a, f) => a + f.sequence.length, 0);
  const fragments = clean.map((f, i) => {
    const prev = clean[i - 1];
    const next = clean[i + 1];
    const leftOverlap = prev ? prev.sequence.slice(-overlapLen) : null;
    const rightOverlap = next ? next.sequence.slice(0, overlapLen) : null;
    const annealF = f.sequence.slice(0, annealLen);
    const annealR = revcomp(f.sequence.slice(-annealLen));
    return {
      id: f.id,
      name: f.name,
      length: f.sequence.length,
      leftOverlap,
      rightOverlap,
      primerF: (leftOverlap ?? "") + annealF,
      primerR: (rightOverlap ? revcomp(rightOverlap) : "") + annealR,
    };
  });
  return { fragments, totalLength: total, overlapLen, annealLen };
}
