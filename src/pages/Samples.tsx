import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, TestTubes, MapPin } from "lucide-react";
import {
  ALERT_LABELS,
  SAMPLE_TYPES,
  fmtDate,
  rowLabel,
  colLabel,
  sampleAlert,
  type SampleType,
} from "@/lib/labels";
import LocationSelect from "@/components/LocationSelect";
import { toast } from "sonner";

const EMPTY_FORM = {
  name: "",
  type: "reagent",
  quantity: "0",
  unit: "管",
  alertThreshold: "",
  locationId: null as number | null,
  boxRow: "",
  boxCol: "",
  projectId: "none",
  expiryDate: "",
  notes: "",
};

export default function Samples() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: samples, isLoading } = trpc.sample.list.useQuery({
    search: search || undefined,
    type: typeFilter === "all" ? undefined : (typeFilter as SampleType),
  });
  const { data: locations } = trpc.storage.tree.useQuery();
  const { data: projects } = trpc.project.options.useQuery();

  const createMut = trpc.sample.create.useMutation({
    onSuccess: (r) => {
      toast.success(`样本 ${r.sku} 已登记`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      utils.sample.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = samples?.filter((s) => !alertsOnly || sampleAlert(s) !== null);

  const selectedLocation = locations?.find((l) => l.id === form.locationId);

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("请输入样本名称");
      return;
    }
    createMut.mutate({
      name: form.name.trim(),
      type: form.type as SampleType,
      quantity: Number(form.quantity) || 0,
      unit: form.unit,
      alertThreshold: form.alertThreshold ? Number(form.alertThreshold) : null,
      locationId: form.locationId,
      boxRow: form.boxRow ? Number(form.boxRow) : null,
      boxCol: form.boxCol ? Number(form.boxCol) : null,
      projectId: form.projectId === "none" ? null : Number(form.projectId),
      expiryDate: form.expiryDate || null,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">样本库存</h1>
          <p className="text-sm text-muted-foreground mt-1">
            样本全生命周期管理 · 效期与低库存自动预警
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 登记样本
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索样本名称或编号…"
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {Object.entries(SAMPLE_TYPES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <Checkbox checked={alertsOnly} onCheckedChange={(c) => setAlertsOnly(c === true)} />
          仅看预警样本
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          共 {filtered?.length ?? 0} 个样本
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">编号</TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-28">类型</TableHead>
                <TableHead className="w-32">余量</TableHead>
                <TableHead className="w-52">存储位置</TableHead>
                <TableHead className="w-28">效期</TableHead>
                <TableHead className="w-24">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((s) => {
                const alert = sampleAlert(s);
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/samples/${s.id}`)}
                  >
                    <TableCell className="font-mono text-xs text-teal-700">{s.sku}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SAMPLE_TYPES[s.type]?.cls}>
                        {SAMPLE_TYPES[s.type]?.label ?? s.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.quantity} {s.unit}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.locationName ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {s.locationName}
                          {s.locationType === "box" && s.boxRow && s.boxCol && (
                            <span className="font-mono text-xs">
                              [{rowLabel(s.boxRow - 1)}{colLabel(s.boxCol - 1)}]
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.expiryDate)}</TableCell>
                    <TableCell>
                      {alert ? (
                        <Badge variant="outline" className={ALERT_LABELS[alert].cls}>
                          {ALERT_LABELS[alert].label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          正常
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && !filtered?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    <TestTubes className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    没有匹配的样本
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 登记样本 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>登记新样本</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>样本名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：pLenti-CD19-CAR-4G 质粒"
              />
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SAMPLE_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>所属项目</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">（不关联项目）</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>初始数量</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>单位</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="管 / µg / mL / 瓶…"
              />
            </div>
            <div className="space-y-2">
              <Label>低库存阈值（可选）</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={form.alertThreshold}
                onChange={(e) => setForm({ ...form, alertThreshold: e.target.value })}
                placeholder="低于该数量时预警"
              />
            </div>
            <div className="space-y-2">
              <Label>有效期（可选）</Label>
              <Input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>存储位置</Label>
              <LocationSelect
                locations={locations ?? []}
                value={form.locationId}
                onChange={(id) => setForm({ ...form, locationId: id })}
              />
            </div>
            {selectedLocation?.type === "box" && (
              <>
                <div className="space-y-2">
                  <Label>盒内行（1-{selectedLocation.rows}）</Label>
                  <Input
                    type="number"
                    min="1"
                    max={selectedLocation.rows ?? 9}
                    value={form.boxRow}
                    onChange={(e) => setForm({ ...form, boxRow: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>盒内列（1-{selectedLocation.cols}）</Label>
                  <Input
                    type="number"
                    min="1"
                    max={selectedLocation.cols ?? 9}
                    value={form.boxCol}
                    onChange={(e) => setForm({ ...form, boxCol: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="space-y-2 col-span-2">
              <Label>备注</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="浓度、代次、来源等补充信息…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending}
              onClick={submit}
            >
              登记入库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
