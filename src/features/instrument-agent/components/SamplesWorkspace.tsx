import { AlertCircle, Archive, Box, PackageCheck, QrCode, RefreshCw, Search, ShieldCheck, Warehouse } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { useMemo, useState } from "react";
import { DEMO_RUN_ID, type ScanMode } from "../model";
import type { InstrumentAgentController } from "../useInstrumentAgent";

const ACTIONS: Array<{ mode: ScanMode; label: string; detail: string; icon: typeof Box; className: string }> = [
  { mode: "receive", label: "扫码入库", detail: "已登记样本或检测产物增量入库", icon: PackageCheck, className: "bg-emerald-50 text-emerald-700" },
  { mode: "checkout", label: "扫码出库", detail: "领用、上机或工序交接", icon: Box, className: "bg-blue-50 text-blue-700" },
  { mode: "return", label: "扫码归还", detail: "未用完样本返回储位", icon: RefreshCw, className: "bg-violet-50 text-violet-700" },
  { mode: "audit", label: "双码盘点", detail: "样本与储位双重核验", icon: ShieldCheck, className: "bg-amber-50 text-amber-700" },
];

export function SamplesWorkspace({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("en-US");
    if (!value) return controller.samples;
    return controller.samples.filter((sample) => `${sample.sku} ${sample.name} ${sample.locationName}`.toLocaleLowerCase("en-US").includes(value));
  }, [controller.samples, search]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((action) => (
          <button
            type="button"
            key={action.mode}
            disabled={action.mode === "audit" && !controller.capabilities.locationAudit}
            onClick={() => controller.scan.openScan(action.mode)}
            className="rounded-xl border bg-white p-4 text-left shadow-sm transition-colors enabled:hover:border-teal-300 enabled:hover:bg-teal-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.className}`}><action.icon className="h-4 w-4" /></span>
            <div className="mt-3 text-sm font-semibold">{t(action.label)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(action.mode === "audit" && !controller.capabilities.locationAudit ? "储位核验接口未接入" : action.detail)}
            </p>
          </button>
        ))}
      </div>

      {!controller.isPreview && controller.dataState.samplesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("样本数据加载失败")}</AlertTitle>
          <AlertDescription>
            <p>{t("正式环境不会回退到演示样本，请检查连接后重试。")}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => controller.dataState.retrySamples()}>{t("重新加载")}</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b bg-slate-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">{t("统一样本台账")}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t("Sample ID、储位、余量与当前任务上下文")}</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("搜索 Sample ID、名称或储位…")} className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {controller.dataState.samplesLoading ? (
              <div className="space-y-2 p-4"><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
            ) : !controller.dataState.samplesError && filtered.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <Archive className="h-9 w-9 text-slate-300" />
                <h3 className="mt-3 text-sm font-semibold">{t(search ? "没有匹配的样本" : "样本库为空")}</h3>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{t(search ? "调整搜索条件，或使用扫码枪直接定位样本。" : "正式环境不会展示演示数据，请先在样本库存中登记样本。")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">{t("仪器任务可用样本列表")}</caption>
                  <TableHeader><TableRow><TableHead>{t("Sample ID")}</TableHead><TableHead>{t("样本名称")}</TableHead><TableHead>{t("项目")}</TableHead><TableHead>{t("储位")}</TableHead><TableHead>{t("可用余量")}</TableHead><TableHead>{t("状态")}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((sample) => (
                      <TableRow key={sample.id} className={controller.currentSample?.sku === sample.sku ? "bg-teal-50/40" : undefined}>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-teal-700">{sample.sku}</TableCell>
                        <TableCell className="min-w-52 font-medium">{sample.name}</TableCell>
                        <TableCell className="min-w-48 text-xs text-muted-foreground">{sample.projectName}</TableCell>
                        <TableCell className="min-w-48 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Warehouse className="h-3 w-3" />{sample.locationName}</span></TableCell>
                        <TableCell className="whitespace-nowrap">{sample.quantity} {sample.unit}</TableCell>
                        <TableCell><Badge variant="outline">{t(sample.status)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-sm"><QrCode className="h-4 w-4 text-teal-600" />{t("当前样本交接")}</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-4">
            {controller.currentSample ? (
              <>
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                  <div className="font-mono text-xs font-semibold text-teal-800">{controller.currentSample.sku}</div>
                  <div className="mt-1 text-sm font-semibold">{controller.currentSample.name}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{controller.currentSample.locationName}</div>
                </div>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">{t("装载状态")}</dt><dd className="font-medium">{controller.sampleLoaded ? t("已扫码装载") : t("未装载")}</dd></div>
                  <div className="flex justify-between border-b pb-2"><dt className="text-muted-foreground">{t("目标设备")}</dt><dd className="font-medium">{controller.currentDevice?.name ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">{t("目标运行")}</dt><dd className="font-mono font-medium">{controller.capabilities.runControl ? DEMO_RUN_ID : t("未创建运行")}</dd></div>
                </dl>
                <Button className="w-full bg-teal-600 hover:bg-teal-500" onClick={() => controller.scan.openScan("checkout")}>
                  <Box className="h-4 w-4" />{t(controller.capabilities.runControl ? "扫码交接到演示设备" : "扫码库存出库")}
                </Button>
              </>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("尚未选择样本")}</div>
            )}
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t("现有库存事务已启用服务端幂等键；库位原子转移、交接人、目标设备与 Run ID 仍需由完整扫码交接接口补齐。")}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
