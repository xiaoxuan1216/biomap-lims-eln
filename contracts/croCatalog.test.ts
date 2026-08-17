import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import {
  CRO_CATALOGS,
  CRO_CATALOG_KEYS,
  initialCroRequirementData,
  validateCroRequirementData,
  type CroRequirementData,
} from "./croCatalog";

describe("CRO service catalogs", () => {
  it("provides five distinct provider catalogs with at least four services each", () => {
    expect(CRO_CATALOG_KEYS).toHaveLength(5);
    for (const catalog of Object.values(CRO_CATALOGS)) {
      expect(catalog.services.length).toBeGreaterThanOrEqual(4);
      expect(new Set(catalog.services.map(service => service.key)).size).toBe(
        catalog.services.length
      );
      for (const service of catalog.services) {
        expect(new Set(service.fields.map(field => field.key)).size).toBe(
          service.fields.length
        );
      }
    }
  });

  it("rejects missing required fields, invalid choices, and unknown fields", () => {
    const template = CRO_CATALOGS.genscript.services[0];
    const emptyErrors = validateCroRequirementData(
      template,
      initialCroRequirementData(template)
    );
    expect(emptyErrors.length).toBeGreaterThan(0);

    const invalid: CroRequirementData = {
      sequence: "ATGC",
      codonHost: "not-a-host",
      vector: "pcDNA3.1",
      cloningSites: "Gibson",
      plasmidScale: "1mg",
      endotoxin: "free",
      injectedField: "should be rejected",
    };
    const invalidErrors = validateCroRequirementData(template, invalid);
    expect(invalidErrors.some(message => message.includes("无效选项"))).toBe(
      true
    );
    expect(invalidErrors.some(message => message.includes("未知字段"))).toBe(
      true
    );
  });

  it("accepts a complete structured gene synthesis request", () => {
    const template = CRO_CATALOGS.genscript.services[0];
    expect(
      validateCroRequirementData(template, {
        sequence: "ATGCGT",
        codonHost: "cho",
        vector: "pcDNA3.1(+) ",
        cloningSites: "Gibson assembly",
        plasmidScale: "1mg",
        endotoxin: "free",
      })
    ).toEqual([]);
  });

  it("keeps every displayed catalog string in the English dictionary", () => {
    const displayed = new Set<string>();
    for (const catalog of Object.values(CRO_CATALOGS)) {
      displayed.add(catalog.sourceLabel);
      for (const service of catalog.services) {
        displayed.add(service.name);
        displayed.add(service.category);
        displayed.add(service.description);
        for (const field of service.fields) {
          displayed.add(field.label);
          if (field.unit) displayed.add(field.unit);
          if (field.placeholder) displayed.add(field.placeholder);
          if (field.help) displayed.add(field.help);
          for (const entry of field.options ?? []) displayed.add(entry.label);
        }
      }
    }
    expect([...displayed].filter(key => !(key in en))).toEqual([]);
  });
});
