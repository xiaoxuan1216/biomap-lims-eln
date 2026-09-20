import { describe, expect, it } from "vitest";
import { methodNodeSpecSchema, methodSpecSchema } from "./method";
import { measurementSchema, methodOutputSchema } from "./methodOutputs";
import { readMethodRequirementsDraft } from "./methodDraft";

describe("method requirements recovery", () => {
  it("retains unfinished requirements without making them executable", () => {
    const spec = methodSpecSchema.parse({ nodes: { step: methodNodeSpecSchema.parse({}) } });
    spec.minSamples = 20; spec.maxSamples = 10;
    spec.materials.push({ name: "", unit: "", approvedSkus: [], perBatch: 0, perSample: 0 });
    spec.nodes.step.parameters.cycles = { adjustable: true, min: 50, max: 40 };
    const restored = readMethodRequirementsDraft(JSON.stringify({ format: 1, specHash: "a".repeat(64), graphHash: "b".repeat(64), spec }));
    expect(restored?.spec).toEqual(spec);
    expect(methodSpecSchema.safeParse(restored?.spec).success).toBe(false);
  });
  it("retains unfinished scientific criteria while publication validation rejects them", () => {
    const spec = methodSpecSchema.parse({ stage: "cloning", nodes: { step: {} } });
    spec.protocol = { reference: "", version: "" };
    spec.nodes.step.measurements = [measurementSchema.parse({ key: "purity", label: "Purity" })];
    spec.nodes.step.measurements[0].min = 100; spec.nodes.step.measurements[0].max = 90;
    spec.nodes.step.produces = methodOutputSchema.parse({ label: "Output", type: "plasmid", unit: "µg", relation: "assembled_from" });
    spec.nodes.step.produces.requiredMetadata = [{ key: "", label: "", labelEn: "" }];
    const raw = JSON.stringify({ format: 1, specHash: "a".repeat(64), graphHash: "b".repeat(64), spec });
    expect(readMethodRequirementsDraft(raw)?.spec).toEqual(spec);
    expect(methodSpecSchema.safeParse(spec).success).toBe(false);
  });
  it("ignores malformed or incompatible local recovery data", () => {
    for (const raw of [null, "{", "null", '{"format":2}', JSON.stringify({ format: 1, specHash: "bad", graphHash: "b".repeat(64), spec: {} })]) {
      expect(readMethodRequirementsDraft(raw)).toBeNull();
    }
  });
});
