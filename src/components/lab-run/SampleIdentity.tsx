import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const chainLabels = { HC: "重链", LC: "轻链", single: "单链或其他构型", paired: "重轻链配对抗体" };
const statusLabels = { review: "身份待确认", approved: "来样身份已确认", rejected: "来样确认已退回", retired: "来样身份已停用" };
const selectClass = "mt-1 block w-full rounded border bg-white p-2 text-sm";
export default function SampleIdentity({ sampleId, sampleType }: { sampleId: number; sampleType: string }) {
  const { t } = useI18n(), { user } = useAuth();
  const utils = trpc.useUtils();
  const history = trpc.sampleIdentity.history.useQuery({ sampleId });
  const sequences = trpc.sequence.list.useQuery();
  const [open, setOpen] = useState(false), [note, setNote] = useState("");
  const [form, setForm] = useState({ source: "external" as "external" | "historical", sourceReference: "", lot: "", antibodyId: "", chain: "single" as "HC" | "LC" | "single" | "paired", sequenceId: "", verification: "" });
  const refresh = async () => { await Promise.all([history.refetch(), utils.sampleIdentity.pending.invalidate(), utils.sample.byId.invalidate({ id: sampleId })]); };
  const submit = trpc.sampleIdentity.submit.useMutation({ onSuccess: async () => { setOpen(false); await refresh(); toast.success(t("来样信息已提交确认")); }, onError: error => toast.error(t(error.message)) });
  const review = trpc.sampleIdentity.review.useMutation({ onSuccess: async () => { setNote(""); await refresh(); toast.success(t("来样确认状态已更新")); }, onError: error => toast.error(t(error.message)) });
  if (history.error) return <p role="alert">{history.error.message}</p>;
  if (!history.data) return null;
  const { records, output } = history.data;
  const active = records.find(record => record.status === "review" || record.status === "approved");
  const canReview = !!active && active.submittedBy !== user?.id && ["reviewer", "admin"].includes(user?.role ?? "");
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("来样身份与阶段接入")}</CardTitle></CardHeader><CardContent className="space-y-4">
    {output ? <div className="flex flex-wrap items-center gap-3 text-sm"><span>{output.antibodyId} · {t(chainLabels[output.chain as keyof typeof chainLabels] ?? output.chain)}</span><Link className="text-teal-700 underline" to={`/runs/${output.runId}`}>{t("查看产物来源实验")}</Link></div> : <>
      <p className="text-sm text-muted-foreground">{t("已有或外购样本可以从确认身份开始进入研发流程，保留真实来源，无需补建克隆实验。")}</p>
      {active && <div className="space-y-3 rounded-lg border bg-slate-50 p-4 text-sm"><div className="flex flex-wrap items-center gap-3"><Badge variant="outline">{t(statusLabels[active.status])}</Badge><strong>{active.antibodyId} · {t(chainLabels[active.chain as keyof typeof chainLabels] ?? active.chain)}</strong><span>{active.lot}</span></div><p>{t(active.source === "external" ? "外部来源" : "历史库存来源")}：{active.sourceReference}</p><p className="whitespace-pre-wrap">{t("身份与质检确认依据")}：{active.verification}</p><p>{t("提交人员")}：{active.submittedByName}{active.reviewedByName && ` · ${t("确认人员")}：${active.reviewedByName}`}</p>{active.sequenceId && <Link className="text-teal-700 underline" to={`/sequences/${active.sequenceId}`}>{t("查看关联序列")}</Link>}
        {active.status === "approved" && <div className="flex flex-wrap gap-3"><Button asChild size="sm"><Link to={`/workflows?stage=${sampleType === "plasmid" ? "expression" : sampleType === "protein" ? "purification" : "characterization"}&sampleId=${sampleId}`}>{t("选择下一阶段方法")}</Link></Button><p className="text-xs text-muted-foreground">{t("准备实验时选择此样本；重轻链表达还需选择同一抗体的另一条链。")}</p></div>}
        {canReview && <details open={active.status === "review"}><summary className="cursor-pointer">{t(active.status === "review" ? "核对来样身份" : "停用此身份确认")}</summary><div className="mt-3 space-y-3"><Label className="block">{t("确认结论或处理原因")}<Textarea className="mt-1" value={note} onChange={e => setNote(e.target.value)}/></Label><div className="flex flex-wrap gap-2">{(active.status === "review" ? ["approve", "reject"] as const : ["retire"] as const).map(decision => <Button key={decision} size="sm" variant={decision === "approve" ? "default" : "outline"} disabled={!note.trim() || review.isPending} onClick={() => review.mutate({ id: active.id, decision, note, requestKey: crypto.randomUUID() })}>{t(decision === "approve" ? "确认身份，可用于后续实验" : decision === "reject" ? "退回重新填写" : "停用并保留历史记录")}</Button>)}</div></div></details>}
      </div>}
      {!active && user?.role !== "viewer" && <Button variant="outline" onClick={() => setOpen(!open)}>{t(open ? "收起来样表单" : "填写来样身份")}</Button>}
      {open && !active && <fieldset disabled={submit.isPending} className="space-y-4 rounded-lg border p-4"><div className="grid gap-3 md:grid-cols-2"><Label className="block">{t("来样来源")}<select className={selectClass} value={form.source} onChange={e => setForm({ ...form, source: e.target.value as typeof form.source })}><option value="external">{t("外部来源")}</option><option value="historical">{t("历史库存来源")}</option></select></Label><Label className="block">{t("来源单位、订单或历史记录")}<Input className="mt-1" value={form.sourceReference} onChange={e => setForm({ ...form, sourceReference: e.target.value })}/></Label><Label className="block">{t("来样批号")}<Input className="mt-1" value={form.lot} onChange={e => setForm({ ...form, lot: e.target.value })}/></Label><Label className="block">{t("抗体编号")}<Input className="mt-1" value={form.antibodyId} onChange={e => setForm({ ...form, antibodyId: e.target.value })}/></Label><Label className="block">{t("链别或构型")}<select className={selectClass} value={form.chain} onChange={e => setForm({ ...form, chain: e.target.value as typeof form.chain })}>{Object.entries(chainLabels).filter(([key]) => sampleType !== "plasmid" || key !== "paired").map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></Label><Label className="block">{t(sampleType === "plasmid" ? "质粒 DNA 序列（必选）" : "关联序列（选填）")}<select className={selectClass} value={form.sequenceId} onChange={e => setForm({ ...form, sequenceId: e.target.value })}><option value="">{t("选择序列")}</option>{sequences.data?.filter(sequence => sampleType !== "plasmid" || sequence.type === "dna").map(sequence => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select></Label></div><Label className="block">{t("身份与质检确认依据")}<Textarea className="mt-1" value={form.verification} placeholder={t("填写测序、质检报告或历史确认记录的编号与结论")} onChange={e => setForm({ ...form, verification: e.target.value })}/></Label><Button disabled={![form.sourceReference, form.lot, form.antibodyId, form.verification].every(value => value.trim()) || (sampleType === "plasmid" && !form.sequenceId)} onClick={() => submit.mutate({ ...form, sampleId, sequenceId: Number(form.sequenceId) || undefined, requestKey: crypto.randomUUID() })}>{t("提交来样身份确认")}</Button></fieldset>}
      {records.length > 0 && <details><summary className="cursor-pointer text-sm">{t("来样确认历史")}</summary><div className="mt-3 space-y-3">{records.map(record => <div className="rounded border p-3 text-sm" key={record.id}><p>{record.antibodyId} · {record.chain} · {record.lot} · {t(statusLabels[record.status])}</p><p>{record.sourceReference}</p><p>{record.submittedByName} · {record.submittedAt.toLocaleString()}</p><p>{record.reviewedByName} · {record.reviewNote}</p>{record.retirementNote && <p>{record.retirementNote}</p>}</div>)}</div></details>}
    </>}
  </CardContent></Card>;
}
