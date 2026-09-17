import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { Download, Grid2X2, History, Save, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import type { AppRouter } from "../../../api/router";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { buildCloningPlan, cloningCSV, CLONING_STAGES, CLONING_WELLS, DEFAULT_CLONING_CONFIG, padTarget, type CloningConfig, type CloningEntity, type CloningMode, type CloningPlan, type CloningPlate, type CloningStage, type CloningStageKey } from "@contracts/cloningLayout";
import "@/features/cloning-planner/planner.css";

type SavedPlan = inferRouterOutputs<AppRouter>["cloningLayout"]["byId"];
export type PlateWorkflow = NonNullable<inferRouterOutputs<AppRouter>["workflow"]["byId"]>;
import { nodePlateStage } from "./workflowPlateContext";
type WorkspaceProps = {
  workflow: PlateWorkflow;
  nodeKey?: string;
  planId?: number;
  onVersionSelect: (id: number) => void;
  onShowGraph: () => void;
};
const selectClass = "h-9 rounded-md border bg-background px-2 text-xs min-w-0";
const PHASES: { title: string; subtitle: string; groups: CloningStageKey[][]; handoff: string }[] = [
  { title: "扩增与纯化", subtitle: "A 模板 + B / C 引物 + D 试剂 → E PCR → F 纯化", groups: [["A", "B", "C"], ["E"], ["F"]], handoff: "PCR 与纯化质控后继续；不同步骤允许重新分配孔位。" },
  { title: "组装与转化", subtitle: "F 插入片段 + 载体 → G 组装 → H 转化 → I 独立平皿", groups: [["F"], ["G"], ["H"]], handoff: "每目标预留一个独立培养皿；形成菌落后挑取候选。" },
  { title: "候选克隆与筛选", subtitle: "I → J 母培养物 → K 筛选；依据 K 结果从 J 择一进入 L", groups: [["J"], ["K"], ["L"]], handoff: "K 提供筛选结果，J 提供培养来源；L 仅预留容量，克隆身份待确认。" },
  { title: "测序与交付", subtitle: "M → N 双向测序 / O 交付；L → P 菌种；N 结果用于放行", groups: [["M"], ["N"], ["O"], ["P"]], handoff: "交付质粒来自 M，菌种来自 L；不将测序反应产物作为交付来源。" },
];

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lives inside the existing WorkflowEditor; context is inherited, never selected here. */
export default function WorkflowPlateWorkspace(props: WorkspaceProps) {
  const { t } = useI18n();
  const versions = trpc.cloningLayout.list.useQuery({ workflowId: props.workflow.id });
  if (versions.isLoading) return <p className="p-4">{t("加载中…")}</p>;
  if (versions.error) return <p role="alert" className="p-4 text-destructive">{t(versions.error.message)}</p>;
  return <LoadedWorkspace key={props.workflow.id} {...props} initialPlanId={versions.data?.[0]?.id} />;
}

function LoadedWorkspace(props: WorkspaceProps & { initialPlanId?: number }) {
  const { t } = useI18n();
  // Pin the starting version so a background list refresh never discards an edited draft.
  const [startingPlanId] = useState(props.initialPlanId);
  const id = props.planId ?? startingPlanId;
  const saved = trpc.cloningLayout.byId.useQuery({ id: id ?? 0 }, { enabled: !!id });
  if (id && saved.isLoading) return <p className="p-4">{t("加载中…")}</p>;
  if (saved.error) return <p role="alert" className="p-4 text-destructive">{t(saved.error.message)}</p>;
  if (saved.data && saved.data.workflowId !== props.workflow.id) return <p role="alert" className="p-4 text-destructive">{t("此方案不属于当前业务流")}</p>;
  if (props.nodeKey && !props.workflow.nodes.some(n => n.nodeKey === props.nodeKey)) return <p role="alert" className="p-4 text-destructive">{t("关联节点不存在，请先保存流程图")}</p>;
  return <PlannerWorkspace key={`${props.workflow.id}:${id ?? "draft"}`} {...props} record={saved.data} />;
}

function PlannerWorkspace({ record, workflow, nodeKey: focusNodeKey, onVersionSelect, onShowGraph }: WorkspaceProps & { record?: SavedPlan }) {
  const { t } = useI18n(), { user } = useAuth(), utils = trpc.useUtils();
  const workflowId = workflow.id;
  const nodeKey = focusNodeKey ?? record?.nodeKey ?? "";
  const node = workflow.nodes.find(n => n.nodeKey === nodeKey);
  const stageKey = nodePlateStage(node?.templateKey);
  const phase = CLONING_STAGES.find(s => s.key === stageKey)?.phase;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<CloningConfig>(record?.plan.config ?? DEFAULT_CLONING_CONFIG);
  const [numberDraft, setNumberDraft] = useState(String(config.samples));
  const [mode, setMode] = useState<CloningMode>(record?.plan.mode ?? "recommended");
  const [name, setName] = useState(record?.name ?? t("高通量分子克隆规划"));
  const [target, setTarget] = useState(1), [targetDraft, setTargetDraft] = useState("1"), [hoverTarget, setHoverTarget] = useState<number | null>(null);
  const [modal, setModal] = useState<"atlas" | "mapping" | "materials" | "entity" | null>(null);
  const [detail, setDetail] = useState<CloningEntity | null>(null), [atlasStage, setAtlasStage] = useState("all"), [atlasPage, setAtlasPage] = useState(0);
  const [mappingStage, setMappingStage] = useState<CloningStageKey>("E"), [search, setSearch] = useState("");
  const versions = trpc.cloningLayout.list.useQuery({ workflowId });
  const pair = useMemo(() => ({ compact: buildCloningPlan(config, "compact"), recommended: buildCloningPlan(config, "recommended") }), [config]);
  const layoutUnchanged = record && JSON.stringify(config) === JSON.stringify(record.plan.config) && mode === record.plan.mode;
  const unchanged = layoutUnchanged && name === record.name && nodeKey === (record.nodeKey ?? "");
  const plan = layoutUnchanged ? record.plan : pair[mode];
  const allPlates = plan.stages.flatMap(s => s.plates), entities = allPlates.flatMap(p => [...p.samples, ...p.controls]);
  const targetEntities = entities.filter(e => e.target === target);
  const numberValid = /^\d+$/.test(numberDraft) && Number(numberDraft) >= 1 && Number(numberDraft) <= 1536;
  const writable = user?.role !== "viewer" && !!workflow && !["completed", "archived"].includes(workflow.status);
  const pendingRequest = useRef<{ signature: string; expectedVersion: number; key: string } | null>(null);
  const save = trpc.cloningLayout.save.useMutation({
    onSuccess: async result => { pendingRequest.current = null; await utils.cloningLayout.list.invalidate(); toast.success(t("排板方案已保存为 V{version}", { version: result.version })); onVersionSelect(result.id); },
    onError: error => { toast.error(t(error.message)); if (error.data?.code === "CONFLICT") { pendingRequest.current = null; void versions.refetch(); } },
  });
  function saveVersion() {
    if (!workflowId || !numberValid || !versions.data || !writable) return;
    const signature = JSON.stringify({ workflowId, nodeKey, name, config, mode });
    if (pendingRequest.current?.signature !== signature) pendingRequest.current = { signature, expectedVersion: Math.max(0, ...versions.data.filter(v => v.workflowId === workflowId).map(v => v.version)), key: crypto.randomUUID() };
    save.mutate({ workflowId, nodeKey: nodeKey || null, name, config, mode, expectedVersion: pendingRequest.current.expectedVersion, idempotencyKey: pendingRequest.current.key });
  }
  function choose(n: number) { if (Number.isInteger(n) && n > 0 && n <= config.samples) { setTarget(n); setTargetDraft(String(n)); } }
  function updateConfig(next: CloningConfig) { setConfig(next); setNumberDraft(String(next.samples)); if (target > next.samples) { setTarget(next.samples); setTargetDraft(String(next.samples)); } }
  function openEntity(entity: CloningEntity) { setDetail(entity); setModal("entity"); }
  const percentage = (n: number | null) => n === null ? "—" : `${Math.round(n * 100)}%`;
  const extra = pair.recommended.summary.plates - pair.compact.summary.plates;
  const balanced = pair.recommended.stages.filter(s => s.balanced).map(s => s.key).join(" / ");
  const atlas = atlasStage === "all" ? allPlates : allPlates.filter(p => p.stage === atlasStage);
  const mappingRows = entities.filter(e => e.stage === mappingStage && (!search || `${e.id} ${e.container} ${e.well} TGT-${e.target ? padTarget(e.target) : ""}`.toLowerCase().includes(search.toLowerCase())));
  const pick = (e: CloningEntity) => { if (e.target) choose(e.target); else openEntity(e); };

  return <div ref={workspaceRef} className="cloning-planner space-y-4 p-1">
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{t("分子克隆 · 全流程排板")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{node ? t("当前节点：{node}；排板方案覆盖整个流程。", { node: node.label }) : t("当前业务流的样本、容器与孔位统一规划。")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{workflow.projectName ?? workflow.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{t("虚拟来源 · 规划草稿")}</Badge>
          {phase && <Button variant="outline" size="sm" onClick={() => workspaceRef.current?.querySelector(`[data-phase="${phase}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t("定位节点孔板")}</Button>}
          <Button variant="outline" size="sm" onClick={onShowGraph}>{t("查看流程图")}</Button>
          <Button variant="outline" size="sm" onClick={() => downloadFile(`cloning-${config.samples}.json`, JSON.stringify({ association: { workflowId, nodeKey, projectId: workflow.projectId, savedPlanId: unchanged ? record?.id : null, version: unchanged ? record?.version : null }, plan }, null, 2), "application/json")}><Download className="mr-1 h-4 w-4" />JSON</Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
        <label className="grid min-w-48 flex-1 gap-1.5 text-xs">{t("方案名称")}<Input className="h-9 text-xs" value={name} onChange={e => setName(e.target.value)} maxLength={255} /></label>
        <label className="grid gap-1.5 text-xs">{t("方案版本")}<select className={cn(selectClass, "max-w-64")} value={record?.id ?? ""} onChange={e => onVersionSelect(Number(e.target.value))} aria-label={t("方案版本")}>
          {!record && <option value="">{t("未保存草稿")}</option>}{versions.data?.map(v => <option key={v.id} value={v.id}>V{v.version} · {t("{n} 样本 / {p} 板", { n: v.sampleCount, p: v.plateCount })}</option>)}
        </select></label>
        <Button size="sm" className="h-9 bg-teal-600 hover:bg-teal-500" disabled={!writable || !numberValid || !name.trim() || save.isPending || !versions.data} onClick={saveVersion}><Save className="mr-1 h-4 w-4" />{save.isPending ? t("保存中…") : record ? t("另存新版本") : t("保存排板方案")}</Button>
      </div>
      {record && <p className="mt-2 text-[11px] text-muted-foreground">V{record.version} · {record.createdByName} · {new Date(record.createdAt).toLocaleString()} · {t(record.nodeLabel ? "保存来源节点：{node}" : "流程级计划", { node: record.nodeLabel ?? "" })}{(!unchanged || name !== record.name) && <span className="ml-2 text-amber-700">{t("未保存更改")}</span>}</p>}
    </section>

    <section className="rounded-xl border bg-card p-4"><h2 className="mb-3 text-sm font-semibold">{t("排板条件")}</h2><div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-1.5 text-xs">{t("输入样本数量")}<Input aria-label={t("输入样本数量")} type="number" min={1} max={1536} value={numberDraft} onChange={e => { setNumberDraft(e.target.value); const n = Number(e.target.value); if (/^\d+$/.test(e.target.value) && n >= 1 && n <= 1536) { setConfig({ ...config, samples: n }); if (target > n) choose(n); } }} /><small className="text-muted-foreground">{t("1–1536 个独立目标")}</small></label><label className="grid gap-1.5 text-xs">{t("每样本候选克隆")}<select className={selectClass} aria-label={t("每样本候选克隆")} value={config.clones} onChange={e => updateConfig({ ...config, clones: Number(e.target.value) })}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select><small className="text-muted-foreground">{t("J / K 按候选数扩展")}</small></label><label className="grid gap-1.5 text-xs">{t("PCR 每板对照")}<select className={selectClass} aria-label={t("PCR 每板对照")} value={config.controls} onChange={e => updateConfig({ ...config, controls: Number(e.target.value) as 0 | 2 | 4 })}>{[0, 2, 4].map(n => <option key={n} value={n}>{t("{n} 孔", { n })}</option>)}</select><small className="text-muted-foreground">{t("只占 E / K 板，NTC / POS 配对预留")}</small></label></div>{!numberValid && <p className="mt-2 text-xs text-destructive" role="alert">{t("请输入 1–1536 的整数；仍显示上一次有效排布。")}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{([
        ["edge", "反应板边缘孔避让", "E / G / K 仅使用内圈 60 孔"], ["group", "候选克隆尽量同板", "推荐时将 J / K 候选成组排入"],
        ["column", "按列遍历孔位", "推荐使用 A→H 顺序，跳过不可用孔"], ["balance", "均衡低占用尾板", "尾板低于 25% 时均分本步骤任务"],
      ] as const).map(([key, label, note]) => <label key={key} className={cn("flex cursor-pointer gap-2 rounded-lg border p-3", config[key] && "border-teal-200 bg-teal-50/60")}><input className="mt-0.5 accent-teal-600" type="checkbox" checked={config[key]} onChange={e => updateConfig({ ...config, [key]: e.target.checked })} /><span><b className="text-xs font-medium">{t(label)}</b><small className="mt-1 block text-[10px] text-muted-foreground">{t(note)}</small></span></label>)}</div><div className="mt-3 flex flex-wrap gap-2">{[[24, 2, false], [96, 2, false], [96, 2, true], [200, 3, false]].map(([n, c, edge], i) => <Button key={i} variant="outline" size="sm" onClick={() => updateConfig({ ...DEFAULT_CLONING_CONFIG, samples: Number(n), clones: Number(c), edge: Boolean(edge), column: i === 3 })}>{t("{n} 样本", { n: Number(n) })}{edge ? ` · ${t("避边")}` : c === 3 ? ` · ${t("3 候选")}` : ""}</Button>)}</div>
    </section>

    <div className="grid gap-3 md:grid-cols-2">{(["compact", "recommended"] as const).map(key => <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)} className={cn("rounded-xl border bg-card p-4 text-left", mode === key && "border-teal-600 ring-1 ring-teal-600")}><div className="flex items-center justify-between text-sm font-semibold">{t(key === "compact" ? "紧凑方案" : "条件推荐方案")}{mode === key && <Badge variant="secondary">{t("当前方案")}</Badge>}</div><div className="mt-3 flex gap-7"><div><strong className="text-2xl">{pair[key].summary.plates}</strong><small className="block text-[10px] text-muted-foreground">{t("全部孔板")}</small></div><div><strong>{pair[key].summary.splits}</strong><small className="block text-[10px] text-muted-foreground">{t("J / K 跨板目标次数")}</small></div><div><strong>{percentage(pair[key].summary.minReactionTail)}</strong><small className="block text-[10px] text-muted-foreground">{t("E / K 最低尾板占用")}</small></div></div><p className="mt-3 text-xs text-muted-foreground">{t(key === "compact" ? "逐行填满前板；允许候选跨板分配。" : "按所选偏好组合成组、遍历与均衡规则。")}</p></button>)}</div>
    <p className="text-xs leading-6 text-teal-800">{t("E / K 每板可排 {n} 个样本反应，对照另占 {q} 孔。", { n: (config.edge ? 60 : 96) - config.controls, q: config.controls })} {balanced && t("推荐均衡步骤：{steps}。", { steps: balanced })} {extra ? t("候选同板使推荐方案额外使用 {n} 块板。", { n: extra }) : t("两种方案的孔板总数相同。")}</p>
    <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 md:grid-cols-5">{[[t("独立目标"), config.samples], [t("候选克隆"), config.samples * config.clones], [t("全部孔板"), plan.summary.plates], [t("对照 / 避让孔"), `${plan.summary.controlWells} / ${plan.summary.blockedWells}`], [t("物理孔位占用"), percentage(plan.summary.occupancy)]].map(([label, value]) => <div key={label}><small className="text-xs text-muted-foreground">{label}</small><strong className="mt-1 block text-xl">{value}</strong></div>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Grid2X2 className="h-4 w-4 text-teal-600" />{t("全流程孔板与样本流向")}</h2><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setAtlasPage(0); setModal("atlas"); }}>{t("全部孔板")}</Button><Button variant="outline" size="sm" onClick={() => setModal("mapping")}>{t("映射详情")}</Button><Button variant="outline" size="sm" onClick={() => downloadFile(`cloning-${config.samples}.csv`, cloningCSV(plan), "text/csv;charset=utf-8")}>{t("导出孔位 CSV")}</Button></div></div>
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3"><label className="text-xs">{t("追踪目标")}</label><span className="font-mono text-xs">TGT-</span><Input className="h-8 w-20 text-xs" aria-label={t("追踪目标")} type="number" min={1} max={config.samples} value={targetDraft} onChange={e => setTargetDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") choose(Number(targetDraft)); }} /><Button size="sm" variant="outline" onClick={() => choose(Number(targetDraft))}>{t("定位")}</Button><span className="text-xs text-muted-foreground">{hoverTarget ? `TGT-${padTarget(hoverTarget)}` : t("悬停查看样本，点击锁定跨板追踪")}</span><span className="ml-auto text-[10px] text-muted-foreground">{t("N / P 为对照；× 为避让；· 为空孔")}</span></div>

    {PHASES.map((phase, i) => <section key={i} className="rounded-xl border bg-card" data-phase={i + 1}><div className="flex items-center justify-between gap-3 border-b p-4"><div><h3 className="font-semibold"><span className="mr-2 text-teal-700">0{i + 1}</span>{t(phase.title)}</h3><p className="mt-1 text-[11px] text-muted-foreground">{t(phase.subtitle)}</p></div><Badge variant="outline">{t("{n} 块板", { n: plan.stages.filter(s => s.phase === i + 1).reduce((n, s) => n + s.plates.length, 0) })}</Badge></div>{i === 0 && <div className="flex flex-wrap gap-3 bg-muted/30 px-4 py-2 text-xs"><b>{t("D · 共用试剂架")}</b><code>RACK-PLAN-001</code><button className="text-teal-700" onClick={() => setModal("materials")}>{t("试剂编码与物料详情")} ↗</button></div>}{i === 1 && <div className="bg-muted/30 px-4 py-2 text-xs text-muted-foreground">{t("复用 F 纯化板；另有 {n} 个 I 独立培养皿，不计入孔板数量。", { n: plan.dishes.length })}</div>}<div className={cn("grid gap-4 p-4", i === 3 ? "lg:grid-cols-2 2xl:grid-cols-4" : "xl:grid-cols-3")}>
      {phase.groups.map(keys => <PlateGroup key={`${keys[0]}-${target}-${JSON.stringify(config)}-${mode}`} keys={keys} plan={plan} target={target} hovered={hoverTarget} onHover={setHoverTarget} onPick={pick} onDetail={openEntity} onAtlas={key => { setAtlasStage(key); setAtlasPage(0); setModal("atlas"); }} />)}
    </div><div className="border-t bg-teal-50/40 px-4 py-3"><div className="mb-2 text-xs font-medium text-teal-800">TGT-{padTarget(target)} · {t("孔位追溯")}</div><div className="flex flex-wrap items-center gap-1.5">{targetEntities.filter(e => phase.groups.flat().includes(e.stage as CloningStageKey)).map(e => <button key={e.id} onClick={() => openEntity(e)} className="rounded border bg-background px-2 py-1 font-mono text-[10px] hover:border-teal-500">{e.stage} · {e.container}:{e.well}{e.cloneId ? ` / C${e.branch}` : e.stage === "N" ? e.branch === 1 ? " / F" : " / R" : ""}</button>)}</div><p className="mt-2 text-[11px] text-muted-foreground">{t(phase.handoff)}</p></div></section>)}

    <details className="rounded-xl border bg-card p-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />{t("已保存的方案版本")}</summary><p className="mt-1 text-xs text-muted-foreground">{t("每次保存产生独立快照和活动记录；历史版本可打开和导出。显示最近 100 条。")}</p><div className="mt-3 grid gap-2 md:grid-cols-2">{versions.data?.map(v => <button key={v.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:border-teal-400" onClick={() => onVersionSelect(v.id)}><div><span className="text-xs font-medium">{v.name} · V{v.version}</span><small className="mt-1 block text-[10px] text-muted-foreground">{v.workflowName}{v.nodeLabel ? ` / ${v.nodeLabel}` : ""}</small></div><span className="text-xs text-teal-700">{t("{n} 样本 / {p} 板", { n: v.sampleCount, p: v.plateCount })} ↗</span></button>)}</div>{!versions.data?.length && <p className="mt-3 text-xs text-muted-foreground">{t("暂无已保存方案")}</p>}</details>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground"><span>{t("当前为虚拟来源规划。执行前需绑定真实样本、试剂用量、SOP 和设备；保存排板不会扣减库存或自动产生实验结果。")}</span><Link className="shrink-0 text-teal-700" to="/activity">{t("查看活动日志")} ↗</Link></div>

    <Dialog open={modal !== null} onOpenChange={open => { if (!open) setModal(null); }}><DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[1200px]"><DialogHeader><DialogTitle>{t(modal === "atlas" ? "全部孔板" : modal === "mapping" ? "映射详情" : modal === "materials" ? "D · 共用试剂架" : "样本与孔位详情")}</DialogTitle><DialogDescription>{t("计划样本与容器分别编码；物料流、待选来源和结果依据分别记录。")}</DialogDescription></DialogHeader>
      {modal === "entity" && detail && <div className="max-w-2xl"><EntityDetails entity={detail} /></div>}
      {modal === "materials" && <div className="grid gap-3 md:grid-cols-3">{plan.materials.map(m => <div key={m.id} className="rounded-lg border p-3"><h3 className="text-sm font-medium">{t(m.name)}</h3><p className="mt-2 font-mono text-xs">{m.id}<br />{m.container}<br />RACK-PLAN-001 : {m.slot}<br />{m.lot}</p><p className="mt-2 text-xs text-muted-foreground">{t("示例物料；配方与用量待配置")}</p></div>)}</div>}
      {modal === "atlas" && <><div className="flex items-center gap-3"><select aria-label={t("查看步骤")} className={selectClass} value={atlasStage} onChange={e => { setAtlasStage(e.target.value); setAtlasPage(0); }}><option value="all">{t("全部流程")}</option>{plan.stages.map(s => <option value={s.key} key={s.key}>{s.key} · {t(s.name)} ({s.plates.length})</option>)}</select><span className="text-xs text-muted-foreground">{t("{n} 块板", { n: atlas.length })}</span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{atlas.slice(atlasPage * 18, atlasPage * 18 + 18).map(p => <div key={p.id} className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold">{p.stage} · {t(plan.stages.find(s => s.key === p.stage)!.name)}</p><code className="mb-2 block text-xs">{p.id}</code><PlateGrid plate={p} target={target} hovered={hoverTarget} onHover={setHoverTarget} onPick={e => { if (e.target) { choose(e.target); setModal(null); } else openEntity(e); }} /></div>)}</div><div className="flex items-center justify-center gap-4"><Button variant="outline" size="sm" disabled={atlasPage === 0} onClick={() => setAtlasPage(atlasPage - 1)}>{t("上一页")}</Button><span className="text-xs">{atlasPage + 1} / {Math.ceil(atlas.length / 18)}</span><Button variant="outline" size="sm" disabled={(atlasPage + 1) * 18 >= atlas.length} onClick={() => setAtlasPage(atlasPage + 1)}>{t("下一页")}</Button></div></>}
      {modal === "mapping" && <><div className="flex flex-wrap gap-2"><select aria-label={t("查看步骤")} className={selectClass} value={mappingStage} onChange={e => setMappingStage(e.target.value as CloningStageKey)}>{plan.stages.map(s => <option key={s.key} value={s.key}>{s.key} · {t(s.name)}</option>)}</select><Input className="w-64" aria-label={t("检索样本或容器")} placeholder={t("检索样本或容器")} value={search} onChange={e => setSearch(e.target.value)} /><span className="text-xs">{t("匹配 {n} 条，最多展示 300 条；导出包含全部孔位。", { n: mappingRows.length })}</span></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["目标", "样本编码", "容器 / 孔位", "计划来源"].map(h => <th className="border-b p-2" key={h}>{t(h)}</th>)}</tr></thead><tbody>{mappingRows.slice(0, 300).map(e => <tr key={e.id}><td className="border-b p-2">{e.target ? `TGT-${padTarget(e.target)}` : e.control}</td><td className="border-b p-2"><button className="text-teal-700" onClick={() => openEntity(e)}>{e.id}</button></td><td className="border-b p-2 font-mono">{e.container}:{e.well}</td><td className="border-b p-2">{e.parents.map(p => `${p.id} (${t(p.kind === "material" ? "计划物料流" : p.kind === "conditional" ? "待选来源" : "结果依据")})`).join("; ") || t("虚拟输入 / 对照预留")}</td></tr>)}</tbody></table></div></>}
    </DialogContent></Dialog>
  </div>;
}

function PlateGroup({ keys, plan, target, hovered, onHover, onPick, onDetail, onAtlas }: { keys: CloningStageKey[]; plan: CloningPlan; target: number; hovered: number | null; onHover: (n: number | null) => void; onPick: (e: CloningEntity) => void; onDetail: (e: CloningEntity) => void; onAtlas: (k: CloningStageKey) => void }) {
  const { t } = useI18n(); const [key, setKey] = useState(keys[0]);
  const stage = plan.stages.find(s => s.key === key)!;
  return <div className="min-w-0 rounded-lg border p-3"><div className="mb-3 flex items-center justify-between gap-2"><div className="flex flex-wrap gap-1">{keys.map(k => <button key={k} className={cn("rounded px-2 py-1 text-xs", key === k ? "bg-teal-50 font-medium text-teal-800" : "text-muted-foreground")} onClick={() => setKey(k)}>{k} · {t(plan.stages.find(s => s.key === k)!.name)}</button>)}</div><button className="shrink-0 text-[10px] text-teal-700" onClick={() => onAtlas(key)}>{t("{n} 块板", { n: stage.plates.length })} ↗</button></div><StagePlate key={key} stage={stage} target={target} hovered={hovered} onHover={onHover} onPick={onPick} onDetail={onDetail} /></div>;
}

function StagePlate({ stage, target, hovered, onHover, onPick, onDetail }: { stage: CloningStage; target: number; hovered: number | null; onHover: (n: number | null) => void; onPick: (e: CloningEntity) => void; onDetail: (e: CloningEntity) => void }) {
  const { t } = useI18n(); const initial = Math.max(0, stage.plates.findIndex(p => p.samples.some(e => e.target === target)));
  const [index, setIndex] = useState(initial); const plate = stage.plates[index], selected = plate.samples.filter(e => e.target === target);
  return <><div className="flex justify-between gap-2 text-[10px] text-muted-foreground"><code>{plate.id}</code><span>{t("{n} 样本 + {q} 对照", { n: plate.samples.length, q: plate.controls.length })}</span></div><select className={cn(selectClass, "my-2 w-full")} aria-label={t("{stage} 孔板切换", { stage: stage.key })} value={index} onChange={e => setIndex(Number(e.target.value))}>{stage.plates.map((p, i) => <option key={p.id} value={i}>{i + 1} / {stage.plates.length} · {p.id}</option>)}</select><PlateGrid plate={plate} target={target} hovered={hovered} onHover={onHover} onPick={onPick} /><div className="mt-3 flex items-start justify-between gap-2 border-t pt-2"><div className="text-xs">{selected.length ? <><b>TGT-{padTarget(target)} · {selected.map(e => e.well).join(" / ")}</b><small className="mt-1 block text-[10px] text-muted-foreground">{selected.map(e => e.id).join(" / ")}</small></> : <span className="text-muted-foreground">{t("本板没有当前目标")}</span>}</div>{selected[0] && <button className="shrink-0 text-[10px] text-teal-700" onClick={() => onDetail(selected[0])}>{t("孔详情")} ↗</button>}</div><p className="mt-2 text-[10px] text-muted-foreground">{t("空闲 {n} 孔 · 避让 {b} 孔", { n: plate.free, b: plate.blocked.length })}</p></>;
}

function PlateGrid({ plate, target, hovered, onHover, onPick }: { plate: CloningPlate; target: number; hovered: number | null; onHover: (n: number | null) => void; onPick: (e: CloningEntity) => void }) {
  const { t } = useI18n(); const entries = new Map([...plate.samples, ...plate.controls].map(e => [e.well, e]));
  return <div className="cp-plate" role="group" aria-label={`${plate.id} 96`}><span />{Array.from({ length: 12 }, (_, i) => <span className="cp-axis" key={i}>{i + 1}</span>)}{Array.from({ length: 8 }, (_, r) => <div className="contents" key={r}><span className="cp-axis">{"ABCDEFGH"[r]}</span>{CLONING_WELLS.slice(r * 12, r * 12 + 12).map(well => { const e = entries.get(well), blocked = plate.blocked.includes(well); return <Tooltip key={well}><TooltipTrigger asChild><button data-plate={plate.id} data-well={well} data-target={e?.target ?? ""} data-entity={e?.id ?? ""} aria-pressed={e?.target === target} aria-label={`${plate.id} ${well} ${e?.id ?? t(blocked ? "避让孔" : "可用空孔")}`} className={cn("cp-well", !e && "cp-empty", blocked && "cp-blocked", e?.kind === "control" && "cp-control", e?.target === target && "cp-selected", e?.target && e.target === hovered && "cp-hovered", e?.target && e.target >= 1000 && "cp-long")} onMouseEnter={() => onHover(e?.target ?? null)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(e?.target ?? null)} onBlur={() => onHover(null)} onClick={() => { if (e) onPick(e); }}>{e?.target ?? (e?.control ? e.control === "NTC" ? "N" : "P" : blocked ? "×" : "·")}</button></TooltipTrigger><TooltipContent side="right" sideOffset={8} className="z-[100] max-h-[75vh] w-[360px] max-w-[calc(100vw-24px)] overflow-auto border bg-background p-4 text-foreground shadow-xl">{e ? <EntityDetails entity={e} /> : <p className="text-xs">{plate.id}:{well}<br />{t(blocked ? "避让孔，不分配样本" : "可用空孔")}</p>}</TooltipContent></Tooltip>; })}</div>)}</div>;
}

function EntityDetails({ entity: e }: { entity: CloningEntity }) {
  const { t } = useI18n();
  const fields: [string, string | undefined][] = [["目标", e.target ? `TGT-${padTarget(e.target)}` : e.control], ["样本编码", e.id], ["容器条码", e.container], ["实际位置", e.well], ["状态", t(e.kind === "control" ? "对照预留 · 待执行" : "计划孔位 · 待执行")], ["浓度", e.concentration], ["物料批号", e.lot], ["长度", e.length], ["序列引用", e.sequenceRef], ["引物配对", e.pairId], ["克隆身份", e.cloneId ?? (["L", "M", "N", "O", "P"].includes(e.stage) ? t("待筛选确认，预留一个入选克隆") : undefined)], ["方向", e.stage === "B" || (e.stage === "N" && e.branch === 1) ? t("正向 F") : e.stage === "C" || e.stage === "N" ? t("反向 R") : undefined], ["共用物料", e.materials.join(" / ") || undefined]];
  return <div className="text-left"><div className="mb-3 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-teal-600" /><strong className="text-sm">{e.stage} · {t(CLONING_STAGES.find(s => s.key === e.stage)?.name ?? "独立培养皿")}</strong><Badge variant="outline" className="ml-auto font-mono">{e.well}</Badge></div><dl className="grid grid-cols-[75px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">{fields.filter(([, v]) => v).map(([label, value]) => <div className="contents" key={label}><dt className="text-muted-foreground">{t(label)}</dt><dd className="break-words">{value}</dd></div>)}{e.parents.map(p => <div className="contents" key={`${p.id}-${p.kind}`}><dt className="text-muted-foreground">{t(p.kind === "material" ? "计划来源" : p.kind === "conditional" ? "待选来源" : "结果依据")}</dt><dd className="break-words"><code>{p.id}</code><br /><code className="text-[10px]">{p.container}:{p.well}</code></dd></div>)}</dl><p className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">{t("虚拟规划数据；尚未执行或放行。")}</p></div>;
}


export function NodePlatePreview({ planId, stageKey, onExpand, disabled }: { planId?: number; stageKey?: CloningStageKey; onExpand: () => void; disabled: boolean }) {
  const { t } = useI18n();
  const saved = trpc.cloningLayout.byId.useQuery({ id: planId ?? 0 }, { enabled: !!planId });
  const [target, setTarget] = useState(1), [hover, setHover] = useState<number | null>(null), [detail, setDetail] = useState<CloningEntity | null>(null);
  const stage = saved.data?.plan.stages.find(s => s.key === stageKey);
  return <section className="space-y-3 rounded-lg border border-teal-100 bg-teal-50/30 p-3">
    <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-teal-800">{t("孔板与样本")}</h3>{saved.data && <Badge variant="outline">V{saved.data.version}</Badge>}</div>
    {saved.isLoading && planId && <p className="text-xs text-muted-foreground">{t("加载中…")}</p>}
    {saved.error && <p role="alert" className="text-xs text-destructive">{t(saved.error.message)}</p>}
    {stage && <div className="cloning-planner"><p className="mb-2 text-xs">{stage.key} · {t(stage.name)} · {t("{n} 块板", { n: stage.plates.length })}</p><StagePlate key={`${planId}-${stage.key}`} stage={stage} target={target} hovered={hover} onHover={setHover} onPick={e => e.target ? setTarget(e.target) : setDetail(e)} onDetail={setDetail} /></div>}
    {!planId && <p className="text-xs leading-5 text-muted-foreground">{t("输入样本数量，为当前流程生成孔板；节点内可直接查看样本和来源。")}</p>}
    {saved.data && <p className="text-[10px] text-muted-foreground">{t("全流程方案：{n} 样本 / {p} 板", { n: saved.data.sampleCount, p: saved.data.plateCount })} · {t("虚拟来源 · 规划草稿")}</p>}
    <Button size="sm" variant="outline" className="w-full text-teal-700" disabled={disabled} title={disabled ? t("请先保存流程图") : undefined} onClick={onExpand}>{t(planId ? "在流程内调整排板" : "在流程内生成排板")}</Button>
    <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent><DialogHeader><DialogTitle>{t("孔详情")}</DialogTitle><DialogDescription>{t("虚拟规划数据；尚未执行或放行。")}</DialogDescription></DialogHeader>{detail && <EntityDetails entity={detail} />}</DialogContent></Dialog>
  </section>;
}
