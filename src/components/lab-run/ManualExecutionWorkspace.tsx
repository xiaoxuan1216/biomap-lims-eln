import { SamplePlateView } from "@/features/cloning-planner/SamplePlateWorkspace";
import { useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { Link, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useRunEvidenceUpload } from "@/hooks/useRunEvidenceUpload";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { missingRunResults } from "@contracts/runExecution";
import { toast } from "sonner";
import { defaultMeasurement } from "@contracts/methodOutputs";
import RunOutputs, { outputSnapshot } from "./RunOutputs";
import MaterialPreparation from "./MaterialPreparation";
import StepRecordForm, { StepRecordSummary } from "./StepRecordForm";
import { latestStepRecord } from "@contracts/stepRecords";

type Run = inferRouterOutputs<AppRouter>["labRun"]["byId"];
export default function ManualExecutionWorkspace({ run }: { run: Run }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const equipment = trpc.equipment.list.useQuery();
  const [replacementNode, setReplacementNode] = useState("");
  const [replacementEquipment, setReplacementEquipment] = useState("");
  const [reworkSamples, setReworkSamples] = useState<number[]>([]);
  const [reworkReason, setReworkReason] = useState("");
  const details = trpc.runExecution.details.useQuery({ runId: run.id }, { refetchInterval: 10000 });
  useEffect(() => {
    if (details.data?.runRevision != null && details.data.runRevision !== run.revision) void utils.labRun.byId.invalidate({ id: run.id });
  }, [details.data?.runRevision, run.revision, run.id, utils]);
  const operators = trpc.runDraft.operators.useQuery();
  const [note, setNote] = useState("");
  const [decisions, setDecisions] = useState<Record<string, "yes" | "no">>({});
  const [ownerId, setOwnerId] = useState("");
  const [reconciled, setReconciled] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [sampleId, setSampleId] = useState("");
  const [resultNode, setResultNode] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [value, setValue] = useState("");
  const [metricKey, setMetricKey] = useState("");
  const [unit, setUnit] = useState("");
  const [outcome, setOutcome] = useState<"pass" | "fail">("pass");
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const refresh = async () => { await Promise.all([utils.labRun.byId.invalidate({ id: run.id }), utils.labRun.list.invalidate(), details.refetch()]); };
  const act = trpc.runExecution.act.useMutation({ onSuccess: async () => { setNote(""); setReviewed(false); setReconciled(false); await refresh(); }, onError: error => toast.error(error.message) });
  const upload = useRunEvidenceUpload(run.id, () => details.refetch());
  const { uploadFile } = upload;
  const result = trpc.runExecution.recordResult.useMutation({ onSuccess: async () => { toast.success(t("样本结果已记录")); setValue(""); setEvidenceId(""); await refresh(); }, onError: error => toast.error(error.message) });
  const rework = trpc.runExecution.prepareRework.useMutation({ onSuccess: async result => { await utils.runDraft.list.invalidate(); navigate(`/runs/new?workflowId=${result.workflowId}&draftId=${result.draftId}`); }, onError: error => toast.error(error.message) });
  const data = details.data;
  if (details.error) return <p role="alert">{details.error.message}</p>;
  if (!data?.execution) return <div className="h-40 animate-pulse rounded-xl bg-slate-100" />;
  const execution = data.execution;
  const requested = [...data.events].reverse().find(event => event.action === "request_equipment");
  const pendingReplacement = requested && !data.events.some(event => event.action === "approve_equipment" && JSON.parse(event.payload).requestEventId === requested.id) ? { ...JSON.parse(requested.payload), id: requested.id } as { id: number; nodeKey: string; equipmentId: number; note: string } : null;
  const owns = execution.ownerId === user?.id;
  const canReview = ["reviewer", "admin"].includes(user?.role ?? "") && !owns;
  const blocked = act.isPending || result.isPending || upload.pending || !run.integrityValid || !note.trim();
  const active = run.nodes.filter(node => node.status === "running");
  const completed = run.nodes.filter(node => node.status === "completed");
  const samples = run.resources.filter(resource => resource.role === "sample");
  const requiredKeys = Object.entries(run.method?.spec.nodes ?? {}).filter(([, rule]) => rule.resultRequired).map(([key]) => key);
  const resultSteps = completed.filter(node => requiredKeys.length ? requiredKeys.includes(node.nodeKey) : !run.methodEdges.some(edge => edge.sourceKey === node.nodeKey));
  const selectedNode = resultSteps.some(node => node.nodeKey === resultNode) ? resultNode : resultSteps.at(-1)?.nodeKey || "";
  const selectedRule = run.method?.spec.nodes[selectedNode];
  const resultTargets = selectedRule?.resultsOn === "outputs" ? data.outputs.filter(output => output.nodeKey === selectedNode && output.status !== "voided").map(output => ({ sampleId: output.sampleId, sku: outputSnapshot(output.sampleSnapshot).sku, sampleName: outputSnapshot(output.sampleSnapshot).name })) : samples;
  const selectedSample = resultTargets.some(sample => String(sample.sampleId) === sampleId) ? sampleId : String(resultTargets[0]?.sampleId ?? "");
  const metrics = selectedRule?.measurements?.length ? selectedRule.measurements : [defaultMeasurement];
  const selectedMetric = metrics.find(metric => metric.key === metricKey) ?? metrics[0];
  const selectedUnit = selectedMetric?.key === "result" ? unit : selectedMetric?.unit ?? "";
  const activeResults = data.currentResults.filter(result => !data.outputs.some(output => output.sampleId === result.sampleId && output.status === "voided"));
  const missing = missingRunResults(run.nodes, run.methodEdges, samples.map(sample => sample.sampleId), requiredKeys, activeResults, run.method?.spec.nodes, data.outputs);
  const incompleteOutputs = completed.some(node => { const produces = run.method?.spec.nodes[node.nodeKey]?.produces; if (!produces) return false; const outputs = data.outputs.filter(output => output.nodeKey === node.nodeKey && output.status !== "voided"); const covered = new Set(outputs.flatMap(output => JSON.parse(output.parentSampleIds) as number[])); return outputs.length < produces.minCount || (produces.requireAllInputs && samples.some(sample => !covered.has(sample.sampleId))); });
  const stateLabel = execution.resultState === "approved" ? "结果已确认并签署" : execution.resultState === "review" ? "结果待复核" : execution.resultState === "changes_requested" ? "结果已退回处理" : "结果收集中";
  const action = (name: "start" | "complete_step" | "pause" | "resume" | "handoff" | "submit_review" | "approve_results" | "return_results" | "request_equipment" | "approve_equipment", nodeKey?: string) => act.mutate({ runId: run.id, expectedRevision: run.revision, idempotencyKey: crypto.randomUUID(), action: name, note, nodeKey, equipmentId: Number(replacementEquipment) || undefined, requestEventId: pendingReplacement?.id, decision: nodeKey ? decisions[nodeKey] : undefined, evidenceIds: nodeKey ? data.evidence.filter(file => file.nodeKey === nodeKey).map(file => file.id) : [], ownerId: Number(ownerId) || undefined, reconcile: reconciled, expectedExperimentRevision: data.experiment?.revision });
  return <div className="space-y-4">
    {upload.progress && <div role="status" className="sticky top-2 z-10 space-y-2 rounded-xl border border-teal-200 bg-white p-4 shadow-sm"><p className="break-all text-sm">{upload.progress.name}</p><Progress aria-label={t("上传进度")} value={upload.progress.percent}/><div className="flex items-center justify-between gap-3 text-sm"><span>{upload.progress.saving ? t("正在校验并保存原始文件") : `${upload.progress.percent}%`}</span><Button size="sm" variant="outline" onClick={upload.cancel}>{t("取消上传")}</Button></div></div>}
    {run.stageSource && <p className="rounded-lg bg-teal-50 p-3 text-sm">{t("本任务使用上一阶段放行的产物。")}<Link className="ml-2 inline-block text-teal-700 underline" to={`/runs/${run.stageSource.runId}`}>{t("查看上一阶段实验")}</Link></p>}
    {run.samplePlatePlans.map(item => <details key={item.id} className="rounded-lg border bg-white p-4"><summary className="cursor-pointer font-medium">{t("执行孔板与样本")} · {item.name} · V{item.version}</summary><div className="mt-3"><SamplePlateView plan={item.plan}/></div></details>)}
    {run.inputIdentities.some(identity => identity.origin !== "run_output") && <details className="rounded-lg border bg-teal-50 p-3 text-sm"><summary className="cursor-pointer font-medium">{t("本批来样身份与来源")}</summary><div className="mt-3 space-y-2">{run.inputIdentities.filter(identity => identity.origin !== "run_output").map(identity => <div key={identity.sampleId}><Link className="text-teal-700 underline" to={`/samples/${identity.sampleId}`}>{samples.find(sample => sample.sampleId === identity.sampleId)?.sku}</Link> · {identity.antibodyId} · {identity.chain} · {identity.lot}<p className="text-xs text-muted-foreground">{identity.sourceReference}</p></div>)}</div></details>}
    {run.reworkSource && <p className="rounded-lg bg-amber-50 p-3 text-sm">{t("本任务为部分样本重做，保留原实验和结果。")}<Link className="ml-2 inline-block text-teal-700 underline" to={`/runs/${run.reworkSource.runId}`}>{t("查看原实验")}</Link> · {run.reworkSource.reason}</p>}
    <Card className={execution.paused ? "border-amber-400" : "border-teal-300"}><CardHeader><CardTitle className="flex flex-wrap items-center gap-2 text-base">{t(execution.resultState === "approved" ? "实验已归档" : "下一步动作")}<Badge variant="outline">{t(execution.paused ? "任务已暂停" : run.status === "ready" ? "待开始" : run.status === "running" ? "执行中" : stateLabel)}</Badge></CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm">{t("当前负责人")}：{execution.ownerName} · {t("人工执行与原始证据记录")}</p>
      {run.status === "ready" && <><p className="text-sm text-muted-foreground">{t("请完成领料、核对设备和现场准备，再确认开始实验。")}</p>{run.readiness.issues.map((issue, index) => <p key={index} className={issue.level === "blocking" ? "text-sm text-red-700" : "text-sm text-amber-700"}>{lang === "en" ? issue.labelEn ?? issue.label : issue.label}</p>)}{run.sampleRequestId && <MaterialPreparation requestId={run.sampleRequestId} canIssue={owns} onIssued={refresh} />}</>}
      {execution.paused && <div className="rounded-lg bg-amber-50 p-3 text-sm"><p>{execution.pauseReason}</p><p className="mt-2">{t("暂停记录不会停止现场设备。恢复前请核对样本、设备和步骤实际状态。")}</p>{owns && <label className="mt-3 flex gap-2"><input type="checkbox" checked={reconciled} onChange={e => setReconciled(e.target.checked)} />{t("已完成现场对账，确认可以继续")}</label>}</div>}
      {(owns || canReview) && execution.resultState !== "approved" && <Label>{t("操作说明、观察或复核结论")}<Textarea className="mt-1" value={note} onChange={e => setNote(e.target.value)} placeholder={t("记录本次操作的依据和观察；该内容将保留在实验记录中。")}/></Label>}
      {owns && <div className="flex flex-wrap gap-2">{run.status === "ready" && <Button disabled={blocked || !run.readiness.summary.ready} onClick={() => action("start")}>{t("确认开始人工实验")}</Button>}{run.status === "running" && (execution.paused ? <Button disabled={blocked || !reconciled} onClick={() => action("resume")}>{t("确认恢复任务")}</Button> : <Button variant="outline" disabled={blocked} onClick={() => action("pause")}>{t("暂停并记录问题")}</Button>)}</div>}
      {execution.paused && <details><summary className="cursor-pointer text-sm">{t("申请替代设备")}</summary><div className="mt-3 space-y-3">{owns && <div className="flex flex-wrap gap-2"><select className="rounded border p-2 text-sm" value={replacementNode} onChange={e => { setReplacementNode(e.target.value); setReplacementEquipment(""); }} aria-label={t("需要替换设备的步骤")}><option value="">{t("选择步骤")}</option>{run.nodes.filter(node => node.type === "equipment" && ["pending", "running"].includes(node.status)).map(node => <option key={node.nodeKey} value={node.nodeKey}>{node.label}</option>)}</select><select className="rounded border p-2 text-sm" value={replacementEquipment} onChange={e => setReplacementEquipment(e.target.value)} aria-label={t("替代设备")}><option value="">{t("选择经过方法验证的设备")}</option>{equipment.data?.filter(device => run.method?.spec.nodes[replacementNode]?.equipmentIds.includes(device.id)).map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select><Button variant="outline" disabled={blocked || !replacementNode || !replacementEquipment} onClick={() => action("request_equipment", replacementNode)}>{t("提交设备替换申请")}</Button></div>}{pendingReplacement && <div className="rounded border p-3 text-sm"><p>{run.nodes.find(node => node.nodeKey === pendingReplacement.nodeKey)?.label} → {equipment.data?.find(device => device.id === pendingReplacement.equipmentId)?.name}</p><p>{pendingReplacement.note}</p>{canReview && <Button className="mt-2" disabled={blocked} onClick={() => action("approve_equipment")}>{t("批准替换并保留偏差记录")}</Button>}</div>}<p className="text-xs text-muted-foreground">{t("替换需另一位复核人批准，并重新检查设备适配、校准和预约。批准后仍需现场对账再恢复。")}</p></div></details>}
      {owns && execution.resultState !== "approved" && <details><summary className="cursor-pointer text-sm">{t("交接当前任务")}</summary><div className="mt-3 flex flex-wrap gap-2"><select className="rounded border p-2 text-sm" value={ownerId} onChange={e => setOwnerId(e.target.value)} aria-label={t("接收人")}><option value="">{t("选择接收人")}</option>{operators.data?.filter(owner => owner.id !== execution.ownerId).map(owner => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select><Button disabled={blocked || !ownerId || (run.status === "running" && !execution.paused)} onClick={() => action("handoff")}>{t("确认交接")}</Button></div></details>}
    </CardContent></Card>
    {active.map(node => {
      const rule = run.method?.spec.nodes[node.nodeKey];
      const waiting = node.type === "timer" ? Math.max(0, Math.ceil((node.updatedAt.getTime() + (rule?.waitMinutes ?? 0) * 60000 - clock) / 1000)) : 0;
      return <Card key={node.nodeKey}><CardHeader><CardTitle className="text-base">{node.label}</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 text-sm md:grid-cols-3"><p><strong>{t("输入要求")}</strong><br/>{rule?.input}</p><p><strong>{t("预期产物")}</strong><br/>{rule?.output}</p><p><strong>{t("完成标准")}</strong><br/>{rule?.completion}</p></div><p className="text-xs text-muted-foreground">{t("涉及样本")}：{samples.map(sample => sample.sku).join(", ")} {(data.equipmentOverrides[node.nodeKey]?.name ?? node.equipmentName) && ` · ${data.equipmentOverrides[node.nodeKey]?.name ?? node.equipmentName}`}</p>
        {node.type === "decision" && <select className="rounded border p-2 text-sm" value={decisions[node.nodeKey] ?? ""} aria-label={t("判断结论")} onChange={e => setDecisions({ ...decisions, [node.nodeKey]: e.target.value as "yes" | "no" })}><option value="">{t("请选择判断结论")}</option><option value="yes">{t("是")}</option><option value="no">{t("否")}</option></select>}
        {node.type === "timer" && <p className="text-sm">{t("剩余等待秒数：{n}", { n: waiting })}</p>}
        {rule?.record && (owns ? <StepRecordForm identities={run.inputIdentities} steps={run.nodes} runId={run.id} revision={run.revision} nodeKey={node.nodeKey} spec={rule.record} events={data.events} samples={samples} disabled={act.isPending || result.isPending || upload.pending || !run.integrityValid || execution.paused} canComplete={!act.isPending && !result.isPending && !upload.pending && run.integrityValid && waiting === 0 && (node.type !== "decision" || !!decisions[node.nodeKey]) && (rule.evidenceRequired === false || !["equipment", "data"].includes(node.type) || data.evidence.some(file => file.nodeKey === node.nodeKey))} note={note} evidenceIds={data.evidence.filter(file => file.nodeKey === node.nodeKey).map(file => file.id)} decision={decisions[node.nodeKey]} refresh={refresh} onCompleted={() => setNote("")}/> : <StepRecordSummary spec={rule.record} rows={latestStepRecord(data.events, node.nodeKey).rows} samples={samples}/>)}
        {owns && <Label className="block">{t("上传原始文件（最大 {n} MB）", { n: upload.maxMB ?? "—" })}<Input type="file" className="mt-1" disabled={(upload.pending || upload.unavailable) || execution.paused} onChange={e => { void uploadFile(node.nodeKey, e.target.files?.[0]); e.target.value = ""; }}/></Label>}
        <div className="flex flex-wrap gap-3 text-xs">{data.evidence.filter(file => file.nodeKey === node.nodeKey).map(file => <a key={file.id} className="text-teal-700 underline" href={`/api/run-files/${file.id}`}>{file.name}</a>)}</div>
        {owns && !rule?.record && <Button disabled={blocked || execution.paused || waiting > 0 || (node.type === "decision" && !decisions[node.nodeKey]) || (["equipment", "data"].includes(node.type) && rule?.evidenceRequired !== false && !data.evidence.some(file => file.nodeKey === node.nodeKey))} onClick={() => action("complete_step", node.nodeKey)}>{t("确认完成此步骤")}</Button>}
      </CardContent></Card>;
    })}
    <RunOutputs run={run} data={data} owns={owns} canPrepare={user?.role !== "viewer"} refresh={refresh} uploadFile={uploadFile} uploadDisabled={upload.pending || upload.unavailable}/>
    {completed.some(node => run.method?.spec.nodes[node.nodeKey]?.record) && <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{t("已完成步骤的实验记录")}</summary><div className="mt-3 space-y-4">{completed.map(node => { const spec = run.method?.spec.nodes[node.nodeKey]?.record; return spec ? <details key={node.nodeKey}><summary className="mb-2 cursor-pointer text-sm font-medium">{node.label}</summary><StepRecordSummary spec={spec} rows={latestStepRecord(data.events, node.nodeKey).rows} samples={samples}/></details> : null; })}</div></details>}
    {(resultSteps.length > 0 || data.currentResults.length > 0) && <Card><CardHeader><CardTitle className="text-base">{t("样本结果与复核")}</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm">{t(stateLabel)} · {t("缺少 {n} 项步骤样本结果", { n: missing.length })}</p>
      {incompleteOutputs && <p className="text-sm text-amber-700">{t("请先补齐本阶段产物登记及输入样本的对应关系。")}</p>}
      {owns && !["review", "approved"].includes(execution.resultState) && <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><div className="grid gap-3 md:grid-cols-2"><Label>{t("结果步骤")}<select className="mt-1 block w-full rounded border p-2" value={selectedNode} onChange={e => { setResultNode(e.target.value); setEvidenceId(""); setSampleId(""); setMetricKey(""); setValue(""); }}>{resultSteps.map(node => <option key={node.nodeKey} value={node.nodeKey}>{node.label}</option>)}</select></Label><Label>{t("样本")}<select className="mt-1 block w-full rounded border p-2" value={selectedSample} onChange={e => setSampleId(e.target.value)}>{resultTargets.map(sample => <option key={sample.sampleId} value={sample.sampleId}>{sample.sku} · {sample.sampleName}</option>)}</select></Label><Label>{t("结果指标")}<select className="mt-1 block w-full rounded border p-2" value={selectedMetric?.key ?? ""} onChange={e => { setMetricKey(e.target.value); setValue(""); }}>{metrics.map(metric => <option key={metric.key} value={metric.key}>{lang === "en" ? metric.labelEn || metric.label : metric.label}</option>)}</select></Label><Label>{t("结果值或判定记录")}<Input value={value} onChange={e => setValue(e.target.value)}/></Label><Label>{t("单位")}<Input value={selectedUnit} readOnly={selectedMetric?.key !== "result"} onChange={e => setUnit(e.target.value)}/></Label><Label>{t("质控判定")}<select className="mt-1 block w-full rounded border p-2" value={outcome} onChange={e => setOutcome(e.target.value as "pass" | "fail")}><option value="pass">{t("合格")}</option><option value="fail">{t("异常，需要处理")}</option></select></Label><Label>{t("关联原始文件")}<select className="mt-1 block w-full rounded border p-2" value={evidenceId} onChange={e => setEvidenceId(e.target.value)}><option value="">{t("选择原始文件")}</option>{data.evidence.filter(file => file.nodeKey === selectedNode).map(file => <option key={file.id} value={file.id}>{file.name}</option>)}</select></Label></div><Label className="block">{t("补充此步骤的原始文件")}<Input type="file" disabled={(upload.pending || upload.unavailable)} onChange={e => { void uploadFile(selectedNode, e.target.files?.[0]); e.target.value = ""; }}/></Label><Button variant="outline" disabled={blocked || !value.trim() || !evidenceId || !selectedSample || !selectedMetric || execution.paused} onClick={() => result.mutate({ runId: run.id, expectedRevision: run.revision, idempotencyKey: crypto.randomUUID(), nodeKey: selectedNode, sampleId: Number(selectedSample), metricKey: selectedMetric!.key, value, unit: selectedUnit, outcome, evidenceId: Number(evidenceId), note })}>{t("记录此样本结果")}</Button></div>}
      <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>{t("样本")}</th><th>{t("结果步骤")}</th><th>{t("结果指标")}</th><th>{t("结果")}</th><th>{t("质控判定")}</th><th>{t("原始文件")}</th></tr></thead><tbody>{activeResults.map(row => <tr key={row.id} className="border-t"><td className="py-2">{samples.find(s => s.sampleId === row.sampleId)?.sku ?? (data.outputs.find(output => output.sampleId === row.sampleId) ? outputSnapshot(data.outputs.find(output => output.sampleId === row.sampleId)!.sampleSnapshot).sku : row.sampleId)}</td><td>{run.nodes.find(n => n.nodeKey === row.nodeKey)?.label}</td><td>{(() => { const metric = run.method?.spec.nodes[row.nodeKey]?.measurements?.find(metric => metric.key === row.metricKey); return metric ? lang === "en" ? metric.labelEn || metric.label : metric.label : t("结果"); })()}</td><td>{row.value} {row.unit}</td><td className={row.outcome === "fail" ? "text-red-700" : "text-teal-700"}>{t(row.outcome === "pass" ? "合格" : "异常")}</td><td><a className="text-teal-700 underline" href={`/api/run-files/${row.evidenceId}`}>{data.evidence.find(e => e.id === row.evidenceId)?.name}</a></td></tr>)}</tbody></table></div>
      {execution.experimentId && <Button asChild variant="outline"><Link to={`/experiments/${execution.experimentId}`}>{t(execution.resultState === "approved" ? "查看已签署实验记录" : "阅读实验记录与填写结论")}</Link></Button>}
      {owns && run.status === "completed" && !["review", "approved"].includes(execution.resultState) && <Button disabled={blocked || missing.length > 0 || incompleteOutputs || !activeResults.length} onClick={() => action("submit_review")}>{t("生成实验记录并提交复核")}</Button>}
      {canReview && execution.resultState === "review" && <div className="space-y-3"><label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>{t("我已阅读结果、原始证据和实验记录，确认签署后不可修改")}</label><div className="flex flex-wrap gap-2"><Button disabled={blocked || !reviewed || activeResults.some(row => row.outcome === "fail")} onClick={() => action("approve_results")}>{t("批准结果并签署实验记录")}</Button><Button variant="outline" disabled={blocked} onClick={() => action("return_results")}>{t("退回补充或重做")}</Button></div></div>}
    </CardContent></Card>}
    {owns && run.status === "completed" && <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{t("选择部分样本重新实验")}</summary><div className="mt-3 space-y-3"><p className="text-sm text-muted-foreground">{t("所选样本将建立独立实验计划，按完整方法重做；重新确认样本余量、物料、设备和时间。原结果及签署记录保留。")}</p><div className="flex flex-wrap gap-4">{samples.map(sample => <label className="flex gap-2 text-sm" key={sample.sampleId}><input type="checkbox" checked={reworkSamples.includes(sample.sampleId)} onChange={e => setReworkSamples(e.target.checked ? [...reworkSamples, sample.sampleId] : reworkSamples.filter(id => id !== sample.sampleId))}/>{sample.sku}</label>)}</div><Textarea aria-label={t("重做原因")} placeholder={t("重做原因")} value={reworkReason} onChange={e => setReworkReason(e.target.value)}/><Button disabled={!reworkReason.trim() || !reworkSamples.length || rework.isPending} onClick={() => rework.mutate({ runId: run.id, sampleIds: reworkSamples, reason: reworkReason, idempotencyKey: crypto.randomUUID() })}>{t("准备重做计划")}</Button></div></details>}
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">{t("操作与证据历史")}</summary><div className="mt-3 space-y-3">{data.events.map(event => <div key={event.id} className="border-t pt-2 text-sm"><p>{event.createdAt.toLocaleString()} · {event.actorName} · {t(({ save_step_record: "保存步骤记录", start: "开始实验", complete_step: "完成步骤", pause: "暂停任务", resume: "恢复任务", handoff: "交接任务", submit_review: "提交结果复核", approve_results: "批准结果", return_results: "退回结果", record_result: "记录样本结果", prepare_rework: "准备样本重做", record_output: "登记实验产物", void_output: "作废产物登记", prepare_next_stage: "准备下一研发阶段", request_equipment: "申请替换设备", approve_equipment: "批准替换设备" } as Record<string, string>)[event.action] ?? event.action)}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{JSON.parse(event.payload).note}</p></div>)}</div></details>
  </div>;
}
