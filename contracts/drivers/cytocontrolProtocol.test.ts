import { describe, expect, it } from "vitest";
import {
  calculateCytocontrolIncubatorInverseXor,
  calculateCytocontrolPssXor,
  decideCytocontrolMutatingRetry,
  formatCytocontrolChecksum,
  frameCytocontrolPssTelegram,
  frameCytocontrolPssTelegramCommand,
  frameCytocontrolPssTerminalCommand,
  parseCytocontrolPssBasicState,
  parseCytocontrolPssDsResponse,
  parseCytocontrolPssResponse,
} from "./cytocontrolProtocol";

describe("CytoControl PSS terminal framing", () => {
  it("normalizes the command token to lowercase and appends exactly one CR", () => {
    expect(frameCytocontrolPssTerminalCommand("CH:DS")).toBe("ch:ds\r");
    expect(frameCytocontrolPssTerminalCommand("MV:ST", ["0042", "b"])).toBe(
      "mv:st 0042 b\r",
    );
  });

  it("preserves case-sensitive container identifiers", () => {
    expect(frameCytocontrolPssTerminalCommand("MV:PO", ["A325Bc9"])).toBe(
      "mv:po A325Bc9\r",
    );
  });

  it("supports documented low-level action labels containing plus or minus", () => {
    expect(frameCytocontrolPssTerminalCommand("ll:h+", ["0001"])).toBe(
      "ll:h+ 0001\r",
    );
    expect(frameCytocontrolPssTerminalCommand("ll:h-", ["0001"])).toBe(
      "ll:h- 0001\r",
    );
  });

  it.each([
    ["", []],
    ["mvst", ["0001"]],
    ["mv:st\r", ["0001"]],
    ["mv:st", [""]],
    ["mv:st", ["0001\rll:in"]],
    ["mv:po", ["ID WITH SPACE"]],
    ["mv:po", ["容器-01"]],
  ])("rejects an invalid command or unsafe parameter: %j %j", (command, parameters) => {
    expect(() =>
      frameCytocontrolPssTerminalCommand(command, parameters),
    ).toThrow();
  });
});

describe("CytoControl PSS telegram-structure framing", () => {
  it("matches the documented ch:bs XOR example byte for byte", () => {
    expect(calculateCytocontrolPssXor("ch:bs")).toBe(0x20);
    expect(Array.from(frameCytocontrolPssTelegram("ch:bs"))).toEqual([
      0x02,
      0x63,
      0x68,
      0x3a,
      0x62,
      0x73,
      0x3b,
      0x20,
      0x03,
    ]);
  });

  it("matches the documented sb:ct 000 mode-disable checksum", () => {
    expect(
      Array.from(frameCytocontrolPssTelegramCommand("SB:CT", ["000"])),
    ).toEqual([
      0x02,
      ...Array.from(Buffer.from("sb:ct 000", "ascii")),
      0x3b,
      0x2c,
      0x03,
    ]);
  });

  it.each(["", "ch:bs\r", "ch:bs\n", "状态"])(
    "rejects an empty, terminated, or non-ASCII telegram payload: %j",
    payload => {
      expect(() => frameCytocontrolPssTelegram(payload)).toThrow();
    },
  );
});

describe("CytoControl incubator checksum", () => {
  it("matches the documented inverse-XOR example", () => {
    const checksum = calculateCytocontrolIncubatorInverseXor("?:2400:00::");
    expect(checksum).toBe(0xc6);
    expect(formatCytocontrolChecksum(checksum)).toBe("c6");
  });

  it.each([-1, 256, 1.5, Number.NaN])(
    "rejects an invalid checksum byte: %s",
    value => {
      expect(() => formatCytocontrolChecksum(value)).toThrow(/unsigned byte/);
    },
  );
});

describe("CytoControl PSS response parsing", () => {
  it("parses accepted commands and the attached basic-state byte", () => {
    expect(parseCytocontrolPssResponse("ok 01\r")).toEqual({
      kind: "ok",
      raw: "ok 01",
      basicState: expect.objectContaining({
        raw: 1,
        rawHex: "01",
        busy: true,
        normalizedState: "running",
      }),
    });
  });

  it("parses rejected commands without treating the info code as state", () => {
    expect(parseCytocontrolPssResponse("er 32\r")).toEqual({
      kind: "error",
      raw: "er 32",
      infoCode: 0x32,
      infoCodeHex: "32",
    });
  });

  it("parses query labels and preserves the complete payload", () => {
    expect(parseCytocontrolPssResponse("it +37.0 +34.1\r")).toEqual({
      kind: "data",
      raw: "it +37.0 +34.1",
      label: "it",
      payload: "+37.0 +34.1",
    });
    expect(parseCytocontrolPssResponse("sd A325Bc9")).toEqual({
      kind: "data",
      raw: "sd A325Bc9",
      label: "sd",
      payload: "A325Bc9",
    });
  });

  it.each([
    "",
    "ok",
    "ok 1",
    "er GG",
    "ds 01\r\n",
    "ds 01\rer 02",
    "ds 状态",
  ])("rejects a malformed response line: %j", line => {
    expect(() => parseCytocontrolPssResponse(line)).toThrow();
  });
});

describe("CytoControl PSS basic-state mapping", () => {
  it.each([
    ["00", "ready"],
    ["01", "running"],
    ["02", "ready"],
    ["04", "warning"],
    ["05", "warning"],
    ["08", "failed"],
    ["0d", "failed"],
  ] as const)("maps state byte %s to %s", (wire, expected) => {
    expect(parseCytocontrolPssBasicState(wire).normalizedState).toBe(expected);
  });

  it("decodes all eight documented bits from a ch:ds response", () => {
    expect(parseCytocontrolPssDsResponse("ds ff\r")).toEqual({
      raw: 0xff,
      rawHex: "ff",
      busy: true,
      ready: true,
      warning: true,
      error: true,
      handlerOccupied: true,
      automaticGateOpen: true,
      doorOpen: true,
      transferStation1Occupied: true,
      normalizedState: "failed",
    });
  });

  it("requires exactly a ds label and a one-byte hexadecimal payload", () => {
    expect(() => parseCytocontrolPssDsResponse("bs 01\r")).toThrow(
      /ch:ds/,
    );
    expect(() => parseCytocontrolPssDsResponse("ds 0100\r")).toThrow(
      /two hexadecimal/,
    );
    expect(() => parseCytocontrolPssBasicState(256)).toThrow(/unsigned byte/);
  });
});

describe("CytoControl mutating-command retry boundary", () => {
  it("allows retry only when no command bytes were written", () => {
    expect(decideCytocontrolMutatingRetry(false)).toBe("safe-retry");
  });

  it("requires reconciliation after any command write", () => {
    expect(decideCytocontrolMutatingRetry(true)).toBe("reconcile-first");
  });
});
