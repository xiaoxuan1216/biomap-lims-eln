export const HAMILTON_UNIFIED_STATES = [
  "ready",
  "preparing",
  "starting",
  "running",
  "pausing",
  "paused",
  "cancelling",
  "finalizing",
  "succeeded",
  "cancelled",
  "failed",
  "unknown",
] as const;

export type HamiltonUnifiedState = (typeof HAMILTON_UNIFIED_STATES)[number];
export type HamiltonStateSource = "run-control" | "executor";

export interface HamiltonStateInput {
  source: HamiltonStateSource;
  state: string | null | undefined;
  /**
   * Run Control: McStateInfo name. Executor: AbortState name or a non-empty
   * termination error marker.
   */
  stateInfo?: string | null;
}

export type HamiltonStartRetryDecision =
  | "safe-retry"
  | "reconcile"
  | "never-auto-retry";

export interface HamiltonStartEvidence {
  /** True once the start call has been dispatched to Hamilton. */
  startRequested: boolean;
  /** True once a Hamilton event or queried state proves execution started. */
  startConfirmed: boolean;
}

const COMPACT_GUID_PATTERN = /^[0-9a-f]{32}$/i;
const DASHED_GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Converts a regular GUID into Hamilton's documented 32-character run id.
 * The normalized value is lowercase hexadecimal with no braces or hyphens.
 */
export function normalizeHamiltonRunGuid(value: string): string {
  const trimmed = value.trim();
  const unwrapped =
    trimmed.startsWith("{") && trimmed.endsWith("}")
      ? trimmed.slice(1, -1)
      : trimmed;

  if (
    !COMPACT_GUID_PATTERN.test(unwrapped) &&
    !DASHED_GUID_PATTERN.test(unwrapped)
  ) {
    throw new Error(
      "Hamilton run GUID must be a 32-character hexadecimal GUID, optionally in canonical dashed form",
    );
  }

  return unwrapped.replace(/-/g, "").toLowerCase();
}

const normalizeToken = (value: string | null | undefined): string =>
  (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();

function mapRunControlState(
  state: string | null | undefined,
  stateInfo: string | null | undefined,
): HamiltonUnifiedState {
  const normalizedState = normalizeToken(state);
  const normalizedInfo = normalizeToken(stateInfo);

  // McStateInfo resolves mcrsIdle, which is used for both ready and terminal
  // outcomes. Check it before the coarse run state.
  switch (normalizedInfo) {
    case "mcsiparsingcomplete":
    case "parsingcomplete":
      return "ready";
    case "mcsiparsingfailedtocomplete":
    case "parsingfailedtocomplete":
    case "mcsiexecutionfailedtocomplete":
    case "executionfailedtocomplete":
      return "failed";
    case "mcsiexecutioncomplete":
    case "executioncomplete":
      return "succeeded";
    case "mcsiexecutionaborted":
    case "executionaborted":
      return "cancelled";
  }

  switch (normalizedState) {
    case "mcrsinitialized":
    case "initialized":
    case "mcrsscheduled":
    case "scheduled":
      return "ready";
    case "mcrsparsing":
    case "parsing":
      return "preparing";
    case "mcrsrunning":
    case "running":
      return "running";
    case "mcrspausing":
    case "pausing":
      return "pausing";
    case "mcrspaused":
    case "paused":
      return "paused";
    default:
      // mcrsBusy is shared by start, resume, abort and termination. mcrsIdle
      // is also ambiguous without McStateInfo, so guessing would be unsafe.
      return "unknown";
  }
}

function mapExecutorState(
  state: string | null | undefined,
  stateInfo: string | null | undefined,
): HamiltonUnifiedState {
  const normalizedState = normalizeToken(state);
  const normalizedInfo = normalizeToken(stateInfo);

  if (normalizedState === "aborted") {
    if (normalizedInfo === "abortedbyuser") return "cancelled";
    if (normalizedInfo === "runfailedtocomplete") return "failed";
    return "unknown";
  }

  switch (normalizedState) {
    case "initialized":
      return "ready";
    case "starting":
      return "starting";
    case "running":
      return "running";
    case "pausing":
      return "pausing";
    case "paused":
      return "paused";
    case "aborting":
      return "cancelling";
    case "terminating":
      return "finalizing";
    case "processed":
      return "succeeded";
    case "terminated":
      // Terminated(pErrorInfo) can carry an error. Without one, the document
      // still does not identify this state as normal completion (Processed).
      return normalizedInfo ? "failed" : "unknown";
    default:
      return "unknown";
  }
}

/** Maps the documented Run Control and Executor states into BioMap states. */
export function mapHamiltonState({
  source,
  state,
  stateInfo,
}: HamiltonStateInput): HamiltonUnifiedState {
  return source === "run-control"
    ? mapRunControlState(state, stateInfo)
    : mapExecutorState(state, stateInfo);
}

/**
 * Returns the only safe automatic action around Hamilton's single-start
 * boundary. A dispatched but unconfirmed start must be reconciled first.
 */
export function decideHamiltonStartRetry({
  startRequested,
  startConfirmed,
}: HamiltonStartEvidence): HamiltonStartRetryDecision {
  if (startConfirmed) return "never-auto-retry";
  return startRequested ? "reconcile" : "safe-retry";
}
