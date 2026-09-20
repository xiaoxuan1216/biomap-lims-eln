import type { FrozenSamplePlate } from "@contracts/samplePlateLayout";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SamplePlateView } from "@/features/cloning-planner/SamplePlateWorkspace";
import { useI18n } from "@/i18n";

export interface SamplePlateBioViewProps {
  samplePlatePlans: readonly FrozenSamplePlate[];
}

/**
 * Read-only BioView renderer for immutable, run-scoped sample plate plans.
 * SamplePlateView remains the source of truth for well rendering and sample links.
 */
export function SamplePlateBioView({
  samplePlatePlans,
}: SamplePlateBioViewProps) {
  const { t } = useI18n();

  if (samplePlatePlans.length === 0) {
    return (
      <Card className="border-dashed shadow-none">
        <CardHeader>
          <CardTitle className="text-base">
            {t("此 Run 未关联冻结排板方案")}
          </CardTitle>
          <CardDescription>
            {t(
              "这是旧 Run 或发起时未选择排板方案。系统不会读取当前流程的最新版本来补写历史 Run。"
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3">
        <strong className="text-sm text-sky-950">{t("冻结规划快照")}</strong>
        <p className="mt-1 text-xs text-sky-800">
          {t(
            "目标号、容器与孔位来自本 Run 冻结的排板规划；它们不是实际执行、库存移动或实验结果记录。"
          )}
        </p>
      </div>

      {samplePlatePlans.map(samplePlate => (
        <Card
          className="overflow-hidden shadow-none"
          key={`${samplePlate.id}:${samplePlate.version}:${samplePlate.snapshotHash}`}
        >
          <CardHeader className="border-b bg-slate-50/60">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle
                  className="truncate text-base"
                  title={samplePlate.name}
                >
                  {samplePlate.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  {t("关联节点")}：
                  <span className="font-mono text-foreground">
                    {samplePlate.nodeKey ?? t("流程级方案")}
                  </span>
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit shrink-0 bg-white">
                {t("版本")} {samplePlate.version}
              </Badge>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer hover:text-foreground">
                {t("查看审计摘要")}
              </summary>
              <div className="mt-2 flex min-w-0 items-baseline gap-2 rounded-md bg-white px-3 py-2">
                <span className="shrink-0">{t("快照哈希")}</span>
                <code
                  className="min-w-0 break-all font-mono text-[11px] text-foreground"
                  title={samplePlate.snapshotHash}
                >
                  {samplePlate.snapshotHash || "—"}
                </code>
              </div>
            </details>
          </CardHeader>
          <CardContent className="p-4">
            <SamplePlateView plan={samplePlate.plan} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
