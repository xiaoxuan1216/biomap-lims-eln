import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MethodNodeSpec, MethodSpec } from "@contracts/method";
import { stepFieldSchema, type StepRecordSpec } from "@contracts/stepRecords";
import { precedingSteps } from "@contracts/stepRecordReuse";

export default function StepRecordRequirements({ rule, editing, change, nodeKey, nodes, edges, method }: { rule: MethodNodeSpec; editing: boolean; change: (value: Partial<MethodNodeSpec>) => void; nodeKey: string; nodes: { nodeKey: string; label: string }[]; edges: { sourceKey: string; targetKey: string }[]; method: MethodSpec }) {
  const { t, lang } = useI18n();
  const record = rule.record;
  const preceding = precedingSteps(nodeKey, edges);
  const sources = [
    ...(["antibodyId", "chain", "lot"] as const).map(field => ({ value: { kind: "identity" as const, field }, label: `${t("本批已确认身份")} · ${t({ antibodyId: "抗体编号", chain: "链别或构型", lot: "来样批号" }[field])}` })),
    ...(["HC", "LC"] as const).map(chain => ({ value: { kind: "identity" as const, field: "lot" as const, chain }, label: `${t("本批已确认身份")} · ${t(chain === "HC" ? "重链" : "轻链")} · ${t("来样批号")}` })),
    ...nodes.filter(node => preceding.has(node.nodeKey)).flatMap(node => (method.nodes[node.nodeKey]?.record?.fields ?? []).filter(field => field.kind === "text").map(field => ({ value: { kind: "step" as const, nodeKey: node.nodeKey, fieldKey: field.key }, label: `${node.label} · ${lang === "en" ? field.labelEn || field.label : field.label}` }))),
  ];
  if (!editing) return record ? <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">{t("本步实验记录")} · {t("{n} 个记录字段", { n: record.fields.length })}</summary><ul className="mt-2 grid gap-2 sm:grid-cols-2">{record.fields.map(field => <li key={field.key}>{lang === "en" ? field.labelEn || field.label : field.label}{field.unit && ` (${field.unit})`} · {t(field.required ? "必填" : "选填")}{field.reuse && <p className="text-xs text-muted-foreground">{t("参考来源")}：{sources.find(source => JSON.stringify(source.value) === JSON.stringify(field.reuse))?.label ?? t("原来源已不可用，请重新选择")}</p>}</li>)}</ul><p className="mt-3 text-xs text-muted-foreground">{t(rule.evidenceRequired ? "完成步骤前必须关联原始文件" : "填写步骤记录后可完成操作，检测结果另行关联原始数据")}</p></details> : null;
  const update = (next: StepRecordSpec) => change({ record: next });
  return <details><summary className="cursor-pointer text-sm">{t("配置本步实验记录")}</summary><div className="mt-3 space-y-3 rounded-lg border p-4">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!record} onChange={e => change({ record: e.target.checked ? { fields: [stepFieldSchema.parse({ key: "record", label: t("操作记录") })], requireAllSamples: true } : null, ...(!e.target.checked ? { evidenceRequired: true } : {}) })}/>{t("使用结构化步骤记录")}</label>
    {record && <><p className="text-xs text-muted-foreground">{t("实验员可按样本、容器或时间追加条目。这里只定义要记录什么，不预填实际实验值。")}</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={record.requireAllSamples} onChange={e => update({ ...record, requireAllSamples: e.target.checked })}/>{t("完成前覆盖本批全部输入样本")}</label>
      {record.fields.map((field, index) => <details key={index} className="rounded border p-3"><summary className="cursor-pointer text-sm">{field.label || t("新记录字段")}{field.unit && ` (${field.unit})`}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(["key", "label", "labelEn", "unit"] as const).map(key => <Label key={key} className="block leading-relaxed">{t(({ key: "字段标识", label: "字段名称", labelEn: "英文名称", unit: "单位" })[key])}<Input className="mt-1" value={field[key]} onChange={e => update({ ...record, fields: record.fields.map((item, i) => i === index ? { ...item, [key]: e.target.value } : item) })}/></Label>)}
        <Label className="block leading-relaxed">{t("记录类型")}<select className="mt-1 block w-full rounded border p-2" value={field.kind} onChange={e => update({ ...record, fields: record.fields.map((item, i) => i === index ? { ...item, kind: e.target.value as typeof field.kind, reuse: e.target.value === "text" ? item.reuse : undefined } : item) })}><option value="text">{t("文字记录")}</option><option value="number">{t("数值")}</option><option value="datetime">{t("日期与时间")}</option></select></Label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={e => update({ ...record, fields: record.fields.map((item, i) => i === index ? { ...item, required: e.target.checked } : item) })}/>{t("必填")}</label>
        {field.kind === "text" && <Label className="block leading-relaxed sm:col-span-2">{t("可沿用的信息来源")}<select className="mt-1 block w-full rounded border p-2" value={field.reuse ? JSON.stringify(field.reuse) : ""} onChange={e => update({ ...record, fields: record.fields.map((item, i) => i === index ? { ...item, reuse: e.target.value ? JSON.parse(e.target.value) : undefined } : item) })}><option value="">{t("每次手动填写")}</option>{field.reuse && !sources.some(source => JSON.stringify(source.value) === JSON.stringify(field.reuse)) && <option value={JSON.stringify(field.reuse)}>{t("原来源已不可用，请重新选择")}</option>}{sources.map(source => <option key={JSON.stringify(source.value)} value={JSON.stringify(source.value)}>{source.label}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">{t("执行时仅提供明确对应当前样本的文字信息，经核对后填入空白字段。")}</p></Label>}
        <Button size="sm" variant="ghost" disabled={record.fields.length === 1} onClick={() => update({ ...record, fields: record.fields.filter((_, i) => i !== index) })}>{t("移除此记录字段")}</Button>
      </div></details>)}
      <Button size="sm" variant="outline" disabled={record.fields.length >= 24} onClick={() => { let n = record.fields.length + 1; while (record.fields.some(field => field.key === `field_${n}`)) n++; update({ ...record, fields: [...record.fields, stepFieldSchema.parse({ key: `field_${n}`, label: t("新记录字段") })] }); }}>{t("添加记录字段")}</Button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.evidenceRequired} onChange={e => change({ evidenceRequired: e.target.checked })}/>{t("完成步骤前必须关联原始文件")}</label>
    </>}
  </div></details>;
}
