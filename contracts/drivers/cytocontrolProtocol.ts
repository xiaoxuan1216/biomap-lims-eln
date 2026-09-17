/**
 * Pure protocol primitives for Thermo Fisher CytoControl V8+ PSS firmware.
 *
 * This module deliberately contains no serial-port I/O. The caller must own
 * the per-equipment lease and persist command intent before writing a
 * state-changing command to the device.
 */

export const CYTOCONTROL_CR = 0x0d;
export const CYTOCONTROL_STX = 0x02;
export const CYTOCONTROL_ETX = 0x03;

export type CytocontrolNormalizedState =
  | "ready"
  | "running"
  | "warning"
  | "failed";

export interface CytocontrolPssBasicState {
  raw: number;
  rawHex: string;
  /** Bit 0: a command is being processed. */
  busy: boolean;
  /** Bit 1: the last command was executed. */
  ready: boolean;
  /** Bit 2: the device has a warning. */
  warning: boolean;
  /** Bit 3: the device has an error. */
  error: boolean;
  /** Bit 4: the handler currently carries a container. */
  handlerOccupied: boolean;
  /** Bit 5: the automatic gate is open. */
  automaticGateOpen: boolean;
  /** Bit 6: the device door is open. */
  doorOpen: boolean;
  /** Bit 7: transfer station 1 is occupied. */
  transferStation1Occupied: boolean;
  normalizedState: CytocontrolNormalizedState;
}

export type ParsedCytocontrolPssResponse =
  | {
      kind: "ok";
      raw: string;
      basicState: CytocontrolPssBasicState;
    }
  | {
      kind: "error";
      raw: string;
      infoCode: number;
      infoCodeHex: string;
    }
  | {
      kind: "data";
      raw: string;
      label: string;
      payload: string | null;
    };

export type CytocontrolMutatingRetryDecision =
  | "safe-retry"
  | "reconcile-first";

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;
const PSS_COMMAND = /^(?:ch|ll|mv|rs|sb|se|st):[a-z][a-z0-9+-]*$/;
const PSS_PARAMETER = /^[\x21-\x7e]+$/;
const HEX_BYTE = /^[0-9a-f]{2}$/i;

function assertPrintableAscii(value: string, label: string): void {
  if (!PRINTABLE_ASCII.test(value)) {
    throw new Error(`${label} must contain printable ASCII characters only`);
  }
}

function buildPssPayload(
  command: string,
  parameters: readonly string[],
): string {
  const normalizedCommand = command.toLowerCase();
  if (!PSS_COMMAND.test(normalizedCommand)) {
    throw new Error(`Invalid CytoControl PSS command: ${command}`);
  }

  for (const parameter of parameters) {
    if (!PSS_PARAMETER.test(parameter)) {
      throw new Error(
        "CytoControl PSS parameters must be non-empty printable ASCII tokens without spaces",
      );
    }
  }

  return [normalizedCommand, ...parameters].join(" ");
}

/** Build the documented lowercase, carriage-return-terminated PSS command. */
export function frameCytocontrolPssTerminalCommand(
  command: string,
  parameters: readonly string[] = [],
): string {
  return `${buildPssPayload(command, parameters)}\r`;
}

function asciiBytes(value: string, label: string): Uint8Array {
  assertPrintableAscii(value, label);
  return Uint8Array.from(value, character => character.charCodeAt(0));
}

/** XOR all bytes, as required by the PSS telegram-structure mode. */
export function calculateCytocontrolPssXor(
  payload: string | Uint8Array,
): number {
  const bytes =
    typeof payload === "string"
      ? asciiBytes(payload, "CytoControl PSS telegram payload")
      : payload;
  let checksum = 0;
  for (const byte of bytes) checksum ^= byte;
  return checksum;
}

/**
 * Frame a PSS payload as STX + payload + semicolon + XOR byte + ETX.
 * The payload must not include the terminal-mode carriage return.
 */
export function frameCytocontrolPssTelegram(payload: string): Uint8Array {
  const payloadBytes = asciiBytes(
    payload,
    "CytoControl PSS telegram payload",
  );
  if (payload.includes("\r") || payload.includes("\n")) {
    throw new Error(
      "CytoControl PSS telegram payload must not include a line terminator",
    );
  }

  const checksum = calculateCytocontrolPssXor(payloadBytes);
  return Uint8Array.from([
    CYTOCONTROL_STX,
    ...payloadBytes,
    0x3b,
    checksum,
    CYTOCONTROL_ETX,
  ]);
}

/** Build and frame a documented PSS command in telegram-structure mode. */
export function frameCytocontrolPssTelegramCommand(
  command: string,
  parameters: readonly string[] = [],
): Uint8Array {
  return frameCytocontrolPssTelegram(buildPssPayload(command, parameters));
}

/**
 * Incubator firmware uses inverse XOR: start with 0xFF and XOR every byte
 * before the checksum and carriage return.
 */
export function calculateCytocontrolIncubatorInverseXor(
  payloadBeforeChecksum: string | Uint8Array,
): number {
  const bytes =
    typeof payloadBeforeChecksum === "string"
      ? asciiBytes(
          payloadBeforeChecksum,
          "CytoControl incubator telegram payload",
        )
      : payloadBeforeChecksum;
  let checksum = 0xff;
  for (const byte of bytes) checksum ^= byte;
  return checksum;
}

/** Format a wire checksum as the documented two lowercase hex characters. */
export function formatCytocontrolChecksum(checksum: number): string {
  if (!Number.isInteger(checksum) || checksum < 0 || checksum > 0xff) {
    throw new Error("CytoControl checksum must be an unsigned byte");
  }
  return checksum.toString(16).padStart(2, "0");
}

function stripOptionalCarriageReturn(line: string): string {
  const payload = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (
    payload.length === 0 ||
    payload.includes("\r") ||
    payload.includes("\n")
  ) {
    throw new Error("Expected exactly one CytoControl PSS response line");
  }
  assertPrintableAscii(payload, "CytoControl PSS response");
  return payload;
}

function parseHexByte(value: string, label: string): number {
  if (!HEX_BYTE.test(value)) {
    throw new Error(`${label} must be exactly two hexadecimal characters`);
  }
  return Number.parseInt(value, 16);
}

/** Normalize the continuously updated PSS basic-state register. */
export function parseCytocontrolPssBasicState(
  value: string | number,
): CytocontrolPssBasicState {
  const raw =
    typeof value === "number"
      ? value
      : parseHexByte(value, "CytoControl PSS basic state");

  if (!Number.isInteger(raw) || raw < 0 || raw > 0xff) {
    throw new Error("CytoControl PSS basic state must be an unsigned byte");
  }

  const busy = (raw & 0x01) !== 0;
  const ready = (raw & 0x02) !== 0;
  const warning = (raw & 0x04) !== 0;
  const error = (raw & 0x08) !== 0;

  const normalizedState: CytocontrolNormalizedState = error
    ? "failed"
    : warning
      ? "warning"
      : busy
        ? "running"
        : "ready";

  return {
    raw,
    rawHex: formatCytocontrolChecksum(raw),
    busy,
    ready,
    warning,
    error,
    handlerOccupied: (raw & 0x10) !== 0,
    automaticGateOpen: (raw & 0x20) !== 0,
    doorOpen: (raw & 0x40) !== 0,
    transferStation1Occupied: (raw & 0x80) !== 0,
    normalizedState,
  };
}

/** Parse the `ok`, `er`, and label/payload PSS terminal responses. */
export function parseCytocontrolPssResponse(
  line: string,
): ParsedCytocontrolPssResponse {
  const raw = stripOptionalCarriageReturn(line);

  const okMatch = /^ok ([0-9a-f]{2})$/i.exec(raw);
  if (okMatch) {
    return {
      kind: "ok",
      raw,
      basicState: parseCytocontrolPssBasicState(okMatch[1]),
    };
  }

  const errorMatch = /^er ([0-9a-f]{2})$/i.exec(raw);
  if (errorMatch) {
    return {
      kind: "error",
      raw,
      infoCode: Number.parseInt(errorMatch[1], 16),
      infoCodeHex: errorMatch[1].toLowerCase(),
    };
  }

  // Prevent malformed status responses from silently becoming generic data.
  if (raw === "ok" || raw.startsWith("ok ") || raw === "er" || raw.startsWith("er ")) {
    throw new Error(`Malformed CytoControl PSS status response: ${raw}`);
  }

  const dataMatch = /^([A-Za-z][A-Za-z0-9]*)(?: (.+))?$/.exec(raw);
  if (!dataMatch) {
    throw new Error(`Unrecognized CytoControl PSS response: ${raw}`);
  }

  return {
    kind: "data",
    raw,
    label: dataMatch[1],
    payload: dataMatch[2] ?? null,
  };
}

/** Parse `ch:ds` data without clearing the device's Ready bit. */
export function parseCytocontrolPssDsResponse(
  line: string,
): CytocontrolPssBasicState {
  const parsed = parseCytocontrolPssResponse(line);
  if (parsed.kind !== "data" || parsed.label !== "ds" || !parsed.payload) {
    throw new Error("Expected a CytoControl ch:ds response");
  }
  return parseCytocontrolPssBasicState(parsed.payload);
}

/**
 * A state-changing command is safe to retry only while no bytes were written.
 * Once written, a lost response leaves execution uncertain and requires state,
 * storage-position, transfer-station, and barcode reconciliation first.
 */
export function decideCytocontrolMutatingRetry(
  commandWritten: boolean,
): CytocontrolMutatingRetryDecision {
  return commandWritten ? "reconcile-first" : "safe-retry";
}
