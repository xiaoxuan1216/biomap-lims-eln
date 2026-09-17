import { describe, expect, it } from "vitest";
import {
  buildOctetCommand,
  frameOctetAsciiLine,
  normalizeOctetStatus,
  parseOctetStatus,
  type OctetCommand,
} from "./octetProtocol";

describe("Octet ASCII line framing", () => {
  it("appends the vendor-required CRLF exactly once", () => {
    expect(frameOctetAsciiLine("Status")).toBe("Status\r\n");
  });

  it.each(["", " ", "Status\n", "Status\r\n", "Status\r\nReset", "状态"])(
    "rejects an empty, multi-line, control-character, or non-ASCII payload: %j",
    payload => {
      expect(() => frameOctetAsciiLine(payload)).toThrow();
    }
  );
});

describe("Octet command serialization", () => {
  it("builds documented commands without inventing command-specific switches", () => {
    expect(buildOctetCommand("Version")).toBe("Version\r\n");
    expect(buildOctetCommand("Status")).toBe("Status\r\n");
    expect(buildOctetCommand("Run")).toBe("Run\r\n");
  });

  it("quotes caller-supplied values containing spaces and preserves Windows paths", () => {
    // `example-switch` exercises generic serialization only. It is not claimed
    // to be an Octet Run/GetMethodInfo switch in the incomplete vendor guide.
    expect(
      buildOctetCommand("GetMethodInfo", [
        { name: "example-switch", value: "C:\\Octet Methods\\HER 2.fmf" },
        { name: "repeat-1", value: 2 },
      ])
    ).toBe(
      'GetMethodInfo example-switch "C:\\Octet Methods\\HER 2.fmf" repeat-1 2\r\n'
    );
  });

  it.each(["method file", "method_name", "switch;Reset", "---", ""])(
    "rejects an unsafe parameter name: %j",
    name => {
      expect(() =>
        buildOctetCommand("GetMethodInfo", [{ name, value: "method.fmf" }])
      ).toThrow(/parameter names/);
    }
  );

  it.each(['C:\\Methods\\bad"name.fmf', "value\r\nReset", "中文方法.fmf", ""])(
    "rejects an ambiguous or non-ASCII parameter value: %j",
    value => {
      expect(() =>
        buildOctetCommand("GetMethodInfo", [{ name: "example-switch", value }])
      ).toThrow();
    }
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-finite numeric parameter: %s",
    value => {
      expect(() =>
        buildOctetCommand("GetMethodInfo", [{ name: "example-switch", value }])
      ).toThrow(/finite/);
    }
  );

  it("rejects unsupported command names at runtime", () => {
    expect(() => buildOctetCommand("Start" as OctetCommand)).toThrow(
      /Unsupported Octet command/
    );
  });
});

describe("Octet status parsing", () => {
  it("parses framed and unframed ready responses", () => {
    const expected = {
      wireStatus: "OK",
      normalizedStatus: "ready",
      detail: null,
      progressPercent: null,
    };
    expect(parseOctetStatus("OK")).toEqual(expected);
    expect(parseOctetStatus("OK\r\n")).toEqual(expected);
  });

  it("parses Busy detail and integer or decimal progress", () => {
    expect(parseOctetStatus("Busy acquiring (42% complete)\r\n")).toEqual({
      wireStatus: "Busy",
      normalizedStatus: "running",
      detail: "acquiring (42% complete)",
      progressPercent: 42,
    });
    expect(parseOctetStatus("Busy 7.5% complete").progressPercent).toBe(7.5);
    expect(parseOctetStatus("Busy 0% complete").progressPercent).toBe(0);
    expect(parseOctetStatus("Busy 100% complete").progressPercent).toBe(100);
    expect(parseOctetStatus("Busy running").progressPercent).toBeNull();
  });

  it("parses Waiting and Error details without treating them as progress", () => {
    expect(parseOctetStatus("Waiting new sensor tray installed")).toEqual({
      wireStatus: "Waiting",
      normalizedStatus: "waiting",
      detail: "new sensor tray installed",
      progressPercent: null,
    });
    expect(parseOctetStatus("Error invalid method 50%")).toEqual({
      wireStatus: "Error",
      normalizedStatus: "failed",
      detail: "invalid method 50%",
      progressPercent: null,
    });
  });

  it.each([
    "Busy 101% complete",
    "Busy -1% complete",
    "Busy 1e2% complete",
    "Busy percent=%",
  ])("rejects malformed Busy progress: %j", line => {
    expect(() => parseOctetStatus(line)).toThrow(/progress/);
  });

  it.each(["busy 10%", "Complete", "OK\n", "OK\r\nBusy", ""])(
    "rejects an undocumented or malformed status line: %j",
    line => {
      expect(() => parseOctetStatus(line)).toThrow();
    }
  );

  it("normalizes every documented wire status", () => {
    expect(normalizeOctetStatus("OK")).toBe("ready");
    expect(normalizeOctetStatus("Busy")).toBe("running");
    expect(normalizeOctetStatus("Waiting")).toBe("waiting");
    expect(normalizeOctetStatus("Error")).toBe("failed");
  });
});
