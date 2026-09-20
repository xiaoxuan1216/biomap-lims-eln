import { expect, it } from "vitest";
import { stepRecordSuggestions, precedingSteps } from "./stepRecordReuse";
import { stepRecordSpecSchema } from "./stepRecords";
import { antibodyMethodDraft } from "./antibodyMethods";
import { methodPublicationIssues } from "./method";
import type { FrozenSampleIdentity } from "./sampleIdentity";
const id = "00000000-0000-4000-8000-000000000001";
const spec = stepRecordSpecSchema.parse({ fields: [{ key: "cultureLot", label: "Culture lot", reuse: { kind: "step", nodeKey: "first", fieldKey: "lot" } }] });
const event = (eventId: number, action: string, rows = [{ id, sampleIds: [1, 2], values: { lot: "L1" } }]) => ({ id: eventId, action, nodeKey: "first", payload: JSON.stringify({ records: rows }) });
it("uses only completed records with full unambiguous sample correspondence", () => {
  expect(stepRecordSuggestions(spec, [1, 2], [], [event(1, "save_step_record")])[0].status).toBe("unavailable");
  expect(stepRecordSuggestions(spec, [1, 2], [], [event(2, "complete_step")])[0]).toMatchObject({ status: "available", value: "L1", eventId: 2 });
  expect(stepRecordSuggestions(spec, [1], [], [event(2, "complete_step")])[0].status).toBe("unavailable");
  expect(stepRecordSuggestions(spec, [], [], [event(2, "complete_step")])[0].status).toBe("unavailable");
  const rows = [{ id, sampleIds: [1], values: { lot: "L1" } }, { id: "00000000-0000-4000-8000-000000000002", sampleIds: [2], values: { lot: "L2" } }];
  expect(stepRecordSuggestions(spec, [1, 2], [], [event(2, "complete_step", rows)])[0].status).toBe("ambiguous");
  expect(stepRecordSuggestions(spec, [1], [], [event(2, "complete_step", rows)])[0].value).toBe("L1");
});
it("uses frozen chain-specific identities and never treats a legacy sample code as a batch lot", () => {
  const rule = stepRecordSpecSchema.parse({ fields: [{ key: "heavy", label: "Heavy lot", reuse: { kind: "identity", field: "lot", chain: "HC" } }] });
  const identities: FrozenSampleIdentity[] = ["HC", "LC"].map((chain, i) => ({ sampleId: i + 1, antibodyId: "AB1", chain, origin: "external", originId: i + 1, lot: `${chain}-lot`, sourceReference: "supplier" }));
  expect(stepRecordSuggestions(rule, [1, 2], identities, [])[0].value).toBe("HC-lot");
  expect(stepRecordSuggestions(rule, [1, 3], identities, [])[0].status).toBe("unavailable");
  expect(stepRecordSuggestions(rule, [1], [{ ...identities[0], origin: "run_output", lot: "SMP-1" }], [])[0].status).toBe("unavailable");
});
it("preserves legacy method serialization and rejects measurement/time reuse", () => {
  const field = { key: "value", label: "Value" };
  expect(stepRecordSpecSchema.parse({ fields: [field] }).fields[0]).not.toHaveProperty("reuse");
  for (const kind of ["number", "datetime"]) expect(stepRecordSpecSchema.safeParse({ fields: [{ ...field, kind, reuse: { kind: "identity", field: "lot" } }] }).success).toBe(false);
});
it("rejects publication when sources are missing, downstream or numeric", () => {
  const draft = antibodyMethodDraft("expression");
  const nodes = draft.nodes.map(node => ({ ...node, templateKey: null }));
  const issues = () => methodPublicationIssues(nodes, draft.edges, draft.spec).filter(issue => issue.includes("批次信息来源"));
  expect(issues()).toEqual([]);
  const field = draft.spec.nodes.transfection.record!.fields.find(field => field.key === "cultureLot")!;
  for (const [nodeKey, fieldKey] of [["harvest", "cultureLot"], ["missing", "cultureLot"], ["cell_readiness", "density"]]) {
    field.reuse = { kind: "step", nodeKey, fieldKey }; expect(issues()).toHaveLength(1);
  }
  expect(precedingSteps("a", [{ sourceKey: "b", targetKey: "a" }, { sourceKey: "a", targetKey: "b" }])).toEqual(new Set(["b"]));
});
