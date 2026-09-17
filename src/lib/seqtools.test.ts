import { describe, expect, it } from "vitest";
import {
  cai,
  codonOptimize,
  gibsonDesign,
  restrictionScan,
  revcomp,
  translate,
} from "./seqtools";

describe("sequence design helpers", () => {
  it("reverse-complements DNA", () => {
    expect(revcomp("ATGCCN")).toBe("NGGCAT");
  });

  it("translates a coding sequence", () => {
    expect(translate("ATGGCTTAA")).toBe("MA*");
  });

  it("optimizes synonymous codons without changing length or trailing bases", () => {
    const source = "ATGTTTAA";
    const result = codonOptimize(source, "ecoli");

    expect(result.optimized).toHaveLength(source.length);
    expect(result.optimized.endsWith("AA")).toBe(true);
    expect(result.proteinAfter).toBe(result.proteinBefore);
    expect(result.identical).toBe(true);
    expect(result.caiAfter).toBeGreaterThanOrEqual(result.caiBefore);
  });

  it("returns a bounded CAI", () => {
    expect(cai("ATGGCTGCTTAA", "ecoli")).toBeGreaterThan(0);
    expect(cai("ATGGCTGCTTAA", "ecoli")).toBeLessThanOrEqual(1);
  });

  it("finds restriction sites using one-based coordinates", () => {
    const ecoRI = restrictionScan("AAAGAATTCTTT").find((hit) => hit.enzyme.name === "EcoRI");
    expect(ecoRI?.positions).toEqual([4]);
  });

  it("builds Gibson overlaps from adjacent fragments", () => {
    const plan = gibsonDesign(
      [
        { id: 1, name: "vector", sequence: "AAAACCCC" },
        { id: 2, name: "insert", sequence: "GGGGTTTT" },
      ],
      4,
      4,
    );

    expect(plan.fragments[1].leftOverlap).toBe("CCCC");
    expect(plan.fragments[1].primerF).toBe("CCCCGGGG");
    expect(plan.totalLength).toBe(16);
  });
});
