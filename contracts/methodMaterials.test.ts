import { expect, it } from "vitest";
import { methodMaterialDemand, methodSpecSchema, methodNodeSpecSchema } from "./method";
import { methodDifferences } from "./methodDiff";
it("calculates batch demand without accepting an unapproved inventory item or mismatched unit", () => {
  const spec = methodSpecSchema.parse({ materials: [{ name: "Buffer", approvedSkus: ["A", "B"], unit: "mL", perBatch: 2, perSample: 0.5 }] });
  const [demand] = methodMaterialDemand(spec, 4, [{ sku: "A", unit: "mL", role: "material", amount: 1 }, { sku: "B", unit: "mL", role: "material", amount: 2 }, { sku: "A", unit: "uL", role: "material", amount: 10 }, { sku: "C", unit: "mL", role: "material", amount: 10 }]);
  expect(demand).toMatchObject({ required: 4, allocated: 3, missing: 1 });
  expect(methodMaterialDemand(spec, 2, [])).toMatchObject([{ required: 3 }]);
});
it("rejects inverted parameter limits and double-counted material inventory", () => {
  expect(() => methodNodeSpecSchema.parse({ parameters: { v: { adjustable: true, min: 20, max: 10 } } })).toThrow();
  const rule = { name: "Buffer", approvedSkus: ["A"], unit: "mL", perBatch: 1, perSample: 0 };
  expect(() => methodSpecSchema.parse({ materials: [rule, rule] })).toThrow();
});
it("shows scientific and routing changes without reporting canvas or runtime changes", () => {
  const base = { nodes: [{ nodeKey: "n", label: "Test", type: "manual", templateKey: null, params: null, posX: 1, status: "pending" }], edges: [], spec: methodSpecSchema.parse({}) };
  expect(methodDifferences(base, { ...base, nodes: [{ ...base.nodes[0], posX: 42, status: "done" }] } as typeof base)).toEqual([]);
  expect(methodDifferences(base, { ...base, nodes: [{ ...base.nodes[0], label: "Updated test" }] })).toEqual([{ kind: "changed", label: "Updated test" }]);
  expect(methodDifferences(
    { ...base, workflow: { visualizationSpec: null } },
    { ...base, workflow: { visualizationSpec: JSON.stringify({ kind: "VisualizationBlueprint" }) } },
  )).toEqual([{ kind: "view", label: "" }]);
});
