import { expect, it } from "vitest";
import { methodNodeSpecSchema } from "./method";
import { measurementIssue, measurementSchema, outputParentIssue } from "./methodOutputs";
import { missingRunResults } from "./runExecution";
it("requires each declared metric on produced lots, not the consumed parent samples", () => {
 const rule = methodNodeSpecSchema.parse({ resultRequired: true, resultsOn: "outputs", measurements: [{ key: "purity", label: "Purity", unit: "%" }, { key: "yield", label: "Yield", unit: "mg" }] });
 const nodes = [{ nodeKey: "qc", type: "data", status: "completed" as const }];
 const outputs = [{ nodeKey: "qc", sampleId: 3, status: "pending_review" }, { nodeKey: "qc", sampleId: 4, status: "voided" }];
 expect(missingRunResults(nodes, [], [1, 2], ["qc"], [{ nodeKey: "qc", sampleId: 3, metricKey: "purity" }], { qc: rule }, outputs)).toEqual([{ nodeKey: "qc", sampleId: 3, metricKey: "yield" }]);
});
it("does not accept an incomplete or mixed antibody heavy/light chain pair", () => {
 const hc = { antibodyId: "AB-1", chain: "HC" }, lc = { antibodyId: "AB-1", chain: "LC" };
 expect(outputParentIssue("paired_hc_lc", "AB-1", [hc, lc])).toBeNull();
 for (const parents of [[hc], [hc, hc], [hc, { ...lc, antibodyId: "AB-2" }]]) expect(outputParentIssue("paired_hc_lc", "AB-1", parents)).not.toBeNull();
});
it("rejects incompatible units, non-numeric input and false pass while allowing a documented failure", () => {
 const rule = measurementSchema.parse({ key: "purity", label: "Purity", unit: "%", min: 90, max: 100 });
 expect(measurementIssue(rule, "95", "%", "pass")).toBeNull();
 expect(measurementIssue(rule, "80", "%", "fail")).toBeNull();
 for (const [value, unit] of [["80", "%"], ["95", "mg"], ["none", "%"], ["", "%"]]) expect(measurementIssue(rule, value, unit, "pass")).not.toBeNull();
});
