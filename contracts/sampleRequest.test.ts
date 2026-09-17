import { describe, expect, it } from "vitest";
import {
  canCancelSampleRequest,
  canClaimFulfillmentTask,
  canCompleteFulfillmentTask,
  getAvailableQuantity,
} from "./sampleRequest";

describe("sample request domain rules", () => {
  it("subtracts active reservations without returning a negative availability", () => {
    expect(getAvailableQuantity(10, 2.125)).toBe(7.875);
    expect(getAvailableQuantity(1, 2)).toBe(0);
  });

  it("only permits cancellation before fulfillment finishes", () => {
    expect(canCancelSampleRequest("draft")).toBe(true);
    expect(canCancelSampleRequest("in_fulfillment")).toBe(true);
    expect(canCancelSampleRequest("fulfilled")).toBe(false);
    expect(canCancelSampleRequest("cancelled")).toBe(false);
  });

  it("requires a task to be claimed before completion", () => {
    expect(canClaimFulfillmentTask("ready")).toBe(true);
    expect(canClaimFulfillmentTask("claimed")).toBe(false);
    expect(canCompleteFulfillmentTask("ready")).toBe(false);
    expect(canCompleteFulfillmentTask("claimed")).toBe(true);
    expect(canCompleteFulfillmentTask("running")).toBe(true);
  });
});
