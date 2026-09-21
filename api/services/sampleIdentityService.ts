import { and, eq, inArray } from "drizzle-orm";
import { labRunOutputs, sampleIdentities, samples } from "@db/schema";
import type { DatabaseTransaction } from "../queries/labHelpers";
import type { FrozenSampleIdentity } from "@contracts/sampleIdentity";

export async function resolvedSampleIdentities(tx: DatabaseTransaction, ids: number[]): Promise<FrozenSampleIdentity[]> {
  if (!ids.length) return [];
  const outputs = await tx.select().from(labRunOutputs).where(inArray(labRunOutputs.sampleId, ids));
  const accepted = await tx.select().from(sampleIdentities).where(and(inArray(sampleIdentities.sampleId, ids), eq(sampleIdentities.status, "approved")));
  const current = await tx.select().from(samples).where(inArray(samples.id, ids));
  return ids.flatMap<FrozenSampleIdentity>(sampleId => {
    const output = outputs.find(row => row.sampleId === sampleId);
    if (output) return output.status === "released" ? [{ sampleId, antibodyId: output.antibodyId, chain: output.chain, origin: "run_output" as const, originId: output.id, sourceReference: `Run ${output.runId}`, lot: JSON.parse(output.sampleSnapshot).sku }] : [];
    const candidates = accepted.filter(row => row.sampleId === sampleId);
    const identity = candidates.length === 1 ? candidates[0] : null;
    const sample = current.find(row => row.id === sampleId);
    if (!identity || !sample || sample.archivedAt) return [];
    const snapshot = JSON.parse(identity.sampleSnapshot);
    if (snapshot.type !== sample.type || snapshot.unit !== sample.unit || identity.sequenceId !== sample.sequenceId) return [];
    return [{ sampleId, antibodyId: identity.antibodyId, chain: identity.chain, origin: identity.source, originId: identity.id, sourceReference: identity.sourceReference, lot: identity.lot, sequenceSnapshot: identity.sequenceSnapshot ? JSON.parse(identity.sequenceSnapshot) : null }];
  });
}
