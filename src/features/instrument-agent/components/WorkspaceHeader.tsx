import {
  Activity,
  BellRing,
  Bot,
  CircleDot,
  Database,
  Plus,
  ScanLine,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { InstrumentAgentController } from "../useInstrumentAgent";

export function WorkspaceHeader({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();
  const online = controller.devices.filter((device) => device.connection === "online").length;
  const attention = controller.devices.filter((device) => device.connection !== "online").length;
  const metrics = controller.isPreview
    ? [
        { icon: Wifi, label: t("设备在线"), value: `${online}/${controller.devices.length}`, detail: t("演示 Edge 心跳"), tone: "emerald" as const },
        { icon: Activity, label: t("执行中任务"), value: "3", detail: t("演示任务共 12 个"), tone: "blue" as const },
        { icon: BellRing, label: t("待处理事项"), value: String(attention + 2), detail: t("演示设备与审批待办"), tone: "amber" as const },
        { icon: CircleDot, label: t("数据同步"), value: "99.8%", detail: t("演示同步快照"), tone: "teal" as const },
      ]
    : [
        { icon: Database, label: t("设备台账"), value: String(controller.devices.length), detail: t("不代表 Edge 在线"), tone: "blue" as const },
        { icon: Activity, label: t("执行中任务"), value: "—", detail: t("运行聚合接口未接入"), tone: "blue" as const },
        { icon: BellRing, label: t("台账需关注"), value: String(attention), detail: t("仅来自设备台账状态"), tone: attention ? "amber" as const : "emerald" as const },
        { icon: CircleDot, label: t("数据同步"), value: "—", detail: t("实时同步接口未接入"), tone: "teal" as const },
      ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 shadow-sm">
            <Bot className="h-5 w-5 text-teal-300" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">{t("仪器运行控制中心")}</h1>
              <Badge variant="outline" className="border-slate-300 bg-white text-slate-600">RUO</Badge>
              <Badge
                variant="outline"
                className={controller.isPreview
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"}
              >
                <Database className="h-3 w-3" />
                {controller.isPreview ? t("演示数据") : t("正式模式 · 能力锁定")}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("统一组织样本交接、参数审批、设备执行与数据回收；未接入的受控能力默认锁定。")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => controller.scan.openScan("checkout")}>
            <ScanLine className="h-4 w-4" /> {t("快速扫码")}
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-500"
            disabled={!controller.capabilities.runControl}
            onClick={controller.createDemoRun}
          >
            <Plus className="h-4 w-4" /> {t(controller.capabilities.runControl ? "新建演示任务" : "任务接口待接入")}
          </Button>
        </div>
      </div>

      <div className="grid overflow-hidden rounded-xl border bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <SummaryMetric key={metric.label} {...metric} />)}
      </div>
    </div>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "blue" | "amber" | "teal";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    teal: "bg-teal-50 text-teal-700",
  };
  return (
    <div className="flex items-center gap-3 border-b p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums text-slate-950">{value}</span>
          <span className="text-xs font-medium text-slate-600">{label}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
