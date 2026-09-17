import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  MonitorCog,
  Microscope,
  Cog,
  Bot,
  Wrench,
  CalendarClock,
  AlertTriangle,
  MapPin,
  Cable,
} from "lucide-react";
import { EQUIP_CATEGORIES, EQUIP_STATUS, fmtDate } from "@/lib/labels";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

const CATEGORY_ICONS: Record<string, typeof Microscope> = {
  analytical: Microscope,
  execution: Cog,
  automation: Bot,
  support: Wrench,
};

const EMPTY_FORM = {
  name: "",
  category: "analytical",
  model: "",
  serialNo: "",
  room: "",
  responsibleName: "",
  specs: "",
  nextCalibrationDate: "",
};

export default function Equipment() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [category, setCategory] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [calibrationCutoff] = useState(() =>
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  );

  const { data: equipment, isLoading } = trpc.equipment.list.useQuery({
    category: category === "all" ? undefined : (category as "analytical"),
  });
  const { data: todayBookings } = trpc.equipment.todayBookings.useQuery();

  const createMut = trpc.equipment.create.useMutation({
    onSuccess: () => {
      toast.success(t("设备已登记"));
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      utils.equipment.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);
  const counts: Record<string, number> = {
    available: equipment?.filter((e) => e.status === "available").length ?? 0,
    in_use: equipment?.filter((e) => e.status === "in_use").length ?? 0,
    maintenance: equipment?.filter((e) => e.status === "maintenance").length ?? 0,
    fault: equipment?.filter((e) => e.status === "fault").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("设备管理")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("分析设备 · 执行设备 · 自动化岛台的台账、预约与维护")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/drivers")}>
            <Cable className="h-4 w-4 mr-1" /> {t("驱动中心")}
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t("登记设备")}
          </Button>
        </div>
      </div>

      {/* 状态统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.keys(EQUIP_STATUS) as (keyof typeof EQUIP_STATUS)[]).map((k) => {
          const st = EQUIP_STATUS[k];
          return (
            <Card key={k}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${st.dot}`} />
                <div>
                  <div className="text-xl font-bold leading-none">{counts[k]}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t(st.label)}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 左：设备列表 */}
        <div className="lg:col-span-2 space-y-4">
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList>
              <TabsTrigger value="all">{t("全部")}</TabsTrigger>
              {Object.entries(EQUIP_CATEGORIES).map(([k, v]) => (
                <TabsTrigger key={k} value={k}>{t(v.label)}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoading ? (
            <Card className="h-64 animate-pulse bg-slate-100" />
          ) : equipment?.length ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {equipment.map((e) => {
                const cat = EQUIP_CATEGORIES[e.category];
                const st = EQUIP_STATUS[e.status];
                const Icon = CATEGORY_ICONS[e.category] ?? MonitorCog;
                const calDue =
                  e.nextCalibrationDate &&
                  e.nextCalibrationDate <= calibrationCutoff;
                return (
                  <Card
                    key={e.id}
                    className="cursor-pointer hover:shadow-md hover:border-teal-200 transition-all"
                    onClick={() => navigate(`/equipment/${e.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${cat.cls.replace("border-", "").split(" ").slice(0, 2).join(" ")}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm truncate">{e.name}</h3>
                            <Badge variant="outline" className={`${st.cls} shrink-0`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${st.dot} mr-1`} />
                              {t(st.label)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {e.model ?? "—"} {e.serialNo && `· SN ${e.serialNo}`}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {e.room && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {e.room}
                              </span>
                            )}
                            {e.todayBookingCount > 0 && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <CalendarClock className="h-3 w-3" /> {t("今日 {n} 个预约", { n: e.todayBookingCount })}
                              </span>
                            )}
                          </div>
                          {calDue && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              {t("校准到期：")}{fmtDate(e.nextCalibrationDate)}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="py-16">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <MonitorCog className="h-10 w-10 opacity-40" />
                <p>{t("暂无设备，点击「登记设备」建立设备台账")}</p>
              </div>
            </Card>
          )}
        </div>

        {/* 右：今明预约 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-600" />
              {t("今明两天机时")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todayBookings?.length ? (
              todayBookings.map((b) => (
                <div key={b.id} className="rounded-lg border px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{b.equipmentName}</span>
                    <Badge variant="outline" className={EQUIP_CATEGORIES[b.category ?? "support"]?.cls}>
                      {t(EQUIP_CATEGORIES[b.category ?? "support"]?.label ?? "")}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {b.startTime.toLocaleString(lang === "en" ? "en-US" : "zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {" — "}
                    {b.endTime.toLocaleString(lang === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    {b.startTime.toISOString().slice(0, 10) === today ? t("（今天）") : t("（明天）")}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {b.userName}
                    {b.purpose && ` · ${b.purpose}`}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("今明两天没有预约")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 登记设备 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("登记新设备")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("设备名称")} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("例如：流式细胞仪")} />
            </div>
            <div className="space-y-2">
              <Label>{t("类别")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EQUIP_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{t(v.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("型号")}</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={t("例如：BD FACSCanto II")} />
            </div>
            <div className="space-y-2">
              <Label>{t("序列号（SN）")}</Label>
              <Input value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("所在位置")}</Label>
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder={t("例如：B2-204")} />
            </div>
            <div className="space-y-2">
              <Label>{t("负责人")}</Label>
              <Input value={form.responsibleName} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("下次校准日期")}</Label>
              <Input type="date" value={form.nextCalibrationDate} onChange={(e) => setForm({ ...form, nextCalibrationDate: e.target.value })} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>{t("技术规格")}</Label>
              <Textarea value={form.specs} onChange={(e) => setForm({ ...form, specs: e.target.value })} rows={2} placeholder={t("激光配置、通量、精度等关键参数…")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !form.name.trim()}
              onClick={() =>
                createMut.mutate({
                  name: form.name.trim(),
                  category: form.category as "analytical",
                  model: form.model || undefined,
                  serialNo: form.serialNo || undefined,
                  room: form.room || undefined,
                  responsibleName: form.responsibleName || undefined,
                  specs: form.specs || undefined,
                  nextCalibrationDate: form.nextCalibrationDate || null,
                })
              }
            >
              {t("登记")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
