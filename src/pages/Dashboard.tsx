import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderKanban,
  NotebookPen,
  TestTubes,
  Workflow,
  Network,
  AlertTriangle,
  Clock,
  ArrowRight,
  FileCheck2,
  MonitorCog,
  Sparkles,
  FlaskConical,
  Gauge,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { ALERT_LABELS, fmtDate, sampleAlert, timeAgo, SAMPLE_TYPES } from "@/lib/labels";
import { useI18n } from "@/i18n";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: activity } = trpc.dashboard.recentActivity.useQuery({ limit: 12 });
  const { data: expiring } = trpc.dashboard.expiringSamples.useQuery();
  const { data: lowStock } = trpc.dashboard.lowStockSamples.useQuery();
  const { data: experiments } = trpc.experiment.list.useQuery();
  const { data: workflows } = trpc.workflow.list.useQuery();
  const { data: equipmentList } = trpc.equipment.list.useQuery();
  const { data: insights } = trpc.ai.insights.useQuery({ lang });

  const chartData = [
    { name: t("计划中"), value: experiments?.filter((e) => e.status === "planning").length ?? 0, fill: "#94a3b8" },
    { name: t("进行中"), value: experiments?.filter((e) => e.status === "in_progress").length ?? 0, fill: "#3b82f6" },
    { name: t("已完成"), value: experiments?.filter((e) => e.status === "completed").length ?? 0, fill: "#10b981" },
    { name: t("已签署"), value: experiments?.filter((e) => e.status === "signed").length ?? 0, fill: "#8b5cf6" },
  ];

  const statCards = [
    { label: t("进行中项目"), value: stats?.activeProjects, icon: FolderKanban, color: "text-teal-600 bg-teal-50", to: "/projects" },
    { label: t("进行中实验"), value: stats?.inProgressExperiments, icon: NotebookPen, color: "text-blue-600 bg-blue-50", to: "/experiments" },
    { label: t("样本总数"), value: stats?.totalSamples, icon: TestTubes, color: "text-violet-600 bg-violet-50", to: "/samples" },
    { label: t("进行中流程"), value: workflows?.filter((w) => w.status === "active").length, icon: Network, color: "text-amber-600 bg-amber-50", to: "/workflows" },
    { label: t("设备总数"), value: equipmentList?.length, icon: MonitorCog, color: "text-indigo-600 bg-indigo-50", to: "/equipment" },
    {
      label: t("设备可用"),
      value: equipmentList?.filter((e) => e.status === "available").length,
      icon: Gauge,
      color: "text-emerald-600 bg-emerald-50",
      to: "/equipment",
    },
  ];

  const INSIGHT_ICONS: Record<string, typeof FlaskConical> = {
    flask: FlaskConical,
    alert: AlertTriangle,
    gauge: Gauge,
    workflow: Workflow,
    sparkles: Sparkles,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("仪表盘")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("实验室运行概览")} · {new Date().toLocaleDateString(lang === "en" ? "en-US" : "zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
      </div>

      {/* 预警条 */}
      {stats && (stats.expired > 0 || stats.lowStock > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {t("库存预警：")}
            {stats.expired > 0 && <b className="mx-1">{t("{n} 个样本已过期", { n: stats.expired })}</b>}
            {stats.lowStock > 0 && <b className="mx-1">{t("{n} 个样本低库存", { n: stats.lowStock })}</b>}
            {stats.expiringSoon > 0 && <b className="mx-1">{t("{n} 个样本 30 天内到期", { n: stats.expiringSoon })}</b>}
          </span>
          <Link to="/samples" className="ml-auto flex items-center gap-1 font-medium hover:underline">
            {t("去处理")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((c) => (
          <Card
            key={c.label}
            className="cursor-pointer hover:shadow-md hover:border-teal-200 transition-all"
            onClick={() => navigate(c.to)}
          >
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${c.color}`}>
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <div className="text-2xl font-bold leading-none">{c.value ?? 0}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1.5">{t(c.label)}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* 左：图表 + 活动 */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-teal-600" />
                {t("实验状态分布")}
                <span className="text-xs font-normal text-muted-foreground ml-auto">
                  {t("共 {n} 个实验 · 已签署 {m}", { n: stats?.totalExperiments ?? 0, m: stats?.signedExperiments ?? 0 })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={48}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={30} />
                    <RTooltip cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-teal-600" />
                {t("最近活动")}
                <Link to="/activity" className="ml-auto text-xs font-normal text-teal-600 hover:underline flex items-center gap-1">
                  {t("查看全部")} <ArrowRight className="h-3 w-3" />
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {activity?.length ? (
                  activity.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                      <div className="h-7 w-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                        {a.userName?.charAt(0) ?? t("系")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{a.userName}</span> {a.action}
                          {a.entityName && <span className="text-slate-700">「{a.entityName}」</span>}
                        </p>
                        {a.detail && <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 mt-1">{timeAgo(a.createdAt)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t("暂无活动记录")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右：AI 洞察 + 预警面板 */}
        <div className="space-y-6">
          <Card className="border-teal-200 bg-gradient-to-br from-teal-50/80 to-cyan-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-600" />
                {t("Copilot 洞察")}
                <span className="text-[10px] font-normal text-teal-600 bg-teal-100 rounded-full px-2 py-0.5 ml-auto">
                  {t("AI 生成")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights?.map((ins, i) => {
                const Icon = INSIGHT_ICONS[ins.icon] ?? Sparkles;
                const body = (
                  <div
                    className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm bg-white/70 border border-transparent ${
                      ins.url ? "hover:border-teal-300 cursor-pointer transition-colors" : ""
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        ins.level === "warn" ? "text-amber-500" : ins.level === "ok" ? "text-emerald-500" : "text-teal-500"
                      }`}
                    />
                    <span className="text-slate-700 leading-snug">{ins.text}</span>
                  </div>
                );
                return ins.url ? (
                  <Link key={i} to={ins.url}>{body}</Link>
                ) : (
                  <div key={i}>{body}</div>
                );
              }) ?? <p className="text-sm text-muted-foreground py-2">{t("洞察生成中…")}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {t("效期预警")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiring?.length ? (
                expiring.slice(0, 6).map((s) => {
                  const alert = sampleAlert(s);
                  return (
                    <Link
                      key={s.id}
                      to={`/samples/${s.id}`}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.sku} · {t("效期")} {fmtDate(s.expiryDate)}</div>
                      </div>
                      {alert && (
                        <Badge variant="outline" className={ALERT_LABELS[alert].cls}>
                          {t(ALERT_LABELS[alert].label)}
                        </Badge>
                      )}
                    </Link>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">{t("30 天内无到期样本")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TestTubes className="h-4 w-4 text-amber-500" />
                {t("低库存提醒")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStock?.length ? (
                lowStock.slice(0, 6).map((s) => (
                  <Link
                    key={s.id}
                    to={`/samples/${s.id}`}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:border-teal-300 hover:bg-teal-50/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(SAMPLE_TYPES[s.type]?.label ?? s.type)} · {t("剩余")} {s.quantity} {s.unit}
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      {t("补货")}
                    </Badge>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">{t("库存水平健康")}</p>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
