import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { labTaskLabel, labRunModeLabel } from "@contracts/labRun";

function RunActions({
  runId,
  primaryLabel,
}: {
  runId: number;
  primaryLabel: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-end">
      <Button asChild size="sm">
        <Link to={`/runs/${runId}`}>{t(primaryLabel)}</Link>
      </Button>
    </div>
  );
}

export default function MyWork() {
  const { t } = useI18n();
  const { user } = useAuth();
  const runs = trpc.labRun.list.useQuery();
  const drafts = trpc.runDraft.list.useQuery();
  const identities = trpc.sampleIdentity.pending.useQuery(undefined, {
    enabled: ["reviewer", "admin"].includes(user?.role ?? ""),
  });
  const [rehearsal, setRehearsal] = useState(false);
  const reviewQueue = ["reviewer", "admin"].includes(user?.role ?? "")
    ? (runs.data?.filter(
        run =>
          run.resultState === "review" &&
          run.executionOwnerId !== user?.id &&
          run.executionMode !== "simulation"
      ) ?? [])
    : [];
  const mine =
    runs.data?.filter(
      run =>
        (rehearsal
          ? run.executionMode === "simulation"
          : run.executionMode !== "simulation") &&
        (run.executionOwnerId
          ? run.executionOwnerId === user?.id
          : run.createdById === user?.id ||
            (!!user?.name && run.operatorName === user.name))
    ) ?? [];
  const open = mine.filter(
    run =>
      run.status !== "cancelled" &&
      run.resultState !== "approved" &&
      !(run.executionMode === "simulation" && run.status === "completed")
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("我的工作")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.name} · {t("先完成当前任务，或从已发布方法开始新实验。")}
          </p>
        </div>
        <Button asChild>
          <Link to="/workflows">{t("准备新实验")}</Link>
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant={rehearsal ? "outline" : "default"}
          onClick={() => setRehearsal(false)}
        >
          {t("日常实验")}
        </Button>
        <Button
          variant={rehearsal ? "default" : "outline"}
          onClick={() => setRehearsal(true)}
        >
          {t("模拟演练")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "待开始",
            count: mine.filter(r => r.status === "ready").length,
          },
          {
            label: "执行中",
            count: mine.filter(r => r.status === "running" && !r.paused).length,
          },
          {
            label: "待处理",
            count: mine.filter(
              r =>
                r.paused ||
                r.status === "failed" ||
                (r.status === "completed" &&
                  !["review", "approved"].includes(r.resultState ?? "") &&
                  r.executionMode !== "simulation")
            ).length,
          },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="text-3xl font-semibold">{item.count}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t(item.label)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!!reviewQueue.length && !rehearsal && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("等待我复核的实验结果")}</h2>
          {reviewQueue.map(run => (
            <div
              key={run.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4"
            >
              <div>
                <strong>{run.name}</strong>
                <p className="mt-1 text-sm text-muted-foreground">
                  {run.executionOwnerName}
                </p>
              </div>
              <RunActions runId={run.id} primaryLabel="阅读结果并复核" />
            </div>
          ))}
        </section>
      )}
      {drafts.error && <p role="alert">{drafts.error.message}</p>}
      {!rehearsal &&
        identities.data?.some(record => record.submittedBy !== user?.id) && (
          <section className="space-y-3">
            <h2 className="font-semibold">{t("等待我确认的来样身份")}</h2>
            {identities.data
              .filter(record => record.submittedBy !== user?.id)
              .map(record => (
                <Link
                  key={record.id}
                  to={`/samples/${record.sampleId}`}
                  className="flex flex-wrap justify-between gap-2 rounded-xl border bg-violet-50 p-4"
                >
                  <strong>
                    {record.sku} · {record.name}
                  </strong>
                  <span className="text-sm">
                    {record.antibodyId} · {record.chain} ·{" "}
                    {record.submittedByName} →
                  </span>
                </Link>
              ))}
          </section>
        )}
      {!!drafts.data?.length && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("继续准备实验")}</h2>
          {drafts.data
            .filter(draft =>
              rehearsal
                ? draft.payload.executionMode === "simulation"
                : draft.payload.executionMode !== "simulation"
            )
            .map(draft => (
              <Link
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-amber-50 p-4"
                key={draft.id}
                to={`/runs/new?workflowId=${draft.workflowId}&draftId=${draft.id}`}
              >
                <div>
                  <strong>{draft.payload.name || draft.workflowName}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("准备草稿")} · {draft.ownerName}
                  </p>
                </div>
                <span className="text-sm">{t("继续准备")} →</span>
              </Link>
            ))}
        </section>
      )}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("需要我处理")}</h2>
        <Link className="text-sm text-teal-700" to="/runs">
          {t("查看团队实验任务")}
        </Link>
      </div>
      {runs.error && <p role="alert">{runs.error.message}</p>}
      {runs.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : !open.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("目前没有需要处理的任务")}
          </CardContent>
        </Card>
      ) : (
        open.map(run => {
          const primaryLabel =
            run.resultState === "review"
              ? "查看复核进度"
              : run.paused
                ? "核对现场并恢复"
                : run.status === "ready"
                  ? "检查缺项并确认开始"
                  : run.status === "running"
                    ? "继续当前步骤"
                    : "补齐结果或处理异常";
          return (
            <div
              key={run.id}
              className="rounded-xl border bg-white p-5 transition hover:border-teal-400"
            >
              <div className="flex justify-between gap-3">
                <strong>{run.name}</strong>
                <Badge variant="outline">{t(labTaskLabel(run))}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {run.workflowName} · {t(labRunModeLabel(run.executionMode))} ·{" "}
                {run.projectName}
              </p>
              <div className="mt-4">
                <RunActions runId={run.id} primaryLabel={primaryLabel} />
              </div>
            </div>
          );
        })
      )}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/experiments">{t("查看实验记录")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/samples">{t("查找样本与物料")}</Link>
        </Button>
      </div>
    </div>
  );
}
