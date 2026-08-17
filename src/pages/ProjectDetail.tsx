import { trpc } from "@/providers/trpc";
import { useParams, useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  NotebookPen,
  TestTubes,
  Plus,
  LayoutDashboard,
  Workflow,
  Activity as ActivityIcon,
  GitBranch,
  Play,
  Handshake,
} from "lucide-react";
import { EXP_STATUS, PROJECT_COLORS, PROJECT_STATUS, SAMPLE_TYPES, fmtDate, fmtDateTime } from "@/lib/labels";
import { useState } from "react";
import { useI18n } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FLOW_NODE_STATUS, WORKFLOW_STATUS, type FlowNodeStatus } from "@contracts/workflow";
import { externalOrderStage } from "@contracts/externalOrder";

/* 业务流节点状态条：一格一节点，颜色 = 状态 */
function NodeStrip({ nodes }: { nodes: { id: number; label: string; status: string }[] }) {
  const { t } = useI18n();
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex flex-wrap gap-[3px]">
        {nodes.map((n) => {
          const meta = FLOW_NODE_STATUS[(n.status as FlowNodeStatus)] ?? FLOW_NODE_STATUS.pending;
          return (
            <Tooltip key={n.id}>
              <TooltipTrigger asChild>
                <span
                  className="h-3.5 w-3.5 rounded-[3px] inline-block"
                  style={{ backgroundColor: meta.color }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {n.label} · {t(meta.label)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

type WfSummary = {
  id: number;
  name: string;
  status: string;
  experimentId: number | null;
  parentWorkflowId: number | null;
  updatedAt: string | Date;
  total: number;
  done: number;
  inProgress: number;
  progress: number;
  nodes: { id: number; label: string; status: string; type: string }[];
};

function WorkflowCard({ wf, subflows, onOpen }: { wf: WfSummary; subflows: WfSummary[]; onOpen: (id: number) => void }) {
  const { t } = useI18n();
  const st = WORKFLOW_STATUS[wf.status] ?? WORKFLOW_STATUS.draft;
  return (
    <Card className="hover:border-teal-300 transition-colors">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 cursor-pointer" onClick={() => onOpen(wf.id)}>
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="h-4 w-4 text-teal-600 shrink-0" />
            <span className="font-medium truncate">{wf.name}</span>
            <Badge variant="outline" style={{ color: st.color, borderColor: st.color }}>{t(st.label)}</Badge>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {wf.done}/{wf.total} {t("节点")} · {wf.progress}%
          </span>
        </div>
        <Progress value={wf.progress} className="h-1.5" />
        <NodeStrip nodes={wf.nodes} />
        {subflows.length > 0 && (
          <div className="pl-5 border-l-2 border-teal-100 space-y-2 pt-1">
            {subflows.map((sf) => (
              <div key={sf.id} className="cursor-pointer" onClick={() => onOpen(sf.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground truncate">
                    └ {sf.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{sf.progress}%</span>
                </div>
                <Progress value={sf.progress} className="h-1 mt-1" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectDetail() {
  const { t, lang } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);
  const { data: project, isLoading } = trpc.project.byId.useQuery({ id: projectId });
  const { data: dash } = trpc.project.dashboard.useQuery({ id: projectId });
  const { data: externalOrders } = trpc.externalOrder.list.useQuery({ projectId });
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [wfOpen, setWfOpen] = useState<{ experimentId: number; title: string } | null>(null);
  const [wfTpl, setWfTpl] = useState<string>("");
  const [form, setForm] = useState({ title: "", objective: "" });
  const { data: templates } = trpc.workflow.templates.useQuery();
  const createMut = trpc.experiment.create.useMutation({
    onSuccess: (r) => {
      toast.success(t("实验 {code} 已创建", { code: r.code }));
      setCreateOpen(false);
      navigate(`/experiments/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const createWfMut = trpc.workflow.create.useMutation({
    onSuccess: (r) => {
      toast.success(t("业务流已创建"));
      setWfOpen(null);
      setWfTpl("");
      utils.project.dashboard.invalidate();
      navigate(`/workflows/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return <div className="text-center py-20 text-muted-foreground">{t("项目不存在")}</div>;
  }

  const color = PROJECT_COLORS[project.color] ?? PROJECT_COLORS.teal;
  const status = PROJECT_STATUS[project.status];

  const topWfs = (dash?.workflows ?? []).filter((w) => !w.parentWorkflowId);
  const subflowOf = (parentId: number) =>
    (dash?.workflows ?? []).filter((w) => w.parentWorkflowId === parentId);
  const wfForExp = (expId: number) => topWfs.filter((w) => w.experimentId === expId);
  const activeExp = project.experiments.filter(
    (e) => e.status === "in_progress" || e.status === "planning",
  ).length;
  const avgProgress = topWfs.length
    ? Math.round(topWfs.reduce((s, w) => s + w.progress, 0) / topWfs.length)
    : 0;
  const expByStatus = dash?.expByStatus ?? {};

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回项目列表")}
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${color.dot}`} />
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <Badge variant="outline" className={status.cls}>{t(status.label)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
              {project.description || t("暂无描述")}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-teal-600 hover:bg-teal-500 shrink-0">
            <Plus className="h-4 w-4 mr-1" /> {t("新建实验")}
          </Button>
        </div>
      </div>

      {/* 项目仪表盘统计卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: t("实验任务"), value: project.experiments.length, icon: NotebookPen },
          { label: t("进行中实验"), value: activeExp, icon: Play },
          { label: t("业务流"), value: topWfs.length, icon: Workflow },
          { label: t("平均进度"), value: `${avgProgress}%`, icon: LayoutDashboard },
          { label: t("关联样本"), value: project.samples.length, icon: TestTubes },
          { label: t("外部委托"), value: externalOrders?.length ?? 0, icon: Handshake },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <c.icon className="h-5 w-5 text-teal-600 shrink-0" />
              <div>
                <div className="text-xl font-bold leading-none">{c.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" /> {t("项目仪表盘")}
          </TabsTrigger>
          <TabsTrigger value="experiments" className="gap-1.5">
            <NotebookPen className="h-3.5 w-3.5" /> {t("实验任务")} ({project.experiments.length})
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-1.5">
            <Workflow className="h-3.5 w-3.5" /> {t("业务流追踪")} ({topWfs.length})
          </TabsTrigger>
          <TabsTrigger value="samples" className="gap-1.5">
            <TestTubes className="h-3.5 w-3.5" /> {t("关联样本")} ({project.samples.length})
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-1.5">
            <Handshake className="h-3.5 w-3.5" /> {t("外部委托")} ({externalOrders?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* ── 仪表盘 ── */}
        <TabsContent value="dashboard" className="mt-4 grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("实验状态分布")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(Object.keys(EXP_STATUS) as (keyof typeof EXP_STATUS)[]).map((k) => {
                const cnt = expByStatus[k] ?? 0;
                const pct = project.experiments.length ? (cnt / project.experiments.length) * 100 : 0;
                return (
                  <div key={k}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{t(EXP_STATUS[k].label)}</span>
                      <span className="text-muted-foreground">{cnt}</span>
                    </div>
                    <div className="h-1.5 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-teal-500 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("业务流进度")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topWfs.length ? (
                topWfs.slice(0, 6).map((w) => (
                  <div key={w.id} className="cursor-pointer" onClick={() => navigate(`/workflows/${w.id}`)}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="truncate max-w-[70%]">{w.name}</span>
                      <span className="text-muted-foreground">{w.progress}%</span>
                    </div>
                    <Progress value={w.progress} className="h-1.5" />
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">{t("暂无关联业务流")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <ActivityIcon className="h-3.5 w-3.5" /> {t("最近动态")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(dash?.activities ?? []).length ? (
                dash!.activities.map((a) => (
                  <div key={a.id} className="text-xs">
                    <span className="text-teal-700 font-medium">{a.userName ?? "—"}</span>{" "}
                    {t(a.action)}
                    {a.entityName ? `「${a.entityName}」` : ""}
                    <div className="text-muted-foreground mt-0.5">{fmtDateTime(a.createdAt)}</div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">{t("暂无动态")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 实验任务（含 workflow 节点追踪） ── */}
        <TabsContent value="experiments" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {project.experiments.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">{t("编号")}</TableHead>
                      <TableHead>{t("标题")}</TableHead>
                      <TableHead className="w-28">{t("状态")}</TableHead>
                      <TableHead className="w-[26%]">{t("业务流节点追踪")}</TableHead>
                      <TableHead className="w-32">{t("创建人")}</TableHead>
                      <TableHead className="w-36">{t("更新时间")}</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.experiments.map((e) => {
                      const st = EXP_STATUS[e.status];
                      const linked = wfForExp(e.id);
                      return (
                        <TableRow key={e.id}>
                          <TableCell
                            className="font-mono text-xs text-teal-700 cursor-pointer"
                            onClick={() => navigate(`/experiments/${e.id}`)}
                          >
                            {e.code}
                          </TableCell>
                          <TableCell
                            className="font-medium cursor-pointer"
                            onClick={() => navigate(`/experiments/${e.id}`)}
                          >
                            {e.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={st.cls}>{t(st.label)}</Badge>
                          </TableCell>
                          <TableCell>
                            {linked.length ? (
                              <div className="space-y-1.5">
                                {linked.map((w) => (
                                  <div
                                    key={w.id}
                                    className="cursor-pointer group"
                                    onClick={() => navigate(`/workflows/${w.id}`)}
                                  >
                                    <div className="flex items-center justify-between text-xs mb-0.5">
                                      <span className="truncate max-w-[75%] group-hover:text-teal-700">{w.name}</span>
                                      <span className="text-muted-foreground">{w.done}/{w.total}</span>
                                    </div>
                                    <NodeStrip nodes={w.nodes} />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("未关联业务流")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.createdByName ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{fmtDateTime(e.updatedAt)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setWfOpen({ experimentId: e.id, title: e.title })}
                            >
                              <Play className="h-3 w-3 mr-1" /> {t("发起业务流")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">
                  {t("该项目下还没有实验记录")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 业务流追踪 ── */}
        <TabsContent value="workflows" className="mt-4">
          {topWfs.length ? (
            <div className="grid md:grid-cols-2 gap-4">
              {topWfs.map((w) => (
                <WorkflowCard key={w.id} wf={w} subflows={subflowOf(w.id)} onOpen={(wid) => navigate(`/workflows/${wid}`)} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {t("暂无关联业务流，可在实验任务列表中发起")}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── 关联样本 ── */}
        <TabsContent value="samples" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {project.samples.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">{t("编号")}</TableHead>
                      <TableHead>{t("名称")}</TableHead>
                      <TableHead className="w-28">{t("类型")}</TableHead>
                      <TableHead className="w-32">{t("余量")}</TableHead>
                      <TableHead className="w-32">{t("效期")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.samples.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/samples/${s.id}`)}
                      >
                        <TableCell className="font-mono text-xs text-teal-700">{s.sku}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={SAMPLE_TYPES[s.type]?.cls}>
                            {t(SAMPLE_TYPES[s.type]?.label ?? s.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>{s.quantity} {s.unit}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(s.expiryDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">{t("暂无关联样本")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 外部委托 ── */}
        <TabsContent value="external" className="mt-4">
          {externalOrders?.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {externalOrders.map((order) => {
                const stage = externalOrderStage(order);
                return (
                  <Card
                    key={order.id}
                    className="cursor-pointer transition-colors hover:border-pink-300"
                    onClick={() => navigate(`/external-orders/${order.id}`)}
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-mono text-xs font-semibold text-teal-700">{order.orderNo}</div>
                          <div className="mt-1 font-medium">{order.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{order.providerName ?? "—"}</div>
                        </div>
                        <Badge variant="outline" className={stage.cls}>{t(stage.label)}</Badge>
                      </div>
                      <Progress value={stage.progress} className="h-1.5" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{order.itemCount} {t("个服务项")}</span>
                        <span>{t("预计交付")}：{fmtDate(order.expectedDeliveryDate)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
                <Handshake className="h-9 w-9 opacity-40" />
                <span>{t("该项目暂无外部委托")}</span>
                <Button size="sm" variant="outline" onClick={() => navigate("/external-orders")}>{t("前往外部委托")}</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 新建实验 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("在「{name}」下新建实验", { name: project.name })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("实验标题")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("例如：CD19-CAR 慢病毒转导效率优化")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("实验目标（可选）")}</Label>
              <Textarea
                value={form.objective}
                onChange={(e) => setForm({ ...form, objective: e.target.value })}
                rows={3}
                placeholder={t("本实验希望回答的问题或达成的指标…")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createMut.isPending || !form.title.trim()}
              onClick={() =>
                createMut.mutate({ projectId, title: form.title.trim(), objective: form.objective || undefined })
              }
            >
              {t("创建并打开")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 从模板发起业务流（挂到实验任务） */}
      <Dialog open={!!wfOpen} onOpenChange={(o) => !o && setWfOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("为实验「{name}」发起业务流", { name: wfOpen?.title ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("选择流程模板")}</Label>
              <Select value={wfTpl} onValueChange={setWfTpl}>
                <SelectTrigger>
                  <SelectValue placeholder={t("选择一个业务流模板…")} />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((tpl: { key: string; name: string; description?: string }) => (
                    <SelectItem key={tpl.key} value={tpl.key}>
                      {t(tpl.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWfOpen(null)}>{t("取消")}</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={createWfMut.isPending || !wfTpl || !wfOpen}
              onClick={() => {
                const tpl = (templates ?? []).find((x: { key: string }) => x.key === wfTpl);
                if (!wfOpen || !tpl) return;
                createWfMut.mutate({
                  name: `${t(tpl.name)} · ${wfOpen.title}`.slice(0, 250),
                  templateKey: wfTpl,
                  projectId,
                  experimentId: wfOpen.experimentId,
                  lang,
                });
              }}
            >
              {t("创建并打开编辑器")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
