import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  FileText,
  FlaskConical,
  GitBranch,
  Link2,
  Plus,
  TestTubes,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { fmtDate, fmtDateTime } from "@/lib/labels";
import { useI18n } from "@/i18n";
import {
  COMMERCIAL_STATUS,
  DELIVERABLE_REVIEW,
  DELIVERABLE_TYPES,
  EXTERNAL_EXPERIMENT_RELATIONS,
  EXTERNAL_RESULT_REVIEW,
  EXECUTION_STATUS,
  ORDER_ITEM_STATUS,
  ORDER_PRIORITY,
  PROVIDER_QUALIFICATION,
  PROVIDER_TYPE_LABELS,
  QUALITY_STATUS,
  SAMPLE_DIRECTIONS,
  SHIPMENT_STATUS,
  externalOrderStage,
} from "@contracts/externalOrder";
import {
  getCroCatalog,
  getCroServiceTemplate,
  parseCroRequirementData,
  validateCroRequirementData,
  type CroRequirementData,
} from "@contracts/croCatalog";

type CommercialStatus = keyof typeof COMMERCIAL_STATUS;
type ExecutionStatus = keyof typeof EXECUTION_STATUS;
type QualityStatus = keyof typeof QUALITY_STATUS;
type ItemStatus = keyof typeof ORDER_ITEM_STATUS;
type ShipmentStatus = keyof typeof SHIPMENT_STATUS;
type DeliverableType = keyof typeof DELIVERABLE_TYPES;
type ExperimentRelation = keyof typeof EXTERNAL_EXPERIMENT_RELATIONS;
type ResultReviewStatus = keyof typeof EXTERNAL_RESULT_REVIEW;

const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  planned: ["prepared", "shipped", "exception"],
  prepared: ["shipped", "exception"],
  shipped: ["received", "returned", "consumed", "exception"],
  received: ["returned", "consumed", "exception"],
  returned: [],
  consumed: [],
  exception: [
    "planned",
    "prepared",
    "shipped",
    "received",
    "returned",
    "consumed",
  ],
};

const EMPTY_ITEM = {
  name: "",
  category: "",
  description: "",
  quantity: "1",
  unit: "项",
  protocolRef: "",
  acceptanceCriteria: "",
  expectedDeliveryDate: "",
  serviceTemplateKey: "",
  requirementData: {} as CroRequirementData,
};

const EMPTY_SAMPLE = {
  sampleId: "",
  orderItemId: "none",
  amount: "",
  unit: "",
  purpose: "",
  shipmentStatus: "planned" as ShipmentStatus,
  carrier: "",
  trackingNo: "",
};

const EMPTY_DELIVERABLE = {
  orderItemId: "none",
  name: "",
  type: "report" as DeliverableType,
  fileUrl: "",
  version: "v1",
  checksum: "",
  notes: "",
};

const EMPTY_EXPERIMENT_LINK = {
  experimentId: "",
  orderItemId: "none",
  relation: "source" as ExperimentRelation,
};

const EMPTY_RESULT = {
  orderItemId: "none",
  externalOrderSampleId: "none",
  sourceDeliverableId: "none",
  metric: "",
  valueText: "",
  numericValue: "",
  unit: "",
  referenceRange: "",
  method: "",
  replicate: "",
  notes: "",
};

const EMPTY_DERIVED_SAMPLE = {
  name: "",
  quantity: "",
  unit: "",
  orderItemId: "none",
  notes: "",
};

function money(amount: number | null, currency: string, lang: "zh" | "en") {
  if (amount == null) return "—";
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ExternalOrderDetail() {
  const { t, lang } = useI18n();
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [itemOpen, setItemOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [deliverableOpen, setDeliverableOpen] = useState(false);
  const [experimentOpen, setExperimentOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [derivedSourceId, setDerivedSourceId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [sampleForm, setSampleForm] = useState(EMPTY_SAMPLE);
  const [deliverableForm, setDeliverableForm] = useState(EMPTY_DELIVERABLE);
  const [experimentForm, setExperimentForm] = useState(EMPTY_EXPERIMENT_LINK);
  const [resultForm, setResultForm] = useState(EMPTY_RESULT);
  const [derivedForm, setDerivedForm] = useState(EMPTY_DERIVED_SAMPLE);

  const { data: order, isLoading } = trpc.externalOrder.byId.useQuery({
    id: orderId,
  });
  const { data: sampleOptions } = trpc.sample.options.useQuery();
  const { data: experimentOptions } = trpc.experiment.list.useQuery(
    order?.projectId ? { projectId: order.projectId } : undefined
  );
  const providerCatalog = getCroCatalog(order?.provider?.catalogKey);
  const selectedItemTemplate = getCroServiceTemplate(
    order?.provider?.catalogKey,
    itemForm.serviceTemplateKey
  );
  const itemRequirementErrors = selectedItemTemplate
    ? validateCroRequirementData(selectedItemTemplate, itemForm.requirementData)
    : [];
  const canAddItem = selectedItemTemplate
    ? itemRequirementErrors.length === 0
    : Boolean(itemForm.name.trim());

  const refresh = () => {
    utils.externalOrder.byId.invalidate({ id: orderId });
    utils.externalOrder.list.invalidate();
    utils.externalOrder.itemOptions.invalidate();
    if (order?.projectId)
      utils.externalOrder.list.invalidate({ projectId: order.projectId });
  };

  const updateMut = trpc.externalOrder.update.useMutation({
    onSuccess: () => {
      toast.success(t("委托状态已更新"));
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const addItemMut = trpc.externalOrder.addItem.useMutation({
    onSuccess: () => {
      toast.success(t("委托明细已添加"));
      setItemOpen(false);
      setItemForm(EMPTY_ITEM);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const itemStatusMut = trpc.externalOrder.updateItemStatus.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const attachSampleMut = trpc.externalOrder.attachSample.useMutation({
    onSuccess: () => {
      toast.success(t("送样样本已关联"));
      setSampleOpen(false);
      setSampleForm(EMPTY_SAMPLE);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const shipmentMut = trpc.externalOrder.updateShipment.useMutation({
    onSuccess: result => {
      toast.success(
        t("样本交接已更新，当前库存 {n}", { n: result.newQuantity })
      );
      refresh();
      utils.sample.list.invalidate();
      utils.sample.byId.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const addDeliverableMut = trpc.externalOrder.addDeliverable.useMutation({
    onSuccess: () => {
      toast.success(t("交付物已登记，请完成内部验收"));
      setDeliverableOpen(false);
      setDeliverableForm(EMPTY_DELIVERABLE);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const reviewMut = trpc.externalOrder.reviewDeliverable.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const linkExperimentMut = trpc.externalOrder.linkExperiment.useMutation({
    onSuccess: () => {
      toast.success(t("内部实验已关联"));
      setExperimentOpen(false);
      setExperimentForm(EMPTY_EXPERIMENT_LINK);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const addResultMut = trpc.externalOrder.addResult.useMutation({
    onSuccess: () => {
      toast.success(t("结构化结果已登记，请完成内部审核"));
      setResultOpen(false);
      setResultForm(EMPTY_RESULT);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const reviewResultMut = trpc.externalOrder.reviewResult.useMutation({
    onSuccess: refresh,
    onError: error => toast.error(error.message),
  });
  const derivedSampleMut = trpc.externalOrder.registerDerivedSample.useMutation(
    {
      onSuccess: ({ id: newSampleId, sku }) => {
        toast.success(t("CRO 产出样本 {sku} 已入库并建立谱系", { sku }));
        setDerivedSourceId(null);
        setDerivedForm(EMPTY_DERIVED_SAMPLE);
        refresh();
        utils.sample.list.invalidate();
        utils.sample.byId.invalidate({ id: newSampleId });
      },
      onError: error => toast.error(error.message),
    }
  );

  const changeShipmentStatus = (
    link: NonNullable<typeof order>["samples"][number],
    status: ShipmentStatus
  ) => {
    if (status === link.shipmentStatus) return;
    if (
      status === "shipped" &&
      !window.confirm(
        t("确认发货后将立即扣减 {amount} {unit} 库存，是否继续？", {
          amount: link.amount,
          unit: link.unit,
        })
      )
    )
      return;
    let returnAmount: number | undefined;
    if (status === "returned") {
      const value = window.prompt(
        t("请输入实际退回数量（最多 {amount} {unit}）", {
          amount: link.amount,
          unit: link.unit,
        }),
        String(link.amount)
      );
      if (value == null) return;
      returnAmount = Number(value);
      if (!Number.isFinite(returnAmount) || returnAmount <= 0) {
        toast.error(t("请输入有效的退回数量"));
        return;
      }
    }
    shipmentMut.mutate({
      id: link.id,
      shipmentStatus: status,
      carrier: link.carrier,
      trackingNo: link.trackingNo,
      returnAmount,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (!order)
    return (
      <div className="py-20 text-center text-muted-foreground">
        {t("外部委托不存在")}
      </div>
    );

  const stage = externalOrderStage(order);
  const priority = ORDER_PRIORITY[order.priority];
  const qualification = order.provider
    ? PROVIDER_QUALIFICATION[order.provider.qualificationStatus]
    : null;
  const overdue =
    !!order.expectedDeliveryDate &&
    order.expectedDeliveryDate < new Date().toISOString().slice(0, 10) &&
    order.qualityStatus !== "accepted" &&
    order.commercialStatus !== "cancelled";

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/external-orders")}
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回外部委托")}
        </button>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-teal-700">
                {order.orderNo}
              </span>
              <Badge variant="outline" className={priority.cls}>
                {t(priority.label)}
              </Badge>
              <Badge variant="outline" className={stage.cls}>
                {t(stage.label)}
              </Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {order.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {order.objective || t("暂无研究目的说明")}
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-3 xl:min-w-[520px] xl:w-auto">
            <div className="space-y-1">
              <Label className="text-xs">{t("商务状态")}</Label>
              <Select
                value={order.commercialStatus}
                onValueChange={value =>
                  updateMut.mutate({
                    id: orderId,
                    commercialStatus: value as CommercialStatus,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMMERCIAL_STATUS).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {t(meta.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("执行状态")}</Label>
              <Select
                value={order.executionStatus}
                onValueChange={value =>
                  updateMut.mutate({
                    id: orderId,
                    executionStatus: value as ExecutionStatus,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXECUTION_STATUS).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {t(meta.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("质量验收")}</Label>
              <Select
                value={order.qualityStatus}
                onValueChange={value =>
                  updateMut.mutate({
                    id: orderId,
                    qualityStatus: value as QualityStatus,
                  })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(QUALITY_STATUS).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {t(meta.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <Card className={overdue ? "border-rose-200" : ""}>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <Progress value={stage.progress} className="h-2 flex-1" />
            <span className="text-sm font-semibold">{stage.progress}%</span>
          </div>
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 text-pink-600" />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("服务商")}
                </div>
                <div className="font-medium">{order.provider?.name ?? "—"}</div>
                <div className="mt-1 flex gap-1">
                  {order.provider && (
                    <Badge variant="outline">
                      {t(PROVIDER_TYPE_LABELS[order.provider.type])}
                    </Badge>
                  )}
                  {qualification && (
                    <Badge variant="outline" className={qualification.cls}>
                      {t(qualification.label)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <GitBranch className="mt-0.5 h-4 w-4 text-teal-600" />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("所属项目")}
                </div>
                <Link
                  to={`/projects/${order.projectId}`}
                  className="font-medium text-teal-700 hover:underline"
                >
                  {order.project?.name ?? "—"}
                </Link>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 h-4 w-4 text-blue-600" />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("内部负责人")}
                </div>
                <div className="font-medium">{order.ownerName ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays
                className={`mt-0.5 h-4 w-4 ${overdue ? "text-rose-600" : "text-amber-600"}`}
              />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("预计交付")}
                </div>
                <div
                  className={
                    overdue ? "font-medium text-rose-600" : "font-medium"
                  }
                >
                  {fmtDate(order.expectedDeliveryDate)}
                  {overdue ? ` · ${t("已逾期")}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CircleDollarSign className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("报价 / PO")}
                </div>
                <div className="font-medium">
                  {money(order.quotedAmount, order.currency, lang)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {order.poNumber ?? t("暂无采购单号")}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="scope">
        <TabsList>
          <TabsTrigger value="scope">
            {t("服务范围")} ({order.items.length})
          </TabsTrigger>
          <TabsTrigger value="samples">
            {t("样本与物流")} ({order.samples.length})
          </TabsTrigger>
          <TabsTrigger value="deliverables">
            {t("交付与验收")} ({order.deliverables.length})
          </TabsTrigger>
          <TabsTrigger value="audit">
            {t("审计记录")} ({order.activities.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scope" className="mt-4 space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExperimentOpen(true)}
            >
              <Link2 className="mr-1 h-4 w-4" />
              {t("关联内部实验")}
            </Button>
            <Button size="sm" onClick={() => setItemOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("添加服务项目")}
            </Button>
          </div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("关联内部实验")} ({order.experiments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {order.experiments.map(link => (
                <Link
                  key={link.id}
                  to={`/experiments/${link.experimentId}`}
                  className="rounded-lg border bg-slate-50 px-3 py-2 text-sm hover:border-teal-300 hover:bg-teal-50"
                >
                  <div className="font-medium text-teal-700">
                    {link.experiment.code} · {link.experiment.title}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t(EXTERNAL_EXPERIMENT_RELATIONS[link.relation])} ·{" "}
                    {order.items.find(item => item.id === link.orderItemId)
                      ?.name ?? t("整个委托")}
                  </div>
                </Link>
              ))}
              {!order.experiments.length && (
                <div className="py-3 text-sm text-muted-foreground">
                  {t("尚未关联内部实验")}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            {order.items.map(item => {
              const meta = ORDER_ITEM_STATUS[item.status];
              const links = order.linkedNodes.filter(
                node => node.externalOrderItemId === item.id
              );
              const itemTemplate = getCroServiceTemplate(
                order.provider?.catalogKey,
                item.serviceTemplateKey
              );
              const requirementData = parseCroRequirementData(
                item.requirementData
              );
              return (
                <Card key={item.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{item.name}</CardTitle>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.category || t("未分类")} · {item.quantity}{" "}
                          {item.unit}
                        </div>
                      </div>
                      <Select
                        value={item.status}
                        onValueChange={value =>
                          itemStatusMut.mutate({
                            id: item.id,
                            status: value as ItemStatus,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ORDER_ITEM_STATUS).map(
                            ([key, value]) => (
                              <SelectItem key={key} value={key}>
                                {t(value.label)}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <Badge variant="outline" className={meta.cls}>
                      {t(meta.label)}
                    </Badge>
                    {item.description && (
                      <p className="text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    {itemTemplate && (
                      <div className="rounded-lg border bg-slate-50 p-3">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700">
                            {t("结构化委托参数")}
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-white text-[10px]"
                          >
                            {t("模板 v{version}", {
                              version:
                                item.serviceTemplateVersion ??
                                itemTemplate.version,
                            })}
                          </Badge>
                        </div>
                        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                          {itemTemplate.fields.map(field => {
                            const value = requirementData[field.key];
                            if (
                              value === undefined ||
                              value === "" ||
                              (Array.isArray(value) && !value.length)
                            )
                              return null;
                            const optionLabels = new Map(
                              field.options?.map(entry => [
                                entry.value,
                                entry.label,
                              ])
                            );
                            const values = Array.isArray(value)
                              ? value
                              : [value];
                            const rendered = values
                              .map(entry =>
                                typeof entry === "string"
                                  ? t(optionLabels.get(entry) ?? entry)
                                  : typeof entry === "number"
                                    ? String(entry)
                                    : entry
                                      ? t("是")
                                      : t("否")
                              )
                              .join("、");
                            return (
                              <div key={field.key}>
                                <dt className="text-[11px] text-muted-foreground">
                                  {t(field.label)}
                                </dt>
                                <dd className="mt-0.5 break-words text-xs font-medium">
                                  {rendered}
                                  {field.unit ? ` ${t(field.unit)}` : ""}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("验收标准")}
                      </span>
                      <p className="mt-1">{item.acceptanceCriteria || "—"}</p>
                    </div>
                    {item.protocolRef && (
                      <div className="text-xs text-muted-foreground">
                        {t("方案 / SOP")}：{item.protocolRef}
                      </div>
                    )}
                    {links.length > 0 && (
                      <div className="border-t pt-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          {t("关联 BioFlow 节点")}
                        </div>
                        {links.map(node => (
                          <button
                            key={node.nodeId}
                            onClick={() =>
                              navigate(`/workflows/${node.workflowId}`)
                            }
                            className="mr-2 inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-xs text-teal-700 hover:bg-teal-100"
                          >
                            <GitBranch className="h-3 w-3" />
                            {node.workflowName} · {node.nodeLabel}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="samples" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setSampleOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("关联送样")}
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {order.samples.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("样本")}</TableHead>
                      <TableHead>{t("方向 / 数量")}</TableHead>
                      <TableHead>{t("关联服务项")}</TableHead>
                      <TableHead>{t("交接状态")}</TableHead>
                      <TableHead>{t("承运与流水")}</TableHead>
                      <TableHead>{t("操作")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.samples.map(link => (
                      <TableRow key={link.id}>
                        <TableCell>
                          <button
                            onClick={() =>
                              navigate(`/samples/${link.sampleId}`)
                            }
                            className="text-left"
                          >
                            <div className="font-mono text-xs text-teal-700">
                              {link.sample?.sku}
                            </div>
                            <div className="font-medium">
                              {link.sample?.name ?? "—"}
                            </div>
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              link.direction === "inbound"
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                            }
                          >
                            {t(SAMPLE_DIRECTIONS[link.direction])}
                          </Badge>
                          <div className="mt-1 text-xs">
                            {link.amount} {link.unit}
                          </div>
                        </TableCell>
                        <TableCell>
                          {order.items.find(
                            item => item.id === link.orderItemId
                          )?.name ?? t("整个委托")}
                        </TableCell>
                        <TableCell>
                          {link.direction === "outbound" ? (
                            <Select
                              value={link.shipmentStatus}
                              onValueChange={value =>
                                changeShipmentStatus(
                                  link,
                                  value as ShipmentStatus
                                )
                              }
                              disabled={shipmentMut.isPending}
                            >
                              <SelectTrigger className="h-8 w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(SHIPMENT_STATUS)
                                  .filter(
                                    ([key]) =>
                                      key === link.shipmentStatus ||
                                      SHIPMENT_TRANSITIONS[
                                        link.shipmentStatus
                                      ].includes(key as ShipmentStatus)
                                  )
                                  .map(([key, meta]) => (
                                    <SelectItem
                                      key={key}
                                      value={key}
                                      disabled={
                                        key === "shipped" &&
                                        order.commercialStatus !== "ordered"
                                      }
                                    >
                                      {t(meta.label)}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant="outline"
                              className={
                                SHIPMENT_STATUS[link.shipmentStatus].cls
                              }
                            >
                              {t(SHIPMENT_STATUS[link.shipmentStatus].label)}
                            </Badge>
                          )}
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t("{n} 条交接记录", {
                              n: link.custodyEvents.length,
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {link.carrier || "—"}
                          {link.trackingNo ? ` · ${link.trackingNo}` : ""}
                          {link.outboundTransactionId && (
                            <div className="mt-1 text-xs text-rose-600">
                              {t("已扣减库存")} · #{link.outboundTransactionId}
                            </div>
                          )}
                          {link.returnTransactionId && (
                            <div className="mt-1 text-xs text-emerald-600">
                              {t("已回补库存")} · #{link.returnTransactionId}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {link.direction === "outbound" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDerivedSourceId(link.id);
                                setDerivedForm({
                                  ...EMPTY_DERIVED_SAMPLE,
                                  unit: link.unit,
                                  orderItemId: link.orderItemId
                                    ? String(link.orderItemId)
                                    : "none",
                                });
                              }}
                            >
                              {t("登记 CRO 产出")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                  <TestTubes className="h-9 w-9 opacity-40" />
                  {t("尚未关联送样样本")}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            {t(
              "关联样本只建立计划；确认发货时才会扣减库存，退回时自动回补，并全程写入交接与审计流水。"
            )}
          </p>
        </TabsContent>

        <TabsContent value="deliverables" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t(
                "CRO 上传或发送报告不代表委托完成，内部验收通过后才会放行 BioFlow 下游节点。"
              )}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setResultOpen(true)}
              >
                <FlaskConical className="mr-1 h-4 w-4" />
                {t("登记结构化结果")}
              </Button>
              <Button size="sm" onClick={() => setDeliverableOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                {t("登记交付物")}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {order.deliverables.map(file => {
              const meta = DELIVERABLE_REVIEW[file.reviewStatus];
              return (
                <Card key={file.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium">
                            {file.name}
                          </div>
                          <Badge variant="outline" className={meta.cls}>
                            {t(meta.label)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t(DELIVERABLE_TYPES[file.type])} · {file.version} ·{" "}
                          {fmtDateTime(file.uploadedAt)}
                        </div>
                      </div>
                    </div>
                    {file.notes && (
                      <p className="text-sm text-muted-foreground">
                        {file.notes}
                      </p>
                    )}
                    {file.fileUrl && (
                      <a
                        href={file.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-teal-700 hover:underline"
                      >
                        {t("打开交付文件")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-700"
                        onClick={() =>
                          reviewMut.mutate({
                            id: file.id,
                            reviewStatus: "accepted",
                          })
                        }
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {t("接受")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-orange-700"
                        onClick={() =>
                          reviewMut.mutate({
                            id: file.id,
                            reviewStatus: "changes_requested",
                          })
                        }
                      >
                        {t("要求补充")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-700"
                        onClick={() =>
                          reviewMut.mutate({
                            id: file.id,
                            reviewStatus: "rejected",
                          })
                        }
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        {t("拒绝")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {!order.deliverables.length && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <FileCheck2 className="h-9 w-9 opacity-40" />
                {t("尚未登记交付物")}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("结构化检测结果")} ({order.results.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {order.results.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("样本")}</TableHead>
                      <TableHead>{t("检测指标")}</TableHead>
                      <TableHead>{t("结果")}</TableHead>
                      <TableHead>{t("方法 / 重复")}</TableHead>
                      <TableHead>{t("审核状态")}</TableHead>
                      <TableHead>{t("操作")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.results.map(result => {
                      const meta = EXTERNAL_RESULT_REVIEW[result.reviewStatus];
                      return (
                        <TableRow key={result.id}>
                          <TableCell>
                            {result.sample ? (
                              <Link
                                to={`/samples/${result.sampleId}`}
                                className="text-teal-700 hover:underline"
                              >
                                {result.sample.sku} · {result.sample.name}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {result.metric}
                          </TableCell>
                          <TableCell>
                            {result.valueText}
                            {result.unit ? ` ${result.unit}` : ""}
                            {result.referenceRange && (
                              <div className="text-xs text-muted-foreground">
                                {t("参考范围")}：{result.referenceRange}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {result.method || "—"}
                            {result.replicate ? ` · ${result.replicate}` : ""}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={meta.cls}>
                              {t(meta.label)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-emerald-700"
                                onClick={() =>
                                  reviewResultMut.mutate({
                                    id: result.id,
                                    reviewStatus:
                                      "accepted" as ResultReviewStatus,
                                  })
                                }
                              >
                                {t("接受")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-orange-700"
                                onClick={() =>
                                  reviewResultMut.mutate({
                                    id: result.id,
                                    reviewStatus:
                                      "changes_requested" as ResultReviewStatus,
                                  })
                                }
                              >
                                {t("要求补充")}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t("尚未登记结构化结果")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardContent className="divide-y p-0">
              {order.activities.map(activity => (
                <div key={activity.id} className="flex gap-3 px-5 py-4">
                  <div className="mt-1 h-2 w-2 rounded-full bg-teal-500" />
                  <div>
                    <div className="text-sm">
                      <span className="font-medium text-teal-700">
                        {activity.userName ?? t("系统")}
                      </span>{" "}
                      {t(activity.action)}
                    </div>
                    {activity.detail && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {activity.detail}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {fmtDateTime(activity.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
              {!order.activities.length && (
                <div className="py-16 text-center text-muted-foreground">
                  {t("暂无审计记录")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("添加服务项目")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {providerCatalog && (
              <CroServiceRequirementFields
                catalogKey={providerCatalog.key}
                templateKey={itemForm.serviceTemplateKey}
                data={itemForm.requirementData}
                onChange={(templateKey, requirementData) => {
                  const template = getCroServiceTemplate(
                    providerCatalog.key,
                    templateKey
                  );
                  setItemForm(value => ({
                    ...value,
                    serviceTemplateKey: templateKey,
                    requirementData,
                    name: template?.name ?? "",
                    category: template?.category ?? "",
                    unit: template?.unit ?? "项",
                    acceptanceCriteria: template?.acceptanceCriteria ?? "",
                  }));
                }}
              />
            )}
            {!selectedItemTemplate && (
              <div className="space-y-2">
                <Label>{t("服务项目名称")}</Label>
                <Input
                  value={itemForm.name}
                  onChange={event =>
                    setItemForm({ ...itemForm, name: event.target.value })
                  }
                />
              </div>
            )}
            <div
              className={`grid gap-3 ${selectedItemTemplate ? "" : "grid-cols-2"}`}
            >
              {!selectedItemTemplate && (
                <div className="space-y-2">
                  <Label>{t("分类")}</Label>
                  <Input
                    value={itemForm.category}
                    onChange={event =>
                      setItemForm({ ...itemForm, category: event.target.value })
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("预计交付日期")}</Label>
                <Input
                  type="date"
                  value={itemForm.expectedDeliveryDate}
                  onChange={event =>
                    setItemForm({
                      ...itemForm,
                      expectedDeliveryDate: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                {t(selectedItemTemplate ? "补充说明（选填）" : "服务要求")}
              </Label>
              <Textarea
                rows={2}
                value={itemForm.description}
                onChange={event =>
                  setItemForm({ ...itemForm, description: event.target.value })
                }
              />
            </div>
            {!selectedItemTemplate && (
              <div className="space-y-2">
                <Label>{t("验收标准")}</Label>
                <Textarea
                  rows={2}
                  value={itemForm.acceptanceCriteria}
                  onChange={event =>
                    setItemForm({
                      ...itemForm,
                      acceptanceCriteria: event.target.value,
                    })
                  }
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              disabled={!canAddItem || addItemMut.isPending}
              onClick={() =>
                addItemMut.mutate({
                  orderId,
                  name: itemForm.name.trim() || undefined,
                  category: itemForm.category || undefined,
                  description: itemForm.description || undefined,
                  quantity: Number(itemForm.quantity),
                  unit: itemForm.unit,
                  protocolRef: itemForm.protocolRef || undefined,
                  acceptanceCriteria: itemForm.acceptanceCriteria || undefined,
                  serviceTemplateKey: selectedItemTemplate?.key,
                  requirementData: selectedItemTemplate
                    ? itemForm.requirementData
                    : undefined,
                  expectedDeliveryDate:
                    itemForm.expectedDeliveryDate || undefined,
                })
              }
            >
              {t("添加")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sampleOpen} onOpenChange={setSampleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("关联送样样本")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("样本")}</Label>
              <Select
                value={sampleForm.sampleId}
                onValueChange={value => {
                  const sample = sampleOptions?.find(
                    option => option.id === Number(value)
                  );
                  setSampleForm({
                    ...sampleForm,
                    sampleId: value,
                    unit: sample?.unit ?? sampleForm.unit,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("选择样本")} />
                </SelectTrigger>
                <SelectContent>
                  {sampleOptions?.map(sample => (
                    <SelectItem key={sample.id} value={String(sample.id)}>
                      {sample.sku} · {sample.name}（{sample.quantity}{" "}
                      {sample.unit}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("关联服务项目")}</Label>
              <Select
                value={sampleForm.orderItemId}
                onValueChange={value =>
                  setSampleForm({ ...sampleForm, orderItemId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("整个委托")}</SelectItem>
                  {order.items.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("送样量")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={sampleForm.amount}
                  onChange={event =>
                    setSampleForm({ ...sampleForm, amount: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("单位")}</Label>
                <Input
                  value={sampleForm.unit}
                  onChange={event =>
                    setSampleForm({ ...sampleForm, unit: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("承运商")}</Label>
                <Input
                  value={sampleForm.carrier}
                  onChange={event =>
                    setSampleForm({
                      ...sampleForm,
                      carrier: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("运单号")}</Label>
                <Input
                  value={sampleForm.trackingNo}
                  onChange={event =>
                    setSampleForm({
                      ...sampleForm,
                      trackingNo: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("用途 / 说明")}</Label>
              <Textarea
                rows={2}
                value={sampleForm.purpose}
                onChange={event =>
                  setSampleForm({ ...sampleForm, purpose: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSampleOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              disabled={
                !sampleForm.sampleId ||
                !sampleForm.amount ||
                !sampleForm.unit ||
                attachSampleMut.isPending
              }
              onClick={() =>
                attachSampleMut.mutate({
                  orderId,
                  orderItemId:
                    sampleForm.orderItemId === "none"
                      ? null
                      : Number(sampleForm.orderItemId),
                  sampleId: Number(sampleForm.sampleId),
                  amount: Number(sampleForm.amount),
                  unit: sampleForm.unit,
                  purpose: sampleForm.purpose || undefined,
                  shipmentStatus: sampleForm.shipmentStatus,
                  carrier: sampleForm.carrier || undefined,
                  trackingNo: sampleForm.trackingNo || undefined,
                })
              }
            >
              {t("关联样本")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deliverableOpen} onOpenChange={setDeliverableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("登记 CRO 交付物")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("文件 / 交付物名称")}</Label>
              <Input
                value={deliverableForm.name}
                onChange={event =>
                  setDeliverableForm({
                    ...deliverableForm,
                    name: event.target.value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("交付物类型")}</Label>
                <Select
                  value={deliverableForm.type}
                  onValueChange={value =>
                    setDeliverableForm({
                      ...deliverableForm,
                      type: value as DeliverableType,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DELIVERABLE_TYPES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {t(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("版本")}</Label>
                <Input
                  value={deliverableForm.version}
                  onChange={event =>
                    setDeliverableForm({
                      ...deliverableForm,
                      version: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("关联服务项目")}</Label>
              <Select
                value={deliverableForm.orderItemId}
                onValueChange={value =>
                  setDeliverableForm({ ...deliverableForm, orderItemId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("整个委托")}</SelectItem>
                  {order.items.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("文件链接（可选）")}</Label>
              <Input
                type="url"
                value={deliverableForm.fileUrl}
                onChange={event =>
                  setDeliverableForm({
                    ...deliverableForm,
                    fileUrl: event.target.value,
                  })
                }
                placeholder="https://…"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("说明")}</Label>
              <Textarea
                rows={2}
                value={deliverableForm.notes}
                onChange={event =>
                  setDeliverableForm({
                    ...deliverableForm,
                    notes: event.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliverableOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              disabled={
                !deliverableForm.name.trim() || addDeliverableMut.isPending
              }
              onClick={() =>
                addDeliverableMut.mutate({
                  orderId,
                  orderItemId:
                    deliverableForm.orderItemId === "none"
                      ? null
                      : Number(deliverableForm.orderItemId),
                  name: deliverableForm.name.trim(),
                  type: deliverableForm.type,
                  fileUrl: deliverableForm.fileUrl || undefined,
                  version: deliverableForm.version,
                  checksum: deliverableForm.checksum || undefined,
                  notes: deliverableForm.notes || undefined,
                })
              }
            >
              {t("登记交付物")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={experimentOpen} onOpenChange={setExperimentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("关联内部实验")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("内部实验")}</Label>
              <Select
                value={experimentForm.experimentId}
                onValueChange={value =>
                  setExperimentForm({ ...experimentForm, experimentId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("选择内部实验")} />
                </SelectTrigger>
                <SelectContent>
                  {experimentOptions?.map(experiment => (
                    <SelectItem
                      key={experiment.id}
                      value={String(experiment.id)}
                    >
                      {experiment.code} · {experiment.title}
                      {experiment.status === "signed"
                        ? ` · ${t("已签署")}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("关联服务项目")}</Label>
              <Select
                value={experimentForm.orderItemId}
                onValueChange={value =>
                  setExperimentForm({ ...experimentForm, orderItemId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("整个委托")}</SelectItem>
                  {order.items.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("关联关系")}</Label>
              <Select
                value={experimentForm.relation}
                onValueChange={value =>
                  setExperimentForm({
                    ...experimentForm,
                    relation: value as ExperimentRelation,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXTERNAL_EXPERIMENT_RELATIONS).map(
                    ([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {t(label)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExperimentOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              disabled={
                !experimentForm.experimentId || linkExperimentMut.isPending
              }
              onClick={() =>
                linkExperimentMut.mutate({
                  orderId,
                  experimentId: Number(experimentForm.experimentId),
                  orderItemId:
                    experimentForm.orderItemId === "none"
                      ? null
                      : Number(experimentForm.orderItemId),
                  relation: experimentForm.relation,
                })
              }
            >
              {t("建立关联")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("登记结构化检测结果")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("检测指标")}</Label>
              <Input
                value={resultForm.metric}
                onChange={event =>
                  setResultForm({ ...resultForm, metric: event.target.value })
                }
                placeholder="KD / Purity / Titer"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("结果值")}</Label>
              <Input
                value={resultForm.valueText}
                onChange={event =>
                  setResultForm({
                    ...resultForm,
                    valueText: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("数值（可选）")}</Label>
              <Input
                type="number"
                step="any"
                value={resultForm.numericValue}
                onChange={event =>
                  setResultForm({
                    ...resultForm,
                    numericValue: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("单位")}</Label>
              <Input
                value={resultForm.unit}
                onChange={event =>
                  setResultForm({ ...resultForm, unit: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("关联样本")}</Label>
              <Select
                value={resultForm.externalOrderSampleId}
                onValueChange={value =>
                  setResultForm({ ...resultForm, externalOrderSampleId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("不关联样本")}</SelectItem>
                  {order.samples.map(link => (
                    <SelectItem key={link.id} value={String(link.id)}>
                      {link.sample?.sku} · {link.sample?.name} ·{" "}
                      {t(SAMPLE_DIRECTIONS[link.direction])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("关联服务项目")}</Label>
              <Select
                value={resultForm.orderItemId}
                onValueChange={value =>
                  setResultForm({ ...resultForm, orderItemId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("整个委托")}</SelectItem>
                  {order.items.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("来源交付物")}</Label>
              <Select
                value={resultForm.sourceDeliverableId}
                onValueChange={value =>
                  setResultForm({ ...resultForm, sourceDeliverableId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("无")}</SelectItem>
                  {order.deliverables.map(file => (
                    <SelectItem key={file.id} value={String(file.id)}>
                      {file.name} · {file.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("参考范围")}</Label>
              <Input
                value={resultForm.referenceRange}
                onChange={event =>
                  setResultForm({
                    ...resultForm,
                    referenceRange: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("检测方法")}</Label>
              <Input
                value={resultForm.method}
                onChange={event =>
                  setResultForm({ ...resultForm, method: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("重复 / 批次")}</Label>
              <Input
                value={resultForm.replicate}
                onChange={event =>
                  setResultForm({
                    ...resultForm,
                    replicate: event.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("说明")}</Label>
              <Textarea
                rows={2}
                value={resultForm.notes}
                onChange={event =>
                  setResultForm({ ...resultForm, notes: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResultOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              disabled={
                !resultForm.metric.trim() ||
                !resultForm.valueText.trim() ||
                addResultMut.isPending
              }
              onClick={() =>
                addResultMut.mutate({
                  orderId,
                  orderItemId:
                    resultForm.orderItemId === "none"
                      ? null
                      : Number(resultForm.orderItemId),
                  externalOrderSampleId:
                    resultForm.externalOrderSampleId === "none"
                      ? null
                      : Number(resultForm.externalOrderSampleId),
                  sourceDeliverableId:
                    resultForm.sourceDeliverableId === "none"
                      ? null
                      : Number(resultForm.sourceDeliverableId),
                  idempotencyKey: crypto.randomUUID(),
                  metric: resultForm.metric.trim(),
                  valueText: resultForm.valueText.trim(),
                  numericValue: resultForm.numericValue
                    ? Number(resultForm.numericValue)
                    : null,
                  unit: resultForm.unit || undefined,
                  referenceRange: resultForm.referenceRange || undefined,
                  method: resultForm.method || undefined,
                  replicate: resultForm.replicate || undefined,
                  notes: resultForm.notes || undefined,
                })
              }
            >
              {t("登记结果")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={derivedSourceId != null}
        onOpenChange={open => !open && setDerivedSourceId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("登记 CRO 产出样本")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(
                "系统将创建新的样本 SKU、执行入库，并建立与原送样样本的谱系关系。"
              )}
            </p>
            <div className="space-y-2">
              <Label>{t("产出样本名称")}</Label>
              <Input
                value={derivedForm.name}
                onChange={event =>
                  setDerivedForm({ ...derivedForm, name: event.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("入库数量")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={derivedForm.quantity}
                  onChange={event =>
                    setDerivedForm({
                      ...derivedForm,
                      quantity: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("单位")}</Label>
                <Input
                  value={derivedForm.unit}
                  onChange={event =>
                    setDerivedForm({ ...derivedForm, unit: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("关联服务项目")}</Label>
              <Select
                value={derivedForm.orderItemId}
                onValueChange={value =>
                  setDerivedForm({ ...derivedForm, orderItemId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("整个委托")}</SelectItem>
                  {order.items.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("说明")}</Label>
              <Textarea
                rows={2}
                value={derivedForm.notes}
                onChange={event =>
                  setDerivedForm({ ...derivedForm, notes: event.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDerivedSourceId(null)}>
              {t("取消")}
            </Button>
            <Button
              disabled={
                derivedSourceId == null ||
                !derivedForm.name.trim() ||
                !derivedForm.quantity ||
                !derivedForm.unit ||
                derivedSampleMut.isPending
              }
              onClick={() =>
                derivedSourceId != null &&
                derivedSampleMut.mutate({
                  sourceExternalOrderSampleId: derivedSourceId,
                  orderItemId:
                    derivedForm.orderItemId === "none"
                      ? null
                      : Number(derivedForm.orderItemId),
                  name: derivedForm.name.trim(),
                  quantity: Number(derivedForm.quantity),
                  unit: derivedForm.unit,
                  notes: derivedForm.notes || undefined,
                  idempotencyKey: crypto.randomUUID(),
                })
              }
            >
              {t("创建样本并入库")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
