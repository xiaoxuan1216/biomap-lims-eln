import { useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useParams, useNavigate, Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Lock,
  PenLine,
  TestTubes,
  Plus,
  Trash2,
  CheckCircle2,
  CloudUpload,
  Unlock,
} from "lucide-react";
import BlockEditor from "@/components/eln/BlockEditor";
import { EXP_STATUS, PROJECT_COLORS, fmtDate, fmtDateTime, parseBlocks, type ElnBlock } from "@/lib/labels";
import { toast } from "sonner";

export default function ExperimentDetail() {
  const { id } = useParams<{ id: string }>();
  const expId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: exp, isLoading } = trpc.experiment.byId.useQuery({ id: expId });
  const { data: sampleOptions } = trpc.sample.options.useQuery();

  const [blocks, setBlocks] = useState<ElnBlock[]>([]);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [signOpen, setSignOpen] = useState(false);
  const [unsignOpen, setUnsignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [usageForm, setUsageForm] = useState({ sampleId: "", amount: "", note: "" });
  const [usageOpen, setUsageOpen] = useState(false);

  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signed = exp?.status === "signed";

  // 初始化加载
  useEffect(() => {
    if (exp && !loadedRef.current) {
      setBlocks(parseBlocks(exp.content));
      setTitle(exp.title);
      setObjective(exp.objective ?? "");
      loadedRef.current = true;
    }
  }, [exp]);

  const saveMut = trpc.experiment.saveContent.useMutation({
    onSuccess: () => setSaveState("saved"),
    onError: (e) => {
      setSaveState("idle");
      toast.error(`自动保存失败：${e.message}`);
    },
  });
  const updateMut = trpc.experiment.update.useMutation({
    onSuccess: () => utils.experiment.byId.invalidate({ id: expId }),
    onError: (e) => toast.error(e.message),
  });
  const signMut = trpc.experiment.sign.useMutation({
    onSuccess: () => {
      toast.success("实验已签署并锁定");
      setSignOpen(false);
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });
  const unsignMut = trpc.experiment.unsign.useMutation({
    onSuccess: () => {
      toast.success("已撤销签署，实验重新可编辑");
      setUnsignOpen(false);
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.experiment.delete.useMutation({
    onSuccess: () => {
      toast.success("实验已删除");
      navigate("/experiments");
    },
    onError: (e) => toast.error(e.message),
  });
  const addUsageMut = trpc.experiment.addSampleUsage.useMutation({
    onSuccess: () => {
      toast.success("样本消耗已登记，库存已扣减");
      setUsageForm({ sampleId: "", amount: "", note: "" });
      setUsageOpen(false);
      refreshAll();
      utils.sample.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeUsageMut = trpc.experiment.removeSampleUsage.useMutation({
    onSuccess: () => {
      toast.success("消耗记录已移除，库存已回补");
      refreshAll();
      utils.sample.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const refreshAll = () => {
    loadedRef.current = false;
    utils.experiment.byId.invalidate({ id: expId });
    utils.experiment.list.invalidate();
  };

  // 自动保存（防抖 1.2s）
  const scheduleAutoSave = (next: ElnBlock[]) => {
    if (signed || !loadedRef.current) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMut.mutate({ id: expId, content: JSON.stringify(next) });
    }, 1200);
  };

  const handleBlocksChange = (next: ElnBlock[]) => {
    setBlocks(next);
    scheduleAutoSave(next);
  };

  const saveMeta = (patch: { title?: string; objective?: string }) => {
    updateMut.mutate({ id: expId, ...patch });
  };

  if (isLoading || !exp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const st = EXP_STATUS[exp.status];
  const pc = PROJECT_COLORS[exp.project?.color ?? "teal"] ?? PROJECT_COLORS.teal;
  const canUnsign = exp.signedById === user?.id || user?.role === "admin";

  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div>
        <button
          onClick={() => navigate("/experiments")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> 返回实验列表
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-1">
            {exp.code}
          </span>
          <Badge variant="outline" className={st.cls}>
            {exp.status === "signed" && <Lock className="h-3 w-3 mr-1" />}
            {st.label}
          </Badge>
          {exp.project && (
            <Link
              to={`/projects/${exp.project.id}`}
              className={`text-xs px-2 py-1 rounded-md ${pc.soft} hover:opacity-80`}
            >
              {exp.project.name}
            </Link>
          )}
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1.5">
            {saveState === "saving" && (
              <>
                <CloudUpload className="h-3.5 w-3.5 animate-pulse" /> 保存中…
              </>
            )}
            {saveState === "saved" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> 已自动保存
              </>
            )}
          </span>
        </div>
      </div>

      {signed && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            本实验已于 <b>{fmtDateTime(exp.signedAt)}</b> 由 <b>{exp.signedByName}</b> 签署锁定，内容不可修改（符合 GLP 审计要求）。
          </span>
          {canUnsign && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto border-violet-300 text-violet-700 hover:bg-violet-100"
              onClick={() => setUnsignOpen(true)}
            >
              <Unlock className="h-3.5 w-3.5 mr-1" /> 撤销签署
            </Button>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 主编辑区 */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardContent className="p-6">
              {signed ? (
                <h1 className="text-xl font-bold tracking-tight">{exp.title}</h1>
              ) : (
                <input
                  className="w-full text-xl font-bold tracking-tight bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-teal-400 transition-colors pb-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => title.trim() && title !== exp.title && saveMeta({ title: title.trim() })}
                />
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-muted-foreground">
                <span>创建人：{exp.createdByName ?? "—"}</span>
                <span>创建时间：{fmtDateTime(exp.createdAt)}</span>
                <span>最后更新：{fmtDateTime(exp.updatedAt)}</span>
              </div>

              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  实验目标
                </div>
                {signed ? (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {exp.objective || "—"}
                  </p>
                ) : (
                  <textarea
                    className="w-full text-sm text-slate-700 bg-slate-50 rounded-lg p-3 outline-none border border-transparent focus:border-teal-300 resize-none"
                    rows={2}
                    value={objective}
                    placeholder="本实验希望回答的问题或达成的指标…"
                    onChange={(e) => setObjective(e.target.value)}
                    onBlur={() => objective !== (exp.objective ?? "") && saveMeta({ objective })}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base flex items-center gap-2">
                <PenLine className="h-4 w-4 text-teal-600" />
                实验记录
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-4">
              <BlockEditor blocks={blocks} onChange={handleBlocksChange} readOnly={signed} />
            </CardContent>
          </Card>
        </div>

        {/* 右侧栏 */}
        <div className="space-y-5">
          {/* 状态与签署 */}
          {!signed && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">实验状态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  value={exp.status}
                  onValueChange={(v) =>
                    updateMut.mutate({
                      id: expId,
                      status: v as "planning" | "in_progress" | "completed",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">计划中</SelectItem>
                    <SelectItem value="in_progress">进行中</SelectItem>
                    <SelectItem value="completed">已完成</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="w-full bg-violet-600 hover:bg-violet-500"
                  onClick={() => setSignOpen(true)}
                >
                  <Lock className="h-4 w-4 mr-1.5" /> 签署并锁定实验
                </Button>
                <p className="text-xs text-muted-foreground">
                  签署后内容将永久锁定并记录审计日志，仅签署人或管理员可撤销。
                </p>
              </CardContent>
            </Card>
          )}

          {/* 样本消耗 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TestTubes className="h-4 w-4 text-teal-600" />
                样本消耗
                {!signed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-teal-600"
                    onClick={() => setUsageOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> 登记
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {exp.usedSamples.length ? (
                exp.usedSamples.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm group"
                  >
                    <div className="flex-1 min-w-0">
                      <Link to={`/samples/${u.sampleId}`} className="font-medium hover:text-teal-700 truncate block">
                        {u.sampleName ?? "（已删除）"}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {u.sampleSku} · 消耗 {u.amountUsed} {u.sampleUnit}
                        {u.note && ` · ${u.note}`}
                      </div>
                    </div>
                    {!signed && (
                      <button
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 shrink-0"
                        onClick={() => removeUsageMut.mutate({ usageId: u.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-3 text-center">
                  尚未登记样本消耗
                </p>
              )}
            </CardContent>
          </Card>

          {/* 危险操作 */}
          {!signed && (
            <Card className="border-red-100">
              <CardContent className="p-4">
                <Button
                  variant="ghost"
                  className="w-full text-red-600 hover:text-red-600 hover:bg-red-50"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> 删除本实验
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 签署确认 */}
      <AlertDialog open={signOpen} onOpenChange={setSignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>签署并锁定实验？</AlertDialogTitle>
            <AlertDialogDescription>
              签署人：<b>{user?.name}</b> · {fmtDate(new Date())}
              <br />
              签署后实验内容将被锁定，任何修改都会被阻止，并记录到审计日志。此操作符合 GLP/GCP 数据完整性要求。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>再想想</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 hover:bg-violet-500"
              onClick={() => signMut.mutate({ id: expId })}
            >
              确认签署
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 撤销签署 */}
      <AlertDialog open={unsignOpen} onOpenChange={setUnsignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤销签署？</AlertDialogTitle>
            <AlertDialogDescription>
              撤销后实验将回到「进行中」状态并重新可编辑。撤销操作同样会被记录到审计日志。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => unsignMut.mutate({ id: expId })}>
              确认撤销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除实验 {exp.code}？</AlertDialogTitle>
            <AlertDialogDescription>
              实验内容、样本消耗记录将被一并删除，且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id: expId })}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 登记样本消耗 */}
      <AlertDialog open={usageOpen} onOpenChange={setUsageOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>登记样本消耗</AlertDialogTitle>
            <AlertDialogDescription>
              登记后将自动从库存中扣减相应数量，并生成库存流水。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>样本</Label>
              <Select
                value={usageForm.sampleId}
                onValueChange={(v) => setUsageForm({ ...usageForm, sampleId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择样本" />
                </SelectTrigger>
                <SelectContent>
                  {sampleOptions?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.sku} · {s.name}（余 {s.quantity} {s.unit}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>用量</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={usageForm.amount}
                  onChange={(e) => setUsageForm({ ...usageForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>备注（可选）</Label>
                <Input
                  value={usageForm.note}
                  onChange={(e) => setUsageForm({ ...usageForm, note: e.target.value })}
                  placeholder="用途说明"
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-teal-600 hover:bg-teal-500"
              disabled={!usageForm.sampleId || !Number(usageForm.amount)}
              onClick={() =>
                addUsageMut.mutate({
                  experimentId: expId,
                  sampleId: Number(usageForm.sampleId),
                  amountUsed: Number(usageForm.amount),
                  note: usageForm.note || undefined,
                })
              }
            >
              确认登记
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
