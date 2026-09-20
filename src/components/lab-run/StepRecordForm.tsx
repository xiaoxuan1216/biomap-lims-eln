import { useCallback, useState } from "react";
import { useBeforeUnload } from "react-router";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { latestStepRecord, stepRecordIssues, type StepRecordRow, type StepRecordSpec } from "@contracts/stepRecords";
import { parseStepRecordPaste } from "@contracts/stepRecordPaste";
import type { FrozenSampleIdentity } from "@contracts/sampleIdentity";
import StepRecordReferences from "./StepRecordReferences";

type Samples = { sampleId: number; sku: string; sampleName: string }[];
const localTime = (value: string) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
};

export function StepRecordSummary({ spec, rows, samples }: { spec: StepRecordSpec; rows: StepRecordRow[]; samples: Samples }) {
  const { t, lang } = useI18n();
  return <div className="space-y-3">{rows.map((row, index) => <div key={row.id} className="rounded-lg border p-3 text-sm"><p className="mb-2 font-medium">{t("条目 {n}", { n: index + 1 })} · {row.sampleIds.map(id => samples.find(sample => sample.sampleId === id)?.sku ?? id).join(" · ")}</p><dl className="grid gap-3 sm:grid-cols-2">{spec.fields.filter(field => row.values[field.key]).map(field => <div key={field.key} className="min-w-0"><dt className="text-xs text-muted-foreground">{lang === "en" ? field.labelEn || field.label : field.label}</dt><dd className="break-words whitespace-pre-wrap">{field.kind === "datetime" ? new Date(row.values[field.key]).toLocaleString() : row.values[field.key]} {field.unit}</dd></div>)}</dl></div>)}</div>;
}

export default function StepRecordForm({ runId, revision, nodeKey, spec, events, samples, disabled, canComplete, note, evidenceIds, decision, refresh, onCompleted, identities, steps }: {
  runId: number; revision: number; nodeKey: string; spec: StepRecordSpec;
  events: { id: number; action: string; nodeKey: string | null; payload: string }[];
  samples: Samples; disabled: boolean; canComplete: boolean; note: string; evidenceIds: number[];
  decision?: "yes" | "no"; refresh: () => Promise<void>; onCompleted: () => void;
  identities: FrozenSampleIdentity[]; steps: { nodeKey: string; label: string }[];
}) {
  const { t, lang } = useI18n();
  const saved = latestStepRecord(events, nodeKey);
  const [draft, setDraft] = useState<{ eventId: number | null; rows: StepRecordRow[] } | null>(null);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState("");
  const rows = draft?.rows ?? saved.rows;
  const conflict = !!draft && draft.eventId !== saved.eventId;
  const issues = stepRecordIssues(spec, rows, samples.map(sample => sample.sampleId), true);
  useBeforeUnload(useCallback(event => { if (draft || pasted.trim()) { event.preventDefault(); event.returnValue = ""; } }, [draft, pasted]));
  const mutate = trpc.runExecution.act.useMutation({
    onSuccess: async (_, variables) => { await refresh(); setDraft(null); if (variables.action === "complete_step") onCompleted(); toast.success(t(variables.action === "save_step_record" ? "步骤记录已保存，可稍后继续" : "步骤记录已确认")); },
    onError: error => toast.error(t(error.message)),
  });
  const locked = disabled || mutate.isPending || conflict;
  const change = (next: StepRecordRow[]) => setDraft({ eventId: draft ? draft.eventId : saved.eventId, rows: next });
  const newRow = (sampleIds: number[] = []): StepRecordRow => ({ id: crypto.randomUUID(), sampleIds, values: {} });
  const update = (id: string, patch: Partial<StepRecordRow>) => change(rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const send = (action: "save_step_record" | "complete_step") => mutate.mutate({ runId, expectedRevision: revision, nodeKey, action, records: rows, expectedRecordEventId: draft ? draft.eventId : saved.eventId, note: note.trim() || t(action === "complete_step" ? "按填写的记录确认完成本步骤" : "保存步骤记录草稿"), evidenceIds, decision, idempotencyKey: crypto.randomUUID() });
  return <section className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/30 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{t("本步实验记录")}</h3><Badge variant="outline">{t(draft ? "有未保存修改" : saved.eventId ? "已保存" : "尚未填写")}</Badge></div>
    <p className="text-xs text-muted-foreground">{t("按实际反应、培养容器、收集组分或检测位置建立条目；同一批次的多次观察可追加记录。")}</p>
    {conflict && <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"><p>{t("步骤记录已更新，请先载入最新记录")}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => setDraft(null)}>{t("放弃本地修改并载入最新记录")}</Button></div>}
    <fieldset disabled={locked} className="space-y-3">
      {rows.map((row, index) => <details key={row.id} open={index === 0 || undefined} className="rounded-lg border bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium">{t("条目 {n}", { n: index + 1 })} · {row.sampleIds.map(id => samples.find(sample => sample.sampleId === id)?.sku ?? id).join(" · ") || t("待关联样本")} {row.values[spec.fields[0].key] ? ` · ${row.values[spec.fields[0].key]}` : ""}</summary>
        <div className="mt-3 space-y-4"><fieldset><legend className="mb-2 text-sm font-medium">{t("关联本批样本")}</legend><div className="flex max-h-40 flex-wrap gap-3 overflow-auto">{samples.map(sample => <label key={sample.sampleId} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={row.sampleIds.includes(sample.sampleId)} onChange={e => update(row.id, { sampleIds: e.target.checked ? [...row.sampleIds, sample.sampleId] : row.sampleIds.filter(id => id !== sample.sampleId) })}/>{sample.sku} · {sample.sampleName}</label>)}</div><Button size="sm" variant="ghost" className="mt-1" onClick={() => update(row.id, { sampleIds: samples.map(sample => sample.sampleId) })}>{t("关联本批全部样本")}</Button></fieldset>
          <StepRecordReferences row={row} spec={spec} identities={identities} events={events} steps={steps} onApply={values => update(row.id, { values })}/>
          <div className="grid gap-3 sm:grid-cols-2">{spec.fields.map(field => <Label key={field.key} className="block min-w-0 leading-relaxed">{lang === "en" ? field.labelEn || field.label : field.label}{field.required && " *"}{field.unit && ` (${field.unit})`}<Input className="mt-1" type={field.kind === "datetime" ? "datetime-local" : "text"} inputMode={field.kind === "number" ? "decimal" : undefined} maxLength={2000} value={field.kind === "datetime" ? localTime(row.values[field.key] ?? "") : row.values[field.key] ?? ""} onChange={e => { const value = field.kind === "datetime" && e.target.value ? new Date(e.target.value).toISOString() : e.target.value; update(row.id, { values: { ...row.values, [field.key]: value } }); }}/></Label>)}</div>
          <Button variant="ghost" size="sm" onClick={() => change(rows.filter(item => item.id !== row.id))}>{t("移除此条目")}</Button>
        </div>
      </details>)}
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={rows.length >= 200} onClick={() => change([...rows, newRow()])}>{t("新增实验条目")}</Button><Button variant="outline" size="sm" disabled={samples.every(sample => rows.some(row => row.sampleIds.includes(sample.sampleId))) || rows.length + samples.filter(sample => !rows.some(row => row.sampleIds.includes(sample.sampleId))).length > 200} onClick={() => change([...rows, ...samples.filter(sample => !rows.some(row => row.sampleIds.includes(sample.sampleId))).map(sample => newRow([sample.sampleId]))])}>{t("按未关联样本建立条目")}</Button></div>
      <p className="text-xs text-muted-foreground">{t("已关联 {covered}/{total} 份输入样本", { covered: new Set(rows.flatMap(row => row.sampleIds)).size, total: samples.length })} · {t("时间按本地时区填写并保存时区信息")}</p>
      <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">{t("从表格批量粘贴记录")}</summary><div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">{t("按下方列顺序粘贴表格，首列填写本批样本编号；同一条目关联多个样本时用分号分隔。记录会追加到当前列表。")}</p><p className="text-xs text-muted-foreground">{t("日期时间未注明时区时，按当前浏览器的本地时区保存。")}</p><Input aria-label={t("粘贴表头")} readOnly value={[t("样本编号"), ...spec.fields.map(field => `${lang === "en" ? field.labelEn || field.label : field.label}${field.unit ? ` (${field.unit})` : ""}`)].join("\t")} onFocus={e => e.target.select()}/><Textarea aria-label={t("粘贴实验记录")} className="min-h-28 font-mono text-xs" maxLength={500000} value={pasted} onChange={e => { setPasted(e.target.value); setPasteError(""); }}/>{pasteError && <p role="alert" className="text-xs text-red-700">{t(pasteError)}</p>}<Button size="sm" variant="outline" disabled={!pasted.trim()} onClick={() => {
        try { const imported = parseStepRecordPaste(pasted, spec, samples); if (rows.length + imported.length > 200) throw new Error("本步骤最多保留 200 条记录"); change([...rows, ...imported.map(row => ({ ...row, id: crypto.randomUUID() }))]); setPasted(""); setPasteError(""); }
        catch (error) { setPasteError(error instanceof Error ? error.message : "无法读取粘贴记录"); }
      }}>{t("追加到本步记录")}</Button></div></details>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!draft} onClick={() => send("save_step_record")}>{t("保存本步记录")}</Button><Button disabled={!canComplete || issues.length > 0} onClick={() => send("complete_step")}>{t("确认记录并完成此步骤")}</Button></div>
      {issues.length > 0 && <p className="text-xs text-amber-800">{t("补齐必填字段与样本关联后可完成步骤；未填完时可以先保存。")}</p>}
    </fieldset>
  </section>;
}
