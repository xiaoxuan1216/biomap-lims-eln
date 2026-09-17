import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Braces,
  CheckCircle2,
  CircuitBoard,
  CloudCog,
  Code2,
  FileJson2,
  FlaskConical,
  Loader2,
  Microscope,
  Network,
  PackageCheck,
  Power,
  Save,
  ServerCog,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import type { AppRouter } from "../../api/router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DriverRelease = RouterOutputs["driver"]["releases"][number];

const MATURITY_LABELS = {
  simulation: "仅模拟验证",
  "bench-pending": "待真机验证",
  verified: "真机已验证",
} as const;

const MATURITY_STYLES = {
  simulation: "border-sky-200 bg-sky-50 text-sky-700",
  "bench-pending": "border-amber-200 bg-amber-50 text-amber-700",
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700",
} as const;

const RELEASE_LABELS = {
  draft: "草稿",
  published: "已发布",
  retired: "已停用",
} as const;

const RELEASE_STYLES = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  published: "border-teal-200 bg-teal-50 text-teal-700",
  retired: "border-rose-200 bg-rose-50 text-rose-700",
} as const;

const RUNTIME_LABELS = {
  "windows-com-x86": "Windows COM x86",
  "serial-ascii": "Serial ASCII",
  "tcp-serial-ascii": "TCP / Serial ASCII",
  "custom-edge": "Custom Edge",
} as const;

const ARCHITECTURE_STEPS = [
  {
    title: "Manifest 驱动清单",
    description: "统一声明连接参数、设备动作、风险和重试边界",
    icon: FileJson2,
    className: "border-sky-200 bg-sky-50/70 text-sky-700",
  },
  {
    title: "Edge Agent",
    description: "在设备侧加载厂家 SDK，并隔离密钥与本地依赖",
    icon: ServerCog,
    className: "border-violet-200 bg-violet-50/70 text-violet-700",
  },
  {
    title: "物理设备",
    description: "执行受控命令，回传状态、事件和原始结果",
    icon: Microscope,
    className: "border-amber-200 bg-amber-50/70 text-amber-700",
  },
  {
    title: "BioFlow",
    description: "把已发布动作转成可拖拽节点和动态参数表单",
    icon: Workflow,
    className: "border-teal-200 bg-teal-50/70 text-teal-700",
  },
] as const;

function manifestJson(release: DriverRelease): string {
  const manifest: Record<string, unknown> = { ...release };
  for (const key of [
    "releaseId",
    "releaseStatus",
    "sourceKind",
    "checksum",
    "createdAt",
    "publishedAt",
  ]) {
    delete manifest[key];
  }
  return JSON.stringify(manifest, null, 2);
}

export default function DriverCenter() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";

  const releasesQuery = trpc.driver.releases.useQuery();
  const catalogQuery = trpc.driver.catalog.useQuery();
  const bindingsQuery = trpc.driver.bindings.useQuery();
  const templateQuery = trpc.driver.customTemplate.useQuery();

  const [editorOpen, setEditorOpen] = useState(false);
  const [manifestValue, setManifestValue] = useState("");
  const [retireTarget, setRetireTarget] = useState<DriverRelease | null>(null);

  const validateMut = trpc.driver.validateManifest.useMutation({
    onSuccess: () => toast.success(t("Manifest 校验通过")),
    onError: (error) => toast.error(error.message),
  });
  const saveMut = trpc.driver.saveDraft.useMutation({
    onSuccess: async () => {
      toast.success(t("驱动草稿已保存"));
      setEditorOpen(false);
      setManifestValue("");
      validateMut.reset();
      await utils.driver.releases.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const publishMut = trpc.driver.publish.useMutation({
    onSuccess: async () => {
      toast.success(t("驱动版本已发布，动作已进入能力目录"));
      await Promise.all([
        utils.driver.releases.invalidate(),
        utils.driver.catalog.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const retireMut = trpc.driver.retire.useMutation({
    onSuccess: async () => {
      toast.success(t("驱动版本已停用"));
      setRetireTarget(null);
      await Promise.all([
        utils.driver.releases.invalidate(),
        utils.driver.catalog.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const releases = releasesQuery.data ?? [];
  const catalog = catalogQuery.data ?? [];
  const bindings = bindingsQuery.data ?? [];
  const loading =
    releasesQuery.isLoading || catalogQuery.isLoading || bindingsQuery.isLoading;
  const queryError =
    releasesQuery.error ?? catalogQuery.error ?? bindingsQuery.error ?? templateQuery.error;

  const stats = [
    {
      label: t("可用驱动"),
      value: catalog.length,
      icon: PackageCheck,
      className: "text-teal-600 bg-teal-50",
    },
    {
      label: t("用户驱动版本"),
      value: releases.filter((release) => release.sourceKind !== "builtin").length,
      icon: Code2,
      className: "text-violet-600 bg-violet-50",
    },
    {
      label: t("BioFlow 动作"),
      value: catalog.reduce(
        (sum, release) =>
          sum + release.actions.filter((action) => action.exposeAsNode).length,
        0,
      ),
      icon: Workflow,
      className: "text-sky-600 bg-sky-50",
    },
    {
      label: t("已绑定设备"),
      value: bindings.filter((binding) => binding.enabled).length,
      icon: Network,
      className: "text-amber-600 bg-amber-50",
    },
  ];

  const openTemplate = () => {
    setManifestValue(templateQuery.data ?? "{}");
    validateMut.reset();
    setEditorOpen(true);
  };

  const openReleaseCopy = (release: DriverRelease) => {
    setManifestValue(manifestJson(release));
    validateMut.reset();
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-2 text-muted-foreground"
            onClick={() => navigate("/equipment")}
          >
            <ArrowLeft />
            {t("返回设备管理")}
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <CircuitBoard className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t("驱动中心")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("统一管理设备驱动、版本、能力节点与 Edge 运行边界")}
              </p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <Button
            className="bg-teal-600 hover:bg-teal-500"
            onClick={openTemplate}
            disabled={templateQuery.isLoading}
          >
            {templateQuery.isLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Braces />
            )}
            {t("新建用户驱动")}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden border-slate-200 bg-gradient-to-br from-slate-50 to-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CloudCog className="size-4 text-teal-600" />
            {t("统一驱动执行链")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
            {ARCHITECTURE_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="contents">
                  <div className={`rounded-xl border p-4 ${step.className}`}>
                    <Icon className="mb-3 size-5" />
                    <div className="text-sm font-semibold text-foreground">
                      {t(step.title)}
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                      {t(step.description)}
                    </p>
                  </div>
                  {index < ARCHITECTURE_STEPS.length - 1 && (
                    <div className="flex items-center justify-center text-slate-300">
                      <ArrowDown className="size-4 md:hidden" />
                      <ArrowRight className="hidden size-4 md:block" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`flex size-10 items-center justify-center rounded-xl ${stat.className}`}>
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="text-xl font-bold leading-none">{stat.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {queryError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("驱动目录加载失败")}</AlertTitle>
          <AlertDescription>{queryError.message}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("驱动目录")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("内置驱动可直接配置；用户驱动需先通过 Manifest 校验并发布。")}
            </p>
          </div>
          {!isAdmin && (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              <ShieldCheck />
              {t("仅管理员可管理驱动版本")}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Card key={item}>
                <CardContent className="space-y-4 p-5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : releases.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {releases.map((release) => {
              const bound = bindings.filter(
                (binding) =>
                  binding.driverKey === release.driverKey &&
                  binding.driverVersion === release.version,
              );
              const bioFlowReady = bound.filter(
                (binding) =>
                  binding.enabled &&
                  (binding.status === "ready" || binding.status === "simulation_ready"),
              ).length;
              const exposedActions = release.actions.filter(
                (action) => action.exposeAsNode,
              ).length;
              const displayName =
                lang === "en" && release.nameEn ? release.nameEn : release.name;
              const description =
                lang === "en" && release.descriptionEn
                  ? release.descriptionEn
                  : release.description;
              const isBuiltin = release.sourceKind === "builtin";

              return (
                <Card
                  key={`${release.driverKey}:${release.version}:${release.releaseId ?? "builtin"}`}
                  className={`flex flex-col transition-shadow hover:shadow-md ${
                    release.releaseStatus === "retired" ? "opacity-70" : ""
                  }`}
                >
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={
                              isBuiltin
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-violet-200 bg-violet-50 text-violet-700"
                            }
                          >
                            {isBuiltin ? <Boxes /> : <Code2 />}
                            {isBuiltin ? t("内置驱动") : t("用户驱动")}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={RELEASE_STYLES[release.releaseStatus]}
                          >
                            {t(RELEASE_LABELS[release.releaseStatus])}
                          </Badge>
                        </div>
                        <CardTitle className="truncate text-base" title={displayName}>
                          {displayName}
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {release.vendor} · v{release.version}
                        </p>
                      </div>
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <FlaskConical className="size-5" />
                      </div>
                    </div>
                    <p className="min-h-10 text-sm leading-5 text-muted-foreground">
                      {description}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border bg-slate-50/70 p-2.5">
                        <div className="text-muted-foreground">{t("成熟度")}</div>
                        <Badge
                          variant="outline"
                          className={`mt-1 ${MATURITY_STYLES[release.maturity]}`}
                        >
                          {t(MATURITY_LABELS[release.maturity])}
                        </Badge>
                      </div>
                      <div className="rounded-lg border bg-slate-50/70 p-2.5">
                        <div className="text-muted-foreground">{t("运行时")}</div>
                        <div className="mt-1 font-medium text-foreground">
                          {RUNTIME_LABELS[release.runtime.kind]}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-slate-50/70 p-2.5">
                        <div className="text-muted-foreground">{t("设备动作")}</div>
                        <div className="mt-1 font-medium text-foreground">
                          {t("{actions} 个动作 · {nodes} 个节点", {
                            actions: release.actions.length,
                            nodes: exposedActions,
                          })}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-slate-50/70 p-2.5">
                        <div className="text-muted-foreground">{t("可绑定设备数")}</div>
                        <div className="mt-1 font-medium text-foreground">
                          {t("{ready} 台可用 · {bound} 台已绑定", {
                            ready: bioFlowReady,
                            bound: bound.length,
                          })}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`rounded-lg border p-3 ${
                        release.documentation.gaps.length
                          ? "border-amber-200 bg-amber-50/60"
                          : "border-emerald-200 bg-emerald-50/60"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-medium">
                        {release.documentation.gaps.length ? (
                          <AlertTriangle className="size-3.5 text-amber-600" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        )}
                        {release.documentation.gaps.length
                          ? t("{n} 项文档缺口", {
                              n: release.documentation.gaps.length,
                            })
                          : t("文档完整")}
                        <span className="ml-auto text-muted-foreground">
                          {release.documentation.pages || "—"}
                        </span>
                      </div>
                      {release.documentation.gaps.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs leading-4 text-muted-foreground">
                          {release.documentation.gaps.slice(0, 2).map((gap) => (
                            <li key={gap} className="line-clamp-1">
                              · {t(gap)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {isAdmin && (
                      <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReleaseCopy(release)}
                        >
                          <Braces />
                          {t("复制为新版本")}
                        </Button>
                        {!isBuiltin &&
                          release.releaseStatus === "draft" &&
                          release.releaseId !== null && (
                            <Button
                              size="sm"
                              className="bg-teal-600 hover:bg-teal-500"
                              disabled={publishMut.isPending}
                              onClick={() => publishMut.mutate({ id: release.releaseId! })}
                            >
                              {publishMut.isPending &&
                              publishMut.variables?.id === release.releaseId ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Power />
                              )}
                              {t("发布")}
                            </Button>
                          )}
                        {!isBuiltin &&
                          release.releaseStatus === "published" &&
                          release.releaseId !== null && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              onClick={() => setRetireTarget(release)}
                            >
                              <Power />
                              {t("停用版本")}
                            </Button>
                          )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <CircuitBoard className="size-10 opacity-40" />
              <p>{t("暂无驱动版本")}</p>
            </CardContent>
          </Card>
        )}
      </section>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <Braces className="size-5 text-teal-600" />
              {t("JSON Manifest 编辑器")}
            </DialogTitle>
            <DialogDescription>
              {t("请修改 driverKey 和 version 创建新的不可变驱动版本。发布后不能原地覆盖。")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-0 lg:grid-cols-[1fr_260px]">
            <div className="min-w-0 p-5">
              <Textarea
                value={manifestValue}
                onChange={(event) => {
                  setManifestValue(event.target.value);
                  validateMut.reset();
                }}
                spellCheck={false}
                aria-label={t("JSON Manifest 内容")}
                className="h-[56vh] resize-none whitespace-pre font-mono text-xs leading-5"
              />
            </div>
            <div className="border-t bg-slate-50/70 lg:border-l lg:border-t-0">
              <ScrollArea className="h-[56vh]">
                <div className="space-y-4 p-5">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck className="size-4 text-teal-600" />
                      {t("发布前检查")}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t("系统会校验 API 版本、SemVer、动作 key、参数字段和健康检查动作。")}
                    </p>
                  </div>

                  {validateMut.data ? (
                    <Alert className="border-emerald-200 bg-emerald-50">
                      <CheckCircle2 className="text-emerald-600" />
                      <AlertTitle>{t("校验通过")}</AlertTitle>
                      <AlertDescription className="space-y-1 text-xs">
                        <p>{validateMut.data.driverKey}</p>
                        <p>v{validateMut.data.version}</p>
                        <p>
                          {t("{actions} 个动作 · {nodes} 个 BioFlow 节点", {
                            actions: validateMut.data.actionCount,
                            nodes: validateMut.data.nodeActionCount,
                          })}
                        </p>
                        <p className="break-all font-mono text-[10px]">
                          SHA-256 {validateMut.data.checksum}
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : validateMut.error ? (
                    <Alert variant="destructive">
                      <AlertTriangle />
                      <AlertTitle>{t("校验未通过")}</AlertTitle>
                      <AlertDescription className="break-words text-xs">
                        {validateMut.error.message}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-xs leading-5 text-muted-foreground">
                      {t("校验成功后会显示动作数、BioFlow 节点数和 Manifest 校验和。")}
                    </div>
                  )}

                  <div className="rounded-lg border bg-white p-3 text-xs leading-5 text-muted-foreground">
                    <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                      <AlertTriangle className="size-3.5 text-amber-600" />
                      {t("真机边界")}
                    </div>
                    {t("通过 Manifest 校验不代表已通过真机验证；发布前仍需确认厂家 SDK、设备型号和安全联锁。")}
                  </div>
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              {t("取消")}
            </Button>
            <Button
              variant="outline"
              disabled={!manifestValue.trim() || validateMut.isPending || saveMut.isPending}
              onClick={() => validateMut.mutate({ manifestJson: manifestValue })}
            >
              {validateMut.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ShieldCheck />
              )}
              {t("校验 Manifest")}
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-500"
              disabled={!manifestValue.trim() || saveMut.isPending || validateMut.isPending}
              onClick={() =>
                saveMut.mutate({ manifestJson: manifestValue, sourceKind: "custom" })
              }
            >
              {saveMut.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t("保存草稿")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={retireTarget !== null}
        onOpenChange={(open) => !open && setRetireTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("停用这个驱动版本？")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("停用后，该版本将不再出现在可用驱动与 BioFlow 能力目录中。历史记录仍会保留。")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <div className="font-medium">
              {retireTarget &&
                (lang === "en" && retireTarget.nameEn
                  ? retireTarget.nameEn
                  : retireTarget.name)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {retireTarget?.driverKey} · v{retireTarget?.version}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-500"
              disabled={retireMut.isPending}
              onClick={() => {
                if (retireTarget?.releaseId !== null && retireTarget?.releaseId !== undefined) {
                  retireMut.mutate({ id: retireTarget.releaseId });
                }
              }}
            >
              {retireMut.isPending && <Loader2 className="animate-spin" />}
              {t("确认停用")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
