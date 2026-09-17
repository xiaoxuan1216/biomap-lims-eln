import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileLock2,
  FlaskConical,
  Grid2X2,
  Info,
  ListChecks,
  MonitorCog,
  PackageCheck,
  Play,
  Route,
  ShieldCheck,
  TestTubes,
  XCircle,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import RunDataFlow from "@/components/lab-run/RunDataFlow";
import CloningPlateFlowViewer from "@/features/cloning-planner/CloningPlateFlowViewer";
import {
  LAB_RUN_ROLE_META,
  LAB_RUN_STATUS_META,
  type LabRunResourceRole,
  type LabRunStatus,
} from "@contracts/labRun";
import { toast } from "sonner";

type ParameterSnapshot = {
  effectiveValues?: Record<string, string | number | boolean>;
  units?: Record<string, string>;
  overrideReason?: string | null;
  methodRef?: string | null;
};

const RUN_NODE_STATUS_LABELS: Record<string, string> = {
  pending: "待执行",
  running: "模拟执行中",
  completed: "已完成",
  skipped: "已跳过",
  failed: "异常",
};

const RUN_NODE_TYPE_LABELS: Record<string, string> = {
  manual: "人工节点",
  equipment: "设备节点",
  decision: "判断节点",
  data: "数据节点",
  timer: "定时节点",
  external: "外部节点",
};

function parseSnapshot(raw: string | null): ParameterSnapshot {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ParameterSnapshot;
  } catch {
    return {};
  }
}

function fmtDate(value: Date | null, lang: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default function LabRunDetail() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const runId = Number(id);
  const utils = trpc.useUtils();
  const {
    data: run,
    isLoading,
    error,
  } = trpc.labRun.byId.useQuery({ id: runId }, { enabled: runId > 0 });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const cancelMut = trpc.labRun.cancel.useMutation({
    onSuccess: async result => {
      toast.success(
        t(
          result.releasedResources
            ? "实验运行已取消，相关预占和设备预约已释放"
            : "实验运行已取消，运行快照与审计记录已保留"
        )
      );
      setCancelOpen(false);
      await Promise.all([
        utils.labRun.byId.invalidate({ id: runId }),
        utils.labRun.list.invalidate(),
      ]);
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const refreshRun = async () => {
    await Promise.all([
      utils.labRun.byId.invalidate({ id: runId }),
      utils.labRun.list.invalidate(),
    ]);
  };
  const startSimulationMut = trpc.labRun.startSimulation.useMutation({
    onSuccess: async () => {
      toast.success(t("模拟运行已启动，入口节点正在执行"));
      await refreshRun();
    },
    onError: mutationError => toast.error(mutationError.message),
  });
  const advanceSimulationMut = trpc.labRun.advanceSimulation.useMutation({
    onSuccess: async result => {
      toast.success(
        t(
          result.status === "completed"
            ? "模拟运行已完成"
            : "当前节点波次已推进"
        )
      );
      await refreshRun();
    },
    onError: mutationError => toast.error(mutationError.message),
  });

  if (isLoading)
    return <div className="h-56 animate-pulse rounded-xl bg-slate-100" />;
  if (error || !run) {
    return (
      <Alert variant="destructive">
        <CircleAlert className="h-4 w-4" />
        <AlertTitle>{t("无法读取实验运行")}</AlertTitle>
        <AlertDescription>{error?.message ?? t("运行不存在")}</AlertDescription>
      </Alert>
    );
  }

  const meta = LAB_RUN_STATUS_META[run.status as LabRunStatus];
  const runStatusLabel =
    run.executionMode === "simulation" && run.status === "completed"
      ? "模拟状态推进完成"
      : meta.label;
  const issueText = (issue: (typeof run.readiness.issues)[number]) =>
    lang === "en" ? (issue.labelEn ?? issue.label) : issue.label;
  const equipmentNodes = run.nodes.filter(node => node.type === "equipment");
  const completedNodes = run.nodes.filter(
    node => node.status === "completed"
  ).length;
  const progress = run.nodes.length
    ? Math.round((completedNodes / run.nodes.length) * 100)
    : 0;
  const canCancel =
    ["draft", "preparing", "ready"].includes(run.status) ||
    (run.executionMode === "simulation" && run.status === "running");
  const cloningLayoutPlan = run.cloningLayoutPlan;
  const defaultTab =
    cloningLayoutPlan && run.integrityValid ? "plate-flow" : "data-flow";
  const preparation = [
    {
      label: t("流程快照"),
      detail: t("已冻结 {n} 个节点", { n: run.nodes.length }),
      ok: run.integrityValid,
      icon: FileLock2,
    },
    {
      label: t("样本与物料"),
      detail:
        run.executionMode === "simulation"
          ? t("已纳入模拟快照，不占用真实库存")
          : run.requestStatus === "fulfilled"
            ? t("已完成领料")
            : t("已预占，待现场领料"),
      ok:
        run.executionMode === "simulation"
          ? run.resources.length > 0
          : !!run.sampleRequestId,
      icon: PackageCheck,
    },
    {
      label: t("设备与参数"),
      detail:
        run.executionMode === "simulation"
          ? t("已冻结 {n} 个设备节点，不占用真实时段", {
              n: equipmentNodes.length,
            })
          : t("已锁定 {n} 个设备节点", { n: equipmentNodes.length }),
      ok: run.readiness.summary.blocking === 0,
      icon: MonitorCog,
    },
    {
      label: t("启动执行"),
      detail: t(
        run.status === "completed"
          ? "模拟执行已完成"
          : run.status === "running"
            ? "模拟执行已启动"
            : "等待受控启动动作"
      ),
      ok: ["running", "completed"].includes(run.status),
      icon: Play,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/runs")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-teal-700">
                {run.runNo}
              </span>
              <Badge
                variant="outline"
                style={{
                  color: meta.color,
                  borderColor: `${meta.color}55`,
                  background: `${meta.color}11`,
                }}
              >
                {t(runStatusLabel)}
              </Badge>
              <Badge variant="secondary">
                {t(
                  run.executionMode === "simulation" ? "模拟运行" : "现场执行"
                )}
              </Badge>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {run.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {run.purpose || t("未填写实验目的")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/workflows/${run.workflowId}`}>
              <ExternalLink className="mr-1 h-4 w-4" />
              {t("查看来源流程")}
            </Link>
          </Button>
          {canCancel && (
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="mr-1 h-4 w-4" />
              {t("取消运行")}
            </Button>
          )}
        </div>
      </div>

      {!run.integrityValid ? (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>{t("运行快照完整性校验失败")}</AlertTitle>
          <AlertDescription>
            {t("系统已锁定执行入口，请联系管理员检查历史记录。")}
          </AlertDescription>
        </Alert>
      ) : run.readiness.summary.blocking > 0 ? (
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>{t("当前存在执行阻断项")}</AlertTitle>
          <AlertDescription>
            {run.readiness.issues
              .filter(issue => issue.level === "blocking")
              .map(issueText)
              .join(t("；"))}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-teal-200 bg-teal-50">
          <ShieldCheck className="h-4 w-4 text-teal-700" />
          <AlertTitle>{t("运行计划已锁定")}</AlertTitle>
          <AlertDescription>
            {t(
              run.executionMode === "simulation"
                ? "样本、物料、设备和当次参数已冻结为模拟快照；未占用真实库存或设备时段。"
                : "样本与物料已预占、设备时段已预约、当次参数已冻结。创建运行不等于已经向真机下发命令。"
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={defaultTab} className="gap-5">
        <div className="overflow-x-auto border-b">
          <TabsList className="h-auto min-w-max justify-start bg-transparent p-0">
            <TabsTrigger
              value="data-flow"
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none"
            >
              <Route className="h-4 w-4" />
              {t("数据流转")}
            </TabsTrigger>
            <TabsTrigger
              value="plate-flow"
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-teal-600 data-[state=active]:bg-transparent data-[state=active]:text-teal-700 data-[state=active]:shadow-none"
            >
              <Grid2X2 className="h-4 w-4" />
              {t("流程与孔板")}
            </TabsTrigger>
            <TabsTrigger
              value="execution"
              className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-slate-950 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <ListChecks className="h-4 w-4" />
              {t("执行详情")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="data-flow" className="mt-0">
          <RunDataFlow run={run} dataFlow={run.dataFlow} />
        </TabsContent>

        <TabsContent value="plate-flow" className="mt-0 space-y-4">
          {!run.integrityValid ? (
            <Alert variant="destructive">
              <CircleAlert className="h-4 w-4" />
              <AlertTitle>{t("不能读取冻结孔板方案")}</AlertTitle>
              <AlertDescription>
                {t(
                  "Run 快照完整性校验未通过，系统不会改用当前流程中的其他排板版本。"
                )}
              </AlertDescription>
            </Alert>
          ) : cloningLayoutPlan ? (
            <>
              <Card className="border-teal-200 bg-teal-50/30">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">
                          {cloningLayoutPlan.name}
                        </span>
                        <Badge variant="outline">
                          V{cloningLayoutPlan.version}
                        </Badge>
                        <Badge variant="secondary">{t("冻结规划快照")}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {t(
                          "目标号、容器与孔位来自本 Run 冻结的排板规划；它们不是实际执行、库存移动或实验结果记录。"
                        )}
                      </p>
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 text-center text-xs">
                      <div className="rounded-lg border bg-white px-3 py-2">
                        <strong className="block text-base">
                          {cloningLayoutPlan.sampleCount}
                        </strong>
                        {t("目标")}
                      </div>
                      <div className="rounded-lg border bg-white px-3 py-2">
                        <strong className="block text-base">
                          {cloningLayoutPlan.plateCount}
                        </strong>
                        {t("孔板")}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-teal-100 pt-3 text-[10px] text-muted-foreground">
                    <span>
                      {cloningLayoutPlan.nodeLabel
                        ? t("来源节点：{node}", {
                            node: cloningLayoutPlan.nodeLabel,
                          })
                        : t("流程级方案")}
                    </span>
                    <span>
                      {t("引擎版本")} {cloningLayoutPlan.engineVersion}
                    </span>
                    <span className="font-mono">
                      SHA-256 · {cloningLayoutPlan.snapshotHash}
                    </span>
                  </div>
                </CardContent>
              </Card>
              <CloningPlateFlowViewer
                plan={cloningLayoutPlan.plan}
                exportBaseName={`${run.runNo}-cloning-layout-v${cloningLayoutPlan.version}`}
                targetBindings={cloningLayoutPlan.targetBindings}
                jsonExportValue={{
                  run: { id: run.id, runNo: run.runNo, snapshotHash: run.snapshotHash },
                  cloningLayoutPlan,
                }}
              />
            </>
          ) : (
            <Card>
              <CardContent className="px-5 py-12 text-center">
                <Grid2X2 className="mx-auto h-10 w-10 text-slate-300" />
                <h2 className="mt-4 text-base font-semibold">
                  {t("此 Run 未关联冻结排板方案")}
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t(
                    "这是旧 Run 或发起时未选择排板方案。系统不会读取当前流程的最新版本来补写历史 Run。"
                  )}
                </p>
                <Button variant="outline" className="mt-5" asChild>
                  <Link to={`/workflows/${run.workflowId}?view=plates`}>
                    {t("查看来源流程当前孔板配置")}{" "}
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {t("该链接展示当前流程配置，不属于本 Run 快照。")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="execution" className="mt-0 space-y-5">
          <div className="grid gap-3 lg:grid-cols-4">
            {preparation.map((item, index) => (
              <Card
                key={item.label}
                className={item.ok ? "border-teal-200" : ""}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.ok ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-400"}`}
                    >
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("步骤 {n}", { n: index + 1 })}
                      </div>
                      <div className="font-medium">{item.label}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FlaskConical className="h-4 w-4 text-teal-600" />
                    {t("运行步骤")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {run.nodes.map((node, index) => (
                      <div
                        key={node.id}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${node.status === "running" ? "border-blue-300 bg-blue-50" : node.status === "completed" ? "border-teal-200 bg-teal-50/60" : "bg-white"}`}
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${node.status === "completed" ? "bg-teal-600 text-white" : node.status === "running" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}
                        >
                          {node.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {node.label}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {t(RUN_NODE_TYPE_LABELS[node.type] ?? node.type)}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {t(
                            RUN_NODE_STATUS_LABELS[node.status] ?? node.status
                          )}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TestTubes className="h-4 w-4 text-teal-600" />
                      {t("样本与物料")}
                    </CardTitle>
                    {run.sampleRequestId && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/sample-requests/${run.sampleRequestId}`}>
                          {run.requestNo}{" "}
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-xl border">
                    <div className="grid grid-cols-[minmax(0,1fr)_120px_130px] gap-3 border-b bg-slate-50 px-4 py-2 text-[11px] font-semibold text-slate-500">
                      <span>{t("库存对象")}</span>
                      <span>{t("角色")}</span>
                      <span>{t("计划量")}</span>
                    </div>
                    <div className="divide-y">
                      {run.resources.map(resource => (
                        <div
                          key={resource.id}
                          className="grid grid-cols-[minmax(0,1fr)_120px_130px] items-center gap-3 px-4 py-3 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              <span className="mr-2 font-mono text-xs text-teal-700">
                                {resource.sku}
                              </span>
                              {resource.sampleName}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {t(resource.sampleType)} · {t("冻结时库存已记录")}
                            </div>
                          </div>
                          <Badge variant="secondary" className="w-fit">
                            {t(
                              LAB_RUN_ROLE_META[
                                resource.role as LabRunResourceRole
                              ].label
                            )}
                          </Badge>
                          <span>
                            {resource.amount} {resource.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MonitorCog className="h-4 w-4 text-teal-600" />
                    {t("设备节点与当次参数")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {equipmentNodes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {t("该运行没有设备节点")}
                    </p>
                  ) : (
                    equipmentNodes.map((node, index) => {
                      const snapshot = parseSnapshot(node.parameterSnapshot);
                      const parameters = Object.entries(
                        snapshot.effectiveValues ?? {}
                      );
                      return (
                        <div key={node.id} className="rounded-xl border p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-[11px] font-semibold text-teal-700">
                                {t("设备节点 {n}", { n: index + 1 })}
                              </div>
                              <div className="mt-1 font-medium">
                                {node.label}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {node.equipmentName || t("设备快照")}{" "}
                                {node.equipmentModel
                                  ? `· ${node.equipmentModel}`
                                  : ""}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline">
                                {t(
                                  RUN_NODE_STATUS_LABELS[node.status] ??
                                    node.status
                                )}
                              </Badge>
                              {node.driverKey && (
                                <Badge variant="secondary">
                                  {node.driverKey}@{node.driverVersion}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {snapshot.methodRef && (
                            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                              <span className="text-muted-foreground">
                                {t("方法文件")}：
                              </span>
                              {snapshot.methodRef}
                            </div>
                          )}
                          {parameters.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {parameters.map(([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded-md border bg-white px-2 py-1 text-xs"
                                >
                                  <span className="text-muted-foreground">
                                    {key}
                                  </span>{" "}
                                  · {String(value)}
                                  {snapshot.units?.[key]
                                    ? ` ${snapshot.units[key]}`
                                    : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {snapshot.overrideReason && (
                            <div className="mt-3 text-xs text-amber-700">
                              {t("调整说明")}：{snapshot.overrideReason}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4 text-teal-600" />
                    {t("运行信息")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    [t("来源流程"), run.workflowName],
                    [t("关联项目"), run.projectName || "—"],
                    [t("负责人"), run.operatorName || "—"],
                    [t("计划开始"), fmtDate(run.scheduledStart, lang)],
                    [t("计划结束"), fmtDate(run.scheduledEnd, lang)],
                    [t("创建时间"), fmtDate(run.createdAt, lang)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-start justify-between gap-3"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-right font-medium">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    {t("执行就绪")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {run.readiness.issues.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-teal-700">
                      <CheckCircle2 className="h-4 w-4" />
                      {t("当前检查项全部通过")}
                    </div>
                  ) : (
                    run.readiness.issues.map((issue, index) => (
                      <div
                        key={`${issue.code}-${index}`}
                        className={`flex items-start gap-2 text-sm ${issue.level === "blocking" ? "text-red-700" : "text-amber-700"}`}
                      >
                        {issue.level === "blocking" ? (
                          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <Info className="mt-0.5 h-4 w-4 shrink-0" />
                        )}
                        <span>{issueText(issue)}</span>
                      </div>
                    ))
                  )}
                  <div className="rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
                    {t(
                      run.executionMode === "simulation"
                        ? "这是受控模拟 Run。后续可接入节点执行器，但不会产生真机执行声明。"
                        : "现场启动需要 Edge 心跳、设备租约、命令账本和回执闭环；当前入口保持锁定。"
                    )}
                  </div>
                  {run.executionMode !== "simulation" ? (
                    <Button className="w-full" disabled>
                      <Play className="mr-1 h-4 w-4" />
                      {t("等待 Edge 运行通道")}
                    </Button>
                  ) : run.status === "ready" ? (
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-500"
                      disabled={
                        !run.integrityValid ||
                        run.readiness.summary.blocking > 0 ||
                        startSimulationMut.isPending
                      }
                      onClick={() =>
                        startSimulationMut.mutate({
                          id: run.id,
                          expectedRevision: run.revision,
                          idempotencyKey: globalThis.crypto.randomUUID(),
                        })
                      }
                    >
                      <Play className="mr-1 h-4 w-4" />
                      {t(
                        startSimulationMut.isPending
                          ? "正在启动模拟…"
                          : "启动模拟执行"
                      )}
                    </Button>
                  ) : run.status === "running" ? (
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-500"
                      disabled={
                        !run.integrityValid || advanceSimulationMut.isPending
                      }
                      onClick={() =>
                        advanceSimulationMut.mutate({
                          id: run.id,
                          expectedRevision: run.revision,
                          idempotencyKey: globalThis.crypto.randomUUID(),
                        })
                      }
                    >
                      <Play className="mr-1 h-4 w-4" />
                      {t(
                        advanceSimulationMut.isPending
                          ? "正在推进…"
                          : "推进模拟一步"
                      )}
                    </Button>
                  ) : (
                    <Button className="w-full" disabled>
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      {t(
                        run.status === "completed"
                          ? "模拟运行已完成"
                          : "模拟运行不可启动"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FlaskConical className="h-4 w-4 text-teal-600" />
                    {t("节点进度")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t("{done}/{total} 节点完成", {
                        done: completedNodes,
                        total: run.nodes.length,
                      })}
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="mt-2 h-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <ShieldCheck className="h-4 w-4 text-teal-600" />
                    {t("快照完整性")}
                  </div>
                  <div className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                    SHA-256 · {run.snapshotHash}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("取消实验运行")}</DialogTitle>
          </DialogHeader>
          <Alert className="border-amber-200 bg-amber-50">
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t(
                "取消后将释放仍有效的库存预占和设备预约；已产生的运行快照与审计记录会保留。"
              )}
            </AlertDescription>
          </Alert>
          <div className="space-y-1.5">
            <Label>{t("取消原因")}</Label>
            <Textarea
              value={cancelReason}
              onChange={event => setCancelReason(event.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t("返回")}
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMut.isPending}
              onClick={() =>
                cancelMut.mutate({ id: run.id, reason: cancelReason.trim() })
              }
            >
              {t("确认取消并释放资源")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
