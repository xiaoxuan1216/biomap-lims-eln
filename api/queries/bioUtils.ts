// ─── 生物序列计算引擎（Copilot 核心）──────────────────────────────────

const COMPLEMENT: Record<string, string> = {
  A: "T", T: "A", G: "C", C: "G", U: "A", N: "N",
  R: "Y", Y: "R", M: "K", K: "M", S: "S", W: "W",
  B: "V", V: "B", D: "H", H: "D",
};

export function reverseComplement(seq: string): string {
  return seq
    .toUpperCase()
    .split("")
    .reverse()
    .map((c) => COMPLEMENT[c] ?? c)
    .join("");
}

export function gcContent(seq: string): number {
  if (!seq.length) return 0;
  const gc = (seq.toUpperCase().match(/[GC]/g) || []).length;
  return Math.round((gc / seq.length) * 1000) / 10;
}

export function baseCounts(seq: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ch of seq.toUpperCase()) counts[ch] = (counts[ch] || 0) + 1;
  return counts;
}

const CODON_TABLE: Record<string, string> = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L",
  CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M",
  GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S",
  CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T",
  GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*",
  CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K",
  GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  TGT: "C", TGC: "C", TGA: "*", TGG: "W",
  CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R",
  GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

export function translate(dna: string): string {
  const s = dna.toUpperCase().replace(/U/g, "T");
  let protein = "";
  for (let i = 0; i + 3 <= s.length; i += 3) {
    protein += CODON_TABLE[s.slice(i, i + 3)] ?? "X";
  }
  return protein;
}

export interface Orf {
  frame: number; // +1/+2/+3/-1/-2/-3
  start: number; // 1-based
  end: number;
  lengthAa: number;
  proteinPreview: string;
}

/** 六读框 ORF 查找（最小氨基酸长度） */
export function findOrfs(seq: string, minAa = 30): Orf[] {
  const s = seq.toUpperCase();
  const orfs: Orf[] = [];
  const scan = (str: string, strand: 1 | -1) => {
    for (let f = 0; f < 3; f++) {
      let start = -1;
      for (let i = f; i + 3 <= str.length; i += 3) {
        const codon = str.slice(i, i + 3);
        if (codon === "ATG" && start === -1) {
          start = i;
        } else if (["TAA", "TAG", "TGA"].includes(codon) && start !== -1) {
          const lengthAa = (i - start) / 3;
          if (lengthAa >= minAa) {
            const dnaSeg = str.slice(start, i + 3);
            orfs.push({
              frame: strand * (f + 1),
              start: strand === 1 ? start + 1 : str.length - i - 2,
              end: strand === 1 ? i + 3 : str.length - start,
              lengthAa: Math.round(lengthAa),
              proteinPreview: translate(dnaSeg).slice(0, 30),
            });
          }
          start = -1;
        }
      }
    }
  };
  scan(s, 1);
  scan(reverseComplement(s), -1);
  return orfs.sort((a, b) => b.lengthAa - a.lengthAa);
}

// ─── 限制性内切酶 ───────────────────────────────────────────────────────
export const RESTRICTION_ENZYMES: Record<string, { site: string; cut: string }> = {
  EcoRI: { site: "GAATTC", cut: "G^AATTC" },
  BamHI: { site: "GGATCC", cut: "G^GATCC" },
  HindIII: { site: "AAGCTT", cut: "A^AGCTT" },
  XhoI: { site: "CTCGAG", cut: "C^TCGAG" },
  XbaI: { site: "TCTAGA", cut: "T^CTAGA" },
  NotI: { site: "GCGGCCGC", cut: "GC^GGCCGC" },
  NdeI: { site: "CATATG", cut: "CA^TATG" },
  SalI: { site: "GTCGAC", cut: "G^TCGAC" },
  PstI: { site: "CTGCAG", cut: "CTGCA^G" },
  NcoI: { site: "CCATGG", cut: "C^CATGG" },
  BsaI: { site: "GGTCTC", cut: "GGTCTC(N1)^" },
  BsmBI: { site: "CGTCTC", cut: "CGTCTC(N1)^" },
  SapI: { site: "GCTCTTC", cut: "GCTCTTC(N1)^" },
  KpnI: { site: "GGTACC", cut: "GGTAC^C" },
  SacI: { site: "GAGCTC", cut: "GAGCT^C" },
  SpeI: { site: "ACTAGT", cut: "A^CTAGT" },
  AgeI: { site: "ACCGGT", cut: "A^CCGGT" },
  BglII: { site: "AGATCT", cut: "A^GATCT" },
  EcoRV: { site: "GATATC", cut: "GAT^ATC" },
  MluI: { site: "ACGCGT", cut: "A^CGCGT" },
};

export interface RestrictionHit {
  enzyme: string;
  position: number; // 1-based
  strand: 1 | -1;
  cut: string;
}

export function findRestrictionSites(seq: string): RestrictionHit[] {
  const s = seq.toUpperCase();
  const hits: RestrictionHit[] = [];
  for (const [enzyme, { site, cut }] of Object.entries(RESTRICTION_ENZYMES)) {
    let idx = s.indexOf(site);
    while (idx !== -1) {
      hits.push({ enzyme, position: idx + 1, strand: 1, cut });
      idx = s.indexOf(site, idx + 1);
    }
    const rc = reverseComplement(site);
    if (rc !== site) {
      idx = s.indexOf(rc);
      while (idx !== -1) {
        hits.push({ enzyme, position: idx + 1, strand: -1, cut });
        idx = s.indexOf(rc, idx + 1);
      }
    }
  }
  return hits.sort((a, b) => a.position - b.position);
}

/** 唯一酶切位点（载体构建常用：每个酶只切一次） */
export function uniqueCutters(seq: string): string[] {
  const hits = findRestrictionSites(seq);
  const count: Record<string, number> = {};
  hits.forEach((h) => (count[h.enzyme] = (count[h.enzyme] || 0) + 1));
  return Object.entries(count)
    .filter(([, n]) => n === 1)
    .map(([e]) => e);
}

// ─── 引物计算 ───────────────────────────────────────────────────────────
/** Tm 估算：短序列用 Wallace 法则，长序列用经验公式 */
export function tmEstimate(primer: string): number {
  const s = primer.toUpperCase();
  const gc = (s.match(/[GC]/g) || []).length;
  if (s.length < 14) return 2 * (s.length - gc) + 4 * gc;
  return Math.round((64.9 + (41 * (gc - 16.4)) / s.length) * 10) / 10;
}

// ─── 常见元件自动注释 ───────────────────────────────────────────────────
export const COMMON_FEATURES: {
  name: string;
  motif: string;
  type: string;
  color: string;
}[] = [
  { name: "T7 启动子", motif: "TAATACGACTCACTATAGGG", type: "promoter", color: "emerald" },
  { name: "SP6 启动子", motif: "ATTTAGGTGACACTATAG", type: "promoter", color: "emerald" },
  { name: "lac 操纵子", motif: "AATTGTGAGCGGATAACAATT", type: "regulatory", color: "cyan" },
  { name: "T7 终止子", motif: "CTAGCATAACCCCTTGGGGCCTCTAAACGGGTCTTGAGGGGTTTTTTG", type: "terminator", color: "rose" },
  { name: "Kozak 序列", motif: "GCCACCATGG", type: "regulatory", color: "cyan" },
  { name: "6×His 标签", motif: "CATCATCATCATCATCAT", type: "tag", color: "amber" },
  { name: "SV40 poly(A)", motif: "AATAAA", type: "regulatory", color: "cyan" },
  { name: "BsaI (Golden Gate)", motif: "GGTCTC", type: "restriction_site", color: "violet" },
  { name: "BsmBI (Golden Gate)", motif: "CGTCTC", type: "restriction_site", color: "violet" },
];

export interface AutoAnnotation {
  name: string;
  type: string;
  start: number;
  end: number;
  strand: 1 | -1;
  color: string;
}

export function autoAnnotate(seq: string): AutoAnnotation[] {
  const s = seq.toUpperCase();
  const results: AutoAnnotation[] = [];
  for (const f of COMMON_FEATURES) {
    let idx = s.indexOf(f.motif);
    while (idx !== -1) {
      // poly(A) 信号太短，限制只注释前 3 个
      if (f.name === "SV40 poly(A)" && results.filter((r) => r.name === f.name).length >= 3) break;
      results.push({
        name: f.name,
        type: f.type,
        start: idx + 1,
        end: idx + f.motif.length,
        strand: 1,
        color: f.color,
      });
      idx = s.indexOf(f.motif, idx + 1);
    }
    const rc = reverseComplement(f.motif);
    if (rc !== f.motif) {
      let ridx = s.indexOf(rc);
      while (ridx !== -1) {
        results.push({
          name: f.name,
          type: f.type,
          start: ridx + 1,
          end: ridx + rc.length,
          strand: -1,
          color: f.color,
        });
        ridx = s.indexOf(rc, ridx + 1);
      }
    }
  }
  return results.sort((a, b) => a.start - b.start);
}

// ─── Gibson 引物设计（简化版）──────────────────────────────────────────
export interface GibsonPrimer {
  name: string;
  sequence: string;
  tm: number;
  homologyArm: string;
  annealRegion: string;
}

export function designGibsonPrimers(
  insertSeq: string,
  vectorLeftArm: string,
  vectorRightArm: string,
  armLength = 25,
  annealLength = 20,
): { forward: GibsonPrimer; reverse: GibsonPrimer } {
  const ins = insertSeq.toUpperCase();
  const vl = vectorLeftArm.toUpperCase().slice(-armLength);
  const vr = vectorRightArm.toUpperCase().slice(0, armLength);

  const fwdAnneal = ins.slice(0, annealLength);
  const revAnneal = reverseComplement(ins.slice(-annealLength));

  return {
    forward: {
      name: "Insert-F (Gibson)",
      homologyArm: vl,
      annealRegion: fwdAnneal,
      sequence: vl + fwdAnneal,
      tm: tmEstimate(fwdAnneal),
    },
    reverse: {
      name: "Insert-R (Gibson)",
      homologyArm: reverseComplement(vr),
      annealRegion: revAnneal,
      sequence: reverseComplement(vr) + revAnneal,
      tm: tmEstimate(revAnneal),
    },
  };
}
