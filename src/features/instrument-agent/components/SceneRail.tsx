import { Activity, Database, FlaskConical, TestTube2, ThermometerSun, Waves, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { SceneKey } from "../model";
import type { InstrumentAgentController } from "../useInstrumentAgent";

const ICONS = {
  hplc: Waves,
  purifier: FlaskConical,
  reader: TestTube2,
  stability: ThermometerSun,
} satisfies Record<SceneKey, typeof Waves>;

const CONNECTION_LABEL = {
  online: "在线",
  warning: "需关注",
  offline: "离线",
};

export function SceneRail({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();

  return (
    <aside className="rounded-xl border bg-white shadow-sm xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("仪器工作区")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("按设备能力切换任务上下文")}</p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">4 AGENTS</Badge>
      </div>
      <div className="flex gap-2 overflow-x-auto p-2 xl:block xl:space-y-1 xl:overflow-visible">
        {controller.dataState.equipmentLoading
          ? [0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 min-w-56 xl:min-w-0" />)
          : controller.scenes.map((scene) => {
              const selected = scene.key === controller.scene.key;
              const device = controller.devices.find((item) => item.scene === scene.key);
              const Icon = ICONS[scene.icon];
              const connection = device?.connection ?? "offline";
              return (
                <button
                  key={scene.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => controller.selectScene(scene.key)}
                  className={cn(
                    "group min-w-60 rounded-lg border p-3 text-left transition-all xl:min-w-0 xl:w-full",
                    selected
                      ? "border-slate-900 bg-slate-950 text-white shadow-sm"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      selected ? "border-white/10 bg-white/10" : scene.soft,
                    )}>
                      <Icon className={cn("h-4 w-4", selected ? "text-teal-300" : scene.color)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{t(scene.shortLabel)}</span>
                        <span className="flex items-center gap-1 text-[10px]">
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            !controller.capabilities.telemetry
                              ? device ? "bg-blue-500" : "bg-slate-400"
                              : connection === "online" ? "bg-emerald-500" : connection === "warning" ? "bg-amber-500" : "bg-rose-500",
                          )} />
                          <span className={selected ? "text-slate-300" : "text-muted-foreground"}>
                            {t(controller.capabilities.telemetry ? CONNECTION_LABEL[connection] : device ? "台账已登记" : "未绑定")}
                          </span>
                        </span>
                      </div>
                      <p className={cn("mt-1 truncate text-xs", selected ? "text-slate-400" : "text-muted-foreground")}>
                        {device?.name ?? t("未绑定设备")}
                      </p>
                    </div>
                  </div>
                  {controller.capabilities.telemetry ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Progress value={device?.health ?? 0} className={cn("h-1 flex-1", selected && "bg-white/10")} />
                      <span className={cn("text-[10px] tabular-nums", selected ? "text-slate-300" : "text-muted-foreground")}>
                        {device?.health ?? 0}%
                      </span>
                    </div>
                  ) : (
                    <div className={cn("mt-3 text-[10px]", selected ? "text-slate-400" : "text-muted-foreground")}>
                      {t("设备健康遥测未接入")}
                    </div>
                  )}
                </button>
              );
            })}
      </div>
      <div className="border-t p-3">
        <div className="rounded-lg bg-slate-50 p-3">
          {controller.capabilities.telemetry ? (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                {controller.currentDevice?.connection === "offline" ? <WifiOff className="h-3.5 w-3.5 text-rose-600" /> : <Activity className="h-3.5 w-3.5 text-teal-600" />}
                {t("边缘连接状态")}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-muted-foreground">{t("驱动版本")}</dt><dd className="text-right font-medium">{controller.currentDevice?.driverVersion ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("最近心跳")}</dt><dd className="text-right font-medium">{t(controller.currentDevice?.lastSync ?? "无数据")}</dd>
                <dt className="text-muted-foreground">{t("任务队列")}</dt><dd className="text-right font-medium">{controller.currentDevice?.queueDepth ?? 0}</dd>
              </dl>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700"><Database className="h-3.5 w-3.5 text-blue-600" />{t("设备台账信息")}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <dt className="text-muted-foreground">{t("设备状态")}</dt><dd className="text-right font-medium">{controller.currentDevice ? t("已登记") : t("未绑定")}</dd>
                <dt className="text-muted-foreground">{t("校准日期")}</dt><dd className="text-right font-medium">{controller.currentDevice?.calibration ?? "—"}</dd>
                <dt className="text-muted-foreground">{t("今日预约")}</dt><dd className="text-right font-medium">{controller.currentDevice?.queueDepth ?? 0}</dd>
              </dl>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{t("Edge 心跳、驱动与实时状态尚未接入。")}</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
