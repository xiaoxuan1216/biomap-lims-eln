import { validateRunGraph } from "@contracts/labRun";
import { setCopilotContext } from "@/lib/copilotContext";
import { useCallback, useEffect, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import { Link, useBeforeUnload, useParams, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { methodNodeSpecSchema, methodSpecSchema, type MethodNodeSpec, type MethodSpec } from "@contracts/method";
import { EQUIP_PARAM_SCHEMAS, FLOW_NODE_TYPES } from "@contracts/workflow";
import { toast } from "sonner";
import { ScientificMethod, ScientificStep } from "@/components/method/ScientificRequirements";
import StepRecordRequirements from "@/components/method/StepRecordRequirements";
import MethodStepListEditor from "@/components/method/MethodStepListEditor";
import WorkflowEditor from "./WorkflowEditor";
import type { MethodSnapshot } from "../../api/services/methodService";
import { methodDifferences } from "@contracts/methodDiff";
import { readMethodRequirementsDraft } from "@contracts/methodDraft";

export default function MethodDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { t } = useI18n();
  const [editing, setEditing] = useState(search.get("workspace") === "configuration");
  const workflow = trpc.workflow.byId.useQuery({ id: Number(id) });
  if (search.has("view") || search.has("nodeKey")) return <WorkflowEditor />;
  if (workflow.error) return <p role="alert">{workflow.error.message}</p>;
  if (!workflow.data) return <p>{t("加载中…")}</p>;
  return <MethodWorkspace key={`${id}:${workflow.data.methodSpecHash}:${workflow.data.graphHash}`} workflow={workflow.data} editing={editing} onEditingChange={setEditing} />;
}

type WorkflowData = inferRouterOutputs<AppRouter>["workflow"]["byId"];
function MethodWorkspace({ workflow, editing, onEditingChange }: { workflow: WorkflowData; editing: boolean; onEditingChange: (editing: boolean) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [entryParams, setEntryParams] = useSearchParams();
  const configuring = entryParams.get("workspace") === "configuration";
  const entrySampleId = Number(entryParams.get("sampleId"));
  const entrySuffix = Number.isSafeInteger(entrySampleId) && entrySampleId > 0 ? `&sampleId=${entrySampleId}` : "";
  const utils = trpc.useUtils();
  useEffect(() => { setCopilotContext({ entityType: "workflow", entityId: workflow.id, entityName: workflow.name }); return () => setCopilotContext({}); }, [workflow.id, workflow.name]);
  const [spec, setSpec] = useState<MethodSpec>(workflow.methodSpec);
  const [dirty, setDirty] = useState(false);
  const recoveryKey = `biomap-method-requirements:${user?.id}:${workflow.id}`;
  const [recovery, setRecovery] = useState(() => {
    for (const kind of ["sessionStorage", "localStorage"] as const) {
      try { const draft = readMethodRequirementsDraft(window[kind].getItem(recoveryKey)); if (draft) return draft; } catch { /* Try the other recovery store. */ }
    }
    return null;
  });
  const [storageFailed, setStorageFailed] = useState(false);
  const validation = methodSpecSchema.safeParse(spec);
  useBeforeUnload(useCallback(event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }, [dirty]));
  const changeSpec = (next: MethodSpec) => {
    setSpec(next); setDirty(true);
    const raw = JSON.stringify({ format: 1, specHash: workflow.methodSpecHash, graphHash: workflow.graphHash, spec: next });
    let retained = false;
    for (const kind of ["sessionStorage", "localStorage"] as const) {
      try { window[kind].setItem(recoveryKey, raw); retained = true; } catch { /* Keep the tab copy if shared storage is unavailable. */ }
    }
    setStorageFailed(!retained);
  };
  const saveGuard = { expectedSpecHash: workflow.methodSpecHash, expectedGraphHash: workflow.graphHash };
  const [reviewNote, setReviewNote] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState<Record<string, string>>({});
  const releases = trpc.workflow.releases.useQuery({ workflowId: workflow.id });
  const equipment = trpc.equipment.list.useQuery();
  const driverNodes = trpc.driver.nodeCatalog.useQuery();
  const requestedReleaseId = Number(entryParams.get("releaseId"));
  const requestedRelease = Number.isSafeInteger(requestedReleaseId) && requestedReleaseId > 0
    ? releases.data?.find(release => release.id === requestedReleaseId)
    : undefined;
  const published = requestedRelease ?? releases.data?.find(r => r.status === "published");
  const publishedSnapshot = published ? JSON.parse(published.snapshot) as MethodSnapshot : undefined;
  const displayed = !editing && publishedSnapshot ? publishedSnapshot : { workflow, nodes: workflow.nodes, edges: workflow.edges, spec };
  const graphOrder = validateRunGraph(displayed.nodes, displayed.edges);
  const orderedNodes = graphOrder.valid ? graphOrder.order.map(key => displayed.nodes.find(node => node.nodeKey === key)!) : displayed.nodes;
  const canWrite = !!user && user.role !== "viewer";
  const canReview = user?.role === "reviewer" || user?.role === "admin";
  const refresh = async () => { await Promise.all([utils.workflow.byId.invalidate({ id: workflow.id }), utils.workflow.list.invalidate(), releases.refetch()]); };
  const save = trpc.workflow.saveMethodSpec.useMutation({ onSuccess: async (_, variables) => {
    for (const kind of ["sessionStorage", "localStorage"] as const) {
      try {
        const stored = readMethodRequirementsDraft(window[kind].getItem(recoveryKey));
        if (!stored || JSON.stringify(stored.spec) === JSON.stringify(variables.spec)) window[kind].removeItem(recoveryKey);
      } catch { /* Server save succeeded; local recovery remains optional. */ }
    }
    setDirty(false); setRecovery(null); toast.success(t("执行要求已保存")); await refresh();
  }, onError: async e => { toast.error(t(e.message)); if (e.data?.code === "CONFLICT") await refresh(); } });
  const submit = trpc.workflow.submitMethod.useMutation({ onSuccess: async () => { toast.success(t("版本已提交复核")); await refresh(); }, onError: async e => { toast.error(t(e.message)); if (e.data?.code === "CONFLICT") await refresh(); } });
  const review = trpc.workflow.reviewMethod.useMutation({ onSuccess: async () => { toast.success(t("方法版本状态已更新")); setReviewNote(""); await refresh(); }, onError: e => toast.error(e.message) });
  const patch = (key: string, value: Partial<MethodNodeSpec>) => {
    changeSpec({ ...spec, nodes: { ...spec.nodes, [key]: { ...methodNodeSpecSchema.parse({}), ...spec.nodes[key], ...value } } });
  };
  return <div className="space-y-5">
    {recovery && !dirty && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" role="status">
      <p>{t(recovery.specHash === workflow.methodSpecHash && recovery.graphHash === workflow.graphHash ? "发现未保存的执行要求，可恢复后继续维护。" : "执行要求草稿对应的版本已变化。请保留草稿，对照最新方法后再修改。")}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={recovery.specHash !== workflow.methodSpecHash || recovery.graphHash !== workflow.graphHash} onClick={() => { changeSpec(recovery.spec); setRecovery(null); onEditingChange(true); }}>{t("恢复执行要求草稿")}</Button>
      <Button size="sm" variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(recovery, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `method-${workflow.id}-requirements-draft.json`; a.click(); URL.revokeObjectURL(url); }}>{t("下载草稿备份")}</Button>
      <Button size="sm" variant="ghost" onClick={() => { for (const kind of ["sessionStorage", "localStorage"] as const) { try { window[kind].removeItem(recoveryKey); } catch { /* Keep server requirements unchanged. */ } } setRecovery(null); }}>{t("丢弃本地草稿")}</Button></div>
    </div>}
    <fieldset disabled={save.isPending || submit.isPending || !!recovery} className="space-y-5">
    <Link className="text-sm text-teal-700" to={configuring ? "/configuration/methods" : "/workflows"}>← {t(configuring ? "方法与流程画布" : "方法库")}</Link>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex gap-2"><Badge variant="outline">{t("方法定义")}</Badge><Badge>{published ? `${t(published.status === "retired" ? "已停用" : published.status === "review" ? "待复核" : "已发布")} V${published.version}` : t("待确认草稿")}</Badge></div>
        <h1 className="mt-2 text-2xl font-bold">{displayed.workflow.name}</h1><p className="mt-1 text-sm text-muted-foreground">{displayed.workflow.description}</p></div>
      <div className="flex flex-wrap gap-2">
        {configuring && <Button asChild variant="outline"><Link to={`/workflows/${workflow.id}/edit`}>{t("打开流程画布")}</Link></Button>}
        {published?.status === "published" && workflow.status !== "archived" && <Button asChild><Link to={`/runs/new?workflowId=${workflow.id}&methodReleaseId=${published.id}${entrySuffix}`}>{t("使用此方法")}</Link></Button>}
        {canWrite && <Button variant="outline" onClick={() => { if (!configuring) { const params = new URLSearchParams(entryParams); params.set("workspace", "configuration"); setEntryParams(params); onEditingChange(true); } else onEditingChange(!editing); }}>{t(!configuring ? "进入方法配置" : editing ? "收起维护工具" : "维护方法")}</Button>}
      </div>
    </div>
    <div className="rounded-xl border bg-teal-50 p-4 text-sm text-teal-900">{t(editing ? "正在维护工作副本。保存修改不会改变已发布版本；需提交复核后才能用于新实验。" : published ? "以下是已发布版本的执行要求，准备实验时将锁定此版本。" : "此方法尚未发布，请由方法负责人补齐要求并提交复核。")}</div>
    {!editing && <ScientificMethod spec={displayed.spec} editing={false} change={changeSpec}/>}
    {editing && <Card><CardContent className="space-y-4 p-5">
      {dirty && <p role="status" className={storageFailed ? "text-sm text-amber-700" : "text-xs text-muted-foreground"}>{t(storageFailed ? "当前浏览器无法保存恢复草稿，请保存执行要求后再离开。" : "修改已在本机保留；点击保存执行要求后才会更新工作副本。")}</p>}
      {!validation.success && <p role="alert" className="text-sm text-red-700">{t("请检查样本数量、SOP、产物字段、结果指标、物料和参数范围。")}</p>}
      <ScientificMethod spec={spec} editing change={changeSpec}/>
      <div className="flex flex-wrap items-center gap-4">
        <Label>{t("最少样本")}<Input type="number" min={1} max={200} value={spec.minSamples} onChange={e => { changeSpec({ ...spec, minSamples: Number(e.target.value) }); }} /></Label>
        <Label>{t("最多样本")}<Input type="number" min={1} max={200} value={spec.maxSamples} onChange={e => { changeSpec({ ...spec, maxSamples: Number(e.target.value) }); }} /></Label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={spec.layoutRequired} onChange={e => { changeSpec({ ...spec, layoutRequired: e.target.checked }); }} />{t("本方法必须确认孔板布局")}</label>
      </div>
      <details><summary className="cursor-pointer text-sm">{t("物料用量与批准库存")}</summary><div className="mt-3 space-y-3">{spec.materials.map((rule, index) => <div key={index} className="grid gap-2 rounded border p-3 md:grid-cols-3">{(["name", "unit", "perBatch", "perSample", "approvedSkus"] as const).map(field => <Label key={field}>{t(({ name: "物料名称", unit: "单位", perBatch: "每批固定用量", perSample: "每样本追加用量", approvedSkus: "批准库存编号（逗号分隔）" })[field])}<Input type={field === "perBatch" || field === "perSample" ? "number" : "text"} min={0} value={field === "approvedSkus" ? rule.approvedSkus.join(",") : rule[field]} onChange={e => { changeSpec({ ...spec, materials: spec.materials.map((item, i) => i !== index ? item : { ...item, [field]: field === "approvedSkus" ? e.target.value.split(/[,，]/).map(v => v.trim()) : field === "perBatch" || field === "perSample" ? Number(e.target.value) : e.target.value }) }); }}/></Label>)}<Button variant="ghost" onClick={() => { changeSpec({ ...spec, materials: spec.materials.filter((_, i) => i !== index) }); }}>{t("移除此项物料要求")}</Button></div>)}<Button variant="outline" onClick={() => { changeSpec({ ...spec, materials: [...spec.materials, { name: "", unit: "", perBatch: 0, perSample: 1, approvedSkus: [] }] }); }}>{t("添加物料要求")}</Button></div></details>
      <div className="flex flex-wrap gap-2"><Button disabled={!dirty || !validation.success || save.isPending || !!recovery} onClick={() => save.mutate({ workflowId: workflow.id, ...saveGuard, spec })}>{t("保存执行要求")}</Button>
        <Button variant="outline" disabled={dirty || !!recovery || submit.isPending} onClick={() => submit.mutate({ workflowId: workflow.id, ...saveGuard })}>{t("检查并提交复核")}</Button>
        <MethodStepListEditor workflow={workflow} disabled={dirty || !!recovery || save.isPending || submit.isPending} refresh={refresh}/>
        <Button asChild variant="ghost"><Link to={`/workflows/${workflow.id}/edit`}>{t("高级流程编辑器")}</Link></Button></div>
      {dirty && <p className="text-xs text-muted-foreground">{t("保存执行要求后可调整步骤列表。")}</p>}
      <p className="text-xs text-muted-foreground">{t("发布前必须填写输入、输出、完成标准和设备验证依据。编辑子方法后需重新提交父方法版本。")}</p>
    </CardContent></Card>}
    <div className="space-y-3">{orderedNodes.map((node, index) => {
      const rule: MethodNodeSpec = { ...methodNodeSpecSchema.parse({}), ...displayed.spec.nodes[node.nodeKey] };
      const fields = driverNodes.data?.find(n => n.templateKey === node.templateKey)?.action.fields ?? EQUIP_PARAM_SCHEMAS[node.templateKey ?? ""] ?? [];
      return <Card key={node.nodeKey}><CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm">{index + 1}</span><div><h2 className="font-semibold">{node.label}</h2><span className="text-xs text-muted-foreground">{t(FLOW_NODE_TYPES[node.type].label)} · {node.owner || t("方法负责人")}</span></div></div>
        {node.childWorkflowId ? <Link className="text-sm text-teal-700" to={`/workflows/${node.childWorkflowId}`}>{t("查看子方法要求")}</Link> : <>
          <div className="grid gap-3 md:grid-cols-3">{(["input", "output", "completion"] as const).map((key, i) => <div key={key}><Label>{t(["输入要求", "预期产物", "完成标准"][i])}</Label>{editing ? <Textarea className="mt-1" aria-label={`${node.label} · ${t(["输入要求", "预期产物", "完成标准"][i])}`} value={rule[key]} onChange={e => patch(node.nodeKey, { [key]: e.target.value })} /> : <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{rule[key] || t("待方法负责人补充")}</p>}</div>)}</div>
          {editing ? <label className="flex gap-2 text-sm"><input type="checkbox" checked={rule.resultRequired} onChange={e => patch(node.nodeKey, { resultRequired: e.target.checked })}/>{t("此步骤要求逐样本结果与原始文件")}</label> : rule.resultRequired && <Badge variant="outline">{t("此步骤要求逐样本结果与原始文件")}</Badge>}
          <ScientificStep rule={rule} editing={editing} change={value => patch(node.nodeKey, value)}/>
          <StepRecordRequirements rule={rule} editing={editing} change={value => patch(node.nodeKey, value)} nodeKey={node.nodeKey} nodes={displayed.nodes} edges={displayed.edges} method={displayed.spec}/>
          {node.type === "equipment" && <div className="space-y-3 border-t pt-3"><Label>{t("经过本方法验证的设备")}</Label>
            {editing ? <><p className="text-sm text-muted-foreground">{equipment.data?.filter(device => rule.equipmentIds.includes(device.id)).map(device => device.name).join(" · ") || t("尚未验证设备")}</p><details><summary className="cursor-pointer text-sm">{t("选择验证设备")}</summary><Input className="my-2" aria-label={t("搜索设备名称或型号")} placeholder={t("搜索设备名称或型号")} value={equipmentSearch[node.nodeKey] ?? ""} onChange={event => setEquipmentSearch(current => ({ ...current, [node.nodeKey]: event.target.value }))}/><p className="mb-2 text-xs text-muted-foreground">{t("默认显示已选设备，搜索可添加其他设备；勾选前需完成方法验证。")}</p><div className="grid max-h-60 gap-2 overflow-auto md:grid-cols-2">{equipment.data?.filter(device => (equipmentSearch[node.nodeKey] ?? "").trim() ? `${device.name} ${device.model}`.toLowerCase().includes(equipmentSearch[node.nodeKey].trim().toLowerCase()) : rule.equipmentIds.includes(device.id)).map(device => <label className="flex items-center gap-2 text-sm" key={device.id}><input type="checkbox" checked={rule.equipmentIds.includes(device.id)} onChange={e => patch(node.nodeKey, { equipmentIds: e.target.checked ? [...rule.equipmentIds, device.id] : rule.equipmentIds.filter(id => id !== device.id) })} />{device.name} · {device.model}</label>)}</div></details>
              <Label>{t("验证依据或记录编号")}<Textarea value={rule.qualification} onChange={e => patch(node.nodeKey, { qualification: e.target.value })} /></Label>
              <label className="flex gap-2 text-sm"><input type="checkbox" checked={rule.manualAllowed} onChange={e => patch(node.nodeKey, { manualAllowed: e.target.checked })} />{t("允许人工操作设备并提交原始证据")}</label>
            </> : <p className="text-sm text-muted-foreground">{equipment.data?.filter(d => rule.equipmentIds.includes(d.id)).map(d => d.name).join(" · ") || t("尚未验证设备")}</p>}
          </div>}
          {node.type === "timer" && editing && <Label>{t("等待时长（分钟）")}<Input type="number" min={0} max={10080} value={rule.waitMinutes ?? ""} onChange={e => patch(node.nodeKey, { waitMinutes: e.target.value === "" ? undefined : Number(e.target.value) })} /></Label>}
          {!!fields.length && editing && <details><summary className="cursor-pointer text-sm">{t("批次可调整的参数")}</summary><div className="mt-3 space-y-3">{fields.map(field => {
            const policy = rule.parameters[field.key] ?? { adjustable: false };
            return <div key={field.key} className="flex flex-wrap items-center gap-3 text-sm"><label className="flex gap-2"><input type="checkbox" checked={policy.adjustable} onChange={e => patch(node.nodeKey, { parameters: { ...rule.parameters, [field.key]: { ...policy, adjustable: e.target.checked } } })} />{t(field.label)} {field.unit}</label>{field.type === "number" && policy.adjustable && <>{(["min", "max"] as const).map(bound => <Input key={bound} className="w-28" type="number" aria-label={t(bound === "min" ? "最小值" : "最大值")} placeholder={t(bound === "min" ? "最小值" : "最大值")} value={policy[bound] ?? ""} onChange={e => patch(node.nodeKey, { parameters: { ...rule.parameters, [field.key]: { ...policy, [bound]: e.target.value === "" ? undefined : Number(e.target.value) } } })} />)}</>}</div>;
          })}</div></details>}
        </>}
      </CardContent></Card>;
    })}</div>
    {editing && <Card><CardContent className="space-y-4 p-5"><h2 className="font-semibold">{t("版本与复核")}</h2>
      {!releases.data?.length && <p className="text-sm text-muted-foreground">{t("尚无发布版本。历史流程需检查后发布，不能直接作为客户方法使用。")}</p>}
      {canReview && <Label>{t("复核结论或停用原因")}<Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} /></Label>}
      {releases.data?.map(release => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={release.id}><div><strong>V{release.version}</strong> <Badge variant="outline">{t(release.status === "review" ? "待复核" : release.status === "published" ? "已发布" : "已停用")}</Badge><p className="mt-1 text-xs text-muted-foreground">{release.submittedByName} · {release.reviewedByName} · {release.reviewNote}</p>
        <VersionChanges snapshot={release.snapshot} previous={releases.data?.find(r => r.version < release.version)?.snapshot} />
        <details className="mt-2 text-xs"><summary className="cursor-pointer">{t("查看此版本的冻结定义")}</summary><pre className="mt-2 max-h-80 max-w-[70vw] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3">{JSON.stringify(JSON.parse(release.snapshot), null, 2)}</pre></details></div>
        {canReview && release.status !== "retired" && <div className="flex gap-2">{release.status === "review" && <Button disabled={!reviewNote.trim() || review.isPending} onClick={() => review.mutate({ id: release.id, decision: "publish", note: reviewNote })}>{t("复核并发布")}</Button>}<Button variant="ghost" disabled={!reviewNote.trim() || review.isPending} onClick={() => review.mutate({ id: release.id, decision: "retire", note: reviewNote })}>{t("停用此版本")}</Button></div>}
      </div>)}
    </CardContent></Card>}
    </fieldset>
  </div>;
}

function VersionChanges({ snapshot, previous }: { snapshot: string; previous?: string }) {
  const { t } = useI18n();
  const changes = methodDifferences(previous ? JSON.parse(previous) : undefined, JSON.parse(snapshot));
  const labels = { added: "新增步骤", removed: "删除步骤", changed: "步骤内容或执行要求变更", routing: "步骤顺序或分支变更", batch: "批次要求变更", view: "BioView 实验视图变更" };
  return <div className="mt-3 text-sm"><strong>{t("与上一版本比较")}</strong>{changes.length ? <ul className="mt-1 list-disc pl-5">{changes.map((change, i) => <li key={i}>{t(labels[change.kind])}{change.label ? `：${change.label}` : ""}</li>)}</ul> : <p>{t("执行要求未变化")}</p>}</div>;
}
