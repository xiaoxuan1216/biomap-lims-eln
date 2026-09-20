import { expect, it } from "vitest";
import { resolveSampleBatch } from "./sampleBatch";
it("preserves barcode order, removes duplicates and rejects partial or ambiguous batches", () => {
  const rows = [{ id: 1, sku: "S1" }, { id: 2, sku: "S2" }];
  expect(resolveSampleBatch("S2\nS1,S2", rows).samples.map(s => s.id)).toEqual([2, 1]);
  expect(resolveSampleBatch("S1 MISSING", rows)).toEqual({ samples: [], errors: ["MISSING"] });
  expect(resolveSampleBatch("S1", [...rows, { id: 3, sku: "S1" }]).samples).toEqual([]);
});
