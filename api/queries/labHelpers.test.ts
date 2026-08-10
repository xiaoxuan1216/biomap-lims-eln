import { describe, expect, it } from "vitest";
import {
  hashActivityPayload,
  verifyAuditChain,
  type ActivityHashPayload,
} from "./labHelpers";

function makeRecord(
  id: number,
  previousHash: string | null,
  createdAt: Date,
) {
  const payload: ActivityHashPayload = {
    previousHash,
    createdAt: createdAt.toISOString(),
    userId: 1,
    userName: "Reviewer",
    source: "web",
    action: "updated",
    entityType: "experiment",
    entityId: 7,
    entityName: "EXP-0007",
    detail: null,
    beforeJson: null,
    afterJson: '{"revision":2}',
    reason: "correction",
  };
  return { id, ...payload, createdAt, hash: hashActivityPayload(payload) };
}

describe("audit hash chain", () => {
  it("accepts a valid linear chain", () => {
    const first = makeRecord(1, null, new Date("2026-08-06T10:00:00.123Z"));
    const second = makeRecord(2, first.hash, new Date("2026-08-06T10:00:01.456Z"));
    expect(verifyAuditChain([first, second])).toMatchObject({
      valid: true,
      checked: 2,
      lastHash: second.hash,
    });
  });

  it("detects modified content and broken links", () => {
    const first = makeRecord(1, null, new Date("2026-08-06T10:00:00.123Z"));
    const second = makeRecord(2, first.hash, new Date("2026-08-06T10:00:01.456Z"));
    expect(verifyAuditChain([{ ...first, reason: "tampered" }, second])).toMatchObject({
      valid: false,
      brokenAtId: 1,
    });
    expect(verifyAuditChain([first, { ...second, previousHash: "bad" }])).toMatchObject({
      valid: false,
      brokenAtId: 2,
    });
  });
});
