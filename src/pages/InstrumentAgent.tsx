import { AlertCircle, Database, FlaskConical, Gauge, Layers3, TestTubes } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n";
import { DataWorkspace } from "@/features/instrument-agent/components/DataWorkspace";
import { ParameterWorkbench } from "@/features/instrument-agent/components/ParameterWorkbench";
import { ReadinessPanel } from "@/features/instrument-agent/components/ReadinessPanel";
import { RunControl } from "@/features/instrument-agent/components/RunControl";
import { SamplesWorkspace } from "@/features/instrument-agent/components/SamplesWorkspace";
import { ScanDialog } from "@/features/instrument-agent/components/ScanDialog";
import { SceneRail } from "@/features/instrument-agent/components/SceneRail";
import { WorkspaceHeader } from "@/features/instrument-agent/components/WorkspaceHeader";
import { useInstrumentAgent } from "@/features/instrument-agent/useInstrumentAgent";
import type { WorkspaceKey } from "@/features/instrument-agent/model";

export type InstrumentAgentDataMode = "live" | "demo";

export default function InstrumentAgent({ mode = "live" }: { mode?: InstrumentAgentDataMode }) {
  const { t, lang } = useI18n();
  const controller = useInstrumentAgent(t, mode, lang);
  const hasLiveError = !controller.isPreview && (controller.dataState.samplesError || controller.dataState.equipmentError);

  return (
    <div className="space-y-5">
      <WorkspaceHeader controller={controller} />

      {controller.isPreview && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-700" />
          <AlertTitle>{t("当前为工程演示模式")}</AlertTitle>
          <AlertDescription>
            {t("样本、设备、遥测、运行、审批与数据谱系均为隔离的演示适配器；操作只保留在当前浏览器会话，不会写入正式数据库或审计。")}
          </AlertDescription>
        </Alert>
      )}

      {hasLiveError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("部分受控数据暂不可用")}</AlertTitle>
          <AlertDescription>
            {t("系统不会用演示数据掩盖接口故障。相关工作区已显示错误与重试入口，设备执行保持锁定。")}
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={controller.workspace}
        onValueChange={(value) => controller.setWorkspace(value as WorkspaceKey)}
        className="space-y-4"
      >
        <div className="overflow-x-auto rounded-xl border bg-white p-1.5 shadow-sm">
          <TabsList className="h-auto min-w-max justify-start bg-transparent p-0">
            <TabsTrigger value="overview" className="gap-2 px-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
              <Gauge className="h-4 w-4" /> {t("运行总览")}
            </TabsTrigger>
            <TabsTrigger value="parameters" className="gap-2 px-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
              <FlaskConical className="h-4 w-4" /> {t("参数与审批")}
            </TabsTrigger>
            <TabsTrigger value="samples" className="gap-2 px-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
              <TestTubes className="h-4 w-4" /> {t("样本与交接")}
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-2 px-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
              <Layers3 className="h-4 w-4" /> {t("数据与审计")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_310px]">
            <SceneRail controller={controller} />
            <RunControl controller={controller} />
            <ReadinessPanel controller={controller} />
          </div>
        </TabsContent>

        <TabsContent value="parameters" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
            <SceneRail controller={controller} />
            <ParameterWorkbench controller={controller} />
          </div>
        </TabsContent>

        <TabsContent value="samples" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
            <SceneRail controller={controller} />
            <SamplesWorkspace controller={controller} />
          </div>
        </TabsContent>

        <TabsContent value="data" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
            <SceneRail controller={controller} />
            {controller.isPreview ? (
              <DataWorkspace controller={controller} />
            ) : (
              <Alert className="border-blue-200 bg-blue-50">
                <Database className="h-4 w-4 text-blue-700" />
                <AlertTitle>{t("数据谱系聚合接口待接入")}</AlertTitle>
                <AlertDescription>
                  {t("正式环境不会展示静态谱系或伪造完整性百分比。接入 Run、Measurement、Raw Data 与 Report 聚合查询后，此工作区才会显示受控数据。")}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="sr-only" aria-live="polite">{controller.events[0] ? t(controller.events[0].title) : ""}</div>
      <ScanDialog controller={controller} />
    </div>
  );
}
