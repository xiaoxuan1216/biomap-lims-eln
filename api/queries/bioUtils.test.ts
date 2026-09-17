import { describe, expect, it } from "vitest";
import {
  designGibsonPrimers,
  findOrfs,
  findRestrictionSites,
  reverseComplement,
  tmEstimate,
  normalizeSequenceInput,
  normalizeUnambiguousDna,
} from "./bioUtils";

describe("server-side bio utilities", () => {
  it("reverse-complements IUPAC ambiguity codes", () => {
    expect(reverseComplement("ATGRY")).toBe("RYCAT");
  });

  it("finds a complete forward ORF", () => {
    const sequence = `ATG${"GCT".repeat(30)}TAA`;
    const hits = findOrfs(sequence, 30);
    expect(hits[0]).toMatchObject({ frame: 1, start: 1, end: sequence.length, lengthAa: 31 });
  });

  it("finds a unique restriction site", () => {
    const hits = findRestrictionSites("AAAAGAATTCTTT");
    expect(hits).toContainEqual({ enzyme: "EcoRI", position: 5, strand: 1, cut: "G^AATTC" });
  });

  it("designs primers with the requested homology arms", () => {
    const result = designGibsonPrimers("ATGCGTACGTAC", "AAAACCCC", "GGGGTTTT", 4, 6);
    expect(result.forward.sequence.startsWith("CCCC")).toBe(true);
    expect(result.reverse.sequence.startsWith("CCCC")).toBe(true);
    expect(result.forward.tm).toBe(tmEstimate(result.forward.annealRegion));
  });

  it("imports one FASTA record without silently dropping invalid letters", () => {
    expect(normalizeSequenceInput(">plasmid\nATGC 12\nNNRY", "dna"))
      .toBe("ATGCNNRY");
    expect(() => normalizeSequenceInput(">a\nATGC\n>b\nATGC", "dna"))
      .toThrow("一次只能导入一条 FASTA");
    expect(() => normalizeSequenceInput("ATGCQ", "dna"))
      .toThrow("包含不支持的字符");
  });

  it("requires unambiguous DNA for primer calculations", () => {
    expect(normalizeUnambiguousDna("atgc atgc", "引物")).toBe("ATGCATGC");
    expect(() => normalizeUnambiguousDna("ATGCN", "引物")).toThrow("只能包含 A/C/G/T");
  });
});
