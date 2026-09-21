import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { samples, sampleIdentities, sequences, labRunOutputs, labRuns, labRunResources, labRunExecution } from "@db/schema";
import { sampleIdentityInput, sampleIdentityReviewInput } from "@contracts/sampleIdentity";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity } from "./queries/labHelpers";
import { resolvedSampleIdentities } from "./services/sampleIdentityService";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (message: string): never => { throw new TRPCError({ code: "PRECONDITION_FAILED", message }); };
export const sampleIdentityRouter = createRouter({
  pairedCandidates: authedQuery.input(z.object({ sampleIds: z.array(z.number().int().positive()).min(1).max(200) })).query(({ input }) => getDb().transaction(async tx => {
    const selected = await resolvedSampleIdentities(tx, input.sampleIds);
    const missing = selected.filter(identity => ["HC", "LC"].includes(identity.chain) && !selected.some(other => other.antibodyId === identity.antibodyId && other.chain === (identity.chain === "HC" ? "LC" : "HC")));
    if (!missing.length) return { candidates: [], hasMore: false };
    const incoming = await tx.select({ sampleId: samples.id }).from(sampleIdentities).innerJoin(samples, eq(samples.id, sampleIdentities.sampleId)).where(and(
      eq(sampleIdentities.status, "approved"), eq(samples.type, "plasmid"), isNull(samples.archivedAt), gt(samples.quantity, 0),
      or(...missing.map(identity => and(eq(sampleIdentities.antibodyId, identity.antibodyId), eq(sampleIdentities.chain, identity.chain === "HC" ? "LC" : "HC"))))
    )).orderBy(desc(sampleIdentities.id)).limit(101);
    const produced = await tx.select({ sampleId: samples.id }).from(labRunOutputs).innerJoin(samples, eq(samples.id, labRunOutputs.sampleId)).where(and(
      eq(labRunOutputs.status, "released"), eq(samples.type, "plasmid"), isNull(samples.archivedAt), gt(samples.quantity, 0),
      or(...missing.map(identity => and(eq(labRunOutputs.antibodyId, identity.antibodyId), eq(labRunOutputs.chain, identity.chain === "HC" ? "LC" : "HC"))))
    )).orderBy(desc(labRunOutputs.id)).limit(101);
    const ids = [...new Set([...incoming, ...produced].map(row => row.sampleId))].filter(id => !input.sampleIds.includes(id));
    const resolved = await resolvedSampleIdentities(tx, ids);
    const candidates = resolved.filter(identity => missing.some(source => source.antibodyId === identity.antibodyId && identity.chain === (source.chain === "HC" ? "LC" : "HC")));
    return { candidates: candidates.slice(0, 100).map(({ sampleId, antibodyId, chain, lot, sourceReference }) => ({ sampleId, antibodyId, chain, lot, sourceReference })), hasMore: incoming.length > 100 || produced.length > 100 || candidates.length > 100 };
  })),
  resolve: authedQuery.input(z.object({ sampleIds: z.array(z.number().int().positive()).max(200) })).query(({ input }) => getDb().transaction(tx => resolvedSampleIdentities(tx, input.sampleIds))),
  history: authedQuery.input(z.object({ sampleId: z.number().int().positive() })).query(async ({ input }) => {
    const db = getDb();
    const [output] = await db.select({ runId: labRunOutputs.runId, antibodyId: labRunOutputs.antibodyId, chain: labRunOutputs.chain, status: labRunOutputs.status }).from(labRunOutputs).where(eq(labRunOutputs.sampleId, input.sampleId));
    const records = await db.select().from(sampleIdentities).where(eq(sampleIdentities.sampleId, input.sampleId)).orderBy(desc(sampleIdentities.id));
    return { output: output ?? null, records };
  }),
  pending: authedQuery.query(() => getDb().select({ id: sampleIdentities.id, sampleId: samples.id, sku: samples.sku, name: samples.name, antibodyId: sampleIdentities.antibodyId, chain: sampleIdentities.chain, submittedBy: sampleIdentities.submittedBy, submittedByName: sampleIdentities.submittedByName }).from(sampleIdentities).innerJoin(samples, eq(samples.id, sampleIdentities.sampleId)).where(and(eq(sampleIdentities.status, "review"), isNull(samples.archivedAt))).orderBy(desc(sampleIdentities.id))),
  submit: writeQuery.input(sampleIdentityInput).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const [sample] = await tx.select().from(samples).where(eq(samples.id, input.sampleId)).limit(1).for("update");
    if (!sample || sample.archivedAt) return fail("来样不存在或已归档");
    const requestHash = hash(JSON.stringify(input));
    const [prior] = await tx.select().from(sampleIdentities).where(eq(sampleIdentities.requestKey, input.requestKey));
    if (prior) { if (prior.requestHash !== requestHash || prior.submittedBy !== ctx.user.id) return fail("来样提交标识已用于其他内容"); return { id: prior.id }; }
    if (!["plasmid", "protein", "antibody"].includes(sample.type)) return fail("此入口适用于已有质粒、蛋白或抗体样本");
    const [output] = await tx.select().from(labRunOutputs).where(eq(labRunOutputs.sampleId, sample.id));
    if (output) return fail("本系统实验产物请使用原实验的身份与复核记录");
    const active = await tx.select().from(sampleIdentities).where(and(eq(sampleIdentities.sampleId, sample.id), inArray(sampleIdentities.status, ["review", "approved"])));
    if (active.length) return fail("此样本已有待复核或已确认身份，请先处理原记录");
    const [sequence] = input.sequenceId ? await tx.select().from(sequences).where(eq(sequences.id, input.sequenceId)).limit(1) : [];
    if ((input.sequenceId && !sequence) || (sample.type === "plasmid" && (!sequence || sequence.type !== "dna" || !sequence.sequence.trim()))) return fail("来样质粒必须关联实际 DNA 序列");
    if (sample.type === "plasmid" && input.chain === "paired") return fail("请为来样质粒分别确认重链、轻链或单链构型");
    const [saved] = await tx.insert(sampleIdentities).values({ sampleId: sample.id, source: input.source, sourceReference: input.sourceReference, lot: input.lot, antibodyId: input.antibodyId, chain: input.chain, sequenceId: sequence?.id ?? null, sequenceSnapshot: sequence ? JSON.stringify({ id: sequence.id, name: sequence.name, sequence: sequence.sequence, sha256: hash(sequence.sequence) }) : null, sampleSnapshot: JSON.stringify({ sku: sample.sku, name: sample.name, type: sample.type, unit: sample.unit, sequenceId: sample.sequenceId }), verification: input.verification, submittedBy: ctx.user.id, submittedByName: ctx.user.name ?? "用户", requestKey: input.requestKey, requestHash }).$returningId();
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "提交来样身份确认", entityType: "sample", entityId: sample.id, entityName: sample.sku, after: input });
    return { id: saved.id };
  })),
  review: writeQuery.input(sampleIdentityReviewInput).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    if (!["reviewer", "admin"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "需要复核权限" });
    const [hint] = await tx.select().from(sampleIdentities).where(eq(sampleIdentities.id, input.id));
    if (!hint) return fail("来样确认记录不存在");
    const [sample] = await tx.select().from(samples).where(eq(samples.id, hint.sampleId)).limit(1).for("update");
    const [record] = await tx.select().from(sampleIdentities).where(eq(sampleIdentities.id, input.id)).limit(1).for("update");
    if (!sample || sample.archivedAt) return fail("来样不存在或已归档");
    const retiring = input.decision === "retire";
    const requestHash = hash(JSON.stringify(input));
    if ((retiring ? record.retirementRequestKey : record.reviewRequestKey) === input.requestKey) {
      if ((retiring ? record.retirementRequestHash : record.reviewRequestHash) !== requestHash || (retiring ? record.retiredBy : record.reviewedBy) !== ctx.user.id) return fail("来样复核标识已用于其他内容");
      return { id: record.id, status: record.status };
    }
    if (record.submittedBy === ctx.user.id) return fail("来样身份需由另一位有权限的人员确认");
    if (retiring ? record.status !== "approved" : record.status !== "review") return fail("来样确认状态已变化，请刷新后继续");
    if (retiring) {
      const active = await tx.select({ id: labRuns.id }).from(labRunResources).innerJoin(labRuns, eq(labRuns.id, labRunResources.runId)).leftJoin(labRunExecution, eq(labRunExecution.runId, labRuns.id)).where(and(eq(labRunResources.sampleId, sample.id), inArray(labRuns.status, ["ready", "running", "completed"]), or(isNull(labRunExecution.resultState), ne(labRunExecution.resultState, "approved")))).limit(1);
      if (active.length) return fail("来样仍有未结束或未复核实验，请先处理相关实验再停用身份");
      await tx.update(sampleIdentities).set({ status: "retired", retiredBy: ctx.user.id, retiredAt: new Date(), retirementNote: input.note, retirementRequestKey: input.requestKey, retirementRequestHash: requestHash }).where(eq(sampleIdentities.id, record.id));
    } else {
      if (input.decision === "approve") {
        const snapshot = JSON.parse(record.sampleSnapshot);
        if (snapshot.type !== sample.type || snapshot.unit !== sample.unit || snapshot.sequenceId !== sample.sequenceId) return fail("样本类型、单位或关联序列已变化，请退回后重新确认");
        if (record.sequenceId) {
          const [sequence] = await tx.select().from(sequences).where(eq(sequences.id, record.sequenceId)).limit(1);
          if (!sequence || hash(sequence.sequence) !== JSON.parse(record.sequenceSnapshot!).sha256) return fail("关联序列在提交后已变化，请退回后重新确认");
        }
        await tx.update(samples).set({ sequenceId: record.sequenceId }).where(eq(samples.id, sample.id));
      }
      await tx.update(sampleIdentities).set({ status: input.decision === "approve" ? "approved" : "rejected", reviewedBy: ctx.user.id, reviewedByName: ctx.user.name ?? "复核人", reviewedAt: new Date(), reviewNote: input.note, reviewRequestKey: input.requestKey, reviewRequestHash: requestHash }).where(eq(sampleIdentities.id, record.id));
    }
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: retiring ? "停用来样身份" : input.decision === "approve" ? "确认来样身份" : "退回来样身份", entityType: "sample", entityId: sample.id, entityName: sample.sku, detail: input.note, before: { identityId: record.id, status: record.status }, after: { identityId: record.id, status: retiring ? "retired" : input.decision === "approve" ? "approved" : "rejected" } });
    return { id: record.id, status: retiring ? "retired" : input.decision === "approve" ? "approved" : "rejected" };
  })),
});
