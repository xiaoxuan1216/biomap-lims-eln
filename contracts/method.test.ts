import { describe, expect, it } from "vitest";
import { assessMethodEquipment, methodNodeSpecSchema, methodParameterIssues, methodPublicationIssues, parseMethodSpec } from "./method";

describe("published method execution constraints", () => {
  const rule = methodNodeSpecSchema.parse({ equipmentIds: [12], qualification: "Sanger method qualification Q-12", manualAllowed: true });
  it("never qualifies an arbitrary available instrument, including legacy bindings", () => {
    expect(assessMethodEquipment({ templateKey: "e_seq" }, { id: 7, status: "available" }, rule, "simulation").compatible).toBe(false);
    expect(assessMethodEquipment({ templateKey: "e_seq" }, { id: 12, status: "available" }, undefined, "simulation").compatible).toBe(false);
    expect(assessMethodEquipment({ templateKey: "e_seq" }, { id: 12, status: "available" }, rule, "simulation").compatible).toBe(true);
  });
  it("distinguishes method qualification from availability and automation", () => {
    expect(assessMethodEquipment({ templateKey: "e_seq" }, { id: 12, status: "maintenance" }, rule, "manual").compatible).toBe(false);
    expect(assessMethodEquipment({ templateKey: "e_seq" }, { id: 12, status: "available" }, rule, "edge").compatible).toBe(false);
    expect(assessMethodEquipment({ templateKey: "e_seq" }, { id: 12, status: "available" }, rule, "manual").compatible).toBe(true);
  });
  it("rejects fixed, unknown, and out of range changes", () => {
    const spec = methodNodeSpecSchema.parse({ parameters: { volume: { adjustable: true, min: 10, max: 20 } } });
    expect(methodParameterIssues({ cycles: 40, volume: 10 }, { cycles: 41, volume: 30, hidden: true }, spec)).toHaveLength(3);
    expect(methodParameterIssues({ cycles: 40, volume: 10 }, { cycles: 40, volume: 20 }, spec)).toEqual([]);
  });
  it("does not treat legacy methods or corrupt policies as approved", () => {
    const spec = parseMethodSpec(null);
    expect(methodPublicationIssues([{ nodeKey: "n1", type: "equipment", templateKey: "e_seq", label: "Seq" }], [], spec)).toHaveLength(2);
    expect(() => parseMethodSpec('{"maxSamples":0}')).toThrow();
  });
});
