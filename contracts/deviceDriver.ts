import { z } from "zod";

export const DRIVER_API_VERSION = "biomapos.driver/v1" as const;

const keySchema = z
  .string()
  .min(2)
  .max(24)
  .regex(/^[a-z][a-z0-9-]*$/, "仅允许小写字母、数字和短横线");

const valueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const driverFieldSchema = z.object({
  key: keySchema,
  label: z.string().min(1).max(80),
  labelEn: z.string().min(1).max(120).optional(),
  type: z.enum(["text", "number", "select", "boolean", "path"]),
  required: z.boolean().default(false),
  unit: z.string().max(24).optional(),
  help: z.string().max(500).optional(),
  helpEn: z.string().max(500).optional(),
  options: z.array(z.string().max(120)).max(40).optional(),
  default: valueSchema.optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().max(200).optional(),
});

export type DriverField = z.infer<typeof driverFieldSchema>;

export const driverActionSchema = z.object({
  key: keySchema,
  label: z.string().min(1).max(100),
  labelEn: z.string().min(1).max(140).optional(),
  description: z.string().max(600),
  descriptionEn: z.string().max(800).optional(),
  capability: z.string().min(3).max(100),
  kind: z.enum(["query", "run", "transfer", "control", "recover"]),
  risk: z.enum(["read", "operate", "stop", "recover"]),
  exposeAsNode: z.boolean().default(false),
  fields: z.array(driverFieldSchema).max(40).default([]),
  wireCommand: z.string().max(160).optional(),
  completion: z.enum(["immediate", "poll", "event"]),
  retry: z.enum(["safe", "reconcile-first", "never-auto"]),
  /** simulation-only keeps incomplete vendor commands visible for design without allowing real dispatch. */
  executionMode: z.enum(["enabled", "simulation-only"]).optional(),
  constraints: z.array(z.string().max(500)).max(20).default([]),
});

export type DriverAction = z.infer<typeof driverActionSchema>;

export const driverManifestSchema = z
  .object({
    apiVersion: z.literal(DRIVER_API_VERSION),
    driverKey: keySchema.max(20),
    version: z
      .string()
      .min(1)
      .max(12)
      .regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/, "版本号需使用 SemVer"),
    name: z.string().min(1).max(255),
    nameEn: z.string().min(1).max(255).optional(),
    vendor: z.string().min(1).max(120),
    description: z.string().max(1000),
    descriptionEn: z.string().max(1200).optional(),
    maturity: z.enum(["simulation", "bench-pending", "verified"]),
    runtime: z.object({
      kind: z.enum(["windows-com-x86", "serial-ascii", "tcp-serial-ascii", "custom-edge"]),
      platform: z.enum(["windows-x86", "windows", "cross-platform"]),
      transports: z.array(z.enum(["com", "serial", "tcp", "file"])).min(1),
      singleton: z.boolean().default(true),
      requires: z.array(z.string().max(240)).max(30).default([]),
    }),
    connectionFields: z.array(driverFieldSchema).max(30),
    actions: z.array(driverActionSchema).min(1).max(80),
    healthProbeAction: keySchema,
    reliability: z.object({
      acceptanceIsCompletion: z.boolean(),
      commandIdSupported: z.boolean(),
      uncertainStartPolicy: z.enum(["reconcile", "manual-check"]),
      serialization: z.enum(["per-equipment", "parallel"]),
    }),
    documentation: z.object({
      title: z.string().min(1).max(255),
      pages: z.string().max(120),
      verified: z.boolean(),
      gaps: z.array(z.string().max(500)).max(30),
    }),
  })
  .superRefine((manifest, ctx) => {
    const connectionKeys = new Set<string>();
    for (const field of manifest.connectionFields) {
      if (connectionKeys.has(field.key)) {
        ctx.addIssue({
          code: "custom",
          message: `连接字段 key 重复：${field.key}`,
          path: ["connectionFields"],
        });
      }
      connectionKeys.add(field.key);
      if (isSecretLikeKey(field.key)) {
        ctx.addIssue({
          code: "custom",
          message: `连接字段 ${field.key} 疑似凭据；请改用独立 secretRef`,
          path: ["connectionFields", field.key],
        });
      }
      if (field.default !== undefined) {
        for (const issue of validateDriverValues([field], { [field.key]: field.default })) {
          ctx.addIssue({
            code: "custom",
            message: `默认值无效：${issue}`,
            path: ["connectionFields", field.key, "default"],
          });
        }
      }
    }
    const actionKeys = new Set<string>();
    for (const action of manifest.actions) {
      if (actionKeys.has(action.key)) {
        ctx.addIssue({
          code: "custom",
          message: `动作 key 重复：${action.key}`,
          path: ["actions"],
        });
      }
      actionKeys.add(action.key);
      if (makeDriverTemplateKey(manifest.driverKey, manifest.version, action.key).length > 64) {
        ctx.addIssue({
          code: "custom",
          message: `动作 ${action.key} 生成的 BioFlow templateKey 超过 64 字符`,
          path: ["actions"],
        });
      }
      if (action.risk !== "read" && action.retry === "safe") {
        ctx.addIssue({
          code: "custom",
          message: `有物理副作用的动作 ${action.key} 不能声明为 safe retry`,
          path: ["actions", action.key, "retry"],
        });
      }
      const fieldKeys = new Set<string>();
      for (const field of action.fields) {
        if (fieldKeys.has(field.key)) {
          ctx.addIssue({
            code: "custom",
            message: `动作 ${action.key} 的字段 key 重复：${field.key}`,
            path: ["actions", action.key, "fields"],
          });
        }
        fieldKeys.add(field.key);
        if (isSecretLikeKey(field.key)) {
          ctx.addIssue({
            code: "custom",
            message: `动作字段 ${field.key} 疑似凭据；请改用独立 secretRef`,
            path: ["actions", action.key, "fields", field.key],
          });
        }
        if (field.type === "select" && (!field.options || field.options.length === 0)) {
          ctx.addIssue({
            code: "custom",
            message: `下拉字段 ${field.key} 必须提供 options`,
            path: ["actions", action.key, "fields"],
          });
        }
        if (field.default !== undefined) {
          for (const issue of validateDriverValues([field], { [field.key]: field.default })) {
            ctx.addIssue({
              code: "custom",
              message: `默认值无效：${issue}`,
              path: ["actions", action.key, "fields", field.key, "default"],
            });
          }
        }
      }
    }
    if (!actionKeys.has(manifest.healthProbeAction)) {
      ctx.addIssue({
        code: "custom",
        message: "healthProbeAction 必须引用 actions 中的动作",
        path: ["healthProbeAction"],
      });
    }
  });

export type DriverManifest = z.infer<typeof driverManifestSchema>;

export const DRIVER_EXECUTION_STATES = [
  "queued",
  "preparing",
  "ready",
  "starting",
  "running",
  "waiting",
  "paused",
  "cancelling",
  "finalizing",
  "succeeded",
  "cancelled",
  "failed",
  "unknown",
] as const;

export type DriverExecutionState = (typeof DRIVER_EXECUTION_STATES)[number];

/** BioMapOS 与本地 Edge Agent 之间的统一调用上下文。 */
export interface DriverCommandContext {
  commandId: string;
  equipmentId: number;
  workflowId?: number;
  workflowNodeKey?: string;
  requestedBy: string;
  requestedAt: string;
}

export interface DriverRunSnapshot {
  state: DriverExecutionState;
  externalRunId?: string;
  progressPercent?: number;
  message?: string;
  rawState?: unknown;
  needsAction?: string;
}

export interface PreparedDriverRun {
  commandId: string;
  actionKey: string;
  normalizedInput: Record<string, unknown>;
  preconditions: string[];
  evidence: Record<string, unknown>;
}

/**
 * 驱动作者实现此生命周期；物理 I/O 只能发生在 Edge Agent 中。未来开放生产调度时，
 * 调度器必须先写持久化命令账本再调用 start；当前控制面不暴露物理 start 端点。
 * start 超时后的行为由 Manifest retry 策略决定，不能在 SDK 内盲重试。
 */
export interface BioMapDeviceDriver {
  readonly manifest: DriverManifest;
  probe(context: DriverCommandContext): Promise<Record<string, unknown>>;
  testConnection(context: DriverCommandContext): Promise<DriverRunSnapshot>;
  validateRun(
    context: DriverCommandContext,
    actionKey: string,
    input: Record<string, unknown>,
  ): Promise<{ valid: boolean; issues: string[]; evidence: Record<string, unknown> }>;
  prepare(
    context: DriverCommandContext,
    actionKey: string,
    input: Record<string, unknown>,
  ): Promise<PreparedDriverRun>;
  start(context: DriverCommandContext, prepared: PreparedDriverRun): Promise<DriverRunSnapshot>;
  getStatus(context: DriverCommandContext, externalRunId?: string): Promise<DriverRunSnapshot>;
  cancel(context: DriverCommandContext, externalRunId?: string): Promise<DriverRunSnapshot>;
  reconcile(context: DriverCommandContext, externalRunId?: string): Promise<DriverRunSnapshot>;
  collectArtifacts(
    context: DriverCommandContext,
    externalRunId?: string,
  ): Promise<Array<{ name: string; uri: string; sha256: string; size: number }>>;
}

export function makeDriverTemplateKey(driverKey: string, version: string, actionKey: string) {
  return `drv:${driverKey}:${version}:${actionKey}`;
}

export function parseDriverTemplateKey(templateKey: string | null | undefined) {
  if (!templateKey?.startsWith("drv:")) return null;
  const parts = templateKey.split(":");
  if (parts.length !== 4) return null;
  const [, driverKey, version, actionKey] = parts;
  if (!driverKey || !version || !actionKey) return null;
  return { driverKey, version, actionKey };
}

export function driverDefaults(fields: DriverField[]): Record<string, string | number | boolean> {
  return Object.fromEntries(
    fields.filter((field) => field.default !== undefined).map((field) => [field.key, field.default!]),
  );
}

function isSecretLikeKey(key: string) {
  return /(?:password|passwd|secret|token|credential|api-?key|private-?key)/i.test(key);
}

export function validateDriverValues(
  fields: DriverField[],
  values: Record<string, unknown>,
): string[] {
  const issues: string[] = [];
  const declared = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(values)) {
    if (!declared.has(key)) issues.push(`${key}不是已声明字段`);
    if (isSecretLikeKey(key)) issues.push(`${key}疑似凭据；请改用 secretRef`);
  }
  for (const field of fields) {
    const value = values[field.key];
    if (field.required && (value === undefined || value === null || value === "")) {
      issues.push(`${field.label}不能为空`);
      continue;
    }
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push(`${field.label}必须是数字`);
        continue;
      }
      const n = value;
      if (field.min !== undefined && n < field.min) issues.push(`${field.label}不能小于 ${field.min}`);
      if (field.max !== undefined && n > field.max) issues.push(`${field.label}不能大于 ${field.max}`);
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      issues.push(`${field.label}必须是布尔值`);
    }
    if ((field.type === "text" || field.type === "path" || field.type === "select") && typeof value !== "string") {
      issues.push(`${field.label}必须是字符串`);
      continue;
    }
    if (
      typeof value === "string" &&
      Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      })
    ) {
      issues.push(`${field.label}不能包含控制字符`);
    }
    if (field.options && typeof value === "string" && !field.options.includes(value)) {
      issues.push(`${field.label}不是允许的选项`);
    }
    if (field.pattern && typeof value === "string") {
      try {
        if (!new RegExp(field.pattern).test(value)) issues.push(`${field.label}格式不正确`);
      } catch {
        issues.push(`${field.label}的校验表达式无效`);
      }
    }
  }
  return issues;
}

export function validateDriverConfiguration(
  manifest: DriverManifest,
  values: Record<string, unknown>,
): string[] {
  const issues = validateDriverValues(manifest.connectionFields, values);
  if (manifest.driverKey === "octet-da") {
    if (values.transport === "tcp" && (typeof values.host !== "string" || typeof values.port !== "number")) {
      issues.push("Octet TCP 模式必须同时配置主机和端口");
    }
    if (values.transport === "serial" && typeof values["serial-port"] !== "string") {
      issues.push("Octet 串口模式必须配置串口");
    }
  }
  return [...new Set(issues)];
}

export function validateDriverActionForBinding(
  manifest: DriverManifest,
  actionKey: string,
  values: Record<string, unknown>,
  bindingMode: "simulation" | "edge",
  connectionConfig: Record<string, unknown>,
): string[] {
  const action = manifest.actions.find((candidate) => candidate.key === actionKey);
  if (!action) return ["驱动动作不存在"];
  const issues = validateDriverValues(action.fields, values);
  if (action.executionMode === "simulation-only" && bindingMode === "edge") {
    issues.push("该动作因厂家协议资料不完整，仅允许模拟执行");
  }
  if (
    manifest.driverKey === "cytocontrol-v8" &&
    (actionKey === "move-to-transfer" || actionKey === "move-to-storage") &&
    values["transfer-station"] === "b" &&
    connectionConfig["has-tfs2"] !== true
  ) {
    issues.push("当前设备 Profile 未启用第二传递站 TFS2");
  }
  if (
    manifest.driverKey === "cytocontrol-v8" &&
    actionKey === "set-temperature" &&
    connectionConfig["device-profile"] !== "incubator"
  ) {
    issues.push("设置培养温度仅适用于 incubator Profile");
  }
  if (
    manifest.driverKey === "octet-da" &&
    actionKey === "present" &&
    connectionConfig["instrument-family"] === "htx"
  ) {
    issues.push("Present 动作仅适用于 Octet 384 Profile");
  }
  return [...new Set(issues)];
}

const probeAction = (
  key: string,
  label: string,
  labelEn: string,
  capability: string,
  wireCommand: string,
): DriverAction => ({
  key,
  label,
  labelEn,
  description: "读取设备或运行状态，不改变设备状态",
  descriptionEn: "Read device or run state without changing equipment state.",
  capability,
  kind: "query",
  risk: "read",
  exposeAsNode: false,
  fields: [],
  wireCommand,
  completion: "immediate",
  retry: "safe",
  constraints: [],
});

export const BUILTIN_DRIVER_MANIFESTS: DriverManifest[] = [
  {
    apiVersion: DRIVER_API_VERSION,
    driverKey: "hamilton-vector",
    version: "1.0.0",
    name: "Hamilton Vector 方法驱动",
    nameEn: "Hamilton Vector Method Driver",
    vendor: "Hamilton",
    description: "由 Windows x86 Edge Agent 包装本机 Vector Executor / Run Control COM 接口。",
    descriptionEn: "Wraps the local Vector Executor / Run Control COM API in a Windows x86 Edge Agent.",
    maturity: "bench-pending",
    runtime: {
      kind: "windows-com-x86",
      platform: "windows-x86",
      transports: ["com", "file"],
      singleton: true,
      requires: [
        "Hamilton Vector 已安装并注册 COM 组件",
        "Hamilton.Interop.HxStandardLanguage.dll",
        "Hamilton.Interop.HxTrace.dll",
        "以实际安装 Type Library 校验 SetInput 签名",
      ],
    },
    connectionFields: [
      { key: "edge-agent", label: "Edge Agent 标识", labelEn: "Edge Agent ID", type: "text", required: true, default: "edge-hamilton-01" },
      { key: "method-root", label: "受控方法目录", labelEn: "Controlled method root", type: "path", required: true, default: "C:\\Program Files\\Hamilton\\Methods" },
      { key: "trace-root", label: "运行日志目录", labelEn: "Trace directory", type: "path", required: true, default: "C:\\ProgramData\\BioMapOS\\Hamilton\\Traces" },
      { key: "simulation", label: "厂家仿真模式", labelEn: "Vendor simulation mode", type: "boolean", required: true, default: true },
    ],
    actions: [
      probeAction("status", "读取运行状态", "Read run status", "device.status.read", "QueryRunState / RunStateChanged"),
      {
        key: "run-method",
        label: "执行 Hamilton 方法",
        labelEn: "Run Hamilton method",
        description: "加载并解析受控 Vector 方法，READY 后启动并采集 .trc 运行日志。",
        descriptionEn: "Load and parse a controlled Vector method, start after READY, and collect the .trc trace.",
        capability: "hamilton.vector.method.execute",
        kind: "run",
        risk: "operate",
        exposeAsNode: true,
        fields: [
          { key: "method-ref", label: "方法制品引用", labelEn: "Method artifact reference", type: "path", required: true, help: "必须位于受控方法目录，运行前记录哈希" },
          { key: "run-name", label: "运行名称", labelEn: "Run name", type: "text", required: true, default: "BioFlow-Hamilton-Run" },
          { key: "simulation", label: "仿真执行", labelEn: "Simulation", type: "boolean", required: true, default: true },
        ],
        wireCommand: "SetInput → Initialized → Run (Executor)",
        completion: "event",
        retry: "never-auto",
        constraints: ["Executor 的 Run 最多执行一次", "启动结果不确定时进入 UNKNOWN / MANUAL_CHECK", "运行 GUID 固定为 32 位无连字符字符串"],
      },
      {
        key: "pause",
        label: "暂停方法",
        labelEn: "Pause method",
        description: "等待已开始的语句完成后暂停。",
        descriptionEn: "Pause after already-started statements finish.",
        capability: "hamilton.vector.method.pause",
        kind: "control",
        risk: "stop",
        exposeAsNode: false,
        fields: [],
        wireCommand: "Pause",
        completion: "event",
        retry: "reconcile-first",
        constraints: [],
      },
      {
        key: "abort",
        label: "终止方法",
        labelEn: "Abort method",
        description: "终止正在运行的步骤，需要人工确认设备最终状态。",
        descriptionEn: "Abort running steps and require confirmation of the final equipment state.",
        capability: "hamilton.vector.method.abort",
        kind: "control",
        risk: "stop",
        exposeAsNode: false,
        fields: [],
        wireCommand: "Abort",
        completion: "event",
        retry: "never-auto",
        constraints: [],
      },
    ],
    healthProbeAction: "status",
    reliability: {
      acceptanceIsCompletion: false,
      commandIdSupported: false,
      uncertainStartPolicy: "manual-check",
      serialization: "per-equipment",
    },
    documentation: {
      title: "Hamilton Vector Integration",
      pages: "1-16",
      verified: true,
      gaps: ["文档未标明 Vector 版本", "SetInput 文本与示例参数数量不一致", "MLStar OEM 事件名和数据库结构缺失"],
    },
  },
  {
    apiVersion: DRIVER_API_VERSION,
    driverKey: "cytocontrol-v8",
    version: "1.0.0",
    name: "CytoControl V8 自动化存储驱动",
    nameEn: "CytoControl V8 Automated Storage Driver",
    vendor: "Thermo Fisher Scientific",
    description: "通过 RS-232 ASCII 协议控制 Cytomat 自动化培养/存储设备，并统一库存、搬运和环境状态。",
    descriptionEn: "Controls Cytomat automated incubation/storage devices over RS-232 ASCII and normalizes inventory, transfer, and environment state.",
    maturity: "bench-pending",
    runtime: {
      kind: "serial-ascii",
      platform: "cross-platform",
      transports: ["serial"],
      singleton: true,
      requires: ["9600 baud, 8 data bits, no parity, 1 stop bit, no flow control", "控制软件超时不小于 15 秒", "命令必须小写并以 CR 结束"],
    },
    connectionFields: [
      { key: "serial-port", label: "串口", labelEn: "Serial port", type: "text", required: true, default: "COM3" },
      { key: "timeout-ms", label: "超时", labelEn: "Timeout", type: "number", unit: "ms", required: true, default: 15000, min: 15000 },
      { key: "telegram-mode", label: "校验电报模式", labelEn: "Checksummed telegram mode", type: "boolean", required: true, default: false },
      { key: "address-mode", label: "库位寻址", labelEn: "Storage addressing", type: "select", required: true, options: ["absolute", "relative"], default: "absolute" },
      { key: "device-profile", label: "设备 Profile", labelEn: "Device profile", type: "select", required: true, options: ["incubator", "storage"], default: "incubator" },
      { key: "has-tfs2", label: "启用第二传递站", labelEn: "Second transfer station enabled", type: "boolean", required: true, default: false },
    ],
    actions: [
      probeAction("status", "读取设备状态", "Read device status", "device.status.read", "ch:ds<CR>"),
      {
        key: "move-to-transfer",
        label: "库位取板到传递站",
        labelEn: "Move plate to transfer station",
        description: "用高层动作将指定库位容器搬运至 TFS 1/2。",
        descriptionEn: "Use a high-level motion to move a container from storage to TFS 1/2.",
        capability: "storage.container.present",
        kind: "transfer",
        risk: "operate",
        exposeAsNode: true,
        fields: [
          { key: "storage-position", label: "库位", labelEn: "Storage position", type: "text", required: true, pattern: "^(?:\\d{3,4}|\\d{2} \\d{2})$" },
          { key: "transfer-station", label: "传递站", labelEn: "Transfer station", type: "select", required: true, options: ["a", "b"], default: "a" },
          { key: "expected-barcode", label: "预期板条码", labelEn: "Expected plate barcode", type: "text", required: false },
        ],
        wireCommand: "mv:st <sp> [a|b]<CR>",
        completion: "poll",
        retry: "never-auto",
        constraints: ["轮询 ch:ds，不能用会清除 ready 位的 ch:bs", "动作期间禁止发送其他运动命令", "超时后按库位、TFS 占用和条码对账"],
      },
      {
        key: "move-to-storage",
        label: "传递站入板到库位",
        labelEn: "Move plate into storage",
        description: "从 TFS 1/2 将容器搬运到指定库位。",
        descriptionEn: "Move a container from TFS 1/2 to a specified storage position.",
        capability: "storage.container.store",
        kind: "transfer",
        risk: "operate",
        exposeAsNode: true,
        fields: [
          { key: "storage-position", label: "目标库位", labelEn: "Target storage position", type: "text", required: true, pattern: "^(?:\\d{3,4}|\\d{2} \\d{2})$" },
          { key: "transfer-station", label: "传递站", labelEn: "Transfer station", type: "select", required: true, options: ["a", "b"], default: "a" },
          { key: "expected-barcode", label: "预期板条码", labelEn: "Expected plate barcode", type: "text", required: false },
        ],
        wireCommand: "mv:ts <sp> [a|b]<CR>",
        completion: "poll",
        retry: "never-auto",
        constraints: ["轮询 ch:ds 至 busy 清除并检查 ready/error/warning", "超时或断连后不可盲目重发"],
      },
      {
        key: "scan-inventory",
        label: "扫描存储库存",
        labelEn: "Scan storage inventory",
        description: "执行全盘或区间 Location Scan / Inventory Check，随后读取库存有效位和库位数据。",
        descriptionEn: "Run a full or ranged Location Scan / Inventory Check, then read the validity bit and location data.",
        capability: "storage.inventory.scan",
        kind: "run",
        risk: "operate",
        exposeAsNode: true,
        fields: [
          { key: "start-position", label: "起始库位（留空为全盘）", labelEn: "Start position (blank for full)", type: "text", required: false },
          { key: "end-position", label: "结束库位", labelEn: "End position", type: "text", required: false },
        ],
        wireCommand: "mv:sc<CR> | mv:sn <sp1> <sp2><CR>",
        completion: "poll",
        retry: "reconcile-first",
        constraints: ["扫描期间不得访问 stacker", "扫描会覆盖设备中的既有库存管理数据"],
      },
      {
        key: "set-temperature",
        label: "设置培养温度",
        labelEn: "Set incubation temperature",
        description: "设置培养腔温度设定值，仅适用于培养箱型号。",
        descriptionEn: "Set the chamber temperature setpoint; incubator models only.",
        capability: "incubator.temperature.set",
        kind: "control",
        risk: "operate",
        exposeAsNode: true,
        fields: [{ key: "temperature", label: "温度", labelEn: "Temperature", type: "number", unit: "°C", required: true, default: 37 }],
        wireCommand: "ll:it <xx.x><CR>",
        completion: "poll",
        retry: "reconcile-first",
        constraints: ["仅适用于 incubator，不适用于纯 storage device", "写入后用 ch:it 读取设定值与实际值核对"],
      },
      {
        key: "recover-error",
        label: "故障复位并重新初始化",
        labelEn: "Reset error and reinitialize",
        description: "机械检查并排除故障后，清除错误位并重新初始化。",
        descriptionEn: "After mechanical inspection and fault removal, clear the error and reinitialize.",
        capability: "device.error.recover",
        kind: "recover",
        risk: "recover",
        exposeAsNode: false,
        fields: [],
        wireCommand: "rs:be<CR> → ll:in<CR>",
        completion: "poll",
        retry: "never-auto",
        constraints: ["必须先完成机械检查", "反复故障需联系厂家技术服务"],
      },
    ],
    healthProbeAction: "status",
    reliability: {
      acceptanceIsCompletion: false,
      commandIdSupported: false,
      uncertainStartPolicy: "reconcile",
      serialization: "per-equipment",
    },
    documentation: {
      title: "Software Documentation CytoControl V8 and higher (50168346B)",
      pages: "16-17, 29-63, 217-392",
      verified: true,
      gaps: ["需按现场型号确认可用选件、库位数量和第二传递站", "Moxa 是虚拟串口适配器，文档未定义原生 TCP 协议"],
    },
  },
  {
    apiVersion: DRIVER_API_VERSION,
    driverKey: "octet-da",
    version: "1.0.0",
    name: "Octet Data Acquisition 自动化驱动",
    nameEn: "Octet Data Acquisition Automation Driver",
    vendor: "Sartorius / ForteBio",
    description: "面向 Octet RED384、QK384 与 HTX 的 ASCII 行协议驱动，支持 TCP/IP socket 或 RS-232。",
    descriptionEn: "ASCII line-protocol driver for Octet RED384, QK384, and HTX over TCP/IP socket or RS-232.",
    maturity: "bench-pending",
    runtime: {
      kind: "tcp-serial-ascii",
      platform: "cross-platform",
      transports: ["tcp", "serial", "file"],
      singleton: true,
      requires: ["Octet Data Acquisition 已启用 Automation 接口", "所有报文为 ASCII 单行并以 CRLF 结束", "结果目录需由仪器软件和 Edge Agent 共同可见"],
    },
    connectionFields: [
      { key: "transport", label: "连接方式", labelEn: "Transport", type: "select", required: true, options: ["tcp", "serial"], default: "tcp" },
      { key: "host", label: "主机地址", labelEn: "Host", type: "text", required: false, default: "127.0.0.1" },
      { key: "port", label: "TCP 端口", labelEn: "TCP port", type: "number", required: false, min: 1, max: 65535, help: "厂家截图端口不一致，必须按设备实例配置" },
      { key: "serial-port", label: "串口", labelEn: "Serial port", type: "text", required: false },
      { key: "data-root", label: "共享数据目录", labelEn: "Shared data root", type: "path", required: true, default: "\\\\lab-data\\octet" },
      { key: "instrument-family", label: "仪器 Profile", labelEn: "Instrument profile", type: "select", required: true, options: ["red384", "qk384", "htx"], default: "red384" },
    ],
    actions: [
      probeAction("version", "读取版本与仪器类型", "Read version and instrument type", "device.identity.read", "Version<CR><LF>"),
      {
        ...probeAction("status", "读取运行状态", "Read run status", "device.status.read", "Status<CR><LF>"),
        description: "读取 OK / Busy / Waiting / Error；Busy 可携带进度。",
        descriptionEn: "Read OK / Busy / Waiting / Error; Busy may include progress.",
      },
      {
        key: "run-method",
        label: "执行 Octet 方法",
        labelEn: "Run Octet method",
        description: "以预写方法文件运行单个实验，并在完成后通过 GetRunInfo 对账和采集文件。",
        descriptionEn: "Run one experiment from a prewritten method, then reconcile with GetRunInfo and collect files.",
        capability: "octet.data-acquisition.run",
        kind: "run",
        risk: "operate",
        exposeAsNode: true,
        fields: [
          { key: "experiment-name", label: "实验名称", labelEn: "Experiment name", type: "text", required: true, default: "BioFlow-Octet-Run" },
          { key: "method-file", label: "方法文件", labelEn: "Method file", type: "path", required: true },
          { key: "experiment-folder", label: "实验目录", labelEn: "Experiment folder", type: "path", required: true },
          { key: "repetitions", label: "重复次数", labelEn: "Repetitions", type: "number", required: true, default: 1, min: 1 },
        ],
        wireCommand: "Run (switch names pending vendor header)",
        completion: "poll",
        retry: "never-auto",
        executionMode: "simulation-only",
        constraints: ["当前资料未提供准确 switch 名，真实下发保持禁用", "只有先观察到 Busy/Waiting 后再返回 OK 才能判定本次完成", "完成后必须调用 GetRunInfo 并校验结果文件"],
      },
      {
        key: "present",
        label: "Octet 384 开门呈板",
        labelEn: "Present plate on Octet 384",
        description: "开门并将载台移动到机器人装卸位置，仅适用于 384 型号。",
        descriptionEn: "Open the door and move the stage to the robot loading position; 384 models only.",
        capability: "octet.plate.present",
        kind: "transfer",
        risk: "operate",
        exposeAsNode: true,
        fields: [],
        wireCommand: "Present<CR><LF>",
        completion: "poll",
        retry: "reconcile-first",
        constraints: ["仅 Octet 384", "机器人动作前需确认呈板完成"],
      },
      {
        key: "close",
        label: "Octet 关门归位",
        labelEn: "Close Octet door",
        description: "关闭舱门；Octet 384 同时归位读头。",
        descriptionEn: "Close the door; on Octet 384 this also homes the read head.",
        capability: "octet.plate.close",
        kind: "transfer",
        risk: "operate",
        exposeAsNode: true,
        fields: [],
        wireCommand: "Close<CR><LF>",
        completion: "poll",
        retry: "reconcile-first",
        constraints: [],
      },
      {
        key: "reset",
        label: "停止并复位 Octet",
        labelEn: "Stop and reset Octet",
        description: "停止运行并复位仪器，仅用于受控恢复。",
        descriptionEn: "Stop a run and reset the instrument for controlled recovery only.",
        capability: "octet.device.recover",
        kind: "recover",
        risk: "recover",
        exposeAsNode: false,
        fields: [],
        wireCommand: "Reset<CR><LF>",
        completion: "poll",
        retry: "never-auto",
        constraints: ["高风险恢复动作", "保留厂家原始错误文本"],
      },
    ],
    healthProbeAction: "version",
    reliability: {
      acceptanceIsCompletion: false,
      commandIdSupported: false,
      uncertainStartPolicy: "manual-check",
      serialization: "per-equipment",
    },
    documentation: {
      title: "Octet Automation Guidelines",
      pages: "1-5",
      verified: true,
      gaps: ["缺少 Run/GetMethodInfo/GetRunInfo 的准确 switch 与响应语法", "缺少 RS-232 线路参数", "截图中的 TCP 端口不一致", "未说明认证、TLS 和结果文件格式"],
    },
  },
].map((manifest) => driverManifestSchema.parse(manifest));

export const CUSTOM_DRIVER_TEMPLATE: DriverManifest = driverManifestSchema.parse({
  apiVersion: DRIVER_API_VERSION,
  driverKey: "custom-device",
  version: "0.1.0",
  name: "自定义设备驱动",
  nameEn: "Custom equipment driver",
  vendor: "Your vendor",
  description: "由 Edge Agent 执行的自定义驱动。",
  descriptionEn: "A custom driver executed by an Edge Agent.",
  maturity: "simulation",
  runtime: {
    kind: "custom-edge",
    platform: "cross-platform",
    transports: ["tcp"],
    singleton: true,
    requires: ["在隔离的 Edge Agent 中实现动作适配器"],
  },
  connectionFields: [
    { key: "edge-agent", label: "Edge Agent 标识", labelEn: "Edge Agent ID", type: "text", required: true },
  ],
  actions: [
    {
      key: "status",
      label: "读取状态",
      labelEn: "Read status",
      description: "读取设备状态。",
      descriptionEn: "Read equipment state.",
      capability: "device.status.read",
      kind: "query",
      risk: "read",
      exposeAsNode: false,
      fields: [],
      completion: "immediate",
      retry: "safe",
      constraints: [],
    },
    {
      key: "run",
      label: "执行方法",
      labelEn: "Run method",
      description: "执行一个由驱动实现的方法。",
      descriptionEn: "Run a method implemented by the driver.",
      capability: "device.method.run",
      kind: "run",
      risk: "operate",
      exposeAsNode: true,
      fields: [{ key: "method", label: "方法", labelEn: "Method", type: "text", required: true }],
      completion: "poll",
      retry: "never-auto",
      constraints: ["启动结果不确定时不得自动重试"],
    },
  ],
  healthProbeAction: "status",
  reliability: {
    acceptanceIsCompletion: false,
    commandIdSupported: false,
    uncertainStartPolicy: "manual-check",
    serialization: "per-equipment",
  },
  documentation: {
    title: "请替换为实际接口文档",
    pages: "",
    verified: false,
    gaps: ["提交发布前补齐协议、状态和错误处理证据"],
  },
});
