import { describe, expect, it } from "vitest";
import {
  applyDemoScan,
  canAdvanceRun,
  DEMO_DEVICES,
  DEMO_SAMPLES,
  findSampleByBarcode,
  inferScene,
  inventoryDelta,
  nextRunStage,
  riskSummary,
  runProgress,
  SCENES,
} from "./model";

describe("instrument agent domain model", () => {
  it("normalizes whitespace and case for scanned Sample IDs", () => {
    expect(findSampleByBarcode(DEMO_SAMPLES, "  smp-2026-0086  ")?.id).toBe(-1);
    expect(findSampleByBarcode(DEMO_SAMPLES, "   ")).toBeUndefined();
  });

  it("maps all scan operations to an explicit inventory delta", () => {
    expect(inventoryDelta("receive", 1.25)).toBe(1.25);
    expect(inventoryDelta("return", 1.25)).toBe(1.25);
    expect(inventoryDelta("checkout", 1.25)).toBe(-1.25);
    expect(inventoryDelta("audit", 1.25)).toBe(0);
  });

  it("updates demo inventory without mutating the source collection", () => {
    const result = applyDemoScan(DEMO_SAMPLES, -1, "checkout", 2.5);
    expect(result).not.toBe(DEMO_SAMPLES);
    expect(result[0]).not.toBe(DEMO_SAMPLES[0]);
    expect(result[0].quantity).toBe(1.5);
    expect(DEMO_SAMPLES[0].quantity).toBe(4);
  });

  it("rejects a demo checkout that would create negative inventory", () => {
    expect(() => applyDemoScan(DEMO_SAMPLES, -2, "checkout", 1.001)).toThrow(
      "INSUFFICIENT_INVENTORY",
    );
  });

  it("keeps audit scans quantity-neutral", () => {
    expect(applyDemoScan(DEMO_SAMPLES, -1, "audit", 99)).toBe(DEMO_SAMPLES);
  });

  it("advances the run state machine and reports deterministic progress", () => {
    expect(runProgress("draft")).toBe(0);
    expect(runProgress("ready")).toBe(25);
    expect(nextRunStage("ready")).toBe("running");
    expect(nextRunStage("completed")).toBe("completed");
  });

  it("enforces sample, approval, device, and completion gates in order", () => {
    expect(canAdvanceRun({ stage: "ready", sampleLoaded: false, parametersApproved: false, deviceConnection: "offline" })).toEqual({ ok: false, reason: "sample" });
    expect(canAdvanceRun({ stage: "ready", sampleLoaded: true, parametersApproved: false, deviceConnection: "online" })).toEqual({ ok: false, reason: "parameters" });
    expect(canAdvanceRun({ stage: "ready", sampleLoaded: true, parametersApproved: true, deviceConnection: "warning" })).toEqual({ ok: false, reason: "device" });
    expect(canAdvanceRun({ stage: "ready", sampleLoaded: true, parametersApproved: true, deviceConnection: "online" })).toEqual({ ok: true });
    expect(canAdvanceRun({ stage: "completed", sampleLoaded: true, parametersApproved: true, deviceConnection: "online" })).toEqual({ ok: false, reason: "completed" });
  });

  it("summarizes parameter risk counts for approval gates", () => {
    const purifier = SCENES.find((scene) => scene.key === "purifier");
    expect(purifier).toBeDefined();
    expect(riskSummary(purifier?.parameters ?? [])).toEqual({ low: 1, medium: 3, high: 2 });
  });

  it("maps the four customer instruments to their explicit workspaces", () => {
    expect(inferScene("Thermo KingFisher Apex + 24combi")).toBe("purifier");
    expect(inferScene("北京佰司特 PSA-16")).toBe("stability");
    expect(inferScene("Thermo Varioskan LUX 3020")).toBe("reader");
    expect(inferScene("Agilent 1260 / OpenLab")).toBe("hplc");
  });

  it("keeps customer demo instruments isolated and SOP flows complete", () => {
    expect(DEMO_DEVICES).toHaveLength(4);
    expect(DEMO_DEVICES.every((device) => device.source === "demo")).toBe(true);
    expect(DEMO_DEVICES.every((device) => device.driverVersion.includes("未接"))).toBe(true);
    expect(new Set(DEMO_DEVICES.map((device) => device.scene))).toEqual(
      new Set(["hplc", "purifier", "reader", "stability"]),
    );
    expect(SCENES.every((scene) => scene.sopSteps.length >= 5)).toBe(true);
    expect(SCENES.every((scene) => scene.sopSteps.some((step) => step.gate === "human"))).toBe(true);
  });

  it("does not invent unsupported PSA-16 or Varioskan measurements", () => {
    const stability = SCENES.find((scene) => scene.key === "stability");
    const reader = SCENES.find((scene) => scene.key === "reader");
    const stabilityText = JSON.stringify(stability);
    const readerText = JSON.stringify(reader);
    expect(stabilityText).not.toMatch(/Tagg|SLS|PDI/);
    expect(stabilityText).toContain("20-40 µL");
    expect(stabilityText).toContain("预扫描");
    expect(readerText).toContain("禁止智能体猜测");
  });
});
