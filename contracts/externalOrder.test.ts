import { describe, expect, it } from "vitest";
import { externalOrderStage } from "./externalOrder";

describe("external order aggregate stage", () => {
  it("does not complete an order when files are delivered but not accepted", () => {
    expect(
      externalOrderStage({
        commercialStatus: "ordered",
        executionStatus: "delivered",
        qualityStatus: "pending_review",
      }),
    ).toMatchObject({ label: "待验收", progress: 90 });
  });

  it("completes only after quality acceptance", () => {
    expect(
      externalOrderStage({
        commercialStatus: "ordered",
        executionStatus: "delivered",
        qualityStatus: "accepted",
      }),
    ).toMatchObject({ label: "已完成", progress: 100 });
  });

  it("cancellation takes precedence over execution progress", () => {
    expect(
      externalOrderStage({
        commercialStatus: "cancelled",
        executionStatus: "in_progress",
        qualityStatus: "not_ready",
      }),
    ).toMatchObject({ label: "已取消", progress: 0 });
  });
});
