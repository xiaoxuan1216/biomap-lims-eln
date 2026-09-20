import { describe, expect, it } from "vitest";
import {
  workflowRemovalDisposition,
  type WorkflowRemovalReferences,
} from "./workflowRouter";

const noReferences: WorkflowRemovalReferences = {
  cloningLayoutPlans: 0,
  experiments: 0,
  methodReleases: 0,
  labRuns: 0,
  labRunDrafts: 0,
  samplePlatePlans: 0,
};

describe("workflow removal safety", () => {
  it("allows physical deletion only when the whole workflow tree has no historical references", () => {
    expect(workflowRemovalDisposition(noReferences)).toBe("delete");
  });

  it.each([
    "cloningLayoutPlans",
    "experiments",
    "methodReleases",
    "labRuns",
    "labRunDrafts",
    "samplePlatePlans",
  ] as const)("archives when the tree has %s", (referenceType) => {
    expect(
      workflowRemovalDisposition({ ...noReferences, [referenceType]: 1 }),
    ).toBe("archive");
  });
});
