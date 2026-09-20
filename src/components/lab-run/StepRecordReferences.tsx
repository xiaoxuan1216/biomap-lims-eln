import type { StepRecordRow, StepRecordSpec } from "@contracts/stepRecords";
import type { FrozenSampleIdentity } from "@contracts/sampleIdentity";
import { stepRecordSuggestions } from "@contracts/stepRecordReuse";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

export default function StepRecordReferences({ row, spec, identities, events, steps, onApply }: {
  row: StepRecordRow; spec: StepRecordSpec; identities: FrozenSampleIdentity[];
  events: { id: number; action: string; nodeKey: string | null; payload: string }[];
  steps: { nodeKey: string; label: string }[];
  onApply: (values: Record<string, string>) => void;
}) {
  const { t, lang } = useI18n();
  const suggestions = stepRecordSuggestions(spec, row.sampleIds, identities, events);
  if (!suggestions.length) return null;
  const ready = suggestions.filter(suggestion => suggestion.value && !row.values[suggestion.fieldKey]?.trim());
  return <div className="space-y-2 rounded border border-teal-200 bg-teal-50/50 p-3 text-sm">
    <p className="font-medium">{t("核对可沿用的批次信息")}</p>
    {!row.sampleIds.length ? <p>{t("先关联本条记录对应的样本，再查看来源信息。")}</p> : <ul className="space-y-2">{suggestions.map(suggestion => {
      const source = suggestion.source;
      const field = spec.fields.find(field => field.key === suggestion.fieldKey)!;
      return <li key={suggestion.fieldKey}><span className="font-medium">{lang === "en" ? field.labelEn || field.label : field.label}</span>：{suggestion.value ?? t(suggestion.status === "ambiguous" ? "存在多个批次，请拆分条目或手动核对" : "尚无明确对应的已完成记录或身份信息")}<p className="text-xs text-muted-foreground">{t("参考来源")}：{source.kind === "identity" ? t("本批已确认身份") : `${steps.find(step => step.nodeKey === source.nodeKey)?.label ?? source.nodeKey}${suggestion.eventId ? ` · #${suggestion.eventId}` : ""}`}</p></li>;
    })}</ul>}
    <Button size="sm" variant="outline" disabled={!ready.length} onClick={() => onApply({ ...row.values, ...Object.fromEntries(ready.map(suggestion => [suggestion.fieldKey, suggestion.value!])) })}>{t("核对后填入空白字段")}</Button>
    <p className="text-xs text-muted-foreground">{t("已有填写保持不变。沿用后仍可修改，实际用量、时间和检测结果需按本次实验记录。")}</p>
  </div>;
}
