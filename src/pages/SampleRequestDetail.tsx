import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, CheckCircle2, ClipboardCheck, PackageCheck, Play, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, fmtDateTime } from "@/lib/labels";

const REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "草稿", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  reserved: { label: "已预占", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_fulfillment: { label: "履约中", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  fulfilled: { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "已取消", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const ITEM_STATUS: Record<string, string> = {
  pending: "待提交",
  reserved: "已预占",
  in_progress: "履约中",
  fulfilled: "已发放",
  cancelled: "已取消",
};

const TASK_STATUS: Record<string, string> = {
  ready: "待领取",
  claimed: "已领取",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export default function SampleRequestDetail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const requestId = Number(id);
  const utils = trpc.useUtils();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [completeTaskId, setCompleteTaskId] = useState<number | null>(null);

  const { data: request, isLoading } = trpc.sampleRequest.byId.useQuery({ id: requestId });
  const refresh = async () => {
    await Promise.all([
      utils.sampleRequest.byId.invalidate({ id: requestId }),
      utils.sampleRequest.list.invalidate(),
      utils.sampleRequest.availableSamples.invalidate(),
      utils.sample.list.invalidate(),
      utils.dashboard.invalidate(),
    ]);
  };

  const submitMut = trpc.sampleRequest.submit.useMutation({
    onSuccess: async () => { toast.success(t("库存校验通过，已生成履约任务")); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const claimMut = trpc.sampleRequest.claimTask.useMutation({
    onSuccess: async () => { toast.success(t("履约任务已领取")); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const completeMut = trpc.sampleRequest.completeTask.useMutation({
    onSuccess: async () => { toast.success(t("样品已发放，库存流水已记录")); setCompleteTaskId(null); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const cancelMut = trpc.sampleRequest.cancel.useMutation({
    onSuccess: async () => { toast.success(t("请求已取消，未使用的预占已释放")); setCancelOpen(false); await refresh(); },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading || !request) {
    return <div className="space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-72 w-full" /></div>;
  }

  const status = REQUEST_STATUS[request.status];
  const canCancel = ["draft", "reserved", "in_fulfillment"].includes(request.status);

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate("/sample-requests")} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t("返回样品请求")}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded border border-teal-200 bg-teal-50 px-2 py-1 font-mono text-sm text-teal-700">{request.requestNo}</span>
              <h1 className="text-2xl font-bold tracking-tight">{request.title}</h1>
              <Badge variant="outline" className={status?.cls}>{t(status?.label ?? request.status)}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {request.projectName || t("未关联项目")} · {t("申请人")} {request.requesterName || "—"} · {fmtDateTime(request.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            {request.status === "draft" && (
              <Button onClick={() => submitMut.mutate({ id: request.id })} disabled={submitMut.isPending}>
                <ClipboardCheck className="mr-2 h-4 w-4" /> {t("提交并预占")}
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)}>
                <XCircle className="mr-2 h-4 w-4" /> {t("取消请求")}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("样品明细")}</p><p className="mt-1 text-xl font-semibold">{request.items.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("有效预占")}</p><p className="mt-1 text-xl font-semibold">{request.reservations.filter((row) => row.status === "active").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("履约任务")}</p><p className="mt-1 text-xl font-semibold">{request.tasks.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("需要日期")}</p><p className="mt-1 text-base font-semibold">{request.neededBy ? fmtDate(request.neededBy) : "—"}</p></CardContent></Card>
      </div>

      {request.purpose && <Card><CardHeader className="pb-2"><CardTitle className="text-base">{t("用途与要求")}</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{request.purpose}</CardContent></Card>}

      <Card>
        <CardHeader><CardTitle className="text-base">{t("样品明细与库存承诺")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>{t("样品")}</TableHead><TableHead>{t("请求量")}</TableHead><TableHead>{t("已预占")}</TableHead><TableHead>{t("已发放")}</TableHead><TableHead>{t("当前库存")}</TableHead><TableHead>{t("当前可用")}</TableHead><TableHead>{t("目标形式")}</TableHead><TableHead>{t("状态")}</TableHead></TableRow></TableHeader>
            <TableBody>{request.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell><button className="text-left hover:text-teal-700" onClick={() => navigate(`/samples/${item.sampleId}`)}><span className="block font-mono text-xs text-teal-700">{item.sampleSku}</span><span className="font-medium">{item.sampleName}</span></button></TableCell>
                <TableCell>{item.requestedAmount} {item.unit}</TableCell>
                <TableCell>{item.reservedAmount} {item.unit}</TableCell>
                <TableCell>{item.fulfilledAmount} {item.unit}</TableCell>
                <TableCell>{item.onHandQuantity} {item.unit}</TableCell>
                <TableCell>{item.availableQuantity} {item.unit}</TableCell>
                <TableCell>{item.targetFormat || "—"}</TableCell>
                <TableCell><Badge variant="outline">{t(ITEM_STATUS[item.status] ?? item.status)}</Badge></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("履约工作队列")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {request.tasks.length ? request.tasks.map((task) => {
            const item = request.items.find((candidate) => candidate.id === task.requestItemId);
            return (
              <div key={task.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <PackageCheck className="mt-0.5 h-5 w-5 text-teal-600" />
                  <div><div className="flex items-center gap-2"><span className="font-medium">{t("发放任务")} #{task.id}</span><Badge variant="outline">{t(TASK_STATUS[task.status] ?? task.status)}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{task.instruction || `${item?.sampleSku ?? ""} ${item?.requestedAmount ?? ""} ${item?.unit ?? ""}`}</p>{task.assignedToName && <p className="mt-1 text-xs text-muted-foreground">{t("领取人")}: {task.assignedToName}</p>}</div>
                </div>
                <div className="flex gap-2">
                  {task.status === "ready" && <Button size="sm" variant="outline" onClick={() => claimMut.mutate({ taskId: task.id })} disabled={claimMut.isPending}><Play className="mr-1.5 h-3.5 w-3.5" />{t("领取任务")}</Button>}
                  {(task.status === "claimed" || task.status === "running") && <Button size="sm" onClick={() => setCompleteTaskId(task.id)}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{t("确认发放")}</Button>}
                </div>
              </div>
            );
          }) : <p className="py-8 text-center text-sm text-muted-foreground">{request.status === "draft" ? t("提交请求后将按样品生成履约任务") : t("暂无履约任务")}</p>}
        </CardContent>
      </Card>

      {request.cancellationReason && <Card className="border-rose-200 bg-rose-50/50"><CardContent className="p-4 text-sm"><strong>{t("取消原因")}：</strong>{request.cancellationReason}</CardContent></Card>}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("取消样品请求")}</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label>{t("取消原因")}</Label><Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder={t("说明为什么不再需要该请求")} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setCancelOpen(false)}>{t("返回")}</Button><Button variant="destructive" disabled={!cancelReason.trim() || cancelMut.isPending} onClick={() => cancelMut.mutate({ id: request.id, reason: cancelReason })}>{t("确认取消并释放预占")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={completeTaskId !== null} onOpenChange={(open) => !open && setCompleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("确认样品已经发放？")}</AlertDialogTitle><AlertDialogDescription>{t("确认后会按请求量扣减库存、消耗对应预占并写入审计流水，此操作不能通过编辑数字撤销。")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t("暂不发放")}</AlertDialogCancel><AlertDialogAction disabled={completeMut.isPending} onClick={() => completeTaskId && completeMut.mutate({ taskId: completeTaskId })}>{t("确认发放并扣减库存")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
