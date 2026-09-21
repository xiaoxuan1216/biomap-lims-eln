import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Resource = { id: number; sku: string; name: string; unit: string; availableQuantity: number; expiryDate: string | null };
export default function PairedSamplePicker({ sampleIds, selectedIds, resources, scheduledEnd, onAdd }: {
  sampleIds: number[]; selectedIds: number[]; resources: Resource[]; scheduledEnd: string;
  onAdd: (sampleId: number, amount: number) => void;
}) {
  const { t } = useI18n();
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const query = trpc.sampleIdentity.pairedCandidates.useQuery({ sampleIds }, { refetchOnWindowFocus: true });
  if (query.isLoading) return <p className="text-sm">{t("正在查找配对质粒…")}</p>;
  if (query.error) return <p role="alert" className="text-sm">{t("配对质粒查询失败，请重试。 ")}<Button variant="link" onClick={() => query.refetch()}>{t("重试")}</Button></p>;
  const candidates = (query.data?.candidates ?? []).flatMap(candidate => {
    const resource = resources.find(item => item.id === candidate.sampleId);
    return resource && resource.availableQuantity > 0 && !selectedIds.includes(resource.id) && (!resource.expiryDate || resource.expiryDate >= scheduledEnd.slice(0, 10)) ? [{ ...candidate, resource }] : [];
  });
  return <div className="space-y-3 border-t pt-3">
    <h3 className="font-medium">{t("可选的配对质粒")}</h3>
    <p className="text-xs text-muted-foreground">{t("按已确认的抗体编号匹配另一条链。请核对批号及本次用量后加入。")}</p>
    {!candidates.length && <p className="text-sm text-amber-700">{t("未找到可用的已确认配对质粒，请检查库存或确认另一条链的来样身份。")}</p>}
    {candidates.map(candidate => {
      const amount = Number(amounts[candidate.sampleId] ?? "");
      return <div key={candidate.sampleId} className="flex flex-wrap items-end gap-3 rounded border p-3">
        <div className="min-w-0 flex-1 text-sm"><p>{candidate.resource.sku} · {candidate.resource.name}</p><p>{candidate.antibodyId} · {candidate.chain} · {candidate.lot}</p><p className="text-xs text-muted-foreground">{candidate.sourceReference}</p><Link className="text-teal-700 underline" to={`/samples/${candidate.sampleId}`}>{t("查看来源及身份")}</Link></div>
        <Label className="block text-xs">{t("本次取用量")} ({candidate.resource.unit})<Input className="mt-1 w-28" type="number" min="0" step="any" aria-label={`${t("本次取用量")} ${candidate.resource.sku}`} value={amounts[candidate.sampleId] ?? ""} onChange={event => setAmounts(current => ({ ...current, [candidate.sampleId]: event.target.value }))}/></Label>
        <Button size="sm" variant="outline" disabled={!Number.isFinite(amount) || amount <= 0 || amount > candidate.resource.availableQuantity} onClick={() => onAdd(candidate.sampleId, amount)}>{t("加入配对链")}</Button>
      </div>;
    })}
    {query.data?.hasMore && <p className="text-xs text-muted-foreground">{t("匹配批次较多，仅展示部分候选；也可以按样本编号搜索。")}</p>}
  </div>;
}
