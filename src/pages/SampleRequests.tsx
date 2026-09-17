import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  PackageCheck,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtDateTime } from "@/lib/labels";

const REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "草稿", cls: "bg-slate-50 text-slate-700 border-slate-200" },
  reserved: { label: "已预占", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_fulfillment: { label: "履约中", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  fulfilled: { label: "已完成", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "已取消", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const PRIORITY: Record<string, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

type RequestLine = {
  sampleId: string;
  amount: string;
  targetFormat: string;
  note: string;
};

type RequestForm = {
  title: string;
  purpose: string;
  projectId: string;
  priority: "low" | "normal" | "high" | "urgent";
  neededBy: string;
  items: RequestLine[];
};

const EMPTY_LINE: RequestLine = { sampleId: "", amount: "", targetFormat: "", note: "" };
const EMPTY_FORM: RequestForm = {
  title: "",
  purpose: "",
  projectId: "",
  priority: "normal",
  neededBy: "",
  items: [{ ...EMPTY_LINE }],
};

export default function SampleRequests() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const utils = trpc.useUtils();
  const initialSampleId = searchParams.get("sampleId") || "";
  const [createOpen, setCreateOpen] = useState(Boolean(initialSampleId));
  const [form, setForm] = useState<RequestForm>(() =>
    initialSampleId
      ? { ...EMPTY_FORM, items: [{ ...EMPTY_LINE, sampleId: initialSampleId }] }
      : EMPTY_FORM,
  );

  const { data: requests, isLoading } = trpc.sampleRequest.list.useQuery();
  const { data: projects } = trpc.project.options.useQuery();
  const { data: sampleOptions } = trpc.sampleRequest.availableSamples.useQuery();

  const createMut = trpc.sampleRequest.create.useMutation({
    onSuccess: async ({ id }) => {
      toast.success(t("样品请求草稿已创建"));
      await utils.sampleRequest.list.invalidate();
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      navigate(`/sample-requests/${id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const summary = useMemo(() => {
    const rows = requests ?? [];
    return {
      total: rows.length,
      waiting: rows.filter((request) => request.status === "reserved").length,
      running: rows.filter((request) => request.status === "in_fulfillment").length,
      fulfilled: rows.filter((request) => request.status === "fulfilled").length,
    };
  }, [requests]);

  const updateLine = (index: number, patch: Partial<RequestLine>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const submit = () => {
    if (!form.title.trim()) return toast.error(t("请填写请求标题"));
    if (form.items.some((item) => !item.sampleId || Number(item.amount) <= 0)) {
      return toast.error(t("请为每个样品填写有效数量"));
    }
    createMut.mutate({
      title: form.title,
      purpose: form.purpose || null,
      projectId: form.projectId ? Number(form.projectId) : null,
      priority: form.priority,
      neededBy: form.neededBy || null,
      items: form.items.map((item) => ({
        sampleId: Number(item.sampleId),
        amount: Number(item.amount),
        targetFormat: item.targetFormat || null,
        note: item.note || null,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-teal-600" />
            <h1 className="text-2xl font-bold tracking-tight">{t("样品请求与履约")}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("把样品需求转成可校验、可预占、可领取和可追溯的履约任务。")}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-teal-600 hover:bg-teal-500">
          <Plus className="mr-2 h-4 w-4" /> {t("新建样品请求")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "请求总数", value: summary.total, icon: ClipboardList, cls: "text-slate-600" },
          { label: "待领取任务", value: summary.waiting, icon: Clock3, cls: "text-blue-600" },
          { label: "履约中", value: summary.running, icon: AlertTriangle, cls: "text-amber-600" },
          { label: "已完成", value: summary.fulfilled, icon: CheckCircle2, cls: "text-emerald-600" },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{t(card.label)}</p>
                <p className="mt-1 text-2xl font-semibold">{card.value}</p>
              </div>
              <card.icon className={`h-7 w-7 ${card.cls}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("请求编号")}</TableHead>
                <TableHead>{t("标题")}</TableHead>
                <TableHead>{t("项目")}</TableHead>
                <TableHead>{t("优先级")}</TableHead>
                <TableHead>{t("状态")}</TableHead>
                <TableHead>{t("明细进度")}</TableHead>
                <TableHead>{t("需要日期")}</TableHead>
                <TableHead>{t("创建时间")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">{t("加载中…")}</TableCell></TableRow>
              ) : requests?.length ? (
                requests.map((request) => {
                  const status = REQUEST_STATUS[request.status];
                  return (
                    <TableRow
                      key={request.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sample-requests/${request.id}`)}
                    >
                      <TableCell className="font-mono text-xs text-teal-700">{request.requestNo}</TableCell>
                      <TableCell className="font-medium">{request.title}</TableCell>
                      <TableCell>{request.projectName || "—"}</TableCell>
                      <TableCell>{t(PRIORITY[request.priority])}</TableCell>
                      <TableCell><Badge variant="outline" className={status?.cls}>{t(status?.label ?? request.status)}</Badge></TableCell>
                      <TableCell>{request.fulfilledItemCount}/{request.itemCount}</TableCell>
                      <TableCell>{request.neededBy ? fmtDate(request.neededBy) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDateTime(request.createdAt)}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-muted-foreground">
                    <PackageCheck className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    {t("还没有样品请求")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{t("新建样品请求")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("请求标题")} *</Label>
              <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t("例如：蛋白纯化实验样品领用")} />
            </div>
            <div className="space-y-2">
              <Label>{t("所属项目")}</Label>
              <Select value={form.projectId || "none"} onValueChange={(value) => setForm({ ...form, projectId: value === "none" ? "" : value })}>
                <SelectTrigger><SelectValue placeholder={t("不关联项目")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("不关联项目")}</SelectItem>
                  {projects?.map((project) => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("优先级")}</Label>
              <Select value={form.priority} onValueChange={(value: RequestForm["priority"]) => setForm({ ...form, priority: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PRIORITY).map(([value, label]) => <SelectItem key={value} value={value}>{t(label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("需要日期")}</Label>
              <Input type="date" value={form.neededBy} onChange={(event) => setForm({ ...form, neededBy: event.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("用途说明")}</Label>
              <Textarea value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder={t("说明实验用途、交付要求或注意事项")} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("样品明细")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, items: [...current.items, { ...EMPTY_LINE }] }))}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {t("添加样品")}
              </Button>
            </div>
            {form.items.map((item, index) => {
              const selected = sampleOptions?.find((sample) => sample.id === Number(item.sampleId));
              return (
                <div key={index} className="grid gap-3 rounded-lg border bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1.4fr_auto]">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("样品")}</Label>
                    <Select value={item.sampleId} onValueChange={(value) => updateLine(index, { sampleId: value })}>
                      <SelectTrigger><SelectValue placeholder={t("选择样品")} /></SelectTrigger>
                      <SelectContent>
                        {sampleOptions?.map((sample) => (
                          <SelectItem key={sample.id} value={String(sample.id)} disabled={sample.availableQuantity <= 0}>
                            {sample.sku} · {sample.name} · {t("可用")} {sample.availableQuantity} {sample.unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("请求数量")}</Label>
                    <div className="flex items-center gap-2"><Input type="number" min="0.001" step="0.001" value={item.amount} onChange={(event) => updateLine(index, { amount: event.target.value })} /><span className="text-sm text-muted-foreground">{selected?.unit || "—"}</span></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("目标形式")}</Label>
                    <Input value={item.targetFormat} onChange={(event) => updateLine(index, { targetFormat: event.target.value })} placeholder={t("如：2 管，每管 50 µL")} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="self-end text-muted-foreground" disabled={form.items.length === 1} onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="space-y-1.5 sm:col-span-4">
                    <Label className="text-xs">{t("明细备注")}</Label>
                    <Input value={item.note} onChange={(event) => updateLine(index, { note: event.target.value })} placeholder={t("可选：批次、浓度或包装要求")} />
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("取消")}</Button>
            <Button onClick={submit} disabled={createMut.isPending}>{createMut.isPending ? t("创建中…") : t("创建草稿")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
