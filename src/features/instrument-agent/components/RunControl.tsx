import {
  ArrowRight,
  AlertCircle,
  Bot,
  Check,
  Circle,
  Clock3,
  Command,
  FileCheck2,
  FlaskConical,
  ListChecks,
  Play,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { DEMO_RUN_ID, riskSummary, RUN_STEPS, runStageIndex, type RunStage, type SopGate } from "../model";
import type { InstrumentAgentController } from "../useInstrumentAgent";

const STAGE_LABELS: Record<RunStage, string> = {
  draft: "任务草稿",
  ready: "执行就绪",
  running: "设备运行",
  review: "结果复核",
  completed: "数据归档",
};

const SOP_GATE: Record<SopGate, { label: string; className: string }> = {
  scan: { label: "扫码门禁", className: "border-blue-200 bg-blue-50 text-blue-700" },
  human: { label: "人工确认", className: "border-amber-200 bg-amber-50 text-amber-700" },
  system: { label: "系统校验", className: "border-violet-200 bg-violet-50 text-violet-700" },
  review: { label: "结果复核", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function RunControl({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();
  const currentIndex = controller.capabilities.runControl ? runStageIndex(controller.runStage) : -1;
  const parameterRisk = riskSummary(controller.scene.parameters);
  const action = controller.capabilities.runControl
    ? primaryAction(controller.runStage, controller.guard.reason)
    : "运行接口未接入";

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="border-b bg-slate-950 p-0 text-white">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-teal-400/20 bg-teal-400/10 text-teal-200 hover:bg-teal-400/10">
                {controller.capabilities.runControl ? DEMO_RUN_ID : "RUN-NOT-CREATED"}
              </Badge>
              <Badge className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/5">
                <span className={cn("h-1.5 w-1.5 rounded-full", controller.capabilities.runControl ? "bg-emerald-400" : "bg-slate-500")} />
                {t(controller.capabilities.runControl ? STAGE_LABELS[controller.runStage] : "正式运行未创建")}
              </Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight">{t(controller.scene.task)}</h2>
            <p className="mt-1 text-sm text-slate-400">{controller.scene.device} · {t(controller.scene.method)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              className="bg-teal-500 text-slate-950 hover:bg-teal-400"
              onClick={controller.advanceRun}
              disabled={!controller.capabilities.runControl || controller.runStage === "completed"}
            >
              {controller.runStage === "running" ? <FileCheck2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {t(action)}
            </Button>
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-3">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>{t("运行进度")}</span>
            <span className="font-mono text-slate-300">{controller.capabilities.runControl ? `${controller.runProgress}%` : "—"}</span>
          </div>
          <Progress value={controller.capabilities.runControl ? controller.runProgress : 0} className="h-1.5 bg-white/10" />
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        <div className="grid gap-0 overflow-x-auto rounded-xl border bg-slate-50 lg:grid-cols-5">
          {RUN_STEPS.map((step, index) => {
            const complete = controller.capabilities.runControl && index < currentIndex;
            const current = controller.capabilities.runControl && index === currentIndex;
            return (
              <div key={step.stage} className="relative min-w-44 border-b p-3 last:border-b-0 lg:min-w-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                    complete ? "border-emerald-600 bg-emerald-600 text-white" : current ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-400",
                  )}>
                    {complete ? <Check className="h-3.5 w-3.5" /> : current ? <Circle className="h-2.5 w-2.5 fill-current" /> : <span className="text-[10px]">{index + 1}</span>}
                  </span>
                  <span className={cn("text-xs font-semibold", current && "text-teal-700")}>{t(step.label)}</span>
                </div>
                <p className="mt-2 pl-8 text-[11px] leading-4 text-muted-foreground">{t(step.description)}</p>
              </div>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-col gap-3 border-b bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-teal-600" />{t("客户 SOP 执行链")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t(controller.scene.sop)} · {t(controller.scene.software)}</p>
            </div>
            <Badge variant="outline" className="w-fit border-amber-200 bg-amber-50 text-amber-700">{t("人工批准后执行")}</Badge>
          </div>
          <div className="grid gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
            {controller.scene.sopSteps.map((step, index) => {
              const gate = SOP_GATE[step.gate];
              return (
                <div key={step.id} className="bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 font-mono text-[10px] text-white">{index + 1}</span>
                      <span className="text-xs font-semibold">{t(step.label)}</span>
                    </div>
                    <Badge variant="outline" className={`shrink-0 px-1.5 text-[9px] ${gate.className}`}>{t(gate.label)}</Badge>
                  </div>
                  <p className="mt-2 pl-8 text-[11px] leading-5 text-muted-foreground">{t(step.detail)}</p>
                </div>
              );
            })}
          </div>
          <div className="border-t border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
            {t("当前仅验证 SOP 映射、扫码交接和人工门禁；正式设备或 CDS 控制将在客户批准适配器接入前保持锁定。")}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <ContextCard
            icon={FlaskConical}
            label={t("当前样本")}
            value={controller.currentSample?.name ?? t("未装载样本")}
            detail={controller.currentSample?.sku ?? t("需要扫码确认")}
            state={controller.sampleLoaded ? t("已核验") : t("待装载")}
            onClick={() => controller.scan.openScan("checkout")}
          />
          <ContextCard
            icon={ShieldCheck}
            label={t("参数版本")}
            value={`${t(controller.scene.method)} · ${controller.capabilities.parameterApproval ? `V${controller.recommendationVersion}` : "REFERENCE"}`}
            detail={controller.capabilities.parameterApproval
              ? t("{total} 项建议 · {high} 项高风险", { total: controller.scene.parameters.length, high: parameterRisk.high })
              : t("参考参数模板，非已生成建议")}
            state={t(controller.capabilities.parameterApproval ? controller.parametersApproved ? "已批准" : "待审批" : "接口未接入")}
            onClick={() => controller.setWorkspace("parameters")}
          />
          <ContextCard
            icon={Clock3}
            label={t("设备窗口")}
            value={controller.currentDevice?.name ?? t("未绑定设备")}
            detail={controller.currentDevice?.calibration ?? t("缺少校准信息")}
            state={t(controller.capabilities.telemetry ? controller.currentDevice?.connection === "online" ? "可执行" : "需关注" : controller.currentDevice ? "仅台账" : "未绑定")}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
          {controller.capabilities.telemetry ? (
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{t("运行遥测")}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("来自演示 Edge 适配器的实时快照")}</p>
                </div>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> DEMO LIVE
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {telemetry(controller.scene.key).map((metric) => (
                  <div key={metric.label} className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[11px] text-muted-foreground">{t(metric.label)}</div>
                    <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-900">{metric.value}</div>
                    <div className="mt-1 text-[10px] text-emerald-700">{t(metric.state)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4 text-blue-700" />
              <AlertTitle>{t("设备实时事件接口未接入")}</AlertTitle>
              <AlertDescription>{t("当前仅能读取设备台账。接入 Edge 心跳、运行事件与告警流后，才会显示遥测并开放运行控制。")}</AlertDescription>
            </Alert>
          )}
          <div className="rounded-xl border bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Command className="h-4 w-4 text-teal-600" /> {t("快捷指令")}
            </div>
            <div className="mt-3 space-y-2">
              {["检查执行前风险", "解释高风险参数", "生成交接清单"].map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={!controller.capabilities.agentCommand}
                  onClick={() => controller.setCommand(t(item))}
                  className="flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-left text-xs transition-colors enabled:hover:border-teal-300 enabled:hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t(item)} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <form
          className="flex items-center gap-2 rounded-xl border bg-slate-50 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            controller.sendCommand();
          }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950">
            <Bot className="h-4 w-4 text-teal-300" />
          </span>
          <label htmlFor="instrument-agent-command" className="sr-only">{t("向仪器智能体发送指令")}</label>
          <Input
            id="instrument-agent-command"
            disabled={!controller.capabilities.agentCommand}
            value={controller.command}
            onChange={(event) => controller.setCommand(event.target.value)}
            placeholder={t(controller.capabilities.agentCommand ? "询问参数依据、运行风险，或生成操作清单…" : "Agent 执行接口接入后可用")}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="icon" disabled={!controller.capabilities.agentCommand} className="h-9 w-9 bg-teal-600 hover:bg-teal-500" aria-label={t("发送指令")}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ContextCard({
  icon: Icon,
  label,
  value,
  detail,
  state,
  onClick,
}: {
  icon: typeof FlaskConical;
  label: string;
  value: string;
  detail: string;
  state: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className="rounded-xl border bg-white p-3 text-left transition-colors enabled:hover:border-teal-300 enabled:hover:bg-teal-50/30 disabled:cursor-default"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <Badge variant="outline" className="h-5 px-1.5 text-[9px]">{state}</Badge>
          </div>
          <div className="mt-1 truncate text-sm font-semibold">{value}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{detail}</div>
        </div>
      </div>
    </button>
  );
}

function primaryAction(stage: RunStage, guardReason?: string): string {
  if (guardReason === "sample") return "扫码装载样本";
  if (guardReason === "parameters") return "前往参数审批";
  if (guardReason === "device") return "检查设备状态";
  if (stage === "ready") return "启动运行";
  if (stage === "running") return "提交结果复核";
  if (stage === "review") return "完成并归档";
  if (stage === "completed") return "运行已完成";
  return "进入执行就绪";
}

function telemetry(scene: string) {
  const metrics = {
    hplc: [
      { label: "OpenLab 接入", value: "未连接", state: "演示适配器" },
      { label: "SOP 排空流速", value: "5.00 mL/min", state: "仅参数参考" },
      { label: "平衡时间", value: "约 30 min", state: "人工基线确认" },
      { label: "序列状态", value: "0 / 4", state: "等待人工确认" },
    ],
    purifier: [
      { label: "磁头", value: "24 Combi", state: "演示配置" },
      { label: "板位核验", value: "8 / 8", state: "演示扫码通过" },
      { label: "程序时长", value: "2.5-3.5 h", state: "待人工确认" },
      { label: "运行状态", value: "待开始", state: "未接真实硬件" },
    ],
    reader: [
      { label: "USB 主机", value: "未连接", state: "演示适配器" },
      { label: "Session", value: "待创建", state: "命名需人工复核" },
      { label: "板位映射", value: "0 / 96", state: "等待扫码" },
      { label: "导出格式", value: "待确认", state: "客户 SOP 未提供" },
    ],
    stability: [
      { label: "样本体积", value: "20-40 µL", state: "石英管" },
      { label: "温度范围", value: "30-90 °C", state: "上限 110 °C" },
      { label: "升温速率", value: "待设置", state: "范围 0.1-15 °C/min" },
      { label: "预扫描", value: "待执行", state: "强制门禁" },
    ],
  } as const;
  return metrics[scene as keyof typeof metrics] ?? metrics.purifier;
}
