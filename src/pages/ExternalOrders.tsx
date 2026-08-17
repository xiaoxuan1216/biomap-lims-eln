import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Handshake,
  PackageCheck,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
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
import { CroServiceRequirementFields } from "@/components/external-orders/CroServiceRequirementFields";
import { Progress } from "@/components/ui/progress";
import { fmtDate, SAMPLE_TYPES } from "@/lib/labels";
import { useI18n } from "@/i18n";
import {
  ORDER_PRIORITY,
  PROVIDER_QUALIFICATION,
  PROVIDER_TYPE_LABELS,
  PROVIDER_TYPES,
  externalOrderStage,
} from "@contracts/externalOrder";
import {
  getCroCatalog,
  getCroServiceTemplate,
  initialCroRequirementData,
  validateCroRequirementData,
  type CroRequirementData,
} from "@contracts/croCatalog";

type Priority = keyof typeof ORDER_PRIORITY;
type ProviderType = (typeof PROVIDER_TYPES)[number];
type Qualification = keyof typeof PROVIDER_QUALIFICATION;

type PlannedSampleForm = {
  sampleId: string;
  amount: string;
  purpose: string;
};

type OrderForm = {
  projectId: string;
  providerId: string;
  title: string;
  objective: string;
  ownerName: string;
  priority: Priority;
  currency: string;
  quotedAmount: string;
  expectedDeliveryDate: string;
  initialItemName: string;
  initialItemDescription: string;
  acceptanceCriteria: string;
  serviceTemplateKey: string;
  requirementData: CroRequirementData;
  samples: PlannedSampleForm[];
};

const EMPTY_ORDER: OrderForm = {
  projectId: "",
  providerId: "",
  title: "",
  objective: "",
  ownerName: "",
  priority: "normal",
  currency: "CNY",
  quotedAmount: "",
  expectedDeliveryDate: "",
  initialItemName: "",
  initialItemDescription: "",
  acceptanceCriteria: "",
  serviceTemplateKey: "",
  requirementData: {},
  samples: [],
};

type ProviderForm = {
  name: string;
  type: ProviderType;
  qualificationStatus: Qualification;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  certifications: string;
  specialties: string;
};

const EMPTY_PROVIDER: ProviderForm = {
  name: "",
  type: "cro",
  qualificationStatus: "pending",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  certifications: "",
  specialties: "",
};

function money(amount: number | null, currency: string, lang: "zh" | "en") {
  if (amount == null) return "—";
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ExternalOrders() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [sampleSearch, setSampleSearch] = useState("");
  const [form, setForm] = useState<OrderForm>(EMPTY_ORDER);
  const [providerForm, setProviderForm] =
    useState<ProviderForm>(EMPTY_PROVIDER);

  const { data: orders, isLoading } = trpc.externalOrder.list.useQuery({
    search: search.trim() || undefined,
  });
  const { data: providers } = trpc.externalOrder.providers.useQuery();
  const { data: projects } = trpc.project.options.useQuery();
  const { data: sampleOptions, isLoading: samplesLoading } =
    trpc.sample.options.useQuery(
      form.projectId ? { projectId: Number(form.projectId) } : undefined,
      { enabled: Boolean(form.projectId) }
    );
  const selectedProvider = providers?.find(
    provider => provider.id === Number(form.providerId)
  );
  const selectedCatalog = getCroCatalog(selectedProvider?.catalogKey);
  const selectedTemplate = getCroServiceTemplate(
    selectedProvider?.catalogKey,
    form.serviceTemplateKey
  );
  const structuredRequirementErrors = selectedTemplate
    ? validateCroRequirementData(selectedTemplate, form.requirementData)
    : [];
  const selectedSampleIds = new Set(
    form.samples.map(sample => Number(sample.sampleId))
  );
  const visibleSampleOptions = (sampleOptions ?? [])
    .filter(sample => Number(sample.quantity) > 0)
    .filter(sample => !selectedSampleIds.has(sample.id))
    .filter(sample => {
      const query = sampleSearch.trim().toLowerCase();
      return (
        !query ||
        sample.sku.toLowerCase().includes(query) ||
        sample.name.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const rank = (type: string) =>
        type === "antibody" ? 0 : type === "protein" ? 1 : 2;
      return rank(a.type) - rank(b.type) || a.name.localeCompare(b.name);
    });
  const selectedSamplesValid = form.samples.every(selected => {
    const sample = sampleOptions?.find(
      option => option.id === Number(selected.sampleId)
    );
    const amount = Number(selected.amount);
    return sample && amount > 0 && amount <= Number(sample.quantity);
  });
  const canCreateOrder = Boolean(
    form.projectId &&
    form.providerId &&
    form.title.trim() &&
    (selectedTemplate
      ? structuredRequirementErrors.length === 0
      : form.initialItemName.trim()) &&
    selectedSamplesValid
  );

  const createMut = trpc.externalOrder.create.useMutation({
    onSuccess: ({ id, orderNo }) => {
      toast.success(t("外部委托 {orderNo} 已创建", { orderNo }));
      setCreateOpen(false);
      setForm(EMPTY_ORDER);
      setSampleSearch("");
      utils.externalOrder.list.invalidate();
      navigate(`/external-orders/${id}`);
    },
    onError: error => toast.error(error.message),
  });
  const providerMut = trpc.externalOrder.createProvider.useMutation({
    onSuccess: ({ id }) => {
      toast.success(t("服务商已登记"));
      setProviderOpen(false);
      setProviderForm(EMPTY_PROVIDER);
      setForm(value => ({ ...value, providerId: String(id) }));
      utils.externalOrder.providers.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const stats = useMemo(() => {
    const rows = orders ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return {
      active: rows.filter(
        order =>
          order.qualityStatus !== "accepted" &&
          order.commercialStatus !== "cancelled"
      ).length,
      shipping: rows.filter(order => order.executionStatus === "in_transit")
        .length,
      review: rows.filter(
        order =>
          order.qualityStatus === "pending_review" ||
          order.qualityStatus === "changes_requested"
      ).length,
      overdue: rows.filter(
        order =>
          order.expectedDeliveryDate &&
          order.expectedDeliveryDate < today &&
          order.qualityStatus !== "accepted" &&
          order.commercialStatus !== "cancelled"
      ).length,
    };
  }, [orders]);

  const submitOrder = () => {
    if (!canCreateOrder) {
      if (structuredRequirementErrors.length)
        toast.error(t("请完成所有必填的结构化需求参数"));
      return;
    }
    createMut.mutate({
      projectId: Number(form.projectId),
      providerId: Number(form.providerId),
      title: form.title.trim(),
      objective: form.objective || undefined,
      ownerName: form.ownerName || undefined,
      priority: form.priority,
      currency: form.currency,
      quotedAmount: form.quotedAmount ? Number(form.quotedAmount) : undefined,
      expectedDeliveryDate: form.expectedDeliveryDate || undefined,
      initialItemName: selectedTemplate?.name ?? form.initialItemName.trim(),
      initialItemDescription: form.initialItemDescription || undefined,
      acceptanceCriteria:
        selectedTemplate?.acceptanceCriteria ??
        (form.acceptanceCriteria || undefined),
      serviceTemplateKey: selectedTemplate?.key,
      requirementData: selectedTemplate ? form.requirementData : undefined,
      samples: form.samples.map(selected => {
        const sample = sampleOptions?.find(
          option => option.id === Number(selected.sampleId)
        );
        return {
          sampleId: Number(selected.sampleId),
          amount: Number(selected.amount),
          unit: sample?.unit ?? "",
          purpose: selected.purpose || undefined,
        };
      }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Handshake className="h-6 w-6 text-pink-600" /> {t("外部委托")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("统一管理 CRO、CDMO 与第三方平台的需求、送样、执行、交付和验收")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setProviderOpen(true)}>
            <Building2 className="mr-1 h-4 w-4" /> {t("登记服务商")}
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-500"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" /> {t("新建委托")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: t("进行中委托"),
            value: stats.active,
            icon: Clock3,
            cls: "text-blue-600",
          },
          {
            label: t("样本运输中"),
            value: stats.shipping,
            icon: PackageCheck,
            cls: "text-sky-600",
          },
          {
            label: t("交付待验收"),
            value: stats.review,
            icon: CheckCircle2,
            cls: "text-amber-600",
          },
          {
            label: t("已逾期"),
            value: stats.overdue,
            icon: AlertTriangle,
            cls: "text-rose-600",
          },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <stat.icon className={`h-5 w-5 ${stat.cls}`} />
              <div>
                <div className="text-xl font-bold leading-none">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={t("搜索委托编号、标题或服务商")}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-72 animate-pulse bg-slate-50" />
          ) : orders?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t("委托编号")}</TableHead>
                  <TableHead>{t("委托需求")}</TableHead>
                  <TableHead className="w-40">{t("服务商")}</TableHead>
                  <TableHead className="w-40">{t("项目")}</TableHead>
                  <TableHead className="w-44">{t("综合进度")}</TableHead>
                  <TableHead className="w-28">{t("预计交付")}</TableHead>
                  <TableHead className="w-28 text-right">{t("报价")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => {
                  const stage = externalOrderStage(order);
                  const priority = ORDER_PRIORITY[order.priority];
                  const qualification = order.providerQualification
                    ? PROVIDER_QUALIFICATION[order.providerQualification]
                    : null;
                  const overdue =
                    !!order.expectedDeliveryDate &&
                    order.expectedDeliveryDate <
                      new Date().toISOString().slice(0, 10) &&
                    order.qualityStatus !== "accepted" &&
                    order.commercialStatus !== "cancelled";
                  return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/external-orders/${order.id}`)}
                    >
                      <TableCell>
                        <div className="font-mono text-xs font-semibold text-teal-700">
                          {order.orderNo}
                        </div>
                        <Badge
                          variant="outline"
                          className={`mt-1 ${priority.cls}`}
                        >
                          {t(priority.label)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{order.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t("{items} 个服务项 · {files} 份交付物", {
                            items: order.itemCount,
                            files: order.deliverableCount,
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {order.providerName ?? "—"}
                        </div>
                        {qualification && (
                          <Badge
                            variant="outline"
                            className={`mt-1 ${qualification.cls}`}
                          >
                            {t(qualification.label)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.projectName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant="outline" className={stage.cls}>
                            {t(stage.label)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {stage.progress}%
                          </span>
                        </div>
                        <Progress value={stage.progress} className="h-1.5" />
                      </TableCell>
                      <TableCell
                        className={
                          overdue
                            ? "font-medium text-rose-600"
                            : "text-muted-foreground"
                        }
                      >
                        {fmtDate(order.expectedDeliveryDate)}
                        {overdue && (
                          <div className="text-[11px]">{t("已逾期")}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {money(order.quotedAmount, order.currency, lang)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
              <Handshake className="h-10 w-10 opacity-40" />
              <p>{t("暂无外部委托，点击“新建委托”开始登记")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("新建外部委托")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("所属项目")}</Label>
              <Select
                value={form.projectId}
                onValueChange={value => {
                  setForm({ ...form, projectId: value, samples: [] });
                  setSampleSearch("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("选择项目")} />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("CRO / 服务商")}</Label>
              <Select
                value={form.providerId}
                onValueChange={value => {
                  const provider = providers?.find(
                    entry => entry.id === Number(value)
                  );
                  const catalog = getCroCatalog(provider?.catalogKey);
                  const firstTemplate = catalog?.services[0];
                  setForm({
                    ...form,
                    providerId: value,
                    serviceTemplateKey: firstTemplate?.key ?? "",
                    requirementData: firstTemplate
                      ? initialCroRequirementData(firstTemplate)
                      : {},
                    initialItemName: "",
                    initialItemDescription: "",
                    acceptanceCriteria: "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("选择服务商")} />
                </SelectTrigger>
                <SelectContent>
                  {providers?.map(provider => (
                    <SelectItem key={provider.id} value={String(provider.id)}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("委托标题")}</Label>
              <Input
                value={form.title}
                onChange={event =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder={t("例如：候选抗体 SPR 亲和力检测")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("研究目的")}</Label>
              <Textarea
                rows={2}
                value={form.objective}
                onChange={event =>
                  setForm({ ...form, objective: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("内部负责人")}</Label>
              <Input
                value={form.ownerName}
                onChange={event =>
                  setForm({ ...form, ownerName: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("优先级")}</Label>
              <Select
                value={form.priority}
                onValueChange={value =>
                  setForm({ ...form, priority: value as Priority })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_PRIORITY).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {t(value.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("报价")}</Label>
              <div className="flex gap-2">
                <Select
                  value={form.currency}
                  onValueChange={value => setForm({ ...form, currency: value })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  value={form.quotedAmount}
                  onChange={event =>
                    setForm({ ...form, quotedAmount: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("预计交付日期")}</Label>
              <Input
                type="date"
                value={form.expectedDeliveryDate}
                onChange={event =>
                  setForm({ ...form, expectedDeliveryDate: event.target.value })
                }
              />
            </div>
            <div className="space-y-4 rounded-xl border bg-slate-50/70 p-4 sm:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Label className="text-sm font-semibold">
                    {t("计划送样（可选）")}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "可直接选择当前项目或公共库存中的样本；创建委托只登记计划，不扣减库存。"
                    )}
                  </p>
                </div>
                {form.samples.length > 0 && (
                  <Badge variant="outline" className="bg-white">
                    {t("已选 {count} 个样本", { count: form.samples.length })}
                  </Badge>
                )}
              </div>

              {!form.projectId ? (
                <div className="rounded-lg border border-dashed bg-white px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("先选择所属项目后，系统会加载可用样本")}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="bg-white pl-9"
                      value={sampleSearch}
                      onChange={event => setSampleSearch(event.target.value)}
                      placeholder={t("搜索样本编号或名称")}
                    />
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {samplesLoading ? (
                      <div className="h-16 animate-pulse rounded-lg bg-white" />
                    ) : visibleSampleOptions.length ? (
                      visibleSampleOptions.slice(0, 12).map(sample => {
                        const meta = SAMPLE_TYPES[sample.type];
                        return (
                          <button
                            key={sample.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left transition-colors hover:border-teal-300 hover:bg-teal-50"
                            onClick={() =>
                              setForm(value => ({
                                ...value,
                                samples: [
                                  ...value.samples,
                                  {
                                    sampleId: String(sample.id),
                                    amount: String(
                                      Math.min(1, Number(sample.quantity))
                                    ),
                                    purpose: selectedTemplate?.name ?? "",
                                  },
                                ],
                              }))
                            }
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                <span className="font-mono text-xs text-teal-700">
                                  {sample.sku}
                                </span>{" "}
                                · {sample.name}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge
                                  variant="outline"
                                  className={meta?.cls ?? "bg-slate-100"}
                                >
                                  {t(meta?.label ?? sample.type)}
                                </Badge>
                                <span>
                                  {t("可用库存 {quantity} {unit}", {
                                    quantity: sample.quantity,
                                    unit: sample.unit,
                                  })}
                                </span>
                                {!sample.projectId && (
                                  <span>{t("公共样本")}</span>
                                )}
                              </div>
                            </div>
                            <Plus className="h-4 w-4 shrink-0 text-teal-600" />
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed bg-white px-4 py-6 text-center text-sm text-muted-foreground">
                        {t("没有匹配的可用样本")}
                      </div>
                    )}
                  </div>

                  {form.samples.length > 0 && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="text-xs font-semibold text-slate-700">
                        {t("已选样本与计划用量")}
                      </div>
                      {form.samples.map((selected, index) => {
                        const sample = sampleOptions?.find(
                          option => option.id === Number(selected.sampleId)
                        );
                        if (!sample) return null;
                        const invalidAmount =
                          Number(selected.amount) <= 0 ||
                          Number(selected.amount) > Number(sample.quantity);
                        return (
                          <div
                            key={selected.sampleId}
                            className="rounded-lg border bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 text-sm font-medium">
                                <span className="font-mono text-xs text-teal-700">
                                  {sample.sku}
                                </span>{" "}
                                · {sample.name}
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                title={t("移除样本")}
                                onClick={() =>
                                  setForm(value => ({
                                    ...value,
                                    samples: value.samples.filter(
                                      (_, itemIndex) => itemIndex !== index
                                    ),
                                  }))
                                }
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label>{t("计划送样量")}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0.001"
                                    max={Number(sample.quantity)}
                                    step="any"
                                    className={
                                      invalidAmount ? "border-rose-400" : ""
                                    }
                                    value={selected.amount}
                                    onChange={event =>
                                      setForm(value => ({
                                        ...value,
                                        samples: value.samples.map(
                                          (item, itemIndex) =>
                                            itemIndex === index
                                              ? {
                                                  ...item,
                                                  amount: event.target.value,
                                                }
                                              : item
                                        ),
                                      }))
                                    }
                                  />
                                  <span className="shrink-0 text-sm text-muted-foreground">
                                    {sample.unit}
                                  </span>
                                </div>
                                {invalidAmount && (
                                  <p className="text-xs text-rose-600">
                                    {t("计划量必须大于 0 且不能超过可用库存")}
                                  </p>
                                )}
                              </div>
                              <div className="space-y-2">
                                <Label>{t("送样用途")}</Label>
                                <Input
                                  value={selected.purpose}
                                  onChange={event =>
                                    setForm(value => ({
                                      ...value,
                                      samples: value.samples.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                purpose: event.target.value,
                                              }
                                            : item
                                      ),
                                    }))
                                  }
                                  placeholder={t(
                                    "例如：结合活性检测或 PK 预实验"
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            {selectedCatalog && (
              <CroServiceRequirementFields
                catalogKey={selectedCatalog.key}
                templateKey={form.serviceTemplateKey}
                data={form.requirementData}
                onChange={(templateKey, requirementData) => {
                  const template = getCroServiceTemplate(
                    selectedCatalog.key,
                    templateKey
                  );
                  setForm(value => ({
                    ...value,
                    serviceTemplateKey: templateKey,
                    requirementData,
                    initialItemName: template?.name ?? "",
                    acceptanceCriteria: template?.acceptanceCriteria ?? "",
                  }));
                }}
              />
            )}
            {!selectedTemplate && (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("首个服务项目")}</Label>
                  <Input
                    value={form.initialItemName}
                    onChange={event =>
                      setForm({ ...form, initialItemName: event.target.value })
                    }
                    placeholder={t("例如：8 个候选分子的 KD / kon / koff 测定")}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("服务要求")}</Label>
                  <Textarea
                    rows={2}
                    value={form.initialItemDescription}
                    onChange={event =>
                      setForm({
                        ...form,
                        initialItemDescription: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("验收标准")}</Label>
                  <Textarea
                    rows={2}
                    value={form.acceptanceCriteria}
                    onChange={event =>
                      setForm({
                        ...form,
                        acceptanceCriteria: event.target.value,
                      })
                    }
                    placeholder={t(
                      "明确数据完整性、重复数、报告格式和质量阈值"
                    )}
                  />
                </div>
              </>
            )}
            {selectedTemplate && (
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("补充说明（选填）")}</Label>
                <Textarea
                  rows={2}
                  value={form.initialItemDescription}
                  onChange={event =>
                    setForm({
                      ...form,
                      initialItemDescription: event.target.value,
                    })
                  }
                  placeholder={t("填写超出标准模板的特殊要求")}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !canCreateOrder}
              onClick={submitOrder}
            >
              {t("创建委托")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={providerOpen} onOpenChange={setProviderOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("登记外部服务商")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("服务商名称")}</Label>
              <Input
                value={providerForm.name}
                onChange={event =>
                  setProviderForm({ ...providerForm, name: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("服务商类型")}</Label>
              <Select
                value={providerForm.type}
                onValueChange={value =>
                  setProviderForm({
                    ...providerForm,
                    type: value as ProviderType,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPES.map(type => (
                    <SelectItem key={type} value={type}>
                      {t(PROVIDER_TYPE_LABELS[type])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("资质状态")}</Label>
              <Select
                value={providerForm.qualificationStatus}
                onValueChange={value =>
                  setProviderForm({
                    ...providerForm,
                    qualificationStatus: value as Qualification,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_QUALIFICATION).map(
                    ([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {t(value.label)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("联系人")}</Label>
              <Input
                value={providerForm.contactName}
                onChange={event =>
                  setProviderForm({
                    ...providerForm,
                    contactName: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("联系电话")}</Label>
              <Input
                value={providerForm.contactPhone}
                onChange={event =>
                  setProviderForm({
                    ...providerForm,
                    contactPhone: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("联系邮箱")}</Label>
              <Input
                type="email"
                value={providerForm.contactEmail}
                onChange={event =>
                  setProviderForm({
                    ...providerForm,
                    contactEmail: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("资质 / 认证")}</Label>
              <Textarea
                rows={2}
                value={providerForm.certifications}
                onChange={event =>
                  setProviderForm({
                    ...providerForm,
                    certifications: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("擅长领域")}</Label>
              <Textarea
                rows={2}
                value={providerForm.specialties}
                onChange={event =>
                  setProviderForm({
                    ...providerForm,
                    specialties: event.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProviderOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              disabled={providerMut.isPending || !providerForm.name.trim()}
              onClick={() =>
                providerMut.mutate({
                  ...providerForm,
                  name: providerForm.name.trim(),
                })
              }
            >
              {t("保存服务商")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
