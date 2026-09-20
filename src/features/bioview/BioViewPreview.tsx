import { useMemo } from "react";
import { CheckCircle2, CircleAlert, Eye, Puzzle, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import BioViewRuntime, { type BioViewRuntimeProps } from "./BioViewRuntime";
import { controlledRendererRefs, normalizeBioView } from "./model";

export interface BioViewPreviewProps extends BioViewRuntimeProps {
  heading?: string;
  description?: string;
  showReadiness?: boolean;
}

export function BioViewPreview({
  heading,
  description,
  showReadiness = true,
  manifest,
  method,
  nodes,
  edges,
  samples,
  materials,
  parameters,
  cloningPlan,
  targetBindings,
  mode = "design",
  className,
  showHeader = false,
}: BioViewPreviewProps) {
  const { t } = useI18n();
  const normalized = useMemo(
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
  const controlled = controlledRendererRefs(normalized);
  const effectiveScore =
    normalized.readiness.score ??
    Math.min(
      100,
      20 +
        (normalized.nodes.length > 0 ? 30 : 0) +
        (normalized.edges.length > 0 || normalized.nodes.length === 1
          ? 15
          : 0) +
        (controlled.length > 0 ? 20 : 10) +
        (normalized.domainPack ? 15 : 0)
    );
  const checks = [
    {
      ok: normalized.nodes.length > 0,
      text:
        normalized.nodes.length > 0
          ? t("已解析 {n} 个 BioFlow 节点", { n: normalized.nodes.length })
          : t("请先添加并保存 BioFlow 节点"),
    },
    {
      ok: normalized.unknownRendererRefs.length === 0,
      text:
        normalized.unknownRendererRefs.length === 0
          ? t("视图引用均来自受控 Renderer Registry")
          : t("{n} 个视图引用未注册，将被安全忽略", {
              n: normalized.unknownRendererRefs.length,
            }),
    },
    {
      ok: !!normalized.domainPack,
      text: normalized.domainPack
        ? t("已绑定领域包：{pack}", { pack: normalized.domainPack })
        : t("未绑定领域包，使用通用语义视图"),
    },
    {
      ok:
        !controlled.includes("cloning-plate-flow@1") ||
        !!normalized.cloningPlan,
      text: controlled.includes("cloning-plate-flow@1")
        ? normalized.cloningPlan
          ? t("分子克隆孔板规划可用")
          : t("缺少孔板规划，运行时将降级而不伪造孔位")
        : t("当前视图不要求专用孔板规划"),
    },
  ];

  return (
    <section className={cn("space-y-4", className)}>
      <Card className="gap-0 overflow-hidden border-teal-100 py-0 shadow-none">
        <CardHeader className="border-b bg-teal-50/30 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4 text-teal-600" />
                {heading ?? t("BioView 自动生成预览")}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {description ??
                  t(
                    "同一份视图配置将在 Run 实例化时绑定真实样本、物料和设备参数。"
                  )}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="border-teal-200 bg-white text-teal-800"
            >
              <Workflow className="h-3 w-3" />
              {t("模板视图")}
            </Badge>
          </div>
        </CardHeader>
        {showReadiness && (
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t("可视化就绪度")}
                </span>
                <strong>{Math.round(effectiveScore)}%</strong>
              </div>
              <Progress className="mt-3" value={effectiveScore} />
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Puzzle className="h-3.5 w-3.5" />
                {t("已匹配 {n} 个受控组件", { n: controlled.length || 1 })}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map(item => (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs",
                    item.ok
                      ? "border-teal-100 bg-teal-50/30"
                      : "border-amber-200 bg-amber-50/50"
                  )}
                  key={item.text}
                >
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  )}
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <BioViewRuntime
        manifest={manifest}
        method={method}
        nodes={nodes}
        edges={edges}
        samples={samples}
        materials={materials}
        parameters={parameters}
        cloningPlan={cloningPlan}
        targetBindings={targetBindings}
        mode={mode}
        showHeader={showHeader}
      />
    </section>
  );
}

export default BioViewPreview;
