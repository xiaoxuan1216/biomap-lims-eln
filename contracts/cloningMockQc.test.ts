import { describe, expect, it } from "vitest";
import { buildCloningPlan, DEFAULT_CLONING_CONFIG } from "./cloningLayout";
import { mockSequenceSummary, mockStageQc, mockWellQc } from "./cloningMockQc";

describe("cloning mock QC", () => {
  const plan = buildCloningPlan({ ...DEFAULT_CLONING_CONFIG, samples: 200, clones: 3, edge: true }, "recommended");
  it("maps only occupied wells, includes controls, and never modifies the plan", () => {
    const before = JSON.stringify(plan);
    for (const stage of plan.stages) {
      const rows = mockStageQc(plan, stage.key);
      expect(rows).toHaveLength(stage.plates.reduce((n, p) => n + p.samples.length + p.controls.length, 0));
      for (const row of rows) { expect(row.mock).toBe(true); expect(stage.plates.find(p => p.id === row.entity.container)?.blocked).not.toContain(row.entity.well); }
    }
    expect(JSON.stringify(plan)).toBe(before);
  });
  it("keeps QC tied to sample identity when layouts change", () => {
    const other = buildCloningPlan({ ...plan.config, column: true, edge: false }, "compact");
    const rows = mockStageQc(other, "F");
    for (const row of mockStageQc(plan, "F")) expect(row.fragment).toEqual(rows.find(r => r.entity.id === row.entity.id)?.fragment);
  });
  it("provides numeric fragment curves and multiple QC scenarios", () => {
    const rows = mockStageQc(plan, "F");
    expect(new Set(rows.map(r => r.status))).toEqual(new Set(["pass", "review", "fail"]));
    for (const row of rows) { expect(row.fragment?.trace).toHaveLength(201); expect(row.fragment?.trace.every(p => Number.isFinite(p.rfu) && p.rfu >= 0)).toBe(true); }
  });
  it("keeps sequence percentages exclusive and shared across F/R wells", () => {
    const rows = mockStageQc(plan, "N");
    for (const row of rows) {
      const s = row.sequence!;
      expect(s.reference + s.synonymous + s.aaMutation + s.unresolved).toBe(s.total);
      expect(s.total).toBe(100);
      const pair = rows.find(other => other.entity.target === row.entity.target && other.entity.branch !== row.entity.branch)!;
      expect(s).toEqual(pair.sequence);
    }
    expect(mockSequenceSummary(plan).targets).toBe(200);
  });
  it("does not invent independent QC or release results for unmeasured stages", () => {
    for (const stage of ["A", "B", "C", "G", "H", "J", "L", "O", "P"] as const) expect(mockStageQc(plan, stage).every(r => r.status === "pending" && r.assay === "none")).toBe(true);
    const control = mockStageQc(plan, "E").find(r => r.entity.kind === "control")!;
    expect(mockWellQc(control.entity).assay).toBe("control");
  });
  it("keeps default sequencing predominantly passing while retaining review and failure examples", () => {
    for (const samples of [96, 200, 1536]) {
      const layout = buildCloningPlan({ ...DEFAULT_CLONING_CONFIG, samples }, "recommended");
      const targets = mockStageQc(layout, "N").filter(row => row.entity.branch === 1);
      const pass = targets.filter(row => row.status === "pass").length;
      const fail = targets.filter(row => row.status === "fail").length;
      expect(pass / samples).toBeGreaterThanOrEqual(.85);
      expect(fail / samples).toBeLessThanOrEqual(.05);
      expect(fail).toBeGreaterThan(0);
      expect(targets.some(row => row.status === "review" && row.sequence!.synonymous > 0)).toBe(true);
      expect(targets.some(row => row.status === "review" && row.sequence!.unresolved > 10)).toBe(true);
    }
  });
});
