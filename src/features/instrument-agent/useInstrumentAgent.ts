import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { useI18n } from "@/i18n";
import { ALERT_LABELS, sampleAlert } from "@/lib/labels";
import {
  applyDemoScan,
  canAdvanceRun,
  DEMO_DEVICES,
  DEMO_SAMPLES,
  findSampleByBarcode,
  inferScene,
  INITIAL_AUDIT_EVENTS,
  nextRunStage,
  runProgress,
  SCAN_MODE_LABELS,
  SCENES,
  type AuditEvent,
  type ConnectionState,
  type DeviceView,
  type DisplaySample,
  type RunStage,
  type ScanMode,
  type SceneKey,
  type WorkspaceKey,
} from "./model";

type Translator = ReturnType<typeof useI18n>["t"];

function mapConnection(status: string): ConnectionState {
  if (status === "fault") return "offline";
  if (status === "maintenance") return "warning";
  return "online";
}

function nowTime(lang: "zh" | "en"): string {
  return new Date().toLocaleTimeString(lang === "en" ? "en-US" : "zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function auditEvent(title: string, detail: string, lang: "zh" | "en", tone: AuditEvent["tone"] = "info"): AuditEvent {
  return { id: `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`, time: nowTime(lang), title, detail, tone };
}

export function useInstrumentAgent(t: Translator, dataMode: "live" | "demo", lang: "zh" | "en") {
  const isPreview = dataMode === "demo";
  const utils = trpc.useUtils();
  const [sceneKey, setSceneKey] = useState<SceneKey>("purifier");
  const [workspace, setWorkspace] = useState<WorkspaceKey>("overview");
  const [runStage, setRunStage] = useState<RunStage>("ready");
  const [parametersApproved, setParametersApproved] = useState(false);
  const [recommendationVersion, setRecommendationVersion] = useState(3);
  const [recommendationPending, setRecommendationPending] = useState(false);
  const [sampleLoaded, setSampleLoaded] = useState(isPreview);
  const [loadedSampleSku, setLoadedSampleSku] = useState(isPreview ? DEMO_SAMPLES[0].sku : "");
  const [demoSamples, setDemoSamples] = useState(DEMO_SAMPLES);
  const [events, setEvents] = useState(isPreview ? INITIAL_AUDIT_EVENTS : []);
  const [command, setCommand] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("checkout");
  const [scanCode, setScanCode] = useState(isPreview ? DEMO_SAMPLES[0].sku : "");
  const [scanAmount, setScanAmount] = useState("1");
  const [scanLocation, setScanLocation] = useState("");
  const [scanError, setScanError] = useState("");
  const [resolvedSample, setResolvedSample] = useState<DisplaySample | null>(null);
  const [resolvingBarcode, setResolvingBarcode] = useState(false);
  const pendingScan = useRef<{
    sample: DisplaySample;
    mode: ScanMode;
    amount: number;
    idempotencyKey: string;
  } | null>(null);
  const recommendationTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (recommendationTimer.current !== null) {
      window.clearTimeout(recommendationTimer.current);
      recommendationTimer.current = null;
    }
  }, []);

  const sampleQuery = trpc.sample.list.useQuery(undefined, {
    enabled: !isPreview,
    retry: 1,
  });
  const equipmentQuery = trpc.equipment.list.useQuery({}, {
    enabled: !isPreview,
    retry: 1,
  });

  const samples = useMemo<DisplaySample[]>(() => {
    if (isPreview) return demoSamples;
    const rows = (sampleQuery.data ?? []).map((sample) => {
      const alert = sampleAlert(sample);
      return {
        id: sample.id,
        sku: sample.sku,
        name: sample.name,
        quantity: Number(sample.quantity),
        unit: sample.unit,
        locationName: sample.locationName ?? "待分配位置",
        projectName: sample.projectName ?? "未关联项目",
        status: alert ? ALERT_LABELS[alert].label : "正常",
      };
    });
    if (resolvedSample && !rows.some((sample) => sample.id === resolvedSample.id)) {
      return [resolvedSample, ...rows];
    }
    return rows;
  }, [demoSamples, isPreview, resolvedSample, sampleQuery.data]);

  const devices = useMemo<DeviceView[]>(() => {
    if (isPreview) return DEMO_DEVICES;
    return (equipmentQuery.data ?? []).slice(0, 12).map((equipment) => {
      const scene = inferScene(equipment.name);
      const connection = mapConnection(equipment.status);
      return {
        id: String(equipment.id),
        name: equipment.name,
        model: equipment.model ?? "未登记型号",
        scene,
        connection,
        queueDepth: Number(equipment.todayBookingCount ?? 0),
        health: 0,
        lastSync: "未接入设备心跳",
        calibration: equipment.nextCalibrationDate ?? "未设置校准日期",
        driverVersion: "未接入 Edge Agent",
        source: "registry",
      };
    });
  }, [equipmentQuery.data, isPreview]);

  const scene = SCENES.find((item) => item.key === sceneKey) ?? SCENES[1];
  const currentDevice = devices.find((device) => device.scene === sceneKey);
  const currentSample = samples.find((sample) => sample.sku === loadedSampleSku) ?? (isPreview ? samples[0] : undefined);
  const matchedSample = findSampleByBarcode(samples, scanCode);
  const connection: ConnectionState = isPreview ? currentDevice?.connection ?? "offline" : "offline";
  const guard = canAdvanceRun({ stage: runStage, sampleLoaded, parametersApproved, deviceConnection: connection });
  const capabilities = {
    inventoryTransaction: true,
    locationAudit: isPreview,
    parameterApproval: isPreview,
    runControl: isPreview,
    telemetry: isPreview,
    lineage: isPreview,
    agentCommand: isPreview,
  } as const;

  const addEvent = (event: AuditEvent) => {
    if (!isPreview) return;
    setEvents((current) => [event, ...current].slice(0, 12));
  };

  const selectScene = (key: SceneKey) => {
    setSceneKey(key);
    setRunStage("ready");
    setParametersApproved(false);
    setRecommendationVersion(3);
    setRecommendationPending(false);
    if (recommendationTimer.current !== null) {
      window.clearTimeout(recommendationTimer.current);
      recommendationTimer.current = null;
    }
    setWorkspace("overview");
    addEvent(auditEvent("仪器场景已切换", SCENES.find((item) => item.key === key)?.label ?? key, lang, "neutral"));
  };

  const openScan = (mode: ScanMode) => {
    pendingScan.current = null;
    setScanMode(mode);
    setScanCode("");
    setScanAmount("1");
    setScanLocation("");
    setScanError("");
    setScanOpen(true);
  };

  const finishScan = (sample: DisplaySample, mode: ScanMode) => {
    if (isPreview && mode === "checkout") {
      setSampleLoaded(true);
      setLoadedSampleSku(sample.sku);
    }
    addEvent(auditEvent(SCAN_MODE_LABELS[mode], `${sample.sku} · ${sample.name}`, lang, "success"));
    setScanOpen(false);
  };

  const transactMutation = trpc.sample.transact.useMutation({
    onSuccess: (result) => {
      const snapshot = pendingScan.current;
      if (!snapshot) return;
      toast.success(t(
        result.replayed ? "重复请求已安全复用既有库存事务，当前余量 {n}" : "扫码操作已写入库存流水，当前余量 {n}",
        { n: result.newQuantity },
      ));
      setResolvedSample((current) => current?.id === snapshot.sample.id
        ? { ...current, quantity: result.newQuantity }
        : current);
      finishScan(snapshot.sample, snapshot.mode);
      pendingScan.current = null;
      utils.sample.list.invalidate();
    },
    onError: (error) => {
      setScanError(error.message);
      toast.error(error.message);
    },
  });

  const commitScan = async () => {
    if (transactMutation.isPending || resolvingBarcode) return;
    setScanError("");
    let sample = findSampleByBarcode(samples, scanCode);
    if (!sample && !isPreview && scanCode.trim()) {
      setResolvingBarcode(true);
      try {
        const exact = await utils.sample.resolveBarcode.fetch({ code: scanCode.trim() });
        if (exact) {
          const alert = sampleAlert(exact);
          sample = {
            id: exact.id,
            sku: exact.sku,
            name: exact.name,
            quantity: Number(exact.quantity),
            unit: exact.unit,
            locationName: exact.locationName ?? "待分配位置",
            projectName: exact.projectName ?? "未关联项目",
            status: alert ? ALERT_LABELS[alert].label : "正常",
          };
          setResolvedSample(sample);
        }
      } catch (error) {
        setScanError(error instanceof Error ? error.message : t("条码解析失败，请稍后重试"));
        return;
      } finally {
        setResolvingBarcode(false);
      }
    }
    if (!sample) {
      setScanError(t(isPreview ? "未识别该演示样本条码，请检查 Sample ID" : "未找到该 Sample ID，请到样本库确认登记状态"));
      return;
    }
    const amount = Number(scanAmount);
    if (scanMode !== "audit" && (!Number.isFinite(amount) || amount <= 0)) {
      setScanError(t("请输入有效数量"));
      return;
    }
    if (scanMode === "audit") {
      if (!scanLocation.trim()) {
        setScanError(t("请继续扫描储位条码"));
        return;
      }
      if (!isPreview) {
        setScanError(t("储位条码核验接口尚未接入，正式环境禁止模拟盘点"));
        return;
      }
      toast.success(t("演示盘点已完成，未写入正式库存审计"));
      finishScan(sample, scanMode);
      return;
    }
    if (isPreview) {
      try {
        setDemoSamples((current) => applyDemoScan(current, sample.id, scanMode, amount));
        toast.success(t("演示操作已完成，仅更新当前预览会话"));
        finishScan(sample, scanMode);
      } catch {
        setScanError(t("库存不足，无法完成本次出库"));
      }
      return;
    }
    const previous = pendingScan.current;
    const idempotencyKey = previous
      && previous.sample.id === sample.id
      && previous.mode === scanMode
      && previous.amount === amount
      ? previous.idempotencyKey
      : `scan:${crypto.randomUUID()}`;
    pendingScan.current = { sample, mode: scanMode, amount, idempotencyKey };
    transactMutation.mutate({
      sampleId: sample.id,
      amount,
      reason: scanMode === "checkout" ? "consume" : "restock",
      note: `${SCAN_MODE_LABELS[scanMode]} · 仪器智能体工作台`,
      idempotencyKey,
    });
  };

  const approveParameters = () => {
    if (!isPreview) {
      toast.error(t("审批接口尚未接入，正式环境不能使用本地状态代替审批"));
      return;
    }
    setParametersApproved(true);
    addEvent(auditEvent("参数建议已批准", `${scene.method} · V${recommendationVersion}`, lang, "success"));
    toast.success(t("参数建议已批准并锁定为执行版本"));
  };

  const regenerateParameters = () => {
    if (!isPreview || recommendationPending) return;
    setParametersApproved(false);
    setRecommendationPending(true);
    if (recommendationTimer.current !== null) window.clearTimeout(recommendationTimer.current);
    recommendationTimer.current = window.setTimeout(() => {
      setRecommendationVersion((version) => version + 1);
      setRecommendationPending(false);
      addEvent(auditEvent("参数建议已重新生成", `${scene.method} · 规则边界校验完成`, lang, "info"));
      toast.success(t("演示建议已生成新版本，请重新审批"));
      recommendationTimer.current = null;
    }, 650);
  };

  const revokeApproval = () => {
    if (!isPreview) return;
    setParametersApproved(false);
    addEvent(auditEvent("参数批准已撤回", "执行版本已解锁，需重新审批", lang, "warning"));
  };

  const advanceRun = () => {
    if (!isPreview) {
      toast.error(t("运行编排接口尚未接入，正式环境保持锁定"));
      return;
    }
    const nextGuard = canAdvanceRun({ stage: runStage, sampleLoaded, parametersApproved, deviceConnection: connection });
    if (!nextGuard.ok) {
      if (nextGuard.reason === "sample") {
        openScan("checkout");
        toast.error(t("请先扫码装载样本"));
      } else if (nextGuard.reason === "parameters") {
        setWorkspace("parameters");
        toast.error(t("请先完成参数审批"));
      } else if (nextGuard.reason === "device") {
        toast.error(t("当前设备未处于可执行状态"));
      }
      return;
    }
    const next = nextRunStage(runStage);
    setRunStage(next);
    const step = RUN_STEP_LABELS[next];
    addEvent(auditEvent("运行状态已推进", step, lang, next === "completed" ? "success" : "info"));
    toast.success(t("运行状态已更新为：{state}", { state: t(step) }));
  };

  const sendCommand = () => {
    const value = command.trim();
    if (!value) return;
    if (!isPreview) {
      toast.error(t("Agent 执行接口尚未接入，正式环境不会伪造指令记录"));
      return;
    }
    addEvent(auditEvent("Agent 指令已记录", value, lang, "info"));
    setCommand("");
    toast.success(t("指令已加入任务上下文"));
  };

  const createDemoRun = () => {
    if (!isPreview) return;
    if (recommendationTimer.current !== null) {
      window.clearTimeout(recommendationTimer.current);
      recommendationTimer.current = null;
    }
    setRunStage("ready");
    setParametersApproved(false);
    setRecommendationPending(false);
    setSampleLoaded(false);
    setLoadedSampleSku("");
    setRecommendationVersion(3);
    setWorkspace("overview");
    addEvent(auditEvent("演示任务已创建", `${scene.task} · 等待样本扫码`, lang, "neutral"));
    toast.success(t("新的演示任务已创建，请从样本扫码开始"));
  };

  return {
    isPreview,
    capabilities,
    scene,
    scenes: SCENES,
    selectScene,
    workspace,
    setWorkspace,
    runStage,
    runProgress: runProgress(runStage),
    parametersApproved,
    recommendationVersion,
    recommendationPending,
    regenerateParameters,
    approveParameters,
    revokeApproval,
    sampleLoaded,
    currentSample,
    currentDevice,
    devices,
    samples,
    events,
    command,
    setCommand,
    sendCommand,
    advanceRun,
    createDemoRun,
    guard,
    dataState: {
      samplesLoading: !isPreview && sampleQuery.isLoading,
      equipmentLoading: !isPreview && equipmentQuery.isLoading,
      samplesError: !isPreview ? sampleQuery.error : null,
      equipmentError: !isPreview ? equipmentQuery.error : null,
      retrySamples: sampleQuery.refetch,
      retryEquipment: equipmentQuery.refetch,
    },
    scan: {
      open: scanOpen,
      setOpen: setScanOpen,
      mode: scanMode,
      setMode: setScanMode,
      code: scanCode,
      setCode: setScanCode,
      amount: scanAmount,
      setAmount: setScanAmount,
      location: scanLocation,
      setLocation: setScanLocation,
      error: scanError,
      matchedSample,
      pending: transactMutation.isPending || resolvingBarcode,
      openScan,
      commit: commitScan,
    },
  };
}

const RUN_STEP_LABELS: Record<RunStage, string> = {
  draft: "任务草稿",
  ready: "执行就绪",
  running: "设备运行",
  review: "结果复核",
  completed: "数据归档",
};

export type InstrumentAgentController = ReturnType<typeof useInstrumentAgent>;
