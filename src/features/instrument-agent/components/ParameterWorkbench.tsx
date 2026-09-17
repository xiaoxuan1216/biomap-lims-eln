import { AlertTriangle, CheckCircle2, GitCompareArrows, History, LockKeyhole, RotateCcw, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { riskSummary, type RiskLevel } from "../model";
import type { InstrumentAgentController } from "../useInstrumentAgent";

const RISK_LABEL: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const RISK_CLASS: Record<RiskLevel, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
};

export function ParameterWorkbench({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();
  const summary = riskSummary(controller.scene.parameters);
  const evidence = controller.capabilities.parameterApproval
    ? [
        ["客户 SOP 来源", controller.scene.sop, "客户提供 · 文档版本与签署待确认"],
        ["设备与工作站", controller.currentDevice?.name ?? "—", controller.scene.software],
        ["能力边界", controller.currentDevice?.driverVersion ?? "—", "演示适配器 · 正式接口待确认"],
        ["规则与模型", "CUSTOMER-SOP-MAP 1.0", "越界阻断 + 人工确认"],
      ]
    : [
        ["客户 SOP 来源", controller.scene.sop, "参考模板 · 未绑定正式方法版本"],
        ["设备与工作站", controller.currentDevice?.name ?? "未绑定", controller.scene.software],
        ["能力边界", "正式接口未接入", "不下发设备或 CDS 指令"],
        ["规则与模型", "未绑定", "等待规则集与模型版本"],
      ];

  return (
    <div className="space-y-4">
      {!controller.capabilities.parameterApproval && (
        <Alert className="border-blue-200 bg-blue-50">
          <AlertTriangle className="h-4 w-4 text-blue-700" />
          <AlertTitle>{t("当前展示参数结构参考")}</AlertTitle>
          <AlertDescription>{t("这些参数用于说明产品交互与风险分层，不是正式环境实时生成的推荐，也不能形成设备执行版本。")}</AlertDescription>
        </Alert>
      )}
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b bg-slate-50">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{t("参数建议与审批")}</CardTitle>
                <Badge variant="outline" className="font-mono">{controller.capabilities.parameterApproval ? `RECOMMENDATION V${controller.recommendationVersion}` : "REFERENCE TEMPLATE"}</Badge>
                <Badge variant="outline" className={controller.parametersApproved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                  {controller.parametersApproved ? <LockKeyhole className="h-3 w-3" /> : <History className="h-3 w-3" />}
                  {t(controller.capabilities.parameterApproval ? controller.parametersApproved ? "已批准并锁定" : "等待人工审批" : "审批接口未接入")}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {controller.capabilities.parameterApproval
                  ? `${t(controller.scene.method)} · ${t(controller.scene.sop)} · CUSTOMER-SOP-MAP 1.0`
                  : t("结构参考 · 尚未绑定方法版本、规则集或生成记录")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!controller.capabilities.parameterApproval || controller.parametersApproved || controller.recommendationPending}
                onClick={controller.regenerateParameters}
              >
                <RotateCcw className={controller.recommendationPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {t(controller.recommendationPending ? "正在生成…" : "重新生成")}
              </Button>
              {!controller.capabilities.parameterApproval ? (
                <Button disabled><UserRoundCheck className="h-4 w-4" />{t("审批接口未接入")}</Button>
              ) : controller.parametersApproved ? (
                <Button variant="outline" className="text-rose-700" onClick={controller.revokeApproval}>
                  {t("撤回批准")}
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="bg-teal-600 hover:bg-teal-500">
                      <UserRoundCheck className="h-4 w-4" /> {t("批准执行版本")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("确认批准参数建议 V{version}？", { version: controller.recommendationVersion })}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("本版本包含 {count} 项高风险参数。批准后参数将锁定，运行任务才能下发到设备；任何后续修改都必须生成新版本并重新审批。", { count: summary.high })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("取消")}</AlertDialogCancel>
                      <AlertDialogAction className="bg-teal-600 hover:bg-teal-500" onClick={controller.approveParameters}>
                        {t("确认批准")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid border-b sm:grid-cols-3">
            <RiskMetric label={t("低风险参数")} value={summary.low} className="text-emerald-700" />
            <RiskMetric label={t("需复核参数")} value={summary.medium} className="text-amber-700" />
            <RiskMetric label={t("高风险参数")} value={summary.high} className="text-rose-700" />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">{t("参数基线值与建议值差异")}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">{t("参数")}</TableHead>
                  <TableHead className="min-w-40">{t("基线值")}</TableHead>
                  <TableHead className="min-w-48">{t("建议执行值")}</TableHead>
                  <TableHead className="min-w-56">{t("推荐依据")}</TableHead>
                  <TableHead className="w-28">{t("风险")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {controller.scene.parameters.map((parameter) => {
                  const changed = parameter.baseline !== parameter.recommended;
                  return (
                    <TableRow key={parameter.id}>
                      <TableCell>
                        <div className="font-medium">{t(parameter.label)}</div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground">{parameter.id}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{t(parameter.baseline)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 font-mono text-xs font-semibold text-slate-950">
                          {changed && <GitCompareArrows className="h-3.5 w-3.5 text-teal-600" />}
                          {t(parameter.recommended)}
                        </div>
                        {changed && <div className="mt-1 text-[10px] text-teal-700">{t("Agent 建议变更")}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs leading-5">{t(parameter.rationale)}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">{t("来源：")}{t(parameter.source)}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={RISK_CLASS[parameter.risk]}>{t(RISK_LABEL[parameter.risk])}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-teal-600" />{t("建议证据链")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {evidence.map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  {controller.capabilities.parameterApproval
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    : <History className="h-3.5 w-3.5 text-slate-400" />}
                  {t(label)}
                </div>
                <div className="mt-2 text-sm font-semibold">{t(value)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t(detail)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertTitle>{t("高风险参数需要人工承担决策责任")}</AlertTitle>
          <AlertDescription>
            <p>{t(controller.capabilities.parameterApproval
              ? "智能体提供依据与边界检查，但不会替代操作者或审批人的最终判断。批准动作将写入演示运行事件。"
              : "接入建议版本、证据快照与电子审批接口前，本页只提供结构参考，不能替代正式方法或审批记录。")}</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-800"><ShieldCheck className="h-4 w-4" />{t("电子签名能力将在后端审批接口接入后启用")}</div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

function RiskMetric({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${className}`}>{value}</span>
    </div>
  );
}
