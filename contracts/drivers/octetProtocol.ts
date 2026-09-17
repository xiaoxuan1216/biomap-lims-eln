/**
 * Protocol primitives confirmed by the FortéBio Octet automation guide.
 *
 * The guide defines an ASCII, CRLF-terminated command/response protocol, but it
 * does not provide the command-specific switch names. This module deliberately
 * stays at the transport syntax level and must not be treated as a Run schema.
 */

export const OCTET_COMMANDS = [
  "Version",
  "Reset",
  "GetMethodInfo",
  "Run",
  "GetRunInfo",
  "Stop",
  "Status",
  "Present",
  "Resume",
  "Close",
  "Cleanup",
] as const;

export type OctetCommand = (typeof OCTET_COMMANDS)[number];

export type OctetWireStatus = "OK" | "Busy" | "Waiting" | "Error";
export type OctetNormalizedStatus = "ready" | "running" | "waiting" | "failed";

export interface OctetCommandParameter {
  /**
   * The switch token exactly as supplied by a version-matched vendor contract.
   * No prefix is added because the guide does not define the switch spelling.
   */
  name: string;
  value: string | number;
}

export interface ParsedOctetStatus {
  wireStatus: OctetWireStatus;
  normalizedStatus: OctetNormalizedStatus;
  detail: string | null;
  progressPercent: number | null;
}

const CRLF = "\r\n";
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const PARAMETER_NAME = /^(?=.*[A-Za-z0-9])[A-Za-z0-9-]+$/;

function assertPrintableAscii(value: string, label: string): void {
  if (!PRINTABLE_ASCII.test(value)) {
    throw new Error(`${label} must contain printable ASCII characters only`);
  }
}

function isOctetCommand(value: string): value is OctetCommand {
  return (OCTET_COMMANDS as readonly string[]).includes(value);
}

function serializeParameterValue(value: string | number): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Octet parameter numbers must be finite");
  }

  const serialized = String(value);
  if (serialized.length === 0) {
    throw new Error("Octet parameter values must not be empty");
  }
  assertPrintableAscii(serialized, "Octet parameter value");

  // The guide defines double quotes for values containing spaces, but does not
  // define an escaping rule for an embedded quote. Rejecting it avoids emitting
  // an ambiguous command or inventing a vendor-specific escape sequence.
  if (serialized.includes('"')) {
    throw new Error(
      "Octet parameter values containing double quotes are unsupported"
    );
  }

  return serialized.includes(" ") ? `"${serialized}"` : serialized;
}

/** Add the CRLF terminator required by the Octet ASCII line protocol. */
export function frameOctetAsciiLine(payload: string): string {
  if (payload.trim().length === 0) {
    throw new Error("Octet line payload must not be empty");
  }
  assertPrintableAscii(payload, "Octet line payload");
  return `${payload}${CRLF}`;
}

/**
 * Safely serialize a documented Octet command and caller-supplied switch/value
 * pairs. Command-specific switch definitions intentionally live elsewhere once
 * a complete, version-matched vendor specification is available.
 */
export function buildOctetCommand(
  command: OctetCommand,
  parameters: readonly OctetCommandParameter[] = []
): string {
  if (!isOctetCommand(command)) {
    throw new Error(`Unsupported Octet command: ${String(command)}`);
  }

  const tokens: string[] = [command];
  for (const parameter of parameters) {
    if (!PARAMETER_NAME.test(parameter.name)) {
      throw new Error(
        "Octet parameter names must contain only ASCII letters, digits, and hyphens, with at least one letter or digit"
      );
    }
    tokens.push(parameter.name, serializeParameterValue(parameter.value));
  }

  return frameOctetAsciiLine(tokens.join(" "));
}

/** Normalize the four status values explicitly listed in the vendor guide. */
export function normalizeOctetStatus(
  status: OctetWireStatus
): OctetNormalizedStatus {
  switch (status) {
    case "OK":
      return "ready";
    case "Busy":
      return "running";
    case "Waiting":
      return "waiting";
    case "Error":
      return "failed";
  }
}

function stripOptionalCrlf(line: string): string {
  const payload = line.endsWith(CRLF) ? line.slice(0, -CRLF.length) : line;
  if (
    payload.length === 0 ||
    payload.includes("\r") ||
    payload.includes("\n")
  ) {
    throw new Error("Expected exactly one Octet status line");
  }
  assertPrintableAscii(payload, "Octet status line");
  return payload;
}

function parseBusyProgress(detail: string | null): number | null {
  if (detail === null) return null;

  const match =
    /(?:^|[^0-9A-Za-z.])([+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*%/.exec(
      detail
    );
  if (!match) {
    if (detail.includes("%")) {
      throw new Error("Invalid Octet Busy progress percentage");
    }
    return null;
  }

  const progress = Number(match[1]);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error("Octet Busy progress must be between 0 and 100 percent");
  }
  return progress;
}

/**
 * Parse a status payload either before or after a line reader removes its CRLF.
 * `OK` means ready at the protocol level; deciding whether a prior run completed
 * requires orchestration history and is intentionally outside this pure parser.
 */
export function parseOctetStatus(line: string): ParsedOctetStatus {
  const payload = stripOptionalCrlf(line);
  const match = /^(OK|Busy|Waiting|Error)(?: +(.*))?$/.exec(payload);
  if (!match) {
    throw new Error(`Unrecognized Octet status line: ${payload}`);
  }

  const wireStatus = match[1] as OctetWireStatus;
  const detail = match[2]?.trim() || null;
  return {
    wireStatus,
    normalizedStatus: normalizeOctetStatus(wireStatus),
    detail,
    progressPercent: wireStatus === "Busy" ? parseBusyProgress(detail) : null,
  };
}
