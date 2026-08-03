import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useParams, useNavigate, Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  MapPin,
  Plus,
  Minus,
  Trash2,
  History,
  NotebookPen,
  Pencil,
  PackageX,
} from "lucide-react";
import {
  ALERT_LABELS,
  SAMPLE_TYPES,
  TX_REASONS,
  fmtDate,
  fmtDateTime,
  rowLabel,
  colLabel,
  sampleAlert,
} from "@/lib/labels";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

export default function SampleDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const sampleId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: sample, isLoading } = trpc.sample.byId.useQuery({ id: sampleId });

  const [txOpen, setTxOpen] = useState(false);
  const [txForm, setTxForm] = useState({ reason: "restock", amount: "", note: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", alertThreshold: "", expiryDate: "", notes: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = () => {
    utils.sample.byId.invalidate({ id: sampleId });
    utils.sample.list.invalidate();
    utils.dashboard.invalidate();
  };

  const txMut = trpc.sample.transact.useMutation({
    onSuccess: (r) => {
      toast.success(t("操作成功，当前余量 {n} {unit}", { n: r.newQuantity, unit: sample?.unit ?? "" }));
      setTxOpen(false);
      setTxForm({ reason: "restock", amount: "", note: "" });
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.sample.update.useMutation({
    onSuccess: () => {
      toast.success(t("样本信息已更新"));
      setEditOpen(false);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.sample.delete.useMutation({
    onSuccess: () => {
      toast.success(t("样本已删除"));
      navigate("/samples");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !sample) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const alert = sampleAlert(sample);
  const typeInfo = SAMPLE_TYPES[sample.type];

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/samples")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回样本列表")}
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-1">
            {sample.sku}
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{sample.name}</h1>
          <Badge variant="outline" className={typeInfo?.cls}>{t(typeInfo?.label ?? sample.type)}</Badge>
          {alert && (
            <Badge variant="outline" className={ALERT_LABELS[alert].cls}>
              {t(ALERT_LABELS[alert].label)}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 左：信息 */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("样本信息")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center rounded-lg bg-teal-50 border border-teal-100 px-3 py-2.5">
              <span className="text-teal-700 text-xs font-medium">{t("当前余量")}</span>
              <span className="text-lg font-bold text-teal-800">
                {sample.quantity} <span className="text-xs font-normal">{sample.unit}</span>
              </span>
            </div>
            <InfoRow label={t("低库存阈值")} value={sample.alertThreshold != null ? `${sample.alertThreshold} ${sample.unit}` : t("未设置")} />
            <InfoRow label={t("有效期")} value={fmtDate(sample.expiryDate)} highlight={alert === "expired" || alert === "expiring"} />
            <InfoRow
              label={t("存储位置")}
              value={
                sample.location ? (
                  <span className="flex items-center gap-1 justify-end">
                    <MapPin className="h-3 w-3" />
                    {sample.location.name}
                    {sample.location.type === "box" && sample.boxRow && sample.boxCol && (
                      <span className="font-mono text-xs">
                        [{rowLabel(sample.boxRow - 1)}{colLabel(sample.boxCol - 1)}]
                      </span>
                    )}
                  </span>
                ) : (
                  t("未指定")
                )
              }
            />
            {sample.location?.type === "box" && (
              <div className="text-right">
                <Link
                  to={`/storage/box/${sample.location.id}`}
                  className="text-xs text-teal-600 hover:underline"
                >
                  {t("查看冻存盒布局")} →
                </Link>
              </div>
            )}
            <InfoRow
              label={t("所属项目")}
              value={
                sample.project ? (
                  <Link to={`/projects/${sample.project.id}`} className="text-teal-600 hover:underline">
                    {sample.project.name}
                  </Link>
                ) : (
                  t("未关联")
                )
              }
            />
            <InfoRow label={t("登记人")} value={sample.createdByName ?? "—"} />
            <InfoRow label={t("登记时间")} value={fmtDateTime(sample.createdAt)} />
            {sample.notes && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">{t("备注")}</div>
                <p className="text-slate-700 whitespace-pre-wrap">{sample.notes}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-3">
              <Button
                className="bg-teal-600 hover:bg-teal-500"
                onClick={() => {
                  setTxForm({ reason: "restock", amount: "", note: "" });
                  setTxOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> {t("入库")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTxForm({ reason: "consume", amount: "", note: "" });
                  setTxOpen(true);
                }}
              >
                <Minus className="h-4 w-4 mr-1" /> {t("出库")}
              </Button>
              <Button variant="outline" onClick={() => {
                setEditForm({
                  name: sample.name,
                  alertThreshold: sample.alertThreshold != null ? String(sample.alertThreshold) : "",
                  expiryDate: sample.expiryDate ?? "",
                  notes: sample.notes ?? "",
                });
                setEditOpen(true);
              }}>
                <Pencil className="h-4 w-4 mr-1" /> {t("编辑")}
              </Button>
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-600 hover:bg-red-50"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" /> {t("删除")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 右：流水 */}
        <Card className="lg:col-span-2">
          <Tabs defaultValue="tx">
            <CardHeader className="pb-0">
              <TabsList>
                <TabsTrigger value="tx" className="gap-1.5">
                  <History className="h-3.5 w-3.5" /> {t("库存流水")} ({sample.transactions.length})
                </TabsTrigger>
                <TabsTrigger value="usage" className="gap-1.5">
                  <NotebookPen className="h-3.5 w-3.5" /> {t("实验使用")} ({sample.experimentUsage.length})
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="pt-4">
              <TabsContent value="tx" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">{t("时间")}</TableHead>
                      <TableHead className="w-20">{t("类型")}</TableHead>
                      <TableHead className="w-28">{t("变动")}</TableHead>
                      <TableHead>{t("备注")}</TableHead>
                      <TableHead className="w-28">{t("操作人")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sample.transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm text-muted-foreground">{fmtDateTime(tx.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={tx.delta > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
                            {t(TX_REASONS[tx.reason] ?? tx.reason)}
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-mono font-medium ${tx.delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {tx.delta > 0 ? "+" : ""}{tx.delta}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{tx.note || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{tx.userName ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {!sample.transactions.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                          {t("暂无流水记录")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="usage" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">{t("时间")}</TableHead>
                      <TableHead className="w-24">{t("用量")}</TableHead>
                      <TableHead>{t("备注")}</TableHead>
                      <TableHead className="w-28">{t("登记人")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sample.experimentUsage.map((u) => (
                      <TableRow
                        key={u.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/experiments/${u.experimentId}`)}
                      >
                        <TableCell className="text-sm text-muted-foreground">{fmtDateTime(u.createdAt)}</TableCell>
                        <TableCell className="font-mono text-red-500 font-medium">-{u.amountUsed}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.note || "—"}
                          <span className="text-teal-600 text-xs ml-2">{t("查看实验")} →</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.createdByName ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {!sample.experimentUsage.length && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                          <PackageX className="h-6 w-6 mx-auto mb-2 opacity-40" />
                          {t("尚未在任何实验中使用")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {/* 出入库 */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("库存操作")} · {sample.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("操作类型")}</Label>
              <Select value={txForm.reason} onValueChange={(v) => setTxForm({ ...txForm, reason: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restock">{t("入库（补货）")}</SelectItem>
                  <SelectItem value="consume">{t("出库（领用）")}</SelectItem>
                  <SelectItem value="adjust">{t("入库（校正调整）")}</SelectItem>
                  <SelectItem value="dispose">{t("出库（废弃）")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("数量（当前余量 {n} {unit}）", { n: sample.quantity, unit: sample.unit })}</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("备注")}</Label>
              <Input
                value={txForm.note}
                onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
                placeholder={t("批号、用途等…")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={txMut.isPending || !Number(txForm.amount)}
              onClick={() =>
                txMut.mutate({
                  sampleId,
                  reason: txForm.reason as "restock" | "consume" | "adjust" | "dispose",
                  amount: Number(txForm.amount),
                  note: txForm.note || undefined,
                })
              }
            >
              {t("确认")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("编辑样本信息")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("名称")}</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("低库存阈值")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={editForm.alertThreshold}
                  onChange={(e) => setEditForm({ ...editForm, alertThreshold: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("有效期")}</Label>
                <Input
                  type="date"
                  value={editForm.expiryDate}
                  onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("备注")}</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={updateMut.isPending}
              onClick={() =>
                updateMut.mutate({
                  id: sampleId,
                  name: editForm.name,
                  alertThreshold: editForm.alertThreshold ? Number(editForm.alertThreshold) : null,
                  expiryDate: editForm.expiryDate || null,
                  notes: editForm.notes,
                })
              }
            >
              {t("保存")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除样本 {sku}？", { sku: sample.sku })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("样本及其库存流水、实验使用记录将被一并删除，且不可恢复。")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id: sampleId })}
            >
              {t("确认删除")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={highlight ? "text-red-600 font-medium text-right" : "text-slate-700 text-right"}>
        {value}
      </span>
    </div>
  );
}
