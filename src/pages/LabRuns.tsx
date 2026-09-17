import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  Network,
  Play,
  Plus,
  TestTubes,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LAB_RUN_STATUS_META, type LabRunStatus } from "@contracts/labRun";

type FilterKey = "all" | "active" | "ready" | "completed";

function fmtDate(value: Date | null, lang: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default function LabRuns() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { data: runs, isLoading, error } = trpc.labRun.list.useQuery();
  const [filter, setFilter] = useState<FilterKey>("active");

  const filtered = useMemo(() => {
    if (!runs) return [];
    if (filter === "all") return runs;
    if (filter === "active") return runs.filter((run) => ["preparing", "ready", "running"].includes(run.status));
    if (filter === "ready") return runs.filter((run) => run.status === "ready");
    return runs.filter((run) => run.status === "completed");
  }, [runs, filter]);

  const stats = {
    active: runs?.filter((run) => ["preparing", "ready", "running"].includes(run.status)).length ?? 0,
    ready: runs?.filter((run) => run.status === "ready").length ?? 0,
    completed: runs?.filter((run) => run.status === "completed").length ?? 0,
  };

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "all", label: t("全部运行"), count: runs?.length ?? 0 },
    { key: "active", label: t("进行中"), count: stats.active },
    { key: "ready", label: t("计划就绪"), count: stats.ready },
    { key: "completed", label: t("已完成"), count: stats.completed },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
            <Activity className="h-4 w-4" /> {t("实验执行")}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("运行中心")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("从 BioFlow 模板创建一次可追溯运行，统一锁定样本、物料、设备和当次参数。")}
          </p>
        </div>
        <Button className="bg-teal-600 hover:bg-teal-500" onClick={() => navigate("/runs/new") }>
          <Plus className="mr-1 h-4 w-4" /> {t("发起实验运行")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: t("当前运行"), value: stats.active, icon: Play, tone: "bg-blue-50 text-blue-700" },
          { label: t("计划就绪"), value: stats.ready, icon: CheckCircle2, tone: "bg-teal-50 text-teal-700" },
          { label: t("已完成"), value: stats.completed, icon: FlaskConical, tone: "bg-emerald-50 text-emerald-700" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === item.key
                ? "bg-slate-950 text-white"
                : "bg-muted text-muted-foreground hover:bg-slate-200"
            }`}
          >
            {item.label} <span className="ml-1 opacity-70">{item.count}</span>
          </button>
        ))}
      </div>

      {error ? (
        <Card className="border-red-200">
          <CardContent className="py-10 text-center text-sm text-red-700">{t("运行列表加载失败")}：{error.message}</CardContent>
        </Card>
      ) : isLoading ? (
        <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <Activity className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-semibold">{t("还没有实验运行")}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {t("选择一个已经配置好的 BioFlow，在向导中补齐本批样本、物料和设备参数。")}
            </p>
            <Button className="mt-5 bg-teal-600 hover:bg-teal-500" onClick={() => navigate("/runs/new") }>
              {t("发起第一个运行")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((run) => {
            const meta = LAB_RUN_STATUS_META[run.status as LabRunStatus];
            const progress = run.nodeCount ? Math.round((run.completedNodeCount / run.nodeCount) * 100) : 0;
            return (
              <Card
                key={run.id}
                className="cursor-pointer overflow-hidden transition-all hover:border-teal-300 hover:shadow-sm"
                onClick={() => navigate(`/runs/${run.id}`)}
              >
                <CardContent className="p-0">
                  <div className="flex items-start justify-between gap-3 border-b bg-slate-50/70 px-5 py-4">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold tracking-wide text-teal-700">{run.runNo}</div>
                      <div className="mt-1 truncate font-semibold">{run.name}</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Badge variant="outline">{t(run.executionMode === "simulation" ? "模拟运行" : "现场执行")}</Badge>
                      <Badge
                        variant="outline"
                        style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}10` }}
                      >
                        {t(meta.label)}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-4 px-5 py-4">
                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Network className="h-3.5 w-3.5" />
                        <span className="truncate">{run.workflowName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>{fmtDate(run.scheduledStart, lang)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TestTubes className="h-3.5 w-3.5" />
                        <span>{t("{samples} 个样本 · {materials} 项物料", { samples: run.sampleCount, materials: run.materialCount })}</span>
                      </div>
                      <div className="truncate">{run.projectName || t("未关联项目")}</div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
                        <span>{t("节点进度")}</span>
                        <span>{run.completedNodeCount}/{run.nodeCount}</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
