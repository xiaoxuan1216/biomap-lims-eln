import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATE_FORMATS, PLATE_STAGES, PLATE_STAGE_LABELS, plateWells, type PlateConfig, type SamplePlatePlan } from "@contracts/samplePlateLayout";

const copiesLabel = { cloning: "每个样本的候选克隆数", expression: "每组转染重复数", purification: "每个样本的收集组分数", characterization: "每个样本的检测重复数" };
export function SamplePlateView({ plan }: { plan: SamplePlatePlan }) {
  const { t } = useI18n();
  const [plate, setPlate] = useState(1);
  const current = Math.min(plate, plan.plateCount);
  const entries = plan.entries.filter(e => e.plate === current);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3"><strong>{t(PLATE_STAGE_LABELS[plan.config.stage])}</strong><span>{plan.samples.length} {t("样本")} · {plan.plateCount} {t("板/管架")}</span><label>{t("查看板号")} <select className="rounded border p-1" value={current} onChange={e => setPlate(Number(e.target.value))}>{Array.from({ length: plan.plateCount }, (_, i) => <option key={i + 1} value={i + 1}>P{i + 1}</option>)}</select></label></div>
    <p className="text-xs text-muted-foreground">{t("孔位为计划位置；对照位仅预留。实际投料、组分及结果请在执行记录中确认。")}</p>
    <div className="overflow-auto"><div className="grid min-w-[540px] gap-1" style={{ gridTemplateColumns: `repeat(${PLATE_FORMATS[plan.config.format][1]}, minmax(32px, 1fr))` }}>{plateWells(plan.config.format).map(well => { const entry = entries.find(e => e.well === well); return <div key={well} title={entry ? `${entry.label} / ${entry.copy}` : t("未分配")} className={`rounded border p-1 text-center text-xs ${entry?.kind === "control" ? "bg-amber-100" : entry ? "bg-teal-100" : "bg-slate-50 text-slate-400"}`}><b>{well}</b><div className="truncate">{entry ? entry.kind === "control" ? t("对照") : `#${entry.copy}` : "—"}</div></div>; })}</div></div>
    <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>{t("孔位")}</th><th>{t("来源样本")}</th><th>{t("候选/重复/组分")}</th></tr></thead><tbody>{entries.map(e => <tr className="border-t" key={e.well}><td className="py-2">P{current}:{e.well}</td><td>{e.kind === "control" ? `${t("预留对照位")} · ${e.label}` : e.sampleIds.map(id => { const sample = plan.samples.find(s => s.id === id)!; return <div key={id}><Link className="text-teal-700 underline" to={`/samples/${id}`}>{sample.sku} · {sample.name}</Link>{sample.identity && <span> · {sample.identity.antibodyId} / {sample.identity.chain}</span>}</div>; })}</td><td>{e.kind === "sample" ? e.copy : "—"}</td></tr>)}</tbody></table></div>
  </div>;
}

export default function SamplePlateWorkspace({ workflowId, nodes, stage, initialNodeKey }: { workflowId: number; nodes: { nodeKey: string; label: string }[]; stage?: PlateConfig["stage"] | null; initialNodeKey?: string }) {
  const { t } = useI18n();
  const utils = trpc.useUtils();
  const [config, setConfig] = useState<PlateConfig>({ stage: stage ?? "cloning", format: stage === "expression" ? "24" : "96", sampleIds: [], copies: 1, pairChains: stage === "expression", controls: [], avoidEdges: false, order: "row" });
  const [name, setName] = useState("");
  const [nodeKey, setNodeKey] = useState(initialNodeKey ?? "");
  const [search, setSearch] = useState("");
  const [sampleNames, setSampleNames] = useState<Record<number, string>>({});
  const [shown, setShown] = useState<{ plan: SamplePlatePlan; configKey: string } | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const versions = trpc.samplePlate.list.useQuery({ workflowId });
  const candidates = trpc.samplePlate.candidates.useQuery({ search });
  const preview = trpc.samplePlate.preview.useMutation({ onSuccess: (plan, variables) => { setShown({ plan, configKey: JSON.stringify(variables) }); setLoadedVersion(null); }, onError: e => toast.error(t(e.message)) });
  const save = trpc.samplePlate.save.useMutation({ onSuccess: async record => { setShown({ plan: record.plan, configKey: JSON.stringify(record.plan.config) }); setLoadedVersion(record.version); await utils.samplePlate.list.invalidate({ workflowId }); toast.success(t("孔板方案已保存")); }, onError: e => toast.error(t(e.message)) });
  const change = (patch: Partial<PlateConfig>) => { setConfig(current => ({ ...current, ...patch })); setLoadedVersion(null); };
  const stale = !shown || shown.configKey !== JSON.stringify(config);
  return <section className="space-y-5 p-5">
    <div><h2 className="text-lg font-semibold">{t("抗体开发 · 孔板与样本")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("选择实际样本，按阶段生成孔位方案；保存后可在准备实验时选用。")}</p></div>
    {versions.error && <p role="alert">{t(versions.error.message)} <Button onClick={() => versions.refetch()}>{t("重试")}</Button></p>}
    <label className="block text-sm">{t("已保存孔板版本")}<select className="ml-3 max-w-full rounded border p-2" value={loadedVersion ?? ""} onChange={e => { const record = versions.data?.find(v => v.version === Number(e.target.value)); if (record) { setConfig(record.plan.config); setName(record.name); setNodeKey(record.nodeKey ?? ""); setLoadedVersion(record.version); setShown({ plan: record.plan, configKey: JSON.stringify(record.plan.config) }); setSampleNames(Object.fromEntries(record.plan.samples.map(s => [s.id, `${s.sku} · ${s.name}`]))); } }}><option value="">{t("新建孔板方案")}</option>{versions.data?.map(v => <option key={v.id} value={v.version}>V{v.version} · {t(PLATE_STAGE_LABELS[v.plan.config.stage])} · {v.name}</option>)}</select></label>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm">{t("方案名称")}<Input value={name} maxLength={255} onChange={e => setName(e.target.value)}/></label>
      <label className="text-sm">{t("实验阶段")}<select className="block w-full rounded border p-2" value={config.stage} onChange={e => { const stage = e.target.value as PlateConfig["stage"]; change({ stage, pairChains: stage === "expression", copies: 1, format: stage === "expression" ? "24" : "96" }); }}><option value="cloning">{t("分子克隆")}</option>{PLATE_STAGES.slice(1).map(s => <option value={s} key={s}>{t(PLATE_STAGE_LABELS[s])}</option>)}</select></label>
      <label className="text-sm">{t("关联步骤")}<select className="block w-full rounded border p-2" value={nodeKey} onChange={e => setNodeKey(e.target.value)}><option value="">{t("整个方法")}</option>{nodes.map(n => <option key={n.nodeKey} value={n.nodeKey}>{n.label}</option>)}</select></label>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2 rounded-lg border p-3"><h3 className="font-medium">{t("选择来源样本")}</h3><Input aria-label={t("搜索样本编号或名称")} placeholder={t("搜索样本编号或名称")} value={search} onChange={e => setSearch(e.target.value)}/>
        <p className="text-xs">{t("已选样本数")}：{config.sampleIds.length} / 200</p>
        <div className="max-h-32 overflow-auto">{config.sampleIds.map(id => <Button key={id} variant="secondary" size="sm" className="m-1 max-w-full" onClick={() => change({ sampleIds: config.sampleIds.filter(s => s !== id) })}>{sampleNames[id] ?? shown?.plan.samples.find(s => s.id === id)?.sku ?? id} ×</Button>)}</div>
        <div className="max-h-52 overflow-auto">{candidates.data?.map(s => <label className="flex gap-2 border-t py-2 text-sm" key={s.id}><input type="checkbox" checked={config.sampleIds.includes(s.id)} disabled={!config.sampleIds.includes(s.id) && config.sampleIds.length >= 200} onChange={e => { setSampleNames(current => ({ ...current, [s.id]: `${s.sku} · ${s.name}` })); change({ sampleIds: e.target.checked ? [...config.sampleIds, s.id] : config.sampleIds.filter(id => id !== s.id) }); }}/><span>{s.sku} · {s.name}</span></label>)}</div>
        {candidates.error && <p role="alert">{t(candidates.error.message)}</p>}
      </div>
      <div className="space-y-3 rounded-lg border p-3"><h3 className="font-medium">{t("排布设置")}</h3>
        <label className="block text-sm">{t("板型/管架")}<select className="ml-3 rounded border p-2" value={config.format} onChange={e => change({ format: e.target.value as PlateConfig["format"] })}>{Object.keys(PLATE_FORMATS).map(format => <option key={format} value={format}>{format === "rack24" ? t("24 位管架") : `${format} ${t("孔板")}`}</option>)}</select></label>
        <label className="block text-sm">{t(copiesLabel[config.stage])}<Input type="number" min={1} max={24} value={config.copies} onChange={e => change({ copies: Number(e.target.value) })}/></label>
        {config.stage === "expression" && <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.pairChains} onChange={e => change({ pairChains: e.target.checked })}/>{t("按已确认抗体编号配对重轻链，同孔转染")}</label>}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={config.avoidEdges} onChange={e => change({ avoidEdges: e.target.checked })}/>{t("避开边缘孔")}</label>
        <label className="block text-sm">{t("填充顺序")}<select className="ml-3 rounded border p-2" value={config.order} onChange={e => change({ order: e.target.value as PlateConfig["order"] })}><option value="row">{t("逐行")}</option><option value="column">{t("逐列")}</option></select></label>
        <label className="block text-sm">{t("每板预留对照（每行一个名称）")}<textarea className="mt-1 block w-full rounded border p-2" rows={3} value={config.controls.join("\n")} onChange={e => change({ controls: e.target.value ? e.target.value.split("\n") : [] })}/></label>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!config.sampleIds.length || preview.isPending} onClick={() => preview.mutate(config)}>{t("生成孔位预览")}</Button><Button disabled={stale || !name.trim() || save.isPending || !versions.data} onClick={() => save.mutate({ workflowId, nodeKey: nodeKey || null, name, config, expectedVersion: versions.data?.[0]?.version ?? 0, idempotencyKey: crypto.randomUUID() })}>{t("保存孔板新版本")}</Button>{stale && shown && <p className="text-sm text-amber-700">{t("设置已修改，请重新生成预览。")}</p>}{loadedVersion && <span>V{loadedVersion}</span>}</div>
    {shown && !stale && <SamplePlateView plan={shown.plan}/>}
  </section>;
}
