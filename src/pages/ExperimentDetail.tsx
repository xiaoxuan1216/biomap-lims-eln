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
  Network,
  AlertTriangle,
  History,
} from "lucide-react";
import BlockEditor from "@/components/eln/BlockEditor";
import { EXP_STATUS, PROJECT_COLORS, fmtDate, fmtDateTime, parseBlocks, type ElnBlock } from "@/lib/labels";
import { setCopilotContext, registerInsertHandler } from "@/lib/copilotContext";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

export default function ExperimentDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const expId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: exp, isLoading } = trpc.experiment.byId.useQuery({ id: expId });
  const { data: history } = trpc.experiment.history.useQuery({ id: expId });
  const { data: sampleOptions } = trpc.sample.options.useQuery();

  const [blocks, setBlocks] = useState<ElnBlock[]>([]);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [signOpen, setSignOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendReason, setAmendReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [usageForm, setUsageForm] = useState({ sampleId: "", amount: "", note: "" });
  const [usageOpen, setUsageOpen] = useState(false);

  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signed = exp?.status === "signed";
  const canEdit = user?.role === "user" || user?.role === "reviewer" || user?.role === "admin";
  const canSign = user?.role === "reviewer" || user?.role === "admin";
  const canDelete = user?.role === "admin";

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
      toast.error(t("自动保存失败：{msg}", { msg: e.message }));
    },
  });
  const updateMut = trpc.experiment.update.useMutation({
    onSuccess: () => utils.experiment.byId.invalidate({ id: expId }),
    onError: (e) => toast.error(e.message),
  });
  const signMut = trpc.experiment.sign.useMutation({
    onSuccess: () => {
      toast.success(t("实验已签署并锁定"));
      setSignOpen(false);
      refreshAll();
    },
    onError: (e) => toast.error(e.message),
  });
  const amendmentMut = trpc.experiment.createAmendment.useMutation({
    onSuccess: ({ id: amendmentId }) => {
      toast.success(t("已创建追加修订记录"));
      setAmendOpen(false);
      setAmendReason("");
      navigate(`/experiments/${amendmentId}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.experiment.delete.useMutation({
    onSuccess: () => {
      toast.success(t("实验已删除"));
      navigate("/experiments");
    },
    onError: (e) => toast.error(e.message),
  });
  const addUsageMut = trpc.experiment.addSampleUsage.useMutation({
    onSuccess: () => {
      toast.success(t("样本消耗已登记，库存已扣减"));
      setUsageForm({ sampleId: "", amount: "", note: "" });
      setUsageOpen(false);
      refreshAll();
      utils.sample.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeUsageMut = trpc.experiment.removeSampleUsage.useMutation({
    onSuccess: () => {
      toast.success(t("消耗记录已移除，库存已回补"));
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
    if (signed || !canEdit || !loadedRef.current) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMut.mutate({ id: expId, content: JSON.stringify(next) });
    }, 1200);
  };

  // Copilot 上下文注册（AI 方案可直接插入本实验）
  useEffect(() => {
    if (exp) {
      setCopilotContext({
        entityType: "experiment",
        entityId: exp.id,
        entityName: exp.code,
      });
      registerInsertHandler((newBlocks) => {
        setBlocks((prev) => {
          const next = [...prev, ...newBlocks];
          scheduleAutoSave(next);
          return next;
        });
      });
    }
    return () => {
      setCopilotContext({});
      registerInsertHandler(null);
    };
    // scheduleAutoSave intentionally follows the active experiment and signature state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exp?.id, signed]);

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
  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div>
        <button
          onClick={() => navigate("/experiments")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> {t("返回实验列表")}
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
          {exp.sourceWorkflow && (
            <Link
              to={`/workflows/${exp.sourceWorkflow.id}`}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700"
              title={t("打开来源业务流")}
            >
              <Network className="h-3 w-3" />
              {exp.sourceWorkflow.name}
              {exp.sourceNodeLabel ? ` / ${t("节点")}「${exp.sourceNodeLabel}」` : ""}
            </Link>
          )}
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1.5">
            {saveState === "saving" && (
              <>
                <CloudUpload className="h-3.5 w-3.5 animate-pulse" /> {t("保存中…")}
              </>
            )}
            {saveState === "saved" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {t("已自动保存")}
              </>
            )}
          </span>
        </div>
      </div>

      {signed && (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          exp.integrity.valid
            ? "border-violet-200 bg-violet-50 text-violet-800"
            : "border-red-300 bg-red-50 text-red-800"
        }`}>
          {exp.integrity.valid
            ? <Lock className="h-4 w-4 shrink-0" />
            : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            {exp.integrity.valid && exp.integrity.signature?.meaning === "legacy_import"
              ? t("这是从旧版导入的签名记录；升级时建立的内容哈希校验通过，但未重新执行复核签署。")
              : exp.integrity.valid
                ? t("本实验已于 {time} 由 {name} 复核签署；版本和签名哈希校验通过。", { time: fmtDateTime(exp.signedAt), name: exp.signedByName ?? "" })
              : t("签名完整性校验失败：{reason}", { reason: exp.integrity.reason ?? t("未知原因") })}
          </span>
          {canEdit && !exp.amendment && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto border-violet-300 text-violet-700 hover:bg-violet-100"
              onClick={() => setAmendOpen(true)}
            >
              <PenLine className="h-3.5 w-3.5 mr-1" /> {t("创建追加修订")}
            </Button>
          )}
        </div>
      )}

      {exp.amendment && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {t("该签署记录已有后续修订")}：
          <Link className="font-medium underline ml-1" to={`/experiments/${exp.amendment.id}`}>
            {exp.amendment.code} · {exp.amendment.title}
          </Link>
        </div>
      )}

      {exp.original && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {t("本记录修订自")}：
          <Link className="font-medium underline ml-1" to={`/experiments/${exp.original.id}`}>
            {exp.original.code} · {exp.original.title}
          </Link>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* 主编辑区 */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardContent className="p-6">
              {signed || !canEdit ? (
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
                <span>{t("创建人")}：{exp.createdByName ?? "—"}</span>
                <span>{t("创建时间")}：{fmtDateTime(exp.createdAt)}</span>
                <span>{t("最后更新")}：{fmtDateTime(exp.updatedAt)}</span>
              </div>

              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  {t("实验目标")}
                </div>
                {signed || !canEdit ? (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {exp.objective || "—"}
                  </p>
                ) : (
                  <textarea
                    className="w-full text-sm text-slate-700 bg-slate-50 rounded-lg p-3 outline-none border border-transparent focus:border-teal-300 resize-none"
                    rows={2}
                    value={objective}
                    placeholder={t("本实验希望回答的问题或达成的指标…")}
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
                {t("实验记录")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-4">
              <BlockEditor blocks={blocks} onChange={handleBlocksChange} readOnly={signed || !canEdit} />
            </CardContent>
          </Card>
        </div>

        {/* 右侧栏 */}
        <div className="space-y-5">
          {/* 状态与签署 */}
          {!signed && canEdit && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("实验状态")}</CardTitle>
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
                    <SelectItem value="planning">{t("计划中")}</SelectItem>
                    <SelectItem value="in_progress">{t("进行中")}</SelectItem>
                    <SelectItem value="completed">{t("已完成")}</SelectItem>
                  </SelectContent>
                </Select>
                {canSign && exp.status === "completed" && (
                  <Button
                    className="w-full bg-violet-600 hover:bg-violet-500"
                    onClick={() => setSignOpen(true)}
                  >
                    <Lock className="h-4 w-4 mr-1.5" /> {t("复核并签署实验")}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  {canSign
                    ? t("实验完成后可复核签署。签署不可撤销；后续更正必须创建追加修订。")
                    : t("实验完成后需由复核人或管理员签署。")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* 样本消耗 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TestTubes className="h-4 w-4 text-teal-600" />
                {t("样本消耗")}
                {!signed && canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-teal-600"
                    onClick={() => setUsageOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> {t("登记")}
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
                        {u.sampleName ?? t("（已删除）")}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {u.sampleSku} · {t("消耗")} {u.amountUsed} {u.sampleUnit}
                        {u.note && ` · ${u.note}`}
                      </div>
                    </div>
                    {!signed && canEdit && (
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
                  {t("尚未登记样本消耗")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                {t("版本与签名")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div>{t("当前版本")}：v{exp.revision}</div>
              <div>{t("版本总数")}：{history?.revisions.length ?? exp.revision}</div>
              {exp.contentHash && (
                <div className="font-mono break-all" title={exp.contentHash}>
                  SHA-256: {exp.contentHash.slice(0, 16)}…
                </div>
              )}
              {history?.revisions.slice(0, 3).map((revision) => (
                <div key={revision.id} className="border-t pt-2">
                  v{revision.revision} · {revision.changeReason} · {revision.createdByName ?? t("系统")}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 危险操作 */}
          {!signed && canDelete && (
            <Card className="border-red-100">
              <CardContent className="p-4">
                <Button
                  variant="ghost"
                  className="w-full text-red-600 hover:text-red-600 hover:bg-red-50"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> {t("删除本实验")}
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
            <AlertDialogTitle>{t("复核并签署实验？")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("签署人")}：<b>{user?.name}</b> · {fmtDate(new Date())}
              <br />
              {t("我确认已复核当前版本的内容、样本消耗与关联信息。签署会保存 SHA-256 快照并永久锁定；更正只能通过追加修订完成。")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("再想想")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 hover:bg-violet-500"
              onClick={() => signMut.mutate({
                id: expId,
                meaning: "reviewed_and_approved",
                confirmation: true,
              })}
            >
              {t("确认签署")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 对已签署记录创建追加修订 */}
      <AlertDialog open={amendOpen} onOpenChange={setAmendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("创建追加修订？")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("原签署记录会保持不变。系统将复制其内容为一条新记录，并保存与原记录的修订关系。")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t("修订原因")}</Label>
            <Input
              value={amendReason}
              onChange={(event) => setAmendReason(event.target.value)}
              placeholder={t("请说明需要更正或补充的内容（至少 10 个字符）")}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={amendReason.trim().length < 10 || amendmentMut.isPending}
              onClick={() => amendmentMut.mutate({ id: expId, reason: amendReason.trim() })}
            >
              {t("创建修订记录")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除实验 {code}？", { code: exp.code })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("实验内容、样本消耗记录将被一并删除，且不可恢复。")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id: expId })}
            >
              {t("确认删除")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 登记样本消耗 */}
      <AlertDialog open={usageOpen} onOpenChange={setUsageOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("登记样本消耗")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("登记后将自动从库存中扣减相应数量，并生成库存流水。")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("样本")}</Label>
              <Select
                value={usageForm.sampleId}
                onValueChange={(v) => setUsageForm({ ...usageForm, sampleId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("选择样本")} />
                </SelectTrigger>
                <SelectContent>
                  {sampleOptions?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.sku} · {s.name}（{t("余")} {s.quantity} {s.unit}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("用量")}</Label>
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
                <Label>{t("备注（可选）")}</Label>
                <Input
                  value={usageForm.note}
                  onChange={(e) => setUsageForm({ ...usageForm, note: e.target.value })}
                  placeholder={t("用途说明")}
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-teal-600 hover:bg-teal-500"
              disabled={!usageForm.sampleId || !Number(usageForm.amount)}
              onClick={() =>
                addUsageMut.mutate({
                  experimentId: expId,
                  sampleId: Number(usageForm.sampleId),
                  amountUsed: Number(usageForm.amount),
                  note: usageForm.note || undefined,
                  idempotencyKey: crypto.randomUUID(),
                })
              }
            >
              {t("确认登记")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
