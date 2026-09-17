import { describe, expect, it } from "vitest";
import {
  BUILTIN_DRIVER_MANIFESTS,
  CUSTOM_DRIVER_TEMPLATE,
  driverDefaults,
  driverManifestSchema,
  makeDriverTemplateKey,
  parseDriverTemplateKey,
  validateDriverActionForBinding,
  validateDriverConfiguration,
  validateDriverValues,
} from "./deviceDriver";

describe("device driver manifest contract", () => {
  it("accepts every documentation-backed built-in manifest", () => {
    expect(BUILTIN_DRIVER_MANIFESTS).toHaveLength(3);
    for (const manifest of BUILTIN_DRIVER_MANIFESTS) {
      expect(driverManifestSchema.safeParse(manifest).success).toBe(true);
      expect(manifest.documentation.verified).toBe(true);
      expect(manifest.maturity).toBe("bench-pending");
    }
  });

  it("keeps every dynamic BioFlow key within the database limit", () => {
    for (const manifest of [...BUILTIN_DRIVER_MANIFESTS, CUSTOM_DRIVER_TEMPLATE]) {
      for (const action of manifest.actions) {
        expect(makeDriverTemplateKey(manifest.driverKey, manifest.version, action.key).length).toBeLessThanOrEqual(64);
      }
    }
  });

  it("round-trips a dynamic BioFlow template key", () => {
    const key = makeDriverTemplateKey("octet-da", "1.0.0", "run-method");
    expect(parseDriverTemplateKey(key)).toEqual({
      driverKey: "octet-da",
      version: "1.0.0",
      actionKey: "run-method",
    });
    expect(parseDriverTemplateKey("e_qpcr")).toBeNull();
    expect(parseDriverTemplateKey("drv:broken")).toBeNull();
  });

  it("encodes the non-retryable start boundary for all three physical protocols", () => {
    for (const manifest of BUILTIN_DRIVER_MANIFESTS) {
      const runOrMove = manifest.actions.find(
        (action) => action.exposeAsNode && (action.kind === "run" || action.kind === "transfer"),
      );
      expect(runOrMove).toBeDefined();
      expect(["never-auto", "reconcile-first"]).toContain(runOrMove?.retry);
      expect(manifest.reliability.commandIdSupported).toBe(false);
      expect(manifest.reliability.serialization).toBe("per-equipment");
    }
  });

  it("keeps the vendor-specific transport boundaries explicit", () => {
    const hamilton = BUILTIN_DRIVER_MANIFESTS.find((item) => item.driverKey === "hamilton-vector")!;
    const cyto = BUILTIN_DRIVER_MANIFESTS.find((item) => item.driverKey === "cytocontrol-v8")!;
    const octet = BUILTIN_DRIVER_MANIFESTS.find((item) => item.driverKey === "octet-da")!;

    expect(hamilton.runtime.kind).toBe("windows-com-x86");
    expect(hamilton.runtime.transports).not.toContain("tcp");
    expect(cyto.runtime.transports).toEqual(["serial"]);
    expect(cyto.connectionFields.find((field) => field.key === "timeout-ms")?.min).toBe(15_000);
    expect(cyto.actions.find((action) => action.key === "status")?.wireCommand).toBe("ch:ds<CR>");
    expect(octet.runtime.transports).toContain("tcp");
    expect(octet.connectionFields.find((field) => field.key === "port")?.default).toBeUndefined();
    expect(octet.actions.find((action) => action.key === "run-method")?.wireCommand).toContain("pending");
  });

  it("derives defaults and validates required, range, option, pattern, and boolean fields", () => {
    const cyto = BUILTIN_DRIVER_MANIFESTS.find((item) => item.driverKey === "cytocontrol-v8")!;
    const defaults = driverDefaults(cyto.connectionFields);
    expect(defaults["timeout-ms"]).toBe(15_000);
    expect(validateDriverValues(cyto.connectionFields, { ...defaults, "serial-port": "" })).toContain("串口不能为空");
    expect(
      validateDriverValues(cyto.connectionFields, {
        ...defaults,
        "serial-port": "COM3",
        "timeout-ms": 1_000,
        "telegram-mode": "false",
      }),
    ).toEqual(expect.arrayContaining(["超时不能小于 15000", "校验电报模式必须是布尔值"]));
  });

  it("rejects duplicate action keys", () => {
    const duplicate = structuredClone(CUSTOM_DRIVER_TEMPLATE);
    duplicate.actions.push(structuredClone(duplicate.actions[0]));
    const parsed = driverManifestSchema.safeParse(duplicate);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.message.includes("重复"))).toBe(true);
  });

  it("rejects undeclared fields, secret-like keys, and type bypasses", () => {
    const hamilton = BUILTIN_DRIVER_MANIFESTS.find((item) => item.driverKey === "hamilton-vector")!;
    expect(
      validateDriverConfiguration(hamilton, {
        ...driverDefaults(hamilton.connectionFields),
        password: "must-not-be-stored",
      }),
    ).toEqual(
      expect.arrayContaining([
        "password不是已声明字段",
        "password疑似凭据；请改用 secretRef",
      ]),
    );

    const cytoMove = BUILTIN_DRIVER_MANIFESTS
      .find((item) => item.driverKey === "cytocontrol-v8")!
      .actions.find((action) => action.key === "move-to-transfer")!;
    expect(
      validateDriverValues(cytoMove.fields, {
        "storage-position": 25,
        "transfer-station": "a",
      }),
    ).toContain("库位必须是字符串");
  });

  it("enforces transport and hardware-profile guards", () => {
    const cyto = BUILTIN_DRIVER_MANIFESTS.find((item) => item.driverKey === "cytocontrol-v8")!;
    const cytoConfig = driverDefaults(cyto.connectionFields);
    expect(
      validateDriverActionForBinding(
        cyto,
        "move-to-transfer",
        { "storage-position": "0025", "transfer-station": "b" },
        "edge",
        cytoConfig,
      ),
    ).toContain("当前设备 Profile 未启用第二传递站 TFS2");

    const octet = BUILTIN_DRIVER_MANIFESTS.find((item) => item.driverKey === "octet-da")!;
    expect(validateDriverConfiguration(octet, driverDefaults(octet.connectionFields))).toContain(
      "Octet TCP 模式必须同时配置主机和端口",
    );
    expect(
      validateDriverActionForBinding(
        octet,
        "run-method",
        {
          "experiment-name": "test",
          "method-file": "artifact://method/1",
          "experiment-folder": "artifact://results/1",
          repetitions: 1,
        },
        "edge",
        { ...driverDefaults(octet.connectionFields), port: 20001 },
      ),
    ).toContain("该动作因厂家协议资料不完整，仅允许模拟执行");
  });

  it("rejects unsafe manifest claims for physical actions", () => {
    const unsafe = structuredClone(CUSTOM_DRIVER_TEMPLATE);
    unsafe.actions[0].risk = "operate";
    unsafe.actions[0].retry = "safe";
    const parsed = driverManifestSchema.safeParse(unsafe);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("物理副作用"))).toBe(true);
    }
  });
});
