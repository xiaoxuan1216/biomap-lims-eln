import { stepRecordRowsSchema, type StepRecordSpec } from "./stepRecords";
import type { FrozenSampleIdentity } from "./sampleIdentity";

export function precedingSteps(nodeKey: string, edges: readonly { sourceKey: string; targetKey: string }[]): Set<string> {
  const found = new Set<string>(), queue = [nodeKey];
  while (queue.length) {
    const next = queue.pop()!;
    for (const edge of edges.filter(edge => edge.targetKey === next)) if (edge.sourceKey !== nodeKey && !found.has(edge.sourceKey)) { found.add(edge.sourceKey); queue.push(edge.sourceKey); }
  }
  return found;
}

/** Suggestions are explicit, unique text values. No measurements, times or unfinished step drafts are carried forward. */
export function stepRecordSuggestions(spec: StepRecordSpec, sampleIds: number[], identities: FrozenSampleIdentity[], events: { id: number; action: string; nodeKey: string | null; payload: string }[]) {
  return spec.fields.filter(field => field.reuse && field.kind === "text").map(field => {
    const source = field.reuse!;
    let values: string[] = [], complete = sampleIds.length > 0, eventId: number | undefined;
    if (source.kind === "identity") {
      const selected = sampleIds.map(id => identities.find(identity => identity.sampleId === id));
      complete &&= selected.every(Boolean);
      // Legacy system outputs store a sample code in `lot`, not a confirmed laboratory lot.
      values = selected.filter(identity => identity && (!source.chain || identity.chain === source.chain)).map(identity => source.field === "lot" && identity!.origin === "run_output" ? "" : identity![source.field]);
    } else {
      const event = events.filter(event => event.action === "complete_step" && event.nodeKey === source.nodeKey).sort((a, b) => b.id - a.id)[0];
      eventId = event?.id;
      const records = event ? stepRecordRowsSchema.parse(JSON.parse(event.payload).records ?? []) : [];
      const rows = records.filter(row => row.sampleIds.length && row.sampleIds.every(id => sampleIds.includes(id)));
      complete &&= sampleIds.every(id => rows.some(row => row.sampleIds.includes(id)));
      values = rows.map(row => row.values[source.fieldKey] ?? "");
    }
    complete &&= values.length > 0 && values.every(value => value.trim() && value.length <= 2000);
    const unique = [...new Set(values.map(value => value.trim()))];
    const status = !complete ? "unavailable" : unique.length !== 1 ? "ambiguous" : "available";
    return { fieldKey: field.key, source, eventId, status, value: status === "available" ? unique[0] : undefined };
  });
}
