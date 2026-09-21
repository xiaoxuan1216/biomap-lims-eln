import { expect, it } from "vitest";
import { stepRecordIssues, latestStepRecord, stepRecordSpecSchema, stepRecordRowsSchema, stepRecordText } from "./stepRecords";
import { antibodyMethodDraft } from "./antibodyMethods";
import { linearMethodOrder } from "./linearMethod";
import { methodPublicationIssues, methodSpecSchema } from "./method";
import { readMethodRequirementsDraft } from "./methodDraft";
import { parseStepRecordPaste } from "./stepRecordPaste";

const spec = stepRecordSpecSchema.parse({ fields: [{ key: "volume", label: "体积", kind: "number", unit: "mL" }, { key: "time", label: "时间", kind: "datetime" }] });
const row = { id: "00000000-0000-4000-8000-000000000001", sampleIds: [1], values: { volume: "2.5", time: "2026-09-18T10:30:00+08:00" } };
it("permits incomplete drafts while completion requires coverage, finite numeric values and explicit timezones", () => {
  expect(stepRecordIssues(spec, [{ ...row, values: {} }], [1, 2], false)).toEqual([]);
  expect(stepRecordIssues(spec, [row], [1], true)).toEqual([]);
  expect(stepRecordIssues(spec, [row], [1, 2], true)).not.toEqual([]);
  for (const volume of ["", "NaN", "Infinity", "0x10", "1 mg"]) expect(stepRecordIssues(spec, [{ ...row, values: { ...row.values, volume } }], [1], true)).not.toEqual([]);
  expect(stepRecordIssues(spec, [{ ...row, values: { ...row.values, time: "2026-09-18T10:30" } }], [1], true)).not.toEqual([]);
  expect(stepRecordIssues(spec, [{ ...row, values: { ...row.values, time: "2026-02-31T10:30:00Z" } }], [1], true)).not.toEqual([]);
});
it("pastes quoted spreadsheet records with sample links, explicit units and local timestamps", () => {
  const fields = stepRecordSpecSchema.parse({ fields: [{ key: "note", label: "备注" }, ...spec.fields] });
  const parsed = parseStepRecordPaste('样本编号\t备注\t体积 (mL)\t时间\r\nSMP-1;SMP-2\t"line one\nline ""two"""\t2.5\t2026-09-18 10:30\r\n', fields, [{ sampleId: 1, sku: "SMP-1" }, { sampleId: 2, sku: "SMP-2" }]);
  expect(parsed).toHaveLength(1);
  expect(parsed[0].sampleIds).toEqual([1, 2]);
  expect(parsed[0].values.note).toBe('line one\nline "two"');
  expect(stepRecordIssues(fields, [{ id: row.id, ...parsed[0] }], [1, 2], true)).toEqual([]);
});
it("refuses unknown samples, shifted headers, broken quoting and rollover dates instead of partially importing", () => {
  const samples = [{ sampleId: 1, sku: "SMP-1" }];
  for (const text of ['SMP-other\t2\t2026-09-18T10:30Z', '样本编号\t时间\t体积\nSMP-1\t2\t2026-09-18T10:30Z', 'SMP-1\t"2\t2026-09-18T10:30Z', 'SMP-1\t2\t2026-02-31 10:30']) expect(() => parseStepRecordPaste(text, spec, samples)).toThrow();
});
it("rejects foreign samples, duplicate sample links, unknown fields and duplicate entry identities even in drafts", () => {
  for (const sampleIds of [[99], [1, 1]]) expect(stepRecordIssues(spec, [{ ...row, sampleIds }], [1], false)).not.toEqual([]);
  expect(stepRecordIssues(spec, [{ ...row, values: { other: "value" } }], [1], false)).not.toEqual([]);
  expect(stepRecordRowsSchema.safeParse([row, row]).success).toBe(false);
});
it("reads the final immutable completion record and renders sample identity, units and times for the ELN", () => {
  const events = [{ id: 1, action: "save_step_record", nodeKey: "a", payload: JSON.stringify({ records: [] }) }, { id: 2, action: "complete_step", nodeKey: "a", payload: JSON.stringify({ records: [row] }) }];
  expect(latestStepRecord(events, "a")).toEqual({ eventId: 2, rows: [row] });
  expect(stepRecordText(spec, [row], () => "SMP-1")).toContain("SMP-1");
  expect(stepRecordText(spec, [row], String)).toContain("2.5 mL");
});
it("retains unfinished method record forms for recovery but refuses them as publishable specs", () => {
  const method = antibodyMethodDraft("expression").spec;
  method.nodes.culture.record!.fields[0].label = "";
  const draft = { format: 1, specHash: "a".repeat(64), graphHash: "b".repeat(64), spec: method };
  expect(readMethodRequirementsDraft(JSON.stringify(draft))).not.toBeNull();
  expect(methodSpecSchema.safeParse(method).success).toBe(false);
});
it("provides records for all 19 stage steps without operating values or automatic publication", () => {
  let count = 0;
  for (const stage of ["cloning", "expression", "purification", "characterization"] as const) {
    const draft = antibodyMethodDraft(stage);
    for (const node of draft.nodes) { count++; expect(draft.spec.nodes[node.nodeKey].record?.fields.length).toBeGreaterThan(0); }
    expect(methodPublicationIssues(draft.nodes.map(node => ({ ...node, templateKey: null })), draft.edges, draft.spec)).toContain("请填写该研发阶段使用的 SOP 编号和版本");
  }
  expect(count).toBe(19);
});
it("prevents a simplified list from flattening branches, parallel paths or nested workflows", () => {
  const nodes = ["a", "b", "c"].map(nodeKey => ({ nodeKey, type: "manual" }));
  expect(linearMethodOrder(nodes, [{ sourceKey: "a", targetKey: "b" }, { sourceKey: "b", targetKey: "c" }])).toEqual(["a", "b", "c"]);
  expect(linearMethodOrder(nodes, [{ sourceKey: "a", targetKey: "b" }, { sourceKey: "a", targetKey: "c" }])).toBeNull();
  expect(linearMethodOrder(nodes, [])).toBeNull();
  expect(linearMethodOrder([{ ...nodes[0], childWorkflowId: 42 }], [])).toBeNull();
  expect(linearMethodOrder([{ ...nodes[0], type: "decision" }], [])).toBeNull();
});
