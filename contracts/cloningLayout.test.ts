import { describe, expect, it } from "vitest";
import { buildCloningPlan, cloningCSV, cloningSaveSchema, CLONING_WELLS, DEFAULT_CLONING_CONFIG as base, type CloningConfig } from "./cloningLayout";

describe("cloning workflow planning", () => {
  it.each([[1, 1], [94, 1], [95, 2], [96, 2]])("allocates %i samples across %i PCR plates without displacing controls", (samples, count) => {
    const p = buildCloningPlan({ ...base, samples }, "compact");
    const stage = p.stages.find(s => s.key === "E")!;
    expect(stage.plates).toHaveLength(count);
    expect(stage.plates.flatMap(p => p.controls)).toHaveLength(count * 2);
  });
  it("balances sparse tails while preserving control wells and total work", () => {
    const compact = buildCloningPlan(base, "compact"), recommended = buildCloningPlan(base, "recommended");
    expect(compact.stages.find(s => s.key === "E")!.plates.map(p => p.samples.length)).toEqual([94, 2]);
    expect(recommended.stages.find(s => s.key === "E")!.plates.map(p => p.samples.length)).toEqual([48, 48]);
    expect(recommended.summary.plates).toBe(compact.summary.plates);
  });
  it("reports the real cost of keeping three candidates together", () => {
    const c = { ...base, samples: 94, clones: 3 };
    const compact = buildCloningPlan(c, "compact"), recommended = buildCloningPlan(c, "recommended");
    expect(recommended.summary.plates).toBe(compact.summary.plates + 1);
    expect(compact.summary.splits).toBeGreaterThan(0);
    expect(recommended.summary.splits).toBe(0);
  });
  it("validates all-stage counts, source references and well partitions at multiple scales", () => {
    const cases: CloningConfig[] = [
      ...[1, 24, 58, 59, 60, 61, 94, 95, 96, 97, 200].map(samples => ({ ...base, samples })),
      ...[1, 2, 3, 4].map(clones => ({ ...base, samples: 94, clones, edge: true, column: true })),
      { ...base, samples: 1536, clones: 4, edge: true, controls: 4, column: true },
      { ...base, samples: 96, controls: 0 },
    ];
    for (const c of cases) for (const mode of ["compact", "recommended"] as const) {
      const plan = buildCloningPlan(c, mode), all = [...plan.stages.flatMap(s => s.plates.flatMap(p => [...p.samples, ...p.controls])), ...plan.dishes];
      const byId = new Map(all.map(e => [e.id, e]));
      expect(byId.size).toBe(all.length); expect(plan.dishes).toHaveLength(c.samples);
      for (const stage of plan.stages) {
        const multiplier = ["J", "K"].includes(stage.key) ? c.clones : stage.key === "N" ? 2 : 1;
        expect(stage.plates.reduce((n, p) => n + p.samples.length, 0)).toBe(c.samples * multiplier);
        const perTarget = new Map<number, number>();
        for (const plate of stage.plates) {
          const occupied = [...plate.samples, ...plate.controls];
          expect(new Set(occupied.map(e => e.well)).size).toBe(occupied.length);
          expect(occupied.length + plate.blocked.length + plate.free).toBe(96);
          expect(plate.controls.length).toBe(["E", "K"].includes(stage.key) ? c.controls : 0);
          expect(plate.blocked.length).toBe(c.edge && ["E", "G", "K"].includes(stage.key) ? 36 : 0);
          for (const e of occupied) { expect(CLONING_WELLS).toContain(e.well); expect(plate.blocked).not.toContain(e.well); }
          for (const e of plate.samples) perTarget.set(e.target!, (perTarget.get(e.target!) ?? 0) + 1);
        }
        expect(perTarget.size).toBe(c.samples);
        expect([...perTarget.values()].every(n => n === multiplier)).toBe(true);
      }
      for (const e of all) for (const parent of e.parents) {
        const source = byId.get(parent.id)!;
        expect(source).toBeDefined(); expect(source.target).toBe(e.target);
        expect([source.container, source.well]).toEqual([parent.container, parent.well]);
      }
    }
  });
  it("keeps clone selection pending and distinguishes culture/plasmid sources from result evidence", () => {
    const p = buildCloningPlan(base, "recommended"), first = (s: string) => p.stages.find(x => x.key === s)!.plates[0].samples[0];
    expect(first("L").parents.filter(x => x.kind === "conditional")).toHaveLength(base.clones);
    expect(first("L").parents.filter(x => x.kind === "material")).toHaveLength(0);
    expect(first("L").cloneId).toBeUndefined();
    expect(first("O").parents.find(x => x.kind === "material")!.id).toMatch(/^PLS-/);
    expect(first("P").parents.find(x => x.kind === "material")!.id).toMatch(/^CUL-/);
    expect(first("O").parents.filter(x => x.kind === "result")).toHaveLength(2);
  });
  it("exports every physical well, including controls and excluded wells", () => {
    const plan = buildCloningPlan({ ...base, edge: true }, "recommended"), csv = cloningCSV(plan);
    expect(csv.split("\r\n")).toHaveLength(plan.summary.plates * 96 + 1);
    expect(csv).toContain('"blocked"'); expect(csv).toContain('"control_reserved"');
  });
  it("rejects invalid counts and save requests without an idempotency key", () => {
    for (const samples of [0, -1, 1.5, 1537, NaN]) expect(() => buildCloningPlan({ ...base, samples }, "recommended")).toThrow();
    expect(cloningSaveSchema.safeParse({ workflowId: 1, nodeKey: null, config: base, mode: "recommended", name: "Test", expectedVersion: 0 }).success).toBe(false);
  });
});
