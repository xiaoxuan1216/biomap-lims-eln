import { AlertCircle, ArrowDown, CheckCircle2, CircleDashed, Database, FileCheck2, FileClock, GitBranch, Link2, ShieldCheck, TestTube2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { DATA_ASSETS } from "../model";
import type { InstrumentAgentController } from "../useInstrumentAgent";

const ASSET_STATE = {
  verified: { label: "已校验", className: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  review: { label: "待复核", className: "border-amber-200 bg-amber-50 text-amber-700", icon: FileClock },
  pending: { label: "待生成", className: "border-slate-200 bg-slate-50 text-slate-600", icon: CircleDashed },
};

export function DataWorkspace({ controller }: { controller: InstrumentAgentController }) {
  const { t } = useI18n();
  const verified = DATA_ASSETS.filter((asset) => asset.state === "verified").length;
  const integrity = Math.round((verified / DATA_ASSETS.length) * 100);

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="border-b bg-slate-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><GitBranch className="h-4 w-4 text-teal-600" />{t("跨仪器数据谱系")}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{t("从粗蛋白液到 KingFisher 磁珠纯化，再分流至 PSA-16、Varioskan 与 OpenLab")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">DEMO · {t(controller.scene.shortLabel)}</Badge>
              <Badge variant="outline" className="font-mono">LINEAGE-REV-12</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          <div className="mx-auto max-w-5xl">
            <LineageNode label={t("源样本")} id="SMP-2026-0086" detail={t("目标蛋白粗蛋白液")} tone="slate" />
            <Connector />
            <LineageNode label={t("KingFisher 磁珠纯化")} id="SMP-2026-0087-PUR" detail={t("8 板程序 · 纯化蛋白洗脱液")} tone="teal" />
            <Connector />
            <div className="relative grid gap-3 md:grid-cols-3">
              <span className="absolute left-1/2 top-[-18px] hidden h-px w-[66.6%] -translate-x-1/2 bg-slate-300 md:block" />
              <LineageNode label="Agilent 1260 / OpenLab" id="DAT-OPENLAB-014" detail={t("序列已建立 · 手动积分待复核")} tone="blue" />
              <LineageNode label="Varioskan LUX 3020" id="DAT-LUX-014" detail={t("Session / 波长 / PlateMap 待复核")} tone="violet" />
              <LineageNode label="PSA-16" id="DAT-PSA-014" detail={t("Tm 68.2 °C · 预扫描记录待复核")} tone="amber" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-sm"><Database className="h-4 w-4 text-teal-600" />{t("关联数据资产")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">{t("跨仪器运行关联的数据文件")}</caption>
                <TableHeader><TableRow><TableHead>{t("类型")}</TableHead><TableHead>{t("文件 / 对象")}</TableHead><TableHead>{t("校验与结果")}</TableHead><TableHead>{t("状态")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {DATA_ASSETS.map((asset) => {
                    const state = ASSET_STATE[asset.state];
                    const Icon = state.icon;
                    return (
                      <TableRow key={asset.id}>
                        <TableCell><span className="flex items-center gap-2 whitespace-nowrap text-xs font-medium"><FileCheck2 className="h-4 w-4 text-slate-400" />{t(asset.kind)}</span></TableCell>
                        <TableCell className="min-w-56 font-mono text-xs font-medium">{asset.name}</TableCell>
                        <TableCell className="min-w-60 text-xs text-muted-foreground">{t(asset.detail)}</TableCell>
                        <TableCell><Badge variant="outline" className={state.className}><Icon className="h-3 w-3" />{t(state.label)}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-teal-600" />{t("谱系完整性")}</CardTitle></CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-end justify-between">
                <div><span className="text-4xl font-bold tabular-nums">{integrity}%</span><div className="text-[10px] uppercase tracking-wider text-muted-foreground">VERIFIED ASSETS</div></div>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{t("尚未完成")}</Badge>
              </div>
              <Progress value={integrity} className="h-1.5" />
              <dl className="space-y-2 text-xs">
                <IntegrityRow label={t("Sample ID 关联")} value="4 / 4" ok />
                <IntegrityRow label={t("客户 SOP 映射")} value="4 / 4" ok />
                <IntegrityRow label={t("演示数据对象校验")} value={`${verified} / ${DATA_ASSETS.length}`} />
                <IntegrityRow label={t("人工结果复核")} value="0 / 3" />
                <IntegrityRow label={t("QA 审批")} value="0 / 1" />
              </dl>
            </CardContent>
          </Card>
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <AlertTitle>{t("报告尚不可放行")}</AlertTitle>
            <AlertDescription>{t("PSA-16、Varioskan 与 OpenLab 结果均需人工复核，受控报告仍等待 QA 电子签署。演示数据不作为放行依据。")}</AlertDescription>
          </Alert>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Link2 className="h-4 w-4" /></span>
                <div><div className="text-sm font-semibold">{t("统一测量记录")}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("每个结果对象携带 Sample ID、Run ID、设备快照、方法版本和文件校验值。")}</p></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return <div className="flex h-10 items-center justify-center"><ArrowDown className="h-4 w-4 text-slate-400" /></div>;
}

function LineageNode({ label, id, detail, tone }: { label: string; id: string; detail: string; tone: "slate" | "teal" | "blue" | "violet" | "amber" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50",
    teal: "border-teal-200 bg-teal-50",
    blue: "border-blue-200 bg-blue-50",
    violet: "border-violet-200 bg-violet-50",
    amber: "border-amber-200 bg-amber-50",
  };
  return (
    <div className={cn("relative mx-auto w-full rounded-xl border p-3 text-center md:max-w-sm", tones[tone])}>
      <div className="flex items-center justify-center gap-2 text-xs font-semibold"><TestTube2 className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">{id}</div>
      <div className="mt-2 text-xs">{detail}</div>
    </div>
  );
}

function IntegrityRow({ label, value, ok = false }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("flex items-center gap-1 font-medium", ok ? "text-emerald-700" : "text-amber-700")}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}{value}</dd>
    </div>
  );
}
