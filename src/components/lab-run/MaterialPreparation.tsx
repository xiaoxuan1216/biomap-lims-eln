import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function MaterialPreparation({ requestId, canIssue, onIssued }: {
  requestId: number; canIssue: boolean; onIssued: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const request = trpc.sampleRequest.byId.useQuery({ id: requestId });
  const claim = trpc.sampleRequest.claimTask.useMutation();
  const complete = trpc.sampleRequest.completeTask.useMutation();
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const issue = async (task: NonNullable<typeof request.data>["tasks"][number]) => {
    setBusy(task.id);
    try {
      if (task.status === "ready") await claim.mutateAsync({ taskId: task.id });
      await complete.mutateAsync({ taskId: task.id });
      setChecked(current => ({ ...current, [task.id]: false }));
      toast.success(t("领用已记录，库存与流水已更新"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("领用未完成，请检查后重试"));
    } finally {
      await Promise.all([request.refetch(), utils.sample.list.invalidate(), onIssued()]);
      setBusy(null);
    }
  };
  if (request.error) return <p role="alert">{request.error.message}</p>;
  if (!request.data) return <p className="text-sm text-muted-foreground">{t("正在加载领用清单…")}</p>;
  return <div className="space-y-3 rounded-lg border p-3">
    <p className="text-sm font-medium">{t("核对并领取样本物料")}</p>
    {request.data.tasks.map(task => {
      const item = request.data.items.find(row => row.id === task.requestItemId);
      const done = task.status === "succeeded";
      const allowed = canIssue && (task.status === "ready" || (["claimed", "running"].includes(task.status) && (task.assignedToId === user?.id || user?.role === "admin")));
      return <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
        <div><p className="font-medium">{item?.sampleSku} · {item?.sampleName}</p><p className="text-muted-foreground">{item?.requestedAmount} {item?.unit}{task.assignedToName && ` · ${task.assignedToName}`}</p></div>
        {done ? <span className="text-teal-700">{t("已领用")}</span> : allowed ? <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={checked[task.id] ?? false} disabled={busy !== null} onChange={event => setChecked(current => ({ ...current, [task.id]: event.target.checked }))}/>{t("已核对编号与实际数量")}</label><Button size="sm" variant="outline" disabled={!checked[task.id] || busy !== null} onClick={() => void issue(task)}>{t("确认领用并记录库存")}</Button></div> : <span className="text-muted-foreground">{t("请由领用负责人处理")}</span>}
      </div>;
    })}
    <Link className="inline-block text-xs text-teal-700 underline" to={`/sample-requests/${requestId}`}>{t("查看领用详情")}</Link>
  </div>;
}
