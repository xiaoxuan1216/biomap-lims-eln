import { describe, expect, it } from "vitest";
import { InventoryError, validateInventoryChange } from "./inventoryService";

describe("inventory invariants", () => {
  it("rounds changes to the stored precision", () => {
    expect(validateInventoryChange(1.23456, "adjust")).toBe(1.235);
  });

  it("rejects a negative restock", () => {
    expect(() => validateInventoryChange(-1, "restock")).toThrow(InventoryError);
  });

  it("rejects a positive consumption", () => {
    expect(() => validateInventoryChange(1, "consume")).toThrow(
      "消耗或废弃数量必须为负数",
    );
  });

  it("allows signed adjustments", () => {
    expect(validateInventoryChange(-2, "adjust")).toBe(-2);
    expect(validateInventoryChange(2, "adjust")).toBe(2);
  });
});
