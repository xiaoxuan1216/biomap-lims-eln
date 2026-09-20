import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lt, gte } from "drizzle-orm";
import { z } from "zod";
import { executionActionSchema, resultInputSchema, settleExecutionGraph, missingRunResults } from "@contracts/runExecution";
import { latestStepRecord, stepRecordIssues, stepRecordText, type StepRecordRow } from "@contracts/stepRecords";
import { terminalRunStatus } from "@contracts/labRun";
import { labRuns, labRunExecution, labRunEvents, labRunEvidence, labRunResults, labRunNodes, externalOrderItems, equipmentBookings, equipment, users, experiments, labRunDrafts, labRunOutputs, samples, storageLocations, lineageEdges, sequences } from "@db/schema";
import { authedQuery, createRouter, writeQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { appendActivity, nextExperimentCode, nextSampleSku, type DatabaseTransaction } from "./queries/labHelpers";
import { currentReadiness } from "./labRunRouter";
import { appendExperimentRevision, reviseExperiment, signExperiment } from "./services/elnService";

import { recordOutputSchema, defaultMeasurement, measurementIssue, outputParentIssue, isNextMethodStage } from "@contracts/methodOutputs";
import { changeInventoryInTransaction } from "./services/inventoryService";

import { lockedExecution } from "./services/runExecutionState";
import { saveRunEvidence } from "./services/runEvidenceService";
import { evidenceStorageConfig } from "./services/evidenceStorage";
import { evidenceMetadataSchema, LEGACY_EVIDENCE_MAX_BYTES } from "@contracts/runEvidence";

import { approvedEquipmentOverrides } from "@contracts/runRecovery";
import { runDraftPayloadSchema } from "@contracts/runDraft";
import { assessMethodEquipment } from "@contracts/method";
import { publishedMethod } from "./services/methodService";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (message: string): never => { throw new TRPCError({ code: "PRECONDITION_FAILED", message }); };
const evidenceColumns = { id: labRunEvidence.id, runId: labRunEvidence.runId, nodeKey: labRunEvidence.nodeKey, name: labRunEvidence.name, byteSize: labRunEvidence.byteSize, sha256: labRunEvidence.sha256, uploadedByName: labRunEvidence.uploadedByName, createdAt: labRunEvidence.createdAt };


async function replayEvent(tx: DatabaseTransaction, input: { runId: number; idempotencyKey: string }, actorId: number, requestHash: string) {
  const [event] = await tx.select().from(labRunEvents).where(and(eq(labRunEvents.runId, input.runId), eq(labRunEvents.idempotencyKey, input.idempotencyKey))).limit(1);
  if (!event) return null;
  if (event.requestHash !== requestHash || event.actorId !== actorId) throw new TRPCError({ code: "CONFLICT", message: "此请求标识已用于其他操作" });
  return JSON.parse(event.result) as { revision: number; resultId?: number; outputId?: number; sampleId?: number; experimentId?: number | null };
}

function latestResults(rows: Array<typeof labRunResults.$inferSelect>) {
  const superseded = new Set(rows.map(row => row.supersedesId).filter(Boolean));
  return rows.filter(row => !superseded.has(row.id));
}

export const runExecutionRouter = createRouter({
  details: authedQuery.input(z.object({ runId: z.number().int().positive() })).query(async ({ input }) => {
    const db = getDb();
    const [execution] = await db.select().from(labRunExecution).where(eq(labRunExecution.runId, input.runId));
    const [runState] = await db.select({ revision: labRuns.revision }).from(labRuns).where(eq(labRuns.id, input.runId)).limit(1);
    const [experiment] = execution?.experimentId ? await db.select({ id: experiments.id, revision: experiments.revision, status: experiments.status }).from(experiments).where(eq(experiments.id, execution.experimentId)).limit(1) : [];
    const [events, evidence, results, outputs] = await Promise.all([
      db.select().from(labRunEvents).where(eq(labRunEvents.runId, input.runId)).orderBy(asc(labRunEvents.id)),
      db.select(evidenceColumns).from(labRunEvidence).where(eq(labRunEvidence.runId, input.runId)),
      db.select().from(labRunResults).where(eq(labRunResults.runId, input.runId)).orderBy(desc(labRunResults.id)),
      db.select().from(labRunOutputs).where(eq(labRunOutputs.runId, input.runId)).orderBy(asc(labRunOutputs.id)),
    ]);
    return { runRevision: runState?.revision ?? null, outputs, execution: execution ?? null, experiment: experiment ?? null, events, evidence, results, currentResults: latestResults(results), equipmentOverrides: approvedEquipmentOverrides(events) };
  }),

  prepareRework: writeQuery.input(z.object({ runId: z.number().int().positive(), sampleIds: z.array(z.number().int().positive()).min(1).max(200), reason: z.string().trim().min(1).max(2000), idempotencyKey: z.string().uuid() })).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const { run, execution, resources } = await lockedExecution(tx, input.runId);
    const requestHash = hash(JSON.stringify(input));
    const [prior] = await tx.select().from(labRunEvents).where(and(eq(labRunEvents.runId, run.id), eq(labRunEvents.idempotencyKey, input.idempotencyKey))).limit(1);
    if (prior) { if (prior.requestHash !== requestHash || prior.actorId !== ctx.user.id) return fail("重做请求标识冲突"); return JSON.parse(prior.result) as { draftId: string; workflowId: number }; }
    if (execution.ownerId !== ctx.user.id || run.status !== "completed") return fail("只有原任务负责人可以为已结束实验准备重做");
    if (new Set(input.sampleIds).size !== input.sampleIds.length || input.sampleIds.some(id => !resources.some(r => r.sampleId === id && r.role === "sample"))) return fail("请选择原任务中的样本");
    const { release } = await publishedMethod(tx, run.workflowId, undefined, true);
    const id = randomUUID();
    const payload = runDraftPayloadSchema.parse({ workflowId: run.workflowId, methodReleaseId: release.id, step: 0, name: `${run.name} · 重做`, purpose: input.reason, projectId: String(run.projectId), operatorName: ctx.user.name ?? "", executionMode: "manual", scheduledStart: "", scheduledEnd: "", selectedResources: Object.fromEntries(input.sampleIds.map(sampleId => [sampleId, { role: "sample", amount: Number(resources.find(r => r.sampleId === sampleId)!.amount) }])), sampleOrder: input.sampleIds, cloningLayoutPlanId: null, skipCloningLayout: false, nodeSetups: {}, idempotencyKey: randomUUID(), reworkSource: { runId: run.id, reason: input.reason } });
    await tx.insert(labRunDrafts).values({ id, workflowId: run.workflowId, ownerId: ctx.user.id, ownerName: ctx.user.name ?? "用户", payload: JSON.stringify(payload) });
    const result = { draftId: id, workflowId: run.workflowId };
    await tx.insert(labRunEvents).values({ runId: run.id, action: "prepare_rework", actorId: ctx.user.id, actorName: ctx.user.name ?? "用户", payload: JSON.stringify({ ...input, note: input.reason }), idempotencyKey: input.idempotencyKey, requestHash, result: JSON.stringify(result) });
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "准备部分样本重做", entityType: "lab_run", entityId: run.id, entityName: run.runNo, detail: input.reason });
    return result;
  })),

  prepareNextStage: writeQuery.input(z.object({ runId: z.number().int().positive(), workflowId: z.number().int().positive(), outputs: z.array(z.object({ sampleId: z.number().int().positive(), amount: z.number().min(0.001).max(1e8).multipleOf(0.001) })).min(1).max(200), note: z.string().trim().min(1).max(2000), idempotencyKey: z.string().uuid() })).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const { run, execution, plan } = await lockedExecution(tx, input.runId);
    const requestHash = hash(JSON.stringify(input));
    const [prior] = await tx.select().from(labRunEvents).where(and(eq(labRunEvents.runId, run.id), eq(labRunEvents.idempotencyKey, input.idempotencyKey))).limit(1);
    if (prior) { if (prior.requestHash !== requestHash || prior.actorId !== ctx.user.id) return fail("阶段交接请求标识冲突"); return JSON.parse(prior.result) as { draftId: string; workflowId: number }; }
    if (execution.resultState !== "approved" || run.status !== "completed") return fail("上一阶段结果必须复核通过后才能准备下一阶段");
    const { release, snapshot } = await publishedMethod(tx, input.workflowId, undefined, true);
    if (!isNextMethodStage(plan.method!.spec.stage, snapshot.spec.stage)) return fail("请选择衔接当前产物的下一研发阶段方法");
    const ids = input.outputs.map(output => output.sampleId);
    if (new Set(ids).size !== ids.length || ids.length < snapshot.spec.minSamples || ids.length > snapshot.spec.maxSamples) return fail("所选产物数量不符合下一阶段的方法要求");
    const outputs = await tx.select().from(labRunOutputs).where(and(eq(labRunOutputs.runId, run.id), inArray(labRunOutputs.sampleId, ids)));
    if (outputs.length !== ids.length || outputs.some(output => output.status !== "released")) return fail("请选择本阶段已复核放行的产物");
    const currentSamples = await tx.select().from(samples).where(inArray(samples.id, ids)).orderBy(asc(samples.id)).for("update");
    for (const selection of input.outputs) {
      const sample = currentSamples.find(sample => sample.id === selection.sampleId);
      if (!sample || sample.archivedAt || sample.quantity < selection.amount) return fail("产物库存不足或已经归档，请调整下一阶段用量");
      if (snapshot.spec.inputTypes?.length && !snapshot.spec.inputTypes.includes(sample.type as typeof snapshot.spec.inputTypes[number])) return fail("产物类型不符合下一阶段的输入要求");
    }
    const id = randomUUID();
    const payload = runDraftPayloadSchema.parse({ workflowId: input.workflowId, methodReleaseId: release.id, step: 0, name: `${snapshot.workflow.name} · ${run.runNo}`, purpose: input.note, projectId: String(run.projectId), operatorName: ctx.user.name ?? "", executionMode: "manual", scheduledStart: "", scheduledEnd: "", selectedResources: Object.fromEntries(input.outputs.map(output => [output.sampleId, { role: "sample", amount: output.amount }])), sampleOrder: ids, cloningLayoutPlanId: null, skipCloningLayout: false, nodeSetups: {}, idempotencyKey: randomUUID(), stageSource: { runId: run.id } });
    await tx.insert(labRunDrafts).values({ id, workflowId: input.workflowId, ownerId: ctx.user.id, ownerName: ctx.user.name ?? "用户", payload: JSON.stringify(payload) });
    const result = { draftId: id, workflowId: input.workflowId };
    await tx.insert(labRunEvents).values({ runId: run.id, action: "prepare_next_stage", actorId: ctx.user.id, actorName: ctx.user.name ?? "用户", payload: JSON.stringify(input), idempotencyKey: input.idempotencyKey, requestHash, result: JSON.stringify(result) });
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "准备下一研发阶段", entityType: "lab_run", entityId: run.id, entityName: run.runNo, detail: `${snapshot.workflow.name} · ${ids.join(", ")}`, reason: input.note });
    return result;
  })),

  evidenceLimits: authedQuery.query(() => ({ maxBytes: evidenceStorageConfig().maxBytes })),

  // Compatibility path for existing small-file clients. The UI uses binary streaming.
  uploadEvidence: writeQuery.input(evidenceMetadataSchema.extend({ contentBase64: z.string().min(4).max(2_800_000) })).mutation(async ({ ctx, input }) => {
    const data = Buffer.from(input.contentBase64, "base64");
    if (!data.length || data.length > LEGACY_EVIDENCE_MAX_BYTES || data.toString("base64") !== input.contentBase64) return fail("原始文件必须是有效且不超过 2 MB 的文件");
    const sha256 = createHash("sha256").update(data).digest("hex");
    return getDb().transaction(tx => saveRunEvidence(tx, ctx.user, { ...input, byteSize: data.length, sha256 }));
  }),

  recordOutput: writeQuery.input(recordOutputSchema).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const { run, execution, nodes, resources, plan } = await lockedExecution(tx, input.runId);
    const requestHash = hash(JSON.stringify(input));
    const replay = await replayEvent(tx, input, ctx.user.id, requestHash);
    if (replay) return replay;
    if (run.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "任务已更新，请刷新后继续" });
    if (execution.ownerId !== ctx.user.id || ["review", "approved"].includes(execution.resultState) || !["running", "completed"].includes(run.status) || execution.paused) return fail("当前状态或负责人不允许登记产物");
    const rule = plan.method!.spec.nodes[input.nodeKey]?.produces;
    if (!rule || !nodes.some(node => node.nodeKey === input.nodeKey && node.status === "completed")) return fail("请在方法指定的产出步骤完成后登记产物");
    const parents = [...new Set(input.parentSampleIds)].sort((a, b) => a - b);
    if (parents.length !== input.parentSampleIds.length || parents.some(id => !resources.some(resource => resource.sampleId === id && resource.role === "sample"))) return fail("产物来源必须是本次实验的输入样本且不能重复");
    const parentOutputs = await tx.select().from(labRunOutputs).where(inArray(labRunOutputs.sampleId, parents));
    if (parentOutputs.some(output => output.status !== "released")) return fail("来源产物尚未复核放行");
    const parentIdentities = plan.inputIdentities ? plan.inputIdentities.filter(identity => parents.includes(identity.sampleId)) : parentOutputs;
    if (rule.parentPolicy !== "selected_inputs" && parentIdentities.length !== parents.length) return fail("来源样本缺少经过复核的抗体身份与链别");
    const parentIssue = outputParentIssue(rule.parentPolicy, input.antibodyId, parentIdentities);
    if (parentIssue) return fail(parentIssue);
    if (rule.parentPolicy === "paired_hc_lc" && input.chain !== "paired") return fail("重轻链配对表达的产物必须登记为配对抗体");
    if (rule.parentPolicy === "same_antibody" && parentIdentities.some(parent => parent.chain !== input.chain)) return fail("纯化产物的链别必须与来源保持一致");
    if (rule.requiredMetadata.some(field => !input.metadata[field.key]?.trim())) return fail("请补齐方法要求的产物记录字段");
    const existing = await tx.select().from(labRunOutputs).where(and(eq(labRunOutputs.runId, run.id), eq(labRunOutputs.nodeKey, input.nodeKey)));
    if (existing.filter(output => output.status !== "voided").length >= rule.maxCount) return fail("产物数量已达到方法允许上限");
    const [evidence] = await tx.select(evidenceColumns).from(labRunEvidence).where(eq(labRunEvidence.id, input.evidenceId)).limit(1);
    if (!evidence || evidence.runId !== run.id || evidence.nodeKey !== input.nodeKey) return fail("原始文件与任务步骤不一致");
    const [location] = await tx.select().from(storageLocations).where(eq(storageLocations.id, input.locationId)).limit(1).for("update");
    if (!location) return fail("产物储位不存在");
    if (location.type === "box" && (!input.boxRow || !input.boxCol || !location.rows || !location.cols || input.boxRow > location.rows || input.boxCol > location.cols)) return fail("请指定盒内有效行列位置");
    if (location.type !== "box" && (input.boxRow || input.boxCol)) return fail("只有存储盒可以指定行列位置");
    if (input.boxRow && input.boxCol) {
      const occupied = await tx.select({ id: samples.id }).from(samples).where(and(eq(samples.locationId, location.id), eq(samples.boxRow, input.boxRow), eq(samples.boxCol, input.boxCol))).limit(1);
      if (occupied.length) return fail("此储位已被占用，请选择空位");
    }
    const [sequence] = input.sequenceId ? await tx.select().from(sequences).where(eq(sequences.id, input.sequenceId)).limit(1) : [];
    if ((input.sequenceId || rule.requiresSequence) && !sequence) return fail("请关联实际构建体的序列记录");
    if (sequence && rule.type === "plasmid" && sequence.type !== "dna") return fail("表达质粒必须关联 DNA 序列");
    const sku = await nextSampleSku(tx);
    const snapshot = { sku, name: input.name, type: rule.type, unit: rule.unit, locationId: location.id, locationName: location.name, boxRow: input.boxRow ?? null, boxCol: input.boxCol ?? null, sequenceId: sequence?.id ?? null, sequence: sequence ? { id: sequence.id, name: sequence.name, type: sequence.type, sha256: hash(sequence.sequence) } : null };
    const [sample] = await tx.insert(samples).values({ sku, name: input.name, type: rule.type, quantity: 0, unit: rule.unit, locationId: location.id, boxRow: input.boxRow, boxCol: input.boxCol, sequenceId: sequence?.id, projectId: run.projectId, notes: input.note, createdById: ctx.user.id, createdByName: ctx.user.name }).$returningId();
    const [output] = await tx.insert(labRunOutputs).values({ runId: run.id, nodeKey: input.nodeKey, sampleId: sample.id, antibodyId: input.antibodyId, chain: input.chain, quantity: input.quantity, unit: rule.unit, parentSampleIds: JSON.stringify(parents), metadata: JSON.stringify(input.metadata), sampleSnapshot: JSON.stringify(snapshot), evidenceId: evidence.id, createdById: ctx.user.id, createdByName: ctx.user.name ?? "用户" }).$returningId();
    await tx.insert(lineageEdges).values(parents.map(parentId => ({ childKind: "sample" as const, childId: sample.id, parentKind: "sample" as const, parentId, relation: rule.relation, note: `${run.runNo} · ${input.nodeKey} · ${input.note}` })));
    const result = { revision: run.revision + 1, outputId: output.id, sampleId: sample.id };
    await tx.update(labRuns).set({ revision: result.revision }).where(eq(labRuns.id, run.id));
    await tx.insert(labRunEvents).values({ runId: run.id, action: "record_output", nodeKey: input.nodeKey, actorId: ctx.user.id, actorName: ctx.user.name ?? "用户", payload: JSON.stringify(input), idempotencyKey: input.idempotencyKey, requestHash, result: JSON.stringify(result) });
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "登记了待复核实验产物", entityType: "sample", entityId: sample.id, entityName: `${sku} ${input.name}`, detail: `${run.runNo} · ${input.quantity} ${rule.unit}`, after: { ...snapshot, antibodyId: input.antibodyId, chain: input.chain, parentSampleIds: parents }, reason: input.note });
    return result;
  })),

  voidOutput: writeQuery.input(z.object({ runId: z.number().int().positive(), expectedRevision: z.number().int().min(0), outputId: z.number().int().positive(), idempotencyKey: z.string().uuid(), note: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const { run, execution } = await lockedExecution(tx, input.runId);
    const requestHash = hash(JSON.stringify(input));
    const replay = await replayEvent(tx, input, ctx.user.id, requestHash);
    if (replay) return replay;
    if (run.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "任务已更新，请刷新后继续" });
    if (execution.ownerId !== ctx.user.id || ["review", "approved"].includes(execution.resultState) || !["running", "completed"].includes(run.status)) return fail("当前状态或负责人不允许作废产物登记");
    const [output] = await tx.select().from(labRunOutputs).where(and(eq(labRunOutputs.runId, run.id), eq(labRunOutputs.id, input.outputId))).limit(1);
    if (!output || output.status !== "pending_review") return fail("只有待复核的产物登记可以作废");
    const [sample] = await tx.select().from(samples).where(eq(samples.id, output.sampleId)).limit(1).for("update");
    if (!sample || Number(sample.quantity) !== 0) return fail("产物库存状态不一致，请核对后处理");
    await tx.update(samples).set({ archivedAt: new Date(), locationId: null, boxRow: null, boxCol: null }).where(eq(samples.id, sample.id));
    await tx.update(labRunOutputs).set({ status: "voided" }).where(eq(labRunOutputs.id, output.id));
    const result = { revision: run.revision + 1, outputId: output.id, sampleId: output.sampleId };
    await tx.update(labRuns).set({ revision: result.revision }).where(eq(labRuns.id, run.id));
    await tx.insert(labRunEvents).values({ runId: run.id, action: "void_output", nodeKey: output.nodeKey, actorId: ctx.user.id, actorName: ctx.user.name ?? "用户", payload: JSON.stringify(input), idempotencyKey: input.idempotencyKey, requestHash, result: JSON.stringify(result) });
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "作废了产物登记", entityType: "sample", entityId: output.sampleId, detail: run.runNo, reason: input.note });
    return result;
  })),

  recordResult: writeQuery.input(resultInputSchema).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const { run, execution, nodes, resources, plan } = await lockedExecution(tx, input.runId);
    const requestHash = hash(JSON.stringify(input));
    const replay = await replayEvent(tx, input, ctx.user.id, requestHash);
    if (replay) return replay;
    if (run.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "任务已更新，请刷新后继续" });
    if (execution.ownerId !== ctx.user.id || ["review", "approved"].includes(execution.resultState)) return fail("当前状态或负责人不允许修改结果");
    if (!nodes.some(node => node.nodeKey === input.nodeKey && node.status === "completed")) return fail("结果必须关联已完成的步骤");
    if (!["running", "completed"].includes(run.status) || execution.paused) return fail("当前任务状态不允许记录结果");
    const rule = plan.method!.spec.nodes[input.nodeKey];
    if (rule?.resultsOn === "outputs") {
      const [output] = await tx.select().from(labRunOutputs).where(and(eq(labRunOutputs.runId, run.id), eq(labRunOutputs.sampleId, input.sampleId), eq(labRunOutputs.nodeKey, input.nodeKey))).limit(1);
      if (!output || output.status !== "pending_review") return fail("请选择此步骤已登记的待复核产物");
    } else if (!resources.some(resource => resource.sampleId === input.sampleId && resource.role === "sample")) return fail("样本不属于本次实验");
    const metric = (rule?.measurements?.length ? rule.measurements : [defaultMeasurement]).find(metric => metric.key === input.metricKey);
    if (!metric) return fail("此指标不属于方法批准的结果要求");
    const issue = measurementIssue(metric, input.value, input.unit, input.outcome);
    if (issue) return fail(issue);
    const [evidence] = await tx.select(evidenceColumns).from(labRunEvidence).where(eq(labRunEvidence.id, input.evidenceId)).limit(1);
    if (!evidence || evidence.runId !== run.id || evidence.nodeKey !== input.nodeKey) return fail("原始文件与任务步骤不一致");
    const rows = await tx.select().from(labRunResults).where(and(eq(labRunResults.runId, run.id), eq(labRunResults.nodeKey, input.nodeKey), eq(labRunResults.sampleId, input.sampleId), eq(labRunResults.metricKey, input.metricKey))).orderBy(desc(labRunResults.id));
    const [row] = await tx.insert(labRunResults).values({ runId: run.id, nodeKey: input.nodeKey, sampleId: input.sampleId, metricKey: input.metricKey, outcome: input.outcome, value: input.value, unit: input.unit, evidenceId: evidence.id, supersedesId: rows[0]?.id ?? null, recordedById: ctx.user.id, recordedByName: ctx.user.name ?? "用户", note: input.note }).$returningId();
    const result = { revision: run.revision + 1, resultId: row.id };
    await tx.update(labRuns).set({ revision: result.revision }).where(eq(labRuns.id, run.id));
    await tx.insert(labRunEvents).values({ runId: run.id, action: "record_result", nodeKey: input.nodeKey, actorId: ctx.user.id, actorName: ctx.user.name ?? "用户", payload: JSON.stringify(input), idempotencyKey: input.idempotencyKey, requestHash, result: JSON.stringify(result) });
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: "记录了实验样本结果", entityType: "lab_run", entityId: run.id, entityName: run.runNo, detail: `${input.nodeKey} · sample:${input.sampleId} · ${input.outcome} · ${input.note}` });
    return result;
  })),

  act: writeQuery.input(executionActionSchema).mutation(async ({ ctx, input }) => getDb().transaction(async tx => {
    const { run, execution, nodes, resources, plan } = await lockedExecution(tx, input.runId);
    const requestHash = hash(JSON.stringify(input));
    const replay = await replayEvent(tx, input, ctx.user.id, requestHash);
    if (replay) return replay;
    if (run.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "任务已更新，请刷新后继续" });
    const reviewAction = ["approve_results", "return_results", "approve_equipment"].includes(input.action);
    if (reviewAction) {
      if (!["reviewer", "admin"].includes(ctx.user.role) || execution.ownerId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "结果必须由另一位有复核权限的人员复核" });
    } else if (execution.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "仅当前任务负责人可以执行此操作" });
    if (run.status === "cancelled" || execution.resultState === "approved") return fail("此任务已归档或取消，不能继续修改");
    const events = await tx.select().from(labRunEvents).where(eq(labRunEvents.runId, run.id)).orderBy(asc(labRunEvents.id));
    let experimentId = execution.experimentId;
    const now = new Date();
    let approvedEquipment: { nodeKey: string; equipmentId: number; name: string; approvedBy: string; snapshot: unknown } | undefined;
    let recordedRows: StepRecordRow[] | undefined;
    if (["save_step_record", "complete_step"].includes(input.action)) {
      const node = nodes.find(node => node.nodeKey === input.nodeKey);
      if (run.status !== "running" || !node || node.status !== "running" || execution.paused || ["review", "approved"].includes(execution.resultState)) return fail("请在执行中的当前步骤填写记录");
      const recordSpec = plan.method!.spec.nodes[node.nodeKey]?.record;
      if (recordSpec) {
        const saved = latestStepRecord(events, node.nodeKey);
        if (input.expectedRecordEventId !== saved.eventId) throw new TRPCError({ code: "CONFLICT", message: "步骤记录已更新，请先载入最新记录" });
        recordedRows = input.records ?? saved.rows;
        const issues = stepRecordIssues(recordSpec, recordedRows, resources.filter(resource => resource.role === "sample").map(resource => resource.sampleId), input.action === "complete_step");
        if (issues.length) return fail(issues.join("；"));
      } else if (input.action === "save_step_record" || input.records?.length) return fail("本方法没有配置此步骤的记录表");
    }
    if (input.action === "save_step_record") {
      // Save an incomplete record without advancing the node. Its final snapshot
      // is captured atomically with complete_step and included in the signed ELN.
    } else if (input.action === "start" || input.action === "complete_step") {
      if (execution.paused) return fail("任务已暂停，请先核对现场并恢复");
      if (input.action === "start") {
        if (run.status !== "ready") return fail("只有待开始任务可以启动");
        const readiness = await currentReadiness(run, tx, { nodes, lockEquipment: true });
        if (!readiness.summary.ready) return fail(readiness.issues.filter(i => i.level === "blocking").map(i => i.label).join("；"));
        if (!run.scheduledStart || !run.scheduledEnd || now < run.scheduledStart || now > run.scheduledEnd) return fail("当前不在预约时段内，请重新准备有效时段的实验计划");
      } else {
        if (run.status !== "running") return fail("实验尚未执行");
        const node = nodes.find(node => node.nodeKey === input.nodeKey);
        if (!node || node.status !== "running") return fail("此步骤当前不可完成");
        if (node.type === "decision" && !input.decision) return fail("请选择判断结论及对应分支");
        if (node.type === "timer") {
          const minutes = plan.method!.spec.nodes[node.nodeKey]?.waitMinutes;
          if (minutes === undefined || now.getTime() < node.updatedAt.getTime() + minutes * 60000) return fail("尚未达到方法要求的等待时长");
        }
        if (node.type === "external") {
          const itemId = plan.nodes.find(n => n.nodeKey === node.nodeKey)?.externalOrderItemId;
          const [item] = itemId ? await tx.select().from(externalOrderItems).where(eq(externalOrderItems.id, itemId)).limit(1).for("update") : [];
          if (!item || item.status !== "accepted") return fail("外部委托尚未验收，不能标记步骤完成");
        }
        const evidence = input.evidenceIds.length ? await tx.select(evidenceColumns).from(labRunEvidence).where(inArray(labRunEvidence.id, input.evidenceIds)) : [];
        if (evidence.length !== new Set(input.evidenceIds).size || evidence.some(file => file.runId !== run.id || file.nodeKey !== node.nodeKey)) return fail("步骤证据不属于当前任务与步骤");
        if (["equipment", "data"].includes(node.type) && plan.method!.spec.nodes[node.nodeKey]?.evidenceRequired !== false && !evidence.length) return fail("请提交原始文件后完成此步骤");
        node.status = "completed";
        await tx.update(labRunNodes).set({ status: "completed", updatedAt: now }).where(eq(labRunNodes.id, node.id));
      }
      const decisions: Record<string, "yes" | "no"> = {};
      for (const event of events) {
        const payload = JSON.parse(event.payload) as { decision?: "yes" | "no" };
        if (event.nodeKey && payload.decision) decisions[event.nodeKey] = payload.decision;
      }
      if (input.nodeKey && input.decision) decisions[input.nodeKey] = input.decision;
      const settled = settleExecutionGraph(nodes, plan.edges, decisions);
      for (const status of ["running", "skipped"] as const) {
        const keys = status === "running" ? settled.started : settled.skipped;
        if (keys.length) await tx.update(labRunNodes).set({ status, updatedAt: now }).where(and(eq(labRunNodes.runId, run.id), inArray(labRunNodes.nodeKey, keys)));
      }
      const terminal = terminalRunStatus([...settled.status.values()]);
      await tx.update(labRuns).set({ status: terminal ?? "running", ...(input.action === "start" ? { startedAt: now } : {}), ...(terminal === "completed" ? { completedAt: now } : {}) }).where(eq(labRuns.id, run.id));
      if (terminal) await tx.update(equipmentBookings).set({ status: "completed" }).where(and(eq(equipmentBookings.labRunId, run.id), eq(equipmentBookings.status, "active")));
    } else if (input.action === "request_equipment" || input.action === "approve_equipment") {
      if (run.status !== "running" || !execution.paused) return fail("替换设备前必须暂停任务并记录现场状态");
      const pending = [...events].reverse().find(event => event.action === "request_equipment");
      const request = input.action === "request_equipment" ? input : pending ? executionActionSchema.parse(JSON.parse(pending.payload)) : null;
      if (input.action === "approve_equipment" && (!pending || input.requestEventId !== pending.id || events.some(event => event.action === "approve_equipment" && JSON.parse(event.payload).requestEventId === pending.id))) return fail("设备替换申请已更新或已经处理");
      if (input.action === "approve_equipment" && pending?.actorId === ctx.user.id) return fail("不能批准自己提交的设备替换申请");
      const node = nodes.find(n => n.nodeKey === request?.nodeKey && n.type === "equipment" && ["running", "pending"].includes(n.status));
      if (!node || !request?.equipmentId) return fail("请选择尚未完成的设备步骤和替代设备");
      const [device] = await tx.select().from(equipment).where(eq(equipment.id, request.equipmentId)).limit(1).for("update");
      if (!device || !assessMethodEquipment(node, device, plan.method!.spec.nodes[node.nodeKey], "manual").compatible) return fail("替代设备尚未通过本方法验证或当前不可用");
      if (!run.scheduledEnd || now >= run.scheduledEnd || (device.nextCalibrationDate && device.nextCalibrationDate < run.scheduledEnd.toISOString().slice(0, 10))) return fail("预约或校准有效期不足，请重新准备实验计划");
      if (input.action === "approve_equipment") {
        const conflicts = await tx.select().from(equipmentBookings).where(and(eq(equipmentBookings.equipmentId, device.id), eq(equipmentBookings.status, "active"), lt(equipmentBookings.startTime, run.scheduledEnd), gte(equipmentBookings.endTime, now))).for("update");
        if (conflicts.some(booking => booking.labRunId !== run.id)) return fail("替代设备已有冲突预约");
        const overrides = approvedEquipmentOverrides(events);
        const previousId = overrides[node.nodeKey]?.equipmentId ?? node.equipmentId;
        if (previousId === device.id) return fail("所选设备已经是当前执行设备");
        if (previousId && !nodes.some(other => other.nodeKey !== node.nodeKey && ["pending", "running"].includes(other.status) && (overrides[other.nodeKey]?.equipmentId ?? other.equipmentId) === previousId)) await tx.update(equipmentBookings).set({ status: "cancelled" }).where(and(eq(equipmentBookings.labRunId, run.id), eq(equipmentBookings.equipmentId, previousId), eq(equipmentBookings.status, "active")));
        if (!conflicts.some(booking => booking.labRunId === run.id)) await tx.insert(equipmentBookings).values({ equipmentId: device.id, userName: execution.ownerName, purpose: `${run.runNo} · approved replacement`, startTime: now, endTime: run.scheduledEnd, labRunId: run.id });
        approvedEquipment = { nodeKey: node.nodeKey, equipmentId: device.id, name: device.name, approvedBy: ctx.user.name ?? "复核人", snapshot: device };
      }
    } else if (input.action === "pause") {
      if (run.status !== "running" || execution.paused) return fail("仅执行中的任务可以暂停");
      await tx.update(labRunExecution).set({ paused: true, pauseReason: input.note }).where(eq(labRunExecution.runId, run.id));
    } else if (input.action === "resume") {
      if (!execution.paused || !input.reconcile) return fail("请先核对现场步骤、样本和设备状态，再确认恢复");
      const readiness = await currentReadiness(run, tx, { nodes, lockEquipment: true });
      if (!readiness.summary.ready) return fail(readiness.issues.filter(i => i.level === "blocking").map(i => i.label).join("；"));
      await tx.update(labRunExecution).set({ paused: false, pauseReason: null }).where(eq(labRunExecution.runId, run.id));
    } else if (input.action === "handoff") {
      if (run.status === "running" && !execution.paused) return fail("请先暂停并记录现场状态，再交接任务");
      const [owner] = input.ownerId ? await tx.select().from(users).where(eq(users.id, input.ownerId)).limit(1) : [];
      if (!owner || owner.role === "viewer") return fail("接收人没有执行权限");
      await tx.update(labRunExecution).set({ ownerId: owner.id, ownerName: owner.name ?? "用户" }).where(eq(labRunExecution.runId, run.id));
    } else {
      if (run.status !== "completed") return fail("全部执行步骤结束后才能提交或复核结果");
      const allResults = await tx.select().from(labRunResults).where(eq(labRunResults.runId, run.id)).orderBy(desc(labRunResults.id));
      const outputs = await tx.select().from(labRunOutputs).where(eq(labRunOutputs.runId, run.id));
      const activeOutputs = outputs.filter(output => output.status !== "voided");
      const voidedIds = new Set(outputs.filter(output => output.status === "voided").map(output => output.sampleId));
      const current = latestResults(allResults).filter(result => !voidedIds.has(result.sampleId));
      if (input.action !== "return_results") {
        for (const node of nodes.filter(node => node.status === "completed")) {
          const produces = plan.method!.spec.nodes[node.nodeKey]?.produces;
          const count = activeOutputs.filter(output => output.nodeKey === node.nodeKey).length;
          if (produces && (count < produces.minCount || count > produces.maxCount)) return fail(`${node.label}：请补齐方法要求的产物登记`);
          if (produces?.requireAllInputs) {
            const covered = new Set(activeOutputs.filter(output => output.nodeKey === node.nodeKey).flatMap(output => JSON.parse(output.parentSampleIds) as number[]));
            if (resources.some(resource => resource.role === "sample" && !covered.has(resource.sampleId))) return fail(`${node.label}：仍有输入样本没有对应产物，请记录失败原因并处理或重做`);
          }
        }
      }
      const sampleIds = resources.filter(r => r.role === "sample").map(r => r.sampleId);
      const requiredKeys = Object.entries(plan.method!.spec.nodes).filter(([, rule]) => rule.resultRequired).map(([key]) => key);
      if (input.action !== "return_results" && (!current.length || missingRunResults(nodes, plan.edges, sampleIds, requiredKeys, current, plan.method!.spec.nodes, activeOutputs).length)) return fail("仍有方法要求的步骤与样本缺少结果，请补齐后提交复核");
      if (input.action === "submit_review") {
        if (execution.resultState === "review") return fail("结果已经提交复核");
        const evidence = await tx.select(evidenceColumns).from(labRunEvidence).where(eq(labRunEvidence.runId, run.id));
        const actionLabels: Record<string, string> = { start: "开始实验 / Start", complete_step: "完成步骤 / Complete step", pause: "暂停 / Pause", resume: "恢复 / Resume", handoff: "交接 / Hand off", record_result: "记录结果 / Record result", submit_review: "提交复核 / Submit review", return_results: "退回结果 / Return results", request_equipment: "申请替换设备 / Request instrument replacement", approve_equipment: "批准替换设备 / Approve replacement", record_output: "登记产物 / Register output", void_output: "作废产物登记 / Void output" };
        const autoText = [
          `${run.runNo} · ${run.name}\n方法版本 / Method version: V${plan.method!.version}`,
          plan.stageSource ? `上一阶段 / Previous stage: /runs/${plan.stageSource.runId}` : "",
          ...(plan.inputIdentities ?? []).filter(identity => identity.origin !== "run_output").map(identity => `来样身份 / Incoming sample identity: ${plan.resources.find(resource => resource.id === identity.sampleId)?.sku ?? identity.sampleId}\n${identity.antibodyId} · ${identity.chain} · ${identity.lot}\n来源 / Source: ${identity.sourceReference}\n确认记录 / Identity record: ${identity.originId}\nSequence SHA-256: ${identity.sequenceSnapshot?.sha256 ?? "—"}`),
          "执行记录 / Execution record",
          ...events.filter(e => e.action !== "save_step_record").map(e => {
            const payload = JSON.parse(e.payload);
            const recordSpec = e.nodeKey ? plan.method!.spec.nodes[e.nodeKey]?.record : null;
            const records = e.action === "complete_step" && recordSpec ? stepRecordText(recordSpec, payload.records ?? [], id => plan.resources.find(resource => resource.id === id)?.sku ?? String(id)) : "";
            return `${e.createdAt.toISOString()} · ${e.actorName} · ${actionLabels[e.action] ?? e.action} · ${nodes.find(n => n.nodeKey === e.nodeKey)?.label ?? ""}\n${payload.note ?? ""}${records ? `\n${records}` : ""}`;
          }),
          "产物登记 / Registered outputs",
          ...outputs.map(output => `${JSON.parse(output.sampleSnapshot).sku} · ${JSON.parse(output.sampleSnapshot).name} · ${output.antibodyId} · ${output.chain} · ${output.quantity} ${output.unit} · ${output.status === "voided" ? "已作废 / Voided" : "待本次复核放行 / Pending this review"}\n来源 / Parents: ${output.parentSampleIds}\n储位 / Location: ${JSON.parse(output.sampleSnapshot).locationName}\n产物快照 / Snapshot: ${output.sampleSnapshot}\n记录 / Metadata: ${output.metadata}\n原始文件 / Raw file: /api/run-files/${output.evidenceId}`),
          "样本结果 / Sample results",
          ...current.map(r => { const resource = plan.resources.find(s => s.id === r.sampleId) ?? (() => { const output = activeOutputs.find(output => output.sampleId === r.sampleId); return output ? JSON.parse(output.sampleSnapshot) as { sku: string; name: string } : undefined; })(); return `${resource?.sku ?? r.sampleId} · ${resource?.name ?? ""} · ${nodes.find(n => n.nodeKey === r.nodeKey)?.label ?? r.nodeKey} · ${plan.method!.spec.nodes[r.nodeKey]?.measurements?.find(metric => metric.key === r.metricKey)?.label ?? r.metricKey} · ${r.outcome === "pass" ? "合格 / Pass" : "异常 / Fail"} · ${r.value} ${r.unit}\n原始文件 / Raw file: ${evidence.find(e => e.id === r.evidenceId)?.name ?? r.evidenceId}\n${r.note}`; }),
          "本批领用 / Batch issue",
          ...plan.resources.map(r => `${r.sku} · ${r.name} · ${r.plannedAmount} ${r.unit}`),
          run.sampleRequestId ? `领用流水 / Issue ledger: /sample-requests/${run.sampleRequestId}` : "",
          `提交说明 / Review submission\n${input.note}`,
          "追溯与完整性 / Traceability and integrity",
          `Method SHA-256: ${plan.method!.hash}\nRun SHA-256: ${run.snapshotHash}`,
          ...evidence.map(e => `${e.name} · ${e.sha256} · /api/run-files/${e.id}`),
        ].filter(Boolean).join("\n\n");
        const content = JSON.stringify([{ id: `run-${run.revision}`, type: "heading", text: "实验执行与结果" }, { id: `evidence-${run.revision}`, type: "text", text: autoText }]);
        if (!experimentId) {
          const [parentExecution] = plan.reworkSource ? await tx.select().from(labRunExecution).where(eq(labRunExecution.runId, plan.reworkSource.runId)).limit(1) : [];
          const code = await nextExperimentCode(tx);
          const [record] = await tx.insert(experiments).values({ code, projectId: run.projectId!, workflowId: run.workflowId, amendsExperimentId: parentExecution?.experimentId ?? null, title: `${run.runNo} · ${run.name}`, objective: run.purpose, content, status: "completed", createdById: ctx.user.id, createdByName: ctx.user.name }).$returningId();
          experimentId = record.id;
          const [created] = await tx.select().from(experiments).where(eq(experiments.id, record.id));
          await appendExperimentRevision(tx, created, ctx.user, "从实验任务生成结果复核记录");
        } else {
          const [existing] = await tx.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1).for("update");
          if (!existing || existing.status === "signed") return fail("关联记录已签署，请创建修订任务");
          const existingBlocks = JSON.parse(existing.content ?? "[]") as unknown[];
          await reviseExperiment(tx, experimentId, { content: JSON.stringify([...existingBlocks, ...JSON.parse(content)]), status: "completed" }, ctx.user, "追加实验任务的最新结果证据");
        }
        await tx.update(labRunExecution).set({ resultState: "review", experimentId }).where(eq(labRunExecution.runId, run.id));
      } else {
        if (execution.resultState !== "review") return fail("当前结果尚未提交复核");
        if (input.action === "approve_results") {
          if (!experimentId) return fail("缺少关联实验记录");
          const [record] = await tx.select().from(experiments).where(eq(experiments.id, experimentId)).limit(1).for("update");
          if (!record || record.revision !== input.expectedExperimentRevision) throw new TRPCError({ code: "CONFLICT", message: "实验记录已更新，请重新阅读后再签署" });
          if (current.some(r => r.outcome === "fail")) return fail("存在不合格样本，请退回处理后再批准");
          if (current.some(r => r.recordedById === ctx.user.id)) return fail("不能复核自己录入的样本结果");
          if (outputs.some(output => output.createdById === ctx.user.id)) return fail("不能复核自己登记的产物");
          for (const output of activeOutputs.sort((a, b) => a.sampleId - b.sampleId)) {
            const [sample] = await tx.select().from(samples).where(eq(samples.id, output.sampleId)).limit(1).for("update");
            const snapshot = JSON.parse(output.sampleSnapshot) as { sku: string; name: string; type: string; unit: string; locationId: number; boxRow: number | null; boxCol: number | null; sequenceId: number | null };
            if (!sample || sample.archivedAt || Number(sample.quantity) !== 0 || Object.entries(snapshot).some(([key, value]) => ["sku", "name", "type", "unit", "locationId", "boxRow", "boxCol", "sequenceId"].includes(key) && sample[key as keyof typeof sample] !== value)) return fail("待放行产物与登记快照不一致，请退回核对");
            if (output.status !== "pending_review") return fail("产物已经处理，请刷新后继续");
            await tx.update(labRunOutputs).set({ status: "released", releasedAt: now }).where(eq(labRunOutputs.id, output.id));
            await changeInventoryInTransaction(tx, { sampleId: output.sampleId, delta: Number(output.quantity), reason: "restock", note: `实验产物复核放行 ${run.runNo}`, actorId: ctx.user.id, actorName: ctx.user.name, source: "system", idempotencyKey: `run-output-release:${output.id}` });
          }
          await signExperiment(tx, experimentId, ctx.user);
          await tx.update(labRunExecution).set({ resultState: "approved" }).where(eq(labRunExecution.runId, run.id));
        } else {
          await tx.update(labRunExecution).set({ resultState: "changes_requested" }).where(eq(labRunExecution.runId, run.id));
        }
      }
    }
    const result = { revision: run.revision + 1, experimentId };
    await tx.update(labRuns).set({ revision: result.revision }).where(eq(labRuns.id, run.id));
    await tx.update(labRunExecution).set({ updatedAt: now }).where(eq(labRunExecution.runId, run.id));
    await tx.insert(labRunEvents).values({ runId: run.id, action: input.action, nodeKey: input.nodeKey ?? null, actorId: ctx.user.id, actorName: ctx.user.name ?? "用户", payload: JSON.stringify({ ...input, ...(recordedRows ? { records: recordedRows } : {}), ...(approvedEquipment ? { approvedEquipment } : {}) }), idempotencyKey: input.idempotencyKey, requestHash, result: JSON.stringify(result) });
    await appendActivity(tx, { userId: ctx.user.id, userName: ctx.user.name, action: `实验任务：${input.action}`, entityType: "lab_run", entityId: run.id, entityName: run.runNo, detail: input.note });
    return result;
  })),
});
