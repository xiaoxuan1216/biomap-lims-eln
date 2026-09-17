import { describe, expect, it } from "vitest";
import {
  decideHamiltonStartRetry,
  mapHamiltonState,
  normalizeHamiltonRunGuid,
  type HamiltonUnifiedState,
} from "./hamiltonState";

describe("Hamilton run GUID normalization", () => {
  it("normalizes canonical and compact GUIDs to lowercase without hyphens", () => {
    expect(
      normalizeHamiltonRunGuid("{7889FE50-5A51-4EA3-AADA-A57389E74246}"),
    ).toBe("7889fe505a514ea3aadaa57389e74246");
    expect(
      normalizeHamiltonRunGuid(" 7889FE505A514EA3AADAA57389E74246 "),
    ).toBe("7889fe505a514ea3aadaa57389e74246");
  });

  it("rejects malformed or non-hexadecimal identifiers", () => {
    expect(() => normalizeHamiltonRunGuid("too-short")).toThrow(
      /32-character hexadecimal GUID/,
    );
    expect(() =>
      normalizeHamiltonRunGuid("7889FE505A514EA3AADAA57389E7424Z"),
    ).toThrow(/32-character hexadecimal GUID/);
    expect(() =>
      normalizeHamiltonRunGuid("7889FE50-5A514-EA3-AADA-A57389E74246"),
    ).toThrow(/32-character hexadecimal GUID/);
  });
});

describe("Hamilton state mapping", () => {
  it.each<[string, string | undefined, HamiltonUnifiedState]>([
    ["mcrsInitialized", undefined, "ready"],
    ["mcrsParsing", undefined, "preparing"],
    ["mcrsScheduled", undefined, "ready"],
    ["mcrsRunning", undefined, "running"],
    ["mcrsPausing", undefined, "pausing"],
    ["mcrsPaused", undefined, "paused"],
    ["mcrsIdle", "mcsiParsingComplete", "ready"],
    ["mcrsIdle", "mcsiParsingFailedToComplete", "failed"],
    ["mcrsIdle", "mcsiExecutionComplete", "succeeded"],
    ["mcrsIdle", "mcsiExecutionAborted", "cancelled"],
    ["mcrsIdle", "mcsiExecutionFailedToComplete", "failed"],
    ["mcrsBusy", undefined, "unknown"],
    ["mcrsIdle", undefined, "unknown"],
    ["mcrsNotInitialized", undefined, "unknown"],
  ])("maps Run Control %s / %s to %s", (state, stateInfo, expected) => {
    expect(mapHamiltonState({ source: "run-control", state, stateInfo })).toBe(
      expected,
    );
  });

  it.each<[string, string | undefined, HamiltonUnifiedState]>([
    ["initialized", undefined, "ready"],
    ["starting", undefined, "starting"],
    ["running", undefined, "running"],
    ["pausing", undefined, "pausing"],
    ["paused", undefined, "paused"],
    ["aborting", undefined, "cancelling"],
    ["terminating", undefined, "finalizing"],
    ["processed", undefined, "succeeded"],
    ["aborted", "abortedByUser", "cancelled"],
    ["aborted", "runFailedToComplete", "failed"],
    ["aborted", undefined, "unknown"],
    ["terminated", "COM failure", "failed"],
    ["terminated", undefined, "unknown"],
    ["notInitialized", undefined, "unknown"],
  ])("maps Executor %s / %s to %s", (state, stateInfo, expected) => {
    expect(mapHamiltonState({ source: "executor", state, stateInfo })).toBe(
      expected,
    );
  });

  it("normalizes harmless differences in state spelling and casing", () => {
    expect(
      mapHamiltonState({
        source: "run-control",
        state: "MCRS_RUNNING",
      }),
    ).toBe("running");
    expect(
      mapHamiltonState({ source: "executor", state: "  STARTING " }),
    ).toBe("starting");
  });
});

describe("Hamilton start retry boundary", () => {
  it("allows a retry only before start was dispatched", () => {
    expect(
      decideHamiltonStartRetry({
        startRequested: false,
        startConfirmed: false,
      }),
    ).toBe("safe-retry");
  });

  it("requires reconciliation after an unconfirmed start dispatch", () => {
    expect(
      decideHamiltonStartRetry({
        startRequested: true,
        startConfirmed: false,
      }),
    ).toBe("reconcile");
  });

  it("never automatically retries a confirmed start", () => {
    expect(
      decideHamiltonStartRetry({
        startRequested: true,
        startConfirmed: true,
      }),
    ).toBe("never-auto-retry");
  });
});
