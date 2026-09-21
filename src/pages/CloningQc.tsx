import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CLONING_STAGES, CLONING_WELLS, type CloningPlan, type CloningStageKey } from "@contracts/cloningLayout";
import { MOCK_QC_LABELS, mockSequenceSummary, mockStageQc, type MockWellQc, type MockQcStatus } from "@contracts/cloningMockQc";

const colors: Record<MockQcStatus, string> = { pass: "border-teal-300 bg-teal-50 text-teal-900", review: "border-amber-300 bg-amber-50 text-amber-900", fail: "border-rose-300 bg-rose-50 text-rose-900", pending: "border-slate-200 bg-slate-50 text-slate-500" };
const selectClass = "max-w-full rounded-md border bg-background p-2 text-sm";

export default function CloningQc() {
  const { t } = useI18n();
  const { id } = useParams();
  const workflowId = Number(id);
  const [params, setParams] = useSearchParams();
  const versions = trpc.cloningLayout.list.useQuery({ workflowId }, { enabled: Number.isSafeInteger(workflowId) && workflowId > 0 });
  const planId = params.has("planId") ? Number(params.get("planId")) : versions.data?.[0]?.id;
  const query = trpc.cloningLayout.byId.useQuery({ id: planId ?? 0 }, { enabled: !!planId && Number.isSafeInteger(planId) && planId > 0 });
  const back = `/workflows/${workflowId}/edit?view=plates${planId ? `&planId=${planId}` : ""}`;
  return <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <Link className="inline-flex items-center gap-2 text-sm text-teal-700" to={back}><ArrowLeft size={16}/>{t("返回 A–P 克隆规划")}</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{t("A–P 克隆 · 逐孔 QC")}</h1><p className="mt-1 text-sm text-muted-foreground">{query.data?.workflowId === workflowId ? query.data.workflowName : ""}</p></div></div>
    {versions.isLoading || query.isLoading ? <p>{t("加载中…")}</p> : versions.error || query.error ? <p role="alert">{t((versions.error ?? query.error)!.message)} <Button onClick={() => { void versions.refetch(); void query.refetch(); }}>{t("重试")}</Button></p> : query.data && query.data.workflowId !== workflowId ? <p role="alert">{t("此方案不属于当前业务流")}</p> : !query.data ? <p>{t("请先在 A–P 克隆规划中保存一个排板版本，再查看逐孔 QC。")}</p> : <>
      <label className="flex flex-wrap items-center gap-3 text-sm">{t("方案版本")}<select className={selectClass} aria-label={t("方案版本")} value={planId} onChange={event => setParams({ planId: event.target.value, stage: params.get("stage") ?? "F" })}>{!versions.data?.some(v => v.id === planId) && <option value={planId}>V{query.data.version} · {query.data.name}</option>}{versions.data?.map(v => <option key={v.id} value={v.id}>V{v.version} · {v.name} · {v.sampleCount} {t("样本")}</option>)}</select></label>
      <QcWorkspace key={planId} plan={query.data.plan}/>
    </>}
  </div>;
}

function QcWorkspace({ plan }: { plan: CloningPlan }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const stage = CLONING_STAGES.find(s => s.key === params.get("stage"))?.key ?? "F";
  const rows = useMemo(() => mockStageQc(plan, stage), [plan, stage]);
  const summary = useMemo(() => mockSequenceSummary(plan), [plan]);
  const plates = plan.stages.find(s => s.key === stage)!.plates;
  const plate = plates.find(p => p.id === params.get("plate")) ?? plates[0];
  const selected = rows.find(row => row.entity.container === plate.id && row.entity.well === params.get("well")) ?? rows.find(row => row.entity.container === plate.id);
  const patch = (values: Record<string, string | null>) => setParams(current => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(values)) { if (value === null) next.delete(key); else next.set(key, value); } return next; });
  const changeStage = (value: CloningStageKey) => { patch({ stage: value, plate: null, well: null }); setFilter("all"); setSearch(""); };
  const filtered = rows.filter(row => (filter === "all" || row.status === filter) && `${row.entity.id} ${row.entity.container} ${row.entity.well} TGT-${String(row.entity.target).padStart(3, "0")}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2">{plan.stages.map(s => <Button key={s.key} size="sm" variant={stage === s.key ? "default" : "outline"} onClick={() => changeStage(s.key)}>{s.key} · {t(s.name)}</Button>)}</div>
    <p className="text-xs text-muted-foreground">{t("D 为共用试剂架，I 为独立培养皿。可通过来源链接查看上游孔位结果。")}</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{(["pass", "review", "fail", "pending"] as const).map(status => <button key={status} aria-pressed={filter === status} className={`rounded-lg border p-3 text-left ${colors[status]} ${filter === status ? "ring-2 ring-slate-400" : ""}`} onClick={() => setFilter(filter === status ? "all" : status)}><div className="text-xs">{t(MOCK_QC_LABELS[status])}</div><strong className="mt-1 block text-2xl">{rows.filter(row => row.status === status).length}</strong></button>)}</div>
    {stage === "N" && <div className="rounded-lg border bg-white p-4"><h2 className="font-semibold">{t("测序批次概览")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("按目标去重，F/R 双向孔计为一个目标；同义和 AA 变异目标可重叠。")}</p><div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{[["无变异目标", summary.reference], ["含同义突变目标", summary.synonymous], ["含 AA mutation 目标", summary.aaMutation], ["低覆盖目标", summary.unresolved]].map(([label, count]) => <div key={label}><span className="text-xs">{t(String(label))}</span><p className="font-semibold">{Number(count)} / {summary.targets} · {(Number(count) / (summary.targets || 1) * 100).toFixed(1)}%</p></div>)}</div></div>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-3 rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{t("孔板 QC 热图")}</h2><select className={selectClass} aria-label={t("QC 板号")} value={plate.id} onChange={e => patch({ plate: e.target.value, well: null })}>{plates.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}</select></div>
        <div className="overflow-x-auto"><div className="grid min-w-[480px] grid-cols-12 gap-1">{CLONING_WELLS.map(well => { const row = rows.find(r => r.entity.container === plate.id && r.entity.well === well); return <button key={well} disabled={!row} aria-label={`${plate.id}:${well} ${row ? t(MOCK_QC_LABELS[row.status]) : t(plate.blocked.includes(well) ? "避让孔" : "空孔")}`} aria-pressed={selected?.entity.well === well} onClick={() => patch({ plate: plate.id, well })} title={row?.entity.id} className={`h-11 rounded border text-[10px] ${row ? colors[row.status] : "border-transparent bg-slate-100 text-slate-400"} ${selected?.entity.well === well ? "ring-2 ring-slate-800" : ""}`}><b>{well}</b><span className="block">{row ? row.status === "pass" ? "✓" : row.status === "fail" ? "×" : row.status === "review" ? "!" : "—" : plate.blocked.includes(well) ? "×" : "·"}</span></button>; })}</div></div>
        <p className="text-xs text-muted-foreground">{t("点击孔位查看仪器曲线、检测指标和变异明细。")}</p>
      </section>
      {selected && <WellDetails row={selected} onSource={(container, well, entityId) => { const found = plan.stages.find(s => s.plates.some(p => p.id === container && p.samples.some(e => e.id === entityId))); if (found) patch({ stage: found.key, plate: container, well }); }}/>}
    </div>
    <section className="space-y-3 rounded-xl border bg-white p-4"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{t("逐孔 QC 明细")}</h2><Input className="max-w-xs" aria-label={t("检索 QC 样本或孔位")} placeholder={t("检索 QC 样本或孔位")} value={search} onChange={e => setSearch(e.target.value)}/><select className={selectClass} aria-label={t("QC 状态筛选")} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t("全部")}</option>{Object.entries(MOCK_QC_LABELS).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></div><p className="text-xs text-muted-foreground">{t("匹配 {n} 孔，当前显示前 200 孔；可搜索板号或样本定位。", { n: filtered.length })}</p><div className="overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{["样本编码", "容器 / 孔位", "QC 状态", "检测摘要"].map(label => <th key={label} className="p-2">{t(label)}</th>)}</tr></thead><tbody>{filtered.slice(0, 200).map(row => <tr key={row.entity.id} className="border-t"><td className="p-2"><button className="text-teal-700 underline" onClick={() => patch({ plate: row.entity.container, well: row.entity.well })}>{row.entity.id}</button></td><td className="p-2">{row.entity.container}:{row.entity.well}</td><td className="p-2">{t(MOCK_QC_LABELS[row.status])}</td><td className="p-2">{row.fragment ? `${row.fragment.measuredBp} bp · ${row.fragment.concentration.toFixed(1)} ng/µL · ${row.fragment.mainPeakPercent}%` : row.sequence ? `${t("同义突变")} ${row.sequence.synonymous}% · AA mutation ${row.sequence.aaMutation}%` : row.concentration ? `${row.concentration.ngPerUl} ng/µL` : row.assay === "control" ? `${row.entity.control} · ${row.controlSignal} RFU` : t("暂无检测结果")}</td></tr>)}</tbody></table></div></section>
  </div>;
}

function WellDetails({ row, onSource }: { row: MockWellQc; onSource: (plate: string, well: string, id: string) => void }) {
  const { t } = useI18n();
  const { entity, fragment, sequence, concentration } = row;
  const metric = (label: string, value: string) => <div key={label} className="rounded bg-slate-50 p-2"><p className="text-xs text-muted-foreground">{t(label)}</p><strong className="text-sm">{value}</strong></div>;
  return <section className="min-w-0 space-y-4 rounded-xl border bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{entity.id}</h2><p className="text-xs text-muted-foreground">{entity.container}:{entity.well}</p></div><Badge variant="outline" className={colors[row.status]}>{t(MOCK_QC_LABELS[row.status])}</Badge></div>
    {fragment && <><h3 className="flex items-center gap-2 text-sm font-semibold"><FlaskConical size={16}/>{t("Qsep 片段分析")}</h3><div className="grid grid-cols-2 gap-2">{metric("预期片段长度", `${fragment.expectedBp} bp`)}{metric("主峰长度", `${fragment.measuredBp} bp`)}{metric("浓度", `${fragment.concentration.toFixed(1)} ng/µL`)}{metric("主峰占比", `${fragment.mainPeakPercent}%`)}</div>
      <svg className="w-full rounded border bg-slate-50" viewBox="0 0 520 215" role="img" aria-label={t("电泳曲线：片段长度 bp 与信号 RFU")}><path d="M40 20 V175 H500" fill="none" stroke="#94a3b8"/>{[0, 500, 1000, 1500, 2000].map(bp => <text key={bp} x={40 + bp / 2000 * 455} y={194} textAnchor="middle" fontSize="10" fill="#64748b">{bp}</text>)}<text x="270" y="210" fontSize="10" fill="#64748b">bp</text><text x="8" y="14" fontSize="10" fill="#64748b">RFU</text><polyline points={fragment.trace.map(p => `${40 + p.bp / 2000 * 455},${175 - p.rfu / 1100 * 150}`).join(" ")} fill="none" stroke="#0d9488" strokeWidth="2"/><line x1={40 + fragment.expectedBp / 2000 * 455} x2={40 + fragment.expectedBp / 2000 * 455} y1="28" y2="175" stroke="#94a3b8" strokeDasharray="4 4"/></svg>
      <p className="text-xs text-muted-foreground">{t("虚线为预期片段长度。长度偏差超过 30 bp 或主峰低于 70% 为不通过；主峰低于 90% 或浓度低于 10 ng/µL 为待复核。")}</p></>}
    {sequence && <><h3 className="text-sm font-semibold">{t("外包测序 · 比对结果")}</h3><div className="grid grid-cols-2 gap-2">{metric("方向", entity.branch === 1 ? "Forward" : "Reverse")}{metric("覆盖率", `${sequence.coveragePercent}%`)}{metric("Q20 比例", `${sequence.q20Percent}%`)}{metric("比对总数", String(sequence.total))}</div>
      <div className="space-y-2">{([["参考序列一致", sequence.reference, "bg-teal-500"], ["同义突变", sequence.synonymous, "bg-sky-500"], ["AA mutation", sequence.aaMutation, "bg-rose-500"], ["无法判定", sequence.unresolved, "bg-slate-400"]] as const).map(([label, count, color]) => <div key={label}><div className="flex justify-between text-xs"><span>{t(label)}</span><b>{count}/{sequence.total} · {(count / sequence.total * 100).toFixed(1)}%</b></div><div className="mt-1 h-2 overflow-hidden rounded bg-slate-100"><div className={`h-full ${color}`} style={{ width: `${count / sequence.total * 100}%` }}/></div></div>)}</div>
      <p className="text-xs text-muted-foreground">{t("按比对序列统计：含 AA 变异优先归入 AA mutation，其次为仅同义突变。F/R 共享目标共识统计。")}</p>
      <div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{["核苷酸变异", "密码子", "氨基酸变化", "分类"].map(h => <th className="p-1" key={h}>{t(h)}</th>)}</tr></thead><tbody>{sequence.variants.map(v => <tr key={v.nucleotide} className="border-t"><td className="p-1">{v.nucleotide}</td><td className="p-1">{v.codon}</td><td className="p-1">{v.aminoAcid}</td><td className="p-1">{t(v.kind === "synonymous" ? "同义突变" : "AA mutation")} · {v.count}%</td></tr>)}</tbody></table>{!sequence.variants.length && <p className="mt-2 text-xs">{t("本孔暂无变异记录。")}</p>}</div><p className="text-xs text-muted-foreground">{t("判定规则：AA 变异为不通过；仅同义变异或无法判定超过 10% 为待复核。")}</p></>}
    {concentration && <><h3 className="text-sm font-semibold">{t("微量分光检测")}</h3><div className="grid grid-cols-2 gap-2">{metric("浓度", `${concentration.ngPerUl} ng/µL`)}{metric("A260/A280", concentration.ratio260280.toFixed(2))}</div></>}
    {row.assay === "control" && <p className="text-sm">{t("对照信号")}：{entity.control} · {row.controlSignal} RFU</p>}
    {row.assay === "none" && <p className="text-sm text-muted-foreground">{t("此步骤暂无独立检测结果，可查看下方关联来源孔的 QC。")}</p>}
    <div className="border-t pt-3"><h3 className="text-xs font-semibold">{t("关联来源与结果孔")}</h3><div className="mt-2 flex flex-wrap gap-2">{entity.parents.map(p => <button key={`${p.id}:${p.kind}`} disabled={p.well === "surface"} className="rounded border px-2 py-1 text-left text-xs text-teal-700 disabled:text-slate-500" onClick={() => onSource(p.container, p.well, p.id)}>{p.id}<small className="block">{p.container}:{p.well}</small></button>)}</div></div>
  </section>;
}
