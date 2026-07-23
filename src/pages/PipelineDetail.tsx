import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useParams, useNavigate, Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Check,
  Circle,
  Loader2,
  SkipForward,
  NotebookPen,
  Trash2,
  Repeat,
  Plus,
  Pencil,
} from "lucide-react";
import { PIPELINE_STATUS, PIPELINE_TYPES, fmtDateTime } from "@/lib/labels";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function PipelineDetail() {
  const { id } = useParams<{ id: string }>();
  const pipelineId = Number(id);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: pipeline, isLoading } = trpc.pipeline.byId.useQuery({ id: pipelineId });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [noteStage, setNoteStage] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  const refresh = () => {
    utils.pipeline.byId.invalidate({ id: pipelineId });
    utils.pipeline.list.invalidate();
  };

  const stageMut = trpc.pipeline.updateStage.useMutation({
    onSuccess: () => refresh(),
    onError: (e) => toast.error(e.message),
  });
  const createExpMut = trpc.pipeline.createStageExperiment.useMutation({
    onSuccess: (r) => {
      toast.success(`实验 ${r.code} 已创建并关联`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.pipeline.delete.useMutation({
    onSuccess: () => {
      toast.success("Pipeline 已删除");
      navigate("/pipelines");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !pipeline) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const type = PIPELINE_TYPES[pipeline.type];
  const status = PIPELINE_STATUS[pipeline.status];
  const done = pipeline.stages.filter((s) => s.status === "done").length;
  const pct = pipeline.stages.length ? Math.round((done / pipeline.stages.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/pipelines")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> 返回 Pipeline 列表
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {pipeline.type === "dbtl_cycle" && (
            <span className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded px-2 py-1">
              <Repeat className="h-3 w-3" /> 第 {pipeline.iteration} 轮迭代
            </span>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{pipeline.name}</h1>
          <Badge variant="outline" className={type.cls}>{type.label}</Badge>
          <Badge variant="outline" className={status.cls}>{status.label}</Badge>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-red-600 hover:text-red-600 hover:bg-red-50"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {pipeline.description && (
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{pipeline.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {pipeline.project && (
            <span>
              关联项目：
              <Link to={`/projects/${pipeline.project.id}`} className="text-teal-600 hover:underline">
                {pipeline.project.name}
              </Link>
            </span>
          )}
          <span>启动人：{pipeline.createdByName ?? "—"}</span>
          <span>最近更新：{fmtDateTime(pipeline.updatedAt)}</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            流程进度
            <span className="text-sm font-normal text-muted-foreground">
              {done}/{pipeline.stages.length} 阶段 · {pct}%
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {/* 阶段列表 */}
      <div className="space-y-3">
        {pipeline.stages.map((stage, idx) => {
          const isDone = stage.status === "done";
          const isCurrent = stage.status === "in_progress";
          const isSkipped = stage.status === "skipped";
          return (
            <Card
              key={stage.id}
              className={cn(
                "transition-all",
                isCurrent && "border-blue-300 ring-1 ring-blue-100 bg-blue-50/30",
                isDone && "opacity-80",
              )}
            >
              <CardContent className="p-4 flex items-start gap-4">
                {/* 状态图标 */}
                <div className="flex flex-col items-center pt-0.5">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2",
                      isDone && "bg-emerald-500 border-emerald-500 text-white",
                      isCurrent && "bg-blue-500 border-blue-500 text-white",
                      isSkipped && "bg-slate-200 border-slate-300 text-slate-400",
                      stage.status === "pending" && "bg-white border-slate-300 text-slate-400",
                    )}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isSkipped ? (
                      <SkipForward className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  {idx < pipeline.stages.length - 1 && (
                    <div className={cn("w-0.5 flex-1 mt-1 min-h-4", isDone ? "bg-emerald-300" : "bg-slate-200")} />
                  )}
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">#{stage.orderIndex}</span>
                    <h3 className={cn("font-semibold text-sm", isDone && "line-through text-slate-400")}>
                      {stage.name}
                    </h3>
                    {isCurrent && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        进行中
                      </Badge>
                    )}
                    {isDone && stage.completedAt && (
                      <span className="text-xs text-muted-foreground">
                        完成于 {fmtDateTime(stage.completedAt)}
                      </span>
                    )}
                  </div>

                  {stage.notes && (
                    <p className="text-sm text-muted-foreground mt-1">{stage.notes}</p>
                  )}

                  {/* 关联实验 */}
                  {stage.linkedExperiment ? (
                    <Link
                      to={`/experiments/${stage.linkedExperiment.id}`}
                      className="inline-flex items-center gap-1.5 mt-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-1 hover:bg-teal-100"
                    >
                      <NotebookPen className="h-3 w-3" />
                      {stage.linkedExperiment.code} {stage.linkedExperiment.title}
                    </Link>
                  ) : (
                    pipeline.project &&
                    !isDone &&
                    !isSkipped && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 mt-2 text-teal-600 px-2"
                        disabled={createExpMut.isPending}
                        onClick={() => createExpMut.mutate({ stageId: stage.id })}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> 创建关联实验
                      </Button>
                    )
                  )}

                  {/* 备注编辑 */}
                  {noteStage === stage.id && (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        rows={2}
                        placeholder="阶段备注（关键参数、结果摘要…）"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 bg-teal-600 hover:bg-teal-500"
                          onClick={() => {
                            stageMut.mutate({ stageId: stage.id, status: stage.status, notes: noteText });
                            setNoteStage(null);
                          }}
                        >
                          保存备注
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => setNoteStage(null)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作 */}
                {pipeline.status !== "completed" && (
                  <div className="flex gap-1.5 shrink-0">
                    {(isCurrent || stage.status === "pending") && (
                      <Button
                        size="sm"
                        className="h-7 bg-emerald-600 hover:bg-emerald-500"
                        disabled={stageMut.isPending}
                        onClick={() => stageMut.mutate({ stageId: stage.id, status: "done" })}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> 完成
                      </Button>
                    )}
                    {stage.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={stageMut.isPending}
                        onClick={() => stageMut.mutate({ stageId: stage.id, status: "in_progress" })}
                      >
                        开始
                      </Button>
                    )}
                    {isCurrent && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={stageMut.isPending}
                        onClick={() => stageMut.mutate({ stageId: stage.id, status: "skipped" })}
                      >
                        跳过
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => {
                        setNoteStage(stage.id);
                        setNoteText(stage.notes ?? "");
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {pipeline.type === "dbtl_cycle" && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800 flex items-center gap-2">
          <Repeat className="h-4 w-4 shrink-0" />
          DBTL 工程循环：完成本轮全部阶段后将自动开启下一轮迭代，实现持续工程优化。
        </div>
      )}

      {/* 删除 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Pipeline「{pipeline.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              流程及其阶段记录将被删除（已创建的关联实验保留）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id: pipelineId })}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
