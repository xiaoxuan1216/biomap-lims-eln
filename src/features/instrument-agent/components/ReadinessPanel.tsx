import { AlertTriangle, CheckCircle2, Clock3, Cpu, FileClock, ShieldAlert, UserRoundCheck, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { InstrumentAgentController } from "../useInstrumentAgent";

export function ReadinessPanel({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();
  const deviceReady = controller.capabilities.telemetry && controller.currentDevice?.connection === "online";
  const checks = [
    { label: "样本身份与余量", detail: controller.currentSample?.sku ?? "—", ready: controller.sampleLoaded },
    {
      label: "参数执行版本",
      detail: controller.capabilities.parameterApproval ? `${t(controller.scene.method)} · V${controller.recommendationVersion}` : t("审批与版本接口未接入"),
      ready: controller.capabilities.parameterApproval && controller.parametersApproved,
    },
    {
      label: "设备状态与校准",
      detail: controller.capabilities.telemetry ? controller.currentDevice?.calibration ?? t("无校准信息") : t("Edge 遥测与校准门禁未接入"),
      ready: Boolean(deviceReady),
    },
    {
      label: "操作人权限",
      detail: t(controller.isPreview ? "演示操作者" : "运行授权校验未接入"),
      ready: controller.isPreview,
    },
  ];
  const readiness = Math.round((checks.filter((check) => check.ready).length / checks.length) * 100);

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{t("执行就绪检查")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("启动设备前的强制门禁")}</p>
          </div>
          <span className={cn("text-xl font-bold tabular-nums", readiness === 100 ? "text-emerald-700" : "text-amber-700")}>
            {controller.capabilities.runControl ? `${readiness}%` : "—"}
          </span>
        </div>
        <div className="space-y-3 p-4">
          <Progress value={controller.capabilities.runControl ? readiness : 0} className="h-1.5" />
          <div className="space-y-2">
            {checks.map((check) => (
              <div key={check.label} className="flex items-start gap-2 rounded-lg border p-2.5">
                {check.ready
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{t(check.label)}</div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{check.detail}</div>
                </div>
                <Badge variant="outline" className={cn("h-5 px-1.5 text-[9px]", check.ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                  {check.ready ? t("通过") : t("待处理")}
                </Badge>
              </div>
            ))}
          </div>
          {!controller.parametersApproved && (
            <Button className="w-full bg-slate-950 hover:bg-slate-800" onClick={() => controller.setWorkspace("parameters")}>
              <UserRoundCheck className="h-4 w-4" /> {t("处理参数审批")}
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("设备健康")}</h2>
          {controller.capabilities.telemetry && controller.currentDevice?.connection === "online" ? (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><Cpu className="h-3 w-3" /> {t("正常")}</Badge>
          ) : (
            <Badge variant="outline" className={controller.capabilities.telemetry ? "border-rose-200 bg-rose-50 text-rose-700" : "border-blue-200 bg-blue-50 text-blue-700"}>
              <WifiOff className="h-3 w-3" /> {t(controller.capabilities.telemetry ? "异常" : "遥测未接入")}
            </Badge>
          )}
        </div>
        {controller.dataState.equipmentLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : (
          <div className="p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold tabular-nums">{controller.capabilities.telemetry ? controller.currentDevice?.health ?? 0 : "—"}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">HEALTH SCORE</div>
              </div>
              <div className="text-right text-xs">
                <div className="font-medium">{controller.currentDevice?.name ?? t("未绑定设备")}</div>
                <div className="mt-1 text-muted-foreground">{controller.currentDevice?.model ?? "—"}</div>
              </div>
            </div>
            <Progress value={controller.capabilities.telemetry ? controller.currentDevice?.health ?? 0 : 0} className="mt-3 h-1.5" />
            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">{t("最近心跳")}</dt><dd className="font-medium">{t(controller.capabilities.telemetry ? controller.currentDevice?.lastSync ?? "无数据" : "接口未接入")}</dd></div>
              <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">{t("校准状态")}</dt><dd className="font-medium">{t(controller.currentDevice?.calibration ?? "无数据")}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t(controller.capabilities.telemetry ? "排队任务" : "今日预约")}</dt><dd className="font-medium">{controller.currentDevice?.queueDepth ?? 0}</dd></div>
            </dl>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t("最近审计事件")}</h2>
          <Badge variant="outline" className="font-mono text-[9px]"><FileClock className="h-3 w-3" /> AUDIT</Badge>
        </div>
        <div className="max-h-72 space-y-0 overflow-y-auto p-4">
          {controller.events.length === 0 && (
            <div className="py-6 text-center text-xs leading-5 text-muted-foreground">
              <FileClock className="mx-auto mb-2 h-6 w-6 opacity-30" />
              {t("运行审计聚合接口未接入，正式模式不会展示演示事件。")}
            </div>
          )}
          {controller.events.slice(0, 6).map((event, index) => (
            <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < Math.min(controller.events.length, 6) - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200" />}
              <span className={cn(
                "relative mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white ring-1",
                event.tone === "success" ? "bg-emerald-500 ring-emerald-200" : event.tone === "warning" ? "bg-amber-500 ring-amber-200" : event.tone === "info" ? "bg-blue-500 ring-blue-200" : "bg-slate-400 ring-slate-200",
              )} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{t(event.title)}</span>
                  <time className="shrink-0 font-mono text-[9px] text-muted-foreground">{event.time}</time>
                </div>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{t(event.detail)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!controller.isPreview && controller.dataState.equipmentError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <div className="flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" />{t("设备数据加载失败")}</div>
          <button className="mt-2 underline" onClick={() => controller.dataState.retryEquipment()}>{t("重新加载")}</button>
        </div>
      )}
      {controller.capabilities.telemetry && controller.currentDevice?.connection === "warning" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />{t("设备需要关注")}</div>
          <p className="mt-1 leading-5">{t("校准临近到期或心跳延迟，启动任务前需人工复核。")}</p>
        </div>
      )}
    </aside>
  );
}
