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
      "消耗、废弃或转出数量必须为负数",
    );
  });

  it("enforces external custody transfer directions", () => {
    expect(() => validateInventoryChange(1, "transfer_out")).toThrow(InventoryError);
    expect(() => validateInventoryChange(-1, "transfer_in")).toThrow(InventoryError);
    expect(validateInventoryChange(-2.5, "transfer_out")).toBe(-2.5);
    expect(validateInventoryChange(1.25, "transfer_in")).toBe(1.25);
  });

  it("allows signed adjustments", () => {
    expect(validateInventoryChange(-2, "adjust")).toBe(-2);
    expect(validateInventoryChange(2, "adjust")).toBe(2);
  });
});
