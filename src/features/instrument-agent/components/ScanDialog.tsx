import { AlertCircle, Box, PackageCheck, QrCode, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { SCAN_MODE_LABELS, type ScanMode } from "../model";
import type { InstrumentAgentController } from "../useInstrumentAgent";

const MODE_ICON = {
  receive: PackageCheck,
  checkout: Box,
  return: RefreshCw,
  audit: ShieldCheck,
} satisfies Record<ScanMode, typeof Box>;

export function ScanDialog({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();
  const { scan } = controller;

  return (
    <Dialog open={scan.open} onOpenChange={(open) => !scan.pending && scan.setOpen(open)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950"><QrCode className="h-4 w-4 text-teal-300" /></span>
            {t(SCAN_MODE_LABELS[scan.mode])}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t("选择扫码操作类型")}>
            {(Object.keys(SCAN_MODE_LABELS) as ScanMode[]).map((mode) => {
              const Icon = MODE_ICON[mode];
              return (
                <button
                  type="button"
                  key={mode}
                  aria-pressed={scan.mode === mode}
                  disabled={scan.pending || (mode === "audit" && !controller.capabilities.locationAudit)}
                  onClick={() => scan.setMode(mode)}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                    scan.mode === mode ? "border-teal-500 bg-teal-50 text-teal-800" : "bg-white text-muted-foreground hover:bg-slate-50",
                  )}
                >
                  <Icon className="h-4 w-4" /> {t(SCAN_MODE_LABELS[mode].replace("扫码", ""))}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="instrument-sample-barcode">{t("样本条码 / Sample ID")}</Label>
              {controller.isPreview && controller.samples[0] && (
                <button type="button" className="text-xs text-teal-700 underline-offset-2 hover:underline" onClick={() => scan.setCode(controller.samples[0].sku)}>
                  {t("填入演示条码")}
                </button>
              )}
            </div>
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" />
              <Input
                id="instrument-sample-barcode"
                autoFocus
                disabled={scan.pending}
                value={scan.code}
                onChange={(event) => scan.setCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && scan.mode !== "audit") void scan.commit();
                }}
                aria-invalid={Boolean(scan.error)}
                aria-describedby={scan.error ? "instrument-scan-error" : undefined}
                className="h-11 pl-9 font-mono"
                placeholder={t("请扫描样本条码，不预填默认值")}
              />
            </div>
          </div>

          {scan.matchedSample ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950"><ShieldCheck className="h-4 w-4" />{scan.matchedSample.name}</div>
                  <div className="mt-1 font-mono text-xs text-emerald-800">{scan.matchedSample.sku}</div>
                  <div className="mt-2 text-xs text-emerald-800">{scan.matchedSample.locationName} · {scan.matchedSample.projectName}</div>
                </div>
                <Badge className="bg-emerald-700 hover:bg-emerald-700">{scan.matchedSample.quantity} {scan.matchedSample.unit}</Badge>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-center text-sm text-muted-foreground">
              <QrCode className="mx-auto mb-2 h-6 w-6 opacity-40" />
              {scan.code
                ? t(controller.isPreview ? "未匹配到演示样本，继续检查条码" : "当前列表未命中，提交时将向服务端精确解析 Sample ID")
                : t("等待扫码枪输入")}
            </div>
          )}

          {scan.mode === "audit" ? (
            <div className="space-y-2">
              <Label htmlFor="instrument-location-barcode">{t("储位条码")}</Label>
              <Input
                id="instrument-location-barcode"
                disabled={scan.pending}
                value={scan.location}
                onChange={(event) => scan.setLocation(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void scan.commit();
                }}
                className="h-11 font-mono"
                placeholder={t("扫描冰箱、货架或盒位条码")}
              />
              <p className="text-xs text-muted-foreground">{t("盘点必须同时采集样本条码与储位条码，禁止只凭当前页面位置判定一致。")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="instrument-scan-amount">{t("操作数量")}</Label>
              <Input
                id="instrument-scan-amount"
                disabled={scan.pending}
                type="number"
                min="0.001"
                step="any"
                value={scan.amount}
                onChange={(event) => scan.setAmount(event.target.value)}
                className="h-11"
              />
            </div>
          )}

          {scan.error && (
            <Alert id="instrument-scan-error" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{scan.error}</AlertDescription>
            </Alert>
          )}

          <Alert className={controller.isPreview ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {controller.isPreview
                ? t("当前为演示数据模式：操作只影响本次预览会话，不会写入正式库存或审计。")
                : t("提交时先精确解析 Sample ID，再调用带幂等键的库存事务；请求完成前表单保持锁定。")}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={scan.pending} onClick={() => scan.setOpen(false)}>{t("取消")}</Button>
          <Button
            className="bg-teal-600 hover:bg-teal-500"
            disabled={scan.pending || !scan.code.trim() || (controller.isPreview && !scan.matchedSample)}
            onClick={() => void scan.commit()}
          >
            {scan.pending ? t("正在解析或提交…") : t("确认操作")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
