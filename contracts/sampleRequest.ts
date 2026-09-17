export const SAMPLE_REQUEST_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const SAMPLE_REQUEST_STATUSES = [
  "draft",
  "reserved",
  "in_fulfillment",
  "fulfilled",
  "cancelled",
] as const;
export const SAMPLE_REQUEST_ITEM_STATUSES = [
  "pending",
  "reserved",
  "in_progress",
  "fulfilled",
  "cancelled",
] as const;
export const FULFILLMENT_TASK_STATUSES = [
  "ready",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type SampleRequestStatus = (typeof SAMPLE_REQUEST_STATUSES)[number];
export type FulfillmentTaskStatus = (typeof FULFILLMENT_TASK_STATUSES)[number];

export const roundRequestQuantity = (value: number) =>
  Math.round(value * 1000) / 1000;

export function getAvailableQuantity(onHand: number, activeReserved: number): number {
  return roundRequestQuantity(Math.max(0, onHand - activeReserved));
}

export function canCancelSampleRequest(status: SampleRequestStatus): boolean {
  return status === "draft" || status === "reserved" || status === "in_fulfillment";
}

export function canClaimFulfillmentTask(status: FulfillmentTaskStatus): boolean {
  return status === "ready";
}

export function canCompleteFulfillmentTask(status: FulfillmentTaskStatus): boolean {
  return status === "claimed" || status === "running";
}
