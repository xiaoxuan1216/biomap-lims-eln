import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  CalendarClock,
  Wrench,
  Trash2,
  MapPin,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { EQUIP_CATEGORIES, EQUIP_STATUS, MAINT_TYPES, fmtDate, fmtDateTime } from "@/lib/labels";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { DriverBindingCard } from "@/components/equipment/DriverBindingCard";

export default function EquipmentDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const equipId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: eqp, isLoading } = trpc.equipment.byId.useQuery({ id: equipId });

  const [bookOpen, setBookOpen] = useState(false);
  const [bookForm, setBookForm] = useState({ date: "", start: "09:00", end: "11:00", purpose: "" });
  const [maintOpen, setMaintOpen] = useState(false);
  const [maintForm, setMaintForm] = useState({ type: "maintenance", description: "", nextDueDate: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = () => {
    utils.equipment.byId.invalidate({ id: equipId });
    utils.equipment.list.invalidate();
    utils.equipment.todayBookings.invalidate();
  };

  const statusMut = trpc.equipment.update.useMutation({
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e.message),
  });
  const bookMut = trpc.equipment.book.useMutation({
    onSuccess: () => {
      toast.success(t("预约成功"));
      setBookOpen(false);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.equipment.cancelBooking.useMutation({
    onSuccess: () => {
      toast.success(t("预约已取消"));
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const maintMut = trpc.equipment.addMaintenance.useMutation({
    onSuccess: () => {
      toast.success(t("维护记录已登记"));
      setMaintOpen(false);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.equipment.delete.useMutation({
    onSuccess: () => {
      toast.success(t("设备已删除"));
      navigate("/equipment");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !eqp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const cat = EQUIP_CATEGORIES[eqp.category];
  const st = EQUIP_STATUS[eqp.status];
  const calOverdue = eqp.nextCalibrationDate && eqp.nextCalibrationDate <= new Date().toISOString().slice(0, 10);
  const activeBookings = eqp.bookings.filter((b) => b.status === "active" && b.endTime >= new Date());

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/equipment")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回设备列表")}
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{eqp.name}</h1>
          <Badge variant="outline" className={cat.cls}>{t(cat.label)}</Badge>
          <Badge variant="outline" className={st.cls}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot} mr-1`} />
            {t(st.label)}
          </Badge>
          {calOverdue && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <AlertTriangle className="h-3 w-3 mr-1" /> {t("校准超期")}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 左：信息卡 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("设备档案")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label={t("型号")} value={eqp.model ?? "—"} />
            <InfoRow label={t("序列号")} value={eqp.serialNo ?? "—"} />
            <InfoRow
              label={t("位置")}
              value={
                <span className="flex items-center gap-1 justify-end">
                  <MapPin className="h-3 w-3" /> {eqp.room ?? "—"}
                </span>
              }
            />
            <InfoRow label={t("负责人")} value={eqp.responsibleName ?? t("公共")} />
            <InfoRow
              label={t("下次校准")}
              value={fmtDate(eqp.nextCalibrationDate)}
              highlight={!!calOverdue}
            />
            {eqp.specs && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">{t("技术规格")}</div>
                <p className="text-slate-700 whitespace-pre-wrap">{eqp.specs}</p>
              </div>
            )}

            <div className="space-y-2 pt-3">
              <Button
                className="w-full bg-teal-600 hover:bg-teal-500"
                disabled={eqp.status === "maintenance" || eqp.status === "fault"}
                onClick={() => {
                  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                  setBookForm({ date: tomorrow, start: "09:00", end: "11:00", purpose: "" });
                  setBookOpen(true);
                }}
              >
                <CalendarClock className="h-4 w-4 mr-1.5" /> {t("预约机时")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={eqp.status}
                  onValueChange={(v) => statusMut.mutate({ id: equipId, status: v as "available" })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EQUIP_STATUS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{t(v.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => {
                  setMaintForm({ type: "maintenance", description: "", nextDueDate: "" });
                  setMaintOpen(true);
                }}>
                  <Wrench className="h-4 w-4 mr-1" /> {t("维护登记")}
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full text-red-600 hover:text-red-600 hover:bg-red-50"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> {t("删除设备")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 右：预约与维护 */}
        <Card className="lg:col-span-2">
          <Tabs defaultValue="bookings">
            <CardHeader className="pb-0">
              <TabsList>
                <TabsTrigger value="bookings" className="gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> {t("预约记录")}（{eqp.bookings.length}）
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> {t("维护记录")}（{eqp.maintenance.length}）
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="pt-4">
              <TabsContent value="bookings" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">{t("开始")}</TableHead>
                      <TableHead className="w-36">{t("结束")}</TableHead>
                      <TableHead className="w-28">{t("预约人")}</TableHead>
                      <TableHead>{t("用途")}</TableHead>
                      <TableHead className="w-24">{t("状态")}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eqp.bookings.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm">{fmtDateTime(b.startTime)}</TableCell>
                        <TableCell className="text-sm">{fmtDateTime(b.endTime)}</TableCell>
                        <TableCell className="text-sm">{b.userName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.purpose ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              b.status === "active"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : b.status === "cancelled"
                                  ? "bg-slate-100 text-slate-500 border-slate-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }
                          >
                            {b.status === "active" ? t("已预约") : b.status === "cancelled" ? t("已取消") : t("已完成")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {b.status === "active" && (b.userName === user?.name || user?.role === "admin") && (
                            <button
                              className="text-slate-300 hover:text-red-500"
                              onClick={() => cancelMut.mutate({ bookingId: b.id })}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!eqp.bookings.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          {t("暂无预约记录")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="maintenance" className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">{t("时间")}</TableHead>
                      <TableHead className="w-20">{t("类型")}</TableHead>
                      <TableHead>{t("内容")}</TableHead>
                      <TableHead className="w-28">{t("执行人")}</TableHead>
                      <TableHead className="w-28">{t("下次到期")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eqp.maintenance.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{fmtDate(m.performedAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-slate-50">{MAINT_TYPES[m.type]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.description ?? "—"}</TableCell>
                        <TableCell className="text-sm">{m.performedBy ?? "—"}</TableCell>
                        <TableCell className="text-sm">{fmtDate(m.nextDueDate)}</TableCell>
                      </TableRow>
                    ))}
                    {!eqp.maintenance.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                          {t("暂无维护记录")}
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

      <DriverBindingCard
        equipmentId={equipId}
        equipmentName={eqp.name}
        isAdmin={user?.role === "admin"}
      />

      {/* 预约对话框 */}
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("预约「{name}」", { name: eqp.name })}</DialogTitle>
          </DialogHeader>
          {activeBookings.length > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
              {t("已有 {n} 个有效预约，最近：{time}", { n: activeBookings.length, time: fmtDateTime(activeBookings[activeBookings.length - 1].startTime) })}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("日期")}</Label>
              <Input type="date" value={bookForm.date} onChange={(e) => setBookForm({ ...bookForm, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("开始时间")}</Label>
                <Input type="time" value={bookForm.start} onChange={(e) => setBookForm({ ...bookForm, start: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t("结束时间")}</Label>
                <Input type="time" value={bookForm.end} onChange={(e) => setBookForm({ ...bookForm, end: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("用途")}</Label>
              <Input value={bookForm.purpose} onChange={(e) => setBookForm({ ...bookForm, purpose: e.target.value })} placeholder={t("例如：CAR 阳性率流式检测（EXP-0001）")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={bookMut.isPending || !bookForm.date}
              onClick={() =>
                bookMut.mutate({
                  equipmentId: equipId,
                  startTime: new Date(`${bookForm.date}T${bookForm.start}:00`),
                  endTime: new Date(`${bookForm.date}T${bookForm.end}:00`),
                  purpose: bookForm.purpose || undefined,
                })
              }
            >
              {t("确认预约")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 维护登记 */}
      <Dialog open={maintOpen} onOpenChange={setMaintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("维护登记")} · {eqp.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("类型")}</Label>
              <Select value={maintForm.type} onValueChange={(v) => setMaintForm({ ...maintForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MAINT_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{t(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("内容")}</Label>
              <Input
                value={maintForm.description}
                onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
                placeholder={t("例如：光路校准与流动槽更换")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("下次到期日（可选）")}</Label>
              <Input
                type="date"
                value={maintForm.nextDueDate}
                onChange={(e) => setMaintForm({ ...maintForm, nextDueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={maintMut.isPending}
              onClick={() =>
                maintMut.mutate({
                  equipmentId: equipId,
                  type: maintForm.type as "maintenance",
                  description: maintForm.description || undefined,
                  nextDueDate: maintForm.nextDueDate || null,
                })
              }
            >
              {t("登记")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除设备「{name}」？", { name: eqp.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("设备及其预约、维护记录将被一并删除。")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id: equipId })}
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
