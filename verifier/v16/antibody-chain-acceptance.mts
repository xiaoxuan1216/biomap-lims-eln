import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema.ts";
import { antibodyMethodDraft } from "../../contracts/antibodyMethods.ts";
import type { MethodSpec } from "../../contracts/method.ts";
const url = new URL(process.env.DATABASE_URL!); url.pathname = "/biomap_v15_qa"; process.env.DATABASE_URL = url.toString();
const { getDb } = await import("../../api/queries/connection.ts");
const { appRouter } = await import("../../api/router.ts");
const { signSessionToken } = await import("../../api/security/session.ts");
const db = getDb(), suffix = randomUUID().slice(0, 8), note = "QA synthetic evidence; software acceptance only, no physical experiment";
async function actor(role: "user" | "reviewer" | "viewer") {
 const unionId = `v16-${role}-${suffix}`;
 const [row] = await db.insert(schema.users).values({ unionId, name: `QA 抗体验收 ${role}`, role }).$returningId();
 const [user] = await db.select().from(schema.users).where(eq(schema.users.id, row.id));
 writeFileSync(`/tmp/v16-${role}-token`, await signSessionToken({ unionId }), { mode: 0o600 });
 return { user, api: appRouter.createCaller({ user, req: new Request("http://127.0.0.1:3115"), resHeaders: new Headers() }) };
}
const writer = await actor("user"), reviewer = await actor("reviewer"), viewer = await actor("viewer");
const [project] = await db.insert(schema.projects).values({ name: `QA 抗体四阶段业务链 ${suffix}`, description: note }).$returningId();
const location = await writer.api.storage.create({ name: `QA 冷藏储位 ${suffix}`, type: "fridge", temperature: "QA fixture" });
const [hcSeq] = await db.insert(schema.sequences).values({ name: `QA HC construct ${suffix}`, sequence: "ATGGCCTAA", description: note }).$returningId();
const [lcSeq] = await db.insert(schema.sequences).values({ name: `QA LC construct ${suffix}`, sequence: "ATGCCCTAA", description: note }).$returningId();
const hcInput = await writer.api.sample.create({ name: `QA HC DNA 输入 ${suffix}`, type: "other", quantity: 20, unit: "µg", locationId: location.id, projectId: project.id, notes: note });
const lcInput = await writer.api.sample.create({ name: `QA LC DNA 输入 ${suffix}`, type: "other", quantity: 20, unit: "µg", locationId: location.id, projectId: project.id, notes: note });
const stages = ["cloning", "expression", "purification", "characterization"] as const;
const labels = ["分子克隆与序列确认", "转染表达与收获", "抗体纯化与批次放行", "抗体表征与结果复核"];
const methods: Array<{ workflowId: number; releaseId: number; spec: MethodSpec }> = [];
for (const [index, stage] of stages.entries()) {
 const method = await writer.api.workflow.createAntibodyMethod({ stage, projectId: project.id, lang: "zh" });
 await writer.api.workflow.update({ id: method.id, name: `QA ${labels[index]} ${suffix}`, description: note });
 const original = await writer.api.workflow.byId({ id: method.id });
 await assert.rejects(writer.api.workflow.submitMethod({ workflowId: method.id, expectedSpecHash: original.methodSpecHash, expectedGraphHash: original.graphHash }), /SOP/);
 const spec = antibodyMethodDraft(stage).spec;
 for (const node of antibodyMethodDraft(stage).nodes.filter(node => node.type === "equipment")) {
   const [device] = await db.insert(schema.equipment).values({ name: `QA ${stage} ${node.nodeKey} ${suffix}`, category: "analytical" }).$returningId();
   spec.nodes[node.nodeKey].equipmentIds = [device.id]; spec.nodes[node.nodeKey].qualification = "QA fixture only; no physical qualification claimed"; spec.nodes[node.nodeKey].manualAllowed = true;
 }
 spec.protocol = { reference: "QA ONLY - NOT A LAB SOP", version: "fixture-1" };
 if (stage === "cloning") { spec.nodes.sequence_confirmation.produces!.minCount = 2; }
 if (stage === "characterization") { spec.nodes.purity.measurements[0].min = 90; spec.nodes.purity.measurements[0].max = 100; }
 const guard = await writer.api.workflow.byId({ id: method.id });
 await writer.api.workflow.saveMethodSpec({ workflowId: method.id, expectedSpecHash: guard.methodSpecHash, expectedGraphHash: guard.graphHash, spec });
 const saved = await writer.api.workflow.byId({ id: method.id });
 const release = await writer.api.workflow.submitMethod({ workflowId: method.id, expectedSpecHash: saved.methodSpecHash, expectedGraphHash: saved.graphHash });
 await reviewer.api.workflow.reviewMethod({ id: release.id, decision: "publish", note });
 methods.push({ workflowId: method.id, releaseId: release.id, spec });
}
const cases: string[] = [], runs: number[] = [], outputIds: number[][] = [];
let inputs = [hcInput.id, lcInput.id], draftId: string | undefined, previousRun: number | undefined;
for (const [index, method] of methods.entries()) {
 const createInput = { workflowId: method.workflowId, methodReleaseId: method.releaseId, draftId, ...(previousRun ? { stageSource: { runId: previousRun } } : {}), name: `QA ${labels[index]} · ${suffix}`, purpose: note, projectId: project.id, executionMode: "manual" as const, scheduledStart: new Date(Date.now() - 60000), scheduledEnd: new Date(Date.now() + 3600000), resources: inputs.map(sampleId => ({ sampleId, role: "sample" as const, amount: 1 })), nodeBindings: Object.entries(method.spec.nodes).filter(([, rule]) => rule.equipmentIds.length).map(([nodeKey, rule]) => ({ nodeKey, equipmentId: rule.equipmentIds[0], params: {} })), idempotencyKey: randomUUID() };
 if (index === 1) {
   await assert.rejects(writer.api.labRun.create({ ...createInput, stageSource: undefined }), /阶段来源/);
   await assert.rejects(writer.api.labRun.create({ ...createInput, resources: createInput.resources.slice(0, 1) }), /补齐配对/);
   cases.push("Missing heavy/light chain pairing is blocked before experiment creation");
 }
 const run = await writer.api.labRun.create(createInput); runs.push(run.id);
 const revision = async () => (await writer.api.labRun.byId({ id: run.id })).revision;
 const act = async (action: "start" | "complete_step" | "submit_review" | "return_results" | "approve_results", actor = writer) => {
   const details = await actor.api.runExecution.details({ runId: run.id });
   return actor.api.runExecution.act({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action, expectedExperimentRevision: details.experiment?.revision, note });
 };
 const before = await writer.api.labRun.byId({ id: run.id });
 const request = await writer.api.sampleRequest.byId({ id: before.sampleRequestId! });
 for (const task of request.tasks) { await writer.api.sampleRequest.claimTask({ taskId: task.id }); await writer.api.sampleRequest.completeTask({ taskId: task.id }); }
 await act("start");
 const evidenceByNode: Record<string, number> = {};
 for (const node of antibodyMethodDraft(stages[index]).nodes) {
   const evidence = await writer.api.runExecution.uploadEvidence({ runId: run.id, nodeKey: node.nodeKey, name: `QA-${stages[index]}-${node.nodeKey}-raw.txt`, contentBase64: Buffer.from(`${note}\nStage ${stages[index]}\nStep ${node.nodeKey}\n${suffix}`).toString("base64") });
   evidenceByNode[node.nodeKey] = evidence.id;
   const recordSpec = method.spec.nodes[node.nodeKey].record;
   const records = recordSpec ? [{ id: randomUUID(), sampleIds: inputs, values: Object.fromEntries(recordSpec.fields.map(field => [field.key, field.kind === "number" ? "1.5" : field.kind === "datetime" ? new Date().toISOString() : `QA-${field.key}-${suffix}`])) }] : undefined;
   let expectedRecordEventId: number | null = null;
   if (index === 0 && node.nodeKey === "identity") {
     const draftAction = { runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "save_step_record" as const, nodeKey: node.nodeKey, expectedRecordEventId: null, records: [{ ...records![0], values: {} }], note };
     await assert.rejects(viewer.api.runExecution.act(draftAction), /权限|permission/i);
     await assert.rejects(reviewer.api.runExecution.act(draftAction), /负责人/);
     await assert.rejects(writer.api.runExecution.act({ ...draftAction, records: [{ ...records![0], sampleIds: [999999999] }] }), /本批输入样本/);
     const draftSaved = await writer.api.runExecution.act(draftAction);
     assert.deepEqual(await writer.api.runExecution.act(draftAction), draftSaved);
     const refreshed = await writer.api.runExecution.details({ runId: run.id });
     expectedRecordEventId = refreshed.events.at(-1)!.id;
     assert.equal(JSON.parse(refreshed.events.at(-1)!.payload).records[0].sampleIds.length, inputs.length);
     await assert.rejects(writer.api.runExecution.act({ ...draftAction, expectedRevision: await revision(), idempotencyKey: randomUUID() }), /步骤记录已更新/);
     await assert.rejects(writer.api.runExecution.act({ ...draftAction, action: "complete_step", expectedRevision: await revision(), expectedRecordEventId, idempotencyKey: randomUUID() }), /请填写/);
     cases.push("Structured records: owner-only draft save, idempotency, foreign sample rejection, stale edit conflict and required-field gate");
   }
   await writer.api.runExecution.act({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "complete_step", nodeKey: node.nodeKey, records, expectedRecordEventId, evidenceIds: [], note });
   if (index === 0 && node.nodeKey === "identity") {
     await assert.rejects(writer.api.runExecution.act({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "save_step_record", nodeKey: node.nodeKey, records, expectedRecordEventId, note }), /当前步骤/);
   }
 }
 const outputKey = Object.entries(method.spec.nodes).find(([, rule]) => rule.produces)?.[0] ?? "report";
 const registered: number[] = [];
 if (index < 3) {
   await assert.rejects(act("submit_review"), /产物登记/);
   for (let j = 0; j < (index === 0 ? 2 : 1); j++) {
     const registration = { runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), nodeKey: outputKey, name: `QA ${stages[index]} output ${j + 1} ${suffix}`, quantity: 10, parentSampleIds: index === 0 ? [inputs[j]] : inputs, antibodyId: `QA-AB-${suffix}`, chain: index === 0 ? (j === 0 ? "HC" as const : "LC" as const) : "paired" as const, metadata: Object.fromEntries(method.spec.nodes[outputKey].produces!.requiredMetadata.map(field => [field.key, `QA-${field.key}-${suffix}-${index}-${j}`])), evidenceId: evidenceByNode[outputKey], locationId: location.id, sequenceId: index === 0 ? (j === 0 ? hcSeq.id : lcSeq.id) : undefined, note };
     if (index === 0 && j === 0) {
       await assert.rejects(viewer.api.runExecution.recordOutput(registration), /权限|permission/i);
       await assert.rejects(writer.api.runExecution.recordOutput({ ...registration, parentSampleIds: [999999999] }), /输入样本/);
       await assert.rejects(writer.api.runExecution.recordOutput({ ...registration, sequenceId: undefined }), /序列记录/);
     }
     if (index === 1) {
       await assert.rejects(writer.api.runExecution.recordOutput({ ...registration, parentSampleIds: [inputs[0]] }), /重链.*轻链/);
       await assert.rejects(writer.api.runExecution.recordOutput({ ...registration, antibodyId: "wrong" }), /抗体编号/);
     }
     if (index === 0 && j === 0) {
       const incorrect = await writer.api.runExecution.recordOutput({ ...registration, idempotencyKey: randomUUID(), name: `QA voided registration ${suffix}` });
       const voiding = { runId: run.id, expectedRevision: await revision(), outputId: incorrect.outputId!, idempotencyKey: randomUUID(), note: `${note}; wrong registration corrected before review` };
       await writer.api.runExecution.voidOutput(voiding);
       const replayedVoid = await writer.api.runExecution.voidOutput(voiding); assert.equal(replayedVoid.sampleId, incorrect.sampleId);
       const [voidedSample] = await db.select().from(schema.samples).where(eq(schema.samples.id, incorrect.sampleId!)); assert.ok(voidedSample.archivedAt); assert.equal(voidedSample.quantity, 0); assert.equal(voidedSample.locationId, null);
       registration.expectedRevision = await revision();
       cases.push("Voided output registration keeps evidence and lineage, remains unavailable and frees storage without stock movement");
     }
     const output = await writer.api.runExecution.recordOutput(registration);
     assert.ok(output.sampleId); registered.push(output.sampleId!);
     assert.deepEqual(await writer.api.runExecution.recordOutput(registration), output);
     await assert.rejects(writer.api.runExecution.recordOutput({ ...registration, idempotencyKey: randomUUID() }), /任务已更新/);
     const stored = await writer.api.sample.byId({ id: output.sampleId! }); assert.equal(Number(stored.quantity), 0);
     const { changeInventory } = await import("../../api/services/inventoryService.ts");
     await assert.rejects(changeInventory({ sampleId: output.sampleId!, delta: 10, reason: "restock", actorId: writer.user.id, idempotencyKey: randomUUID() }), /尚未复核放行/);
     await assert.rejects(writer.api.sample.update({ id: output.sampleId!, unit: "mg" }), /待复核产物/);
     await assert.rejects(writer.api.runExecution.prepareNextStage({ runId: run.id, workflowId: methods[index + 1].workflowId, outputs: [{ sampleId: output.sampleId!, amount: 1 }], note, idempotencyKey: randomUUID() }), /复核通过/);
   }
   outputIds.push(registered);
 }
 const resultTargets = index < 3 ? registered : inputs;
 const requiredMetrics = Object.entries(method.spec.nodes).filter(([, rule]) => rule.resultRequired).flatMap(([nodeKey, rule]) => rule.measurements.map(metric => ({ nodeKey, metric })));
 for (const sampleId of resultTargets) for (const [j, { nodeKey, metric }] of requiredMetrics.entries()) {
   const record = { runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), nodeKey, sampleId, metricKey: metric.key, value: metric.kind === "text" ? "QA assessment fixture" : metric.key === "monomer" || metric.key === "purity" ? "95" : metric.key === "tm" ? "63.2" : "1.2", unit: metric.unit, outcome: "pass" as const, evidenceId: evidenceByNode[nodeKey], note };
   if (index === 3 && j === 0) {
     await assert.rejects(writer.api.runExecution.recordResult({ ...record, value: "80" }), /批准范围/);
     await assert.rejects(writer.api.runExecution.recordResult({ ...record, unit: "mg" }), /单位/);
   }
   await writer.api.runExecution.recordResult(record);
   if (index === 3 && j === 0) await assert.rejects(act("submit_review"), /缺少结果/);
 }
 if (index === 3) {
   const details = await writer.api.runExecution.details({ runId: run.id }); const oldKd = details.currentResults.find(result => result.metricKey === "kd")!;
   await writer.api.runExecution.recordResult({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), nodeKey: "binding", sampleId: inputs[0], metricKey: "kd", value: "2.4", unit: "nM", outcome: "pass", evidenceId: evidenceByNode.binding, note: `${note}; corrected fixture` });
   const corrected = await writer.api.runExecution.details({ runId: run.id }); assert.equal(corrected.currentResults.length, 4); assert.equal(corrected.results.length, 5); assert.equal(corrected.currentResults.find(result => result.metricKey === "kd")?.supersedesId, oldKd.id);
   cases.push("Independent metrics retain individual correction histories; omitted metrics, unit mismatch and out-of-range pass blocked");
 }
 if (index === 3) {
   await writer.api.runExecution.recordResult({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), nodeKey: "purity", sampleId: inputs[0], metricKey: "monomer", value: "80", unit: "%", outcome: "fail", evidenceId: evidenceByNode.purity, note: `${note}; deliberate QC failure fixture` });
   await act("submit_review");
   await assert.rejects(act("approve_results", reviewer), /不合格样本/);
   await act("return_results", reviewer);
   await writer.api.runExecution.recordResult({ runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), nodeKey: "purity", sampleId: inputs[0], metricKey: "monomer", value: "95", unit: "%", outcome: "pass", evidenceId: evidenceByNode.purity, note: `${note}; deliberate correction fixture, not a new measurement` });
   cases.push("Failed QC prevents approval; independent return and documented correction preserve the failed result");
 }
 await act("submit_review");
 await assert.rejects(act("approve_results"), /另一位/);
 const review = await reviewer.api.runExecution.details({ runId: run.id });
 const approval = { runId: run.id, expectedRevision: await revision(), idempotencyKey: randomUUID(), action: "approve_results" as const, note, expectedExperimentRevision: review.experiment?.revision };
 const approved = await reviewer.api.runExecution.act(approval); assert.deepEqual(await reviewer.api.runExecution.act(approval), approved);
 const signed = await writer.api.runExecution.details({ runId: run.id }); assert.equal(signed.experiment?.status, "signed"); assert.equal(signed.execution?.resultState, "approved");
 const signedContent = await writer.api.experiment.byId({ id: signed.experiment!.id });
 assert.ok(signedContent.content?.includes(`QA-${method.spec.nodes[antibodyMethodDraft(stages[index]).nodes[0].nodeKey].record!.fields[0].key}-${suffix}`));
 for (const sampleId of registered) {
   assert.equal(Number((await writer.api.sample.byId({ id: sampleId })).quantity), 10);
   const ledger = await db.select().from(schema.stockTransactions).where(eq(schema.stockTransactions.sampleId, sampleId)); assert.equal(ledger.length, 1); assert.equal(ledger[0].quantityAfter, 10);
   const lineage = await db.select().from(schema.lineageEdges).where(and(eq(schema.lineageEdges.childKind, "sample"), eq(schema.lineageEdges.childId, sampleId))); assert.equal(lineage.length, index === 0 ? 1 : inputs.length);
 }
 const projection = (await writer.api.labRun.byId({ id: run.id })).dataFlow;
 assert.equal(projection.nodes.filter(node => node.source === "lab_run_output").length, registered.length);
 for (const sampleId of registered) {
   const output = signed.outputs.find(output => output.sampleId === sampleId)!;
   assert.ok(projection.edges.some(edge => edge.target === `output:${output.id}` && edge.source.startsWith("resource:")));
   assert.ok(projection.edges.some(edge => edge.source === `output:${output.id}` && edge.target.startsWith("result:")));
 }
 cases.push(`${stages[index]}: actual business APIs issue stock, save raw evidence, record outputs/results, independently approve and sign immutable ELN (synthetic QA data)`);
 if (index < 3) {
   const handoff = { runId: run.id, workflowId: methods[index + 1].workflowId, outputs: registered.map(sampleId => ({ sampleId, amount: 1 })), note, idempotencyKey: randomUUID() };
   await assert.rejects(writer.api.runExecution.prepareNextStage({ ...handoff, workflowId: methods[index].workflowId }), /下一研发阶段/);
   const next = await writer.api.runExecution.prepareNextStage(handoff); assert.deepEqual(await writer.api.runExecution.prepareNextStage(handoff), next);
   draftId = next.draftId; inputs = registered; previousRun = run.id;
   const draft = await writer.api.runDraft.byId({ id: draftId }); assert.equal(draft.payload.stageSource?.runId, run.id);
 }
}
const report = { status: "passed", evidenceKind: "synthetic software acceptance; not physical experiment", cases, projectId: project.id, methods: methods.map(({ workflowId, releaseId }) => ({ workflowId, releaseId })), runs, outputIds, writerId: writer.user.id, reviewerId: reviewer.user.id };
writeFileSync("verifier/v16/chain-fixture.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); process.exit(0);
