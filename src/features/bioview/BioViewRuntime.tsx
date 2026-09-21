import { Component, useMemo, type ComponentType, type ReactNode } from "react";
import {
  Boxes,
  CircleAlert,
  Eye,
  FileLock2,
  Info,
  LayoutDashboard,
  MonitorCog,
  Network,
} from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import RunDataFlow, {
  type RunDataFlowData,
  type RunDataFlowRun,
} from "@/components/lab-run/RunDataFlow";
import CloningPlateFlowViewer from "@/features/cloning-planner/CloningPlateFlowViewer";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { FrozenSamplePlate } from "@contracts/samplePlateLayout";
import {
  BioViewGenericOverview,
  BioViewMaterialTable,
  BioViewOperationTimeline,
  BioViewParameterSummary,
  BioViewSampleLineage,
  BioViewSampleTable,
} from "./GenericBioView";
import {
  BIOVIEW_RENDERER_REFS,
  controlledRendererRefs,
  normalizeBioView,
  type BioViewInput,
  type BioViewRendererRef,
  type NormalizedBioView,
} from "./model";
import { SamplePlateBioView } from "./SamplePlateBioView";

interface RegisteredRendererProps {
  view: NormalizedBioView;
  title?: string | null;
  runContext?: RunDataFlowRun | null;
  dataFlow?: RunDataFlowData | null;
  samplePlatePlans?: readonly FrozenSamplePlate[] | null;
}

interface BioViewRendererRegistration {
  label: string;
  component: ComponentType<RegisteredRendererProps>;
}

class BioViewRendererBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function safeExportName(sourceTemplate: string | null) {
  return (
    (sourceTemplate ?? "bioview-run")
      .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bioview-run"
  );
}

function CloningPlateFlowRenderer({ view }: RegisteredRendererProps) {
  const { t } = useI18n();
  if (!view.cloningPlan) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/40 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-teal-900">
          <LayoutDashboard className="h-4 w-4" />
          <span>{t("分子克隆孔板联动")}</span>
        </div>
        <Badge variant="outline" className="border-teal-200 bg-white text-[10px] text-teal-800">
          {t("与本次运行联动")}
        </Badge>
      </div>
      <CloningPlateFlowViewer
        plan={view.cloningPlan}
        exportBaseName={safeExportName(view.sourceTemplate)}
        targetBindings={view.targetBindings}
        jsonExportValue={{
          bioView: {
            kind: view.kind,
            schemaVersion: view.schemaVersion,
            sourceTemplate: view.sourceTemplate,
            domainPack: view.domainPack,
            snapshotHash: view.snapshotHash,
          },
          cloningLayoutPlan: view.cloningPlan,
        }}
      />
    </div>
  );
}

function SamplePlateLayoutRenderer({
  samplePlatePlans,
}: RegisteredRendererProps) {
  if (!samplePlatePlans?.length) return null;
  return <SamplePlateBioView samplePlatePlans={samplePlatePlans} />;
}

function RunDataFlowRenderer({
  runContext,
  dataFlow,
}: RegisteredRendererProps) {
  const resolvedDataFlow = dataFlow ?? runContext?.dataFlow;
  if (!runContext || !resolvedDataFlow) return null;
  return <RunDataFlow run={runContext} dataFlow={resolvedDataFlow} />;
}

/** Static, reviewed registry. Renderer references never become module paths or executable input. */
export const BIOVIEW_RENDERER_REGISTRY: Readonly<
  Record<BioViewRendererRef, BioViewRendererRegistration>
> = {
  "generic-overview@1": {
    label: "通用实验总览",
    component: BioViewGenericOverview,
  },
  "cloning-plate-flow@1": {
    label: "分子克隆孔板流",
    component: CloningPlateFlowRenderer,
  },
  "sample-plate-layout@1": {
    label: "通用孔板与样本布局",
    component: SamplePlateLayoutRenderer,
  },
  "run-data-flow@1": {
    label: "LIMS 数据与证据链",
    component: RunDataFlowRenderer,
  },
  "sample-lineage@1": {
    label: "样本与流程谱系",
    component: BioViewSampleLineage,
  },
  "operation-timeline@1": {
    label: "节点时间线",
    component: BioViewOperationTimeline,
  },
  "sample-table@1": { label: "样本与对照", component: BioViewSampleTable },
  "material-table@1": { label: "试剂与物料", component: BioViewMaterialTable },
  "parameter-summary@1": {
    label: "运行参数摘要",
    component: BioViewParameterSummary,
  },
};

export interface BioViewRuntimeProps extends BioViewInput {
  className?: string;
  showHeader?: boolean;
  showTechnicalDetails?: boolean;
  /** Live LIMS projection shown as a read-only overlay on the frozen BioView layout. */
  runContext?: RunDataFlowRun | null;
  dataFlow?: RunDataFlowData | null;
  /** Immutable plate snapshots frozen into this RunPlan. */
  samplePlatePlans?: readonly FrozenSamplePlate[] | null;
}

function resolvedRendererRefs(
  view: NormalizedBioView,
  {
    hasRunDataFlow,
    hasSamplePlatePlans,
  }: { hasRunDataFlow: boolean; hasSamplePlatePlans: boolean }
) {
  let refs = controlledRendererRefs(view);
  const cloningUnavailable =
    refs.includes("cloning-plate-flow@1") && !view.cloningPlan;
  refs = refs.filter(
    ref =>
      (ref !== "cloning-plate-flow@1" || !!view.cloningPlan) &&
      (ref !== "sample-plate-layout@1" || hasSamplePlatePlans) &&
      (ref !== "run-data-flow@1" || hasRunDataFlow)
  );

  if (refs.length === 0) {
    refs = view.cloningPlan
      ? ["cloning-plate-flow@1", "generic-overview@1"]
      : ["generic-overview@1"];
  } else if (cloningUnavailable && !refs.includes("generic-overview@1")) {
    refs.unshift("generic-overview@1");
  }

  // These are governed projections of authoritative Run data. They are attached at runtime so
  // older frozen layout manifests gain current LIMS evidence without mutating their snapshot.
  if (hasSamplePlatePlans && !refs.includes("sample-plate-layout@1")) {
    refs.unshift("sample-plate-layout@1");
  }
  if (hasRunDataFlow && !refs.includes("run-data-flow@1")) {
    refs.push("run-data-flow@1");
  }

  // The generic overview already contains these three summaries. Suppressing duplicates keeps
  // a user-authored manifest readable while lineage/timeline remain additive views.
  if (refs.includes("generic-overview@1")) {
    refs = refs.filter(
      ref =>
        !["sample-table@1", "material-table@1", "parameter-summary@1"].includes(
          ref
        )
    );
  }
  return { refs, cloningUnavailable };
}

export function BioViewRuntime({
  manifest,
  method,
  nodes,
  edges,
  samples,
  materials,
  parameters,
  cloningPlan,
  targetBindings,
  mode,
  runContext,
  dataFlow,
  samplePlatePlans,
  className,
  showHeader = true,
  showTechnicalDetails = false,
}: BioViewRuntimeProps) {
  const { t } = useI18n();
  const view = useMemo(
    () =>
      normalizeBioView({
        manifest,
        method,
        nodes,
        edges,
        samples,
        materials,
        parameters,
        cloningPlan,
        targetBindings,
        mode,
      }),
    [
      manifest,
      method,
      nodes,
      edges,
      samples,
      materials,
      parameters,
      cloningPlan,
      targetBindings,
      mode,
    ]
  );
  const hasRunDataFlow = !!runContext && !!(dataFlow ?? runContext.dataFlow);
  const hasSamplePlatePlans = (samplePlatePlans?.length ?? 0) > 0;
  const resolved = useMemo(
    () => resolvedRendererRefs(view, { hasRunDataFlow, hasSamplePlatePlans }),
    [view, hasRunDataFlow, hasSamplePlatePlans]
  );
  const definitions = new Map(
    view.views.map(definition => [definition.rendererRef, definition])
  );
  const linkedEquipmentCount = view.nodes.filter(
    node => !!node.equipmentId
  ).length;
  const linkedResourceCount = view.samples.length + view.materials.length;

  return (
    <section
      className={cn("space-y-4", className)}
      data-bioview-mode={view.mode}
    >
      {showHeader && (
        <header className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Eye className="h-5 w-5 text-teal-600" />
                <h2 className="text-lg font-semibold">
                  {t("实验视图")}
                </h2>
                <Badge variant={view.mode === "run" ? "default" : "secondary"}>
                  {view.mode === "run" ? (
                    <FileLock2 className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  {t(
                    view.mode === "run"
                      ? view.manifestState === "missing"
                        ? "历史 Run 兼容视图"
                        : "Run 冻结视图"
                      : view.mode === "draft"
                        ? "本次实验计划预览"
                        : "模板实时预览"
                  )}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {showTechnicalDetails
                  ? view.sourceTemplate
                  : t("实验步骤与样本布局")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {view.workflowId && (
                  <Link
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-slate-600 hover:border-teal-300 hover:text-teal-700"
                    to={`/workflows/${view.workflowId}${view.methodReleaseId ? `?releaseId=${view.methodReleaseId}` : ""}`}
                  >
                    <Network className="h-3.5 w-3.5" />
                    {t("来源方法")}
                    {view.methodReleaseVersion
                      ? ` V${view.methodReleaseVersion}`
                      : ""}
                  </Link>
                )}
                {linkedResourceCount > 0 && (
                  <Link
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-slate-600 hover:border-teal-300 hover:text-teal-700"
                    to="/samples"
                  >
                    <Boxes className="h-3.5 w-3.5" />
                    {t("{n} 个 LIMS 资源对象", { n: linkedResourceCount })}
                  </Link>
                )}
                {linkedEquipmentCount > 0 && (
                  <Link
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-slate-600 hover:border-teal-300 hover:text-teal-700"
                    to="/equipment"
                  >
                    <MonitorCog className="h-3.5 w-3.5" />
                    {t("{n} 个设备节点", { n: linkedEquipmentCount })}
                  </Link>
                )}
              </div>
              {showTechnicalDetails && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {resolved.refs.map(ref => (
                    <Badge
                      key={ref}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      {ref}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {showTechnicalDetails && (
              <div className="w-full shrink-0 rounded-xl border bg-muted/20 p-3 lg:w-72">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {t("可视化就绪度")}
                  </span>
                  <strong>
                    {view.readiness.score == null
                      ? t("自动降级")
                      : `${Math.round(view.readiness.score)}%`}
                  </strong>
                </div>
                <Progress className="mt-2" value={view.readiness.score ?? 35} />
                <p
                  className="mt-2 truncate text-[10px] text-muted-foreground"
                  title={view.snapshotHash ?? undefined}
                >
                  {view.mode === "run"
                    ? (view.snapshotHash ?? t("Run 快照内未记录视图摘要"))
                    : (view.readiness.label ??
                      t("使用当前 BioFlow 数据生成预览"))}
                </p>
              </div>
            )}
          </div>
        </header>
      )}

      {view.manifestState === "invalid" && (
        <Alert className="border-amber-200 bg-amber-50/60 text-amber-950">
          <CircleAlert />
          <AlertTitle>{t("实验视图配置不可解析")}</AlertTitle>
          <AlertDescription>
            {t(
              "已忽略损坏配置并切换到通用视图；流程、样本、物料和参数仍可查看。"
            )}
          </AlertDescription>
        </Alert>
      )}

      {view.mode === "run" && view.manifestState === "missing" && (
        <Alert className="border-amber-200 bg-amber-50/60 text-amber-950">
          <Info />
          <AlertTitle>{t("历史 Run 未冻结实验视图")}</AlertTitle>
          <AlertDescription>
            {t(
              "当前仅将该 Run 的冻结流程、资源与权威 LIMS 证据投影为兼容视图；不会读取当前模板补写历史快照。"
            )}
          </AlertDescription>
        </Alert>
      )}

      {showTechnicalDetails &&
        view.mode !== "run" &&
        view.manifestState === "missing" && (
          <Alert className="border-blue-100 bg-blue-50/50">
            <Info />
            <AlertTitle>{t("正在使用 BioFlow 实时预览")}</AlertTitle>
            <AlertDescription>
              {t(
                "保存视图配置后，Run 实例化时会冻结同一套渲染规则与数据绑定。"
              )}
            </AlertDescription>
          </Alert>
        )}

      {view.unknownRendererRefs.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50/60 text-amber-950">
          <CircleAlert />
          <AlertTitle>{t("存在未注册的视图组件")}</AlertTitle>
          <AlertDescription>
            {t("以下引用不会执行，系统已使用受控组件继续渲染：{refs}", {
              refs: view.unknownRendererRefs.join(", "),
            })}
          </AlertDescription>
        </Alert>
      )}

      {resolved.cloningUnavailable && (
        <Alert className="border-amber-200 bg-amber-50/60 text-amber-950">
          <CircleAlert />
          <AlertTitle>{t("分子克隆视图已安全降级")}</AlertTitle>
          <AlertDescription>
            {t(
              "当前快照缺少有效孔板规划；系统不会伪造孔位，已改用通用实验视图。"
            )}
          </AlertDescription>
        </Alert>
      )}

      {resolved.refs.map(rendererRef => {
        const registration = BIOVIEW_RENDERER_REGISTRY[rendererRef];
        const Renderer = registration.component;
        const definition = definitions.get(rendererRef);
        const failureAlert = (
          <Alert className="border-amber-200 bg-amber-50/60 text-amber-950">
            <CircleAlert />
            <AlertTitle>{t("视图组件渲染失败")}</AlertTitle>
            <AlertDescription>
              {t("该组件收到无效数据，已停止渲染；其他实验视图不受影响。")}
            </AlertDescription>
          </Alert>
        );
        return (
          <BioViewRendererBoundary
            key={rendererRef}
            resetKey={`${rendererRef}:${view.snapshotHash ?? view.sourceTemplate ?? view.nodes.length}`}
            fallback={
              rendererRef === "cloning-plate-flow@1" ? (
                <div className="space-y-4">
                  {failureAlert}
                  <BioViewGenericOverview view={view} />
                </div>
              ) : (
                failureAlert
              )
            }
          >
            <Renderer
              view={view}
              runContext={runContext}
              dataFlow={dataFlow}
              samplePlatePlans={samplePlatePlans}
              title={
                definition?.title ? t(definition.title) : t(registration.label)
              }
            />
          </BioViewRendererBoundary>
        );
      })}
    </section>
  );
}

export function isRegisteredBioViewRenderer(
  value: string
): value is BioViewRendererRef {
  return (BIOVIEW_RENDERER_REFS as readonly string[]).includes(value);
}

export default BioViewRuntime;
