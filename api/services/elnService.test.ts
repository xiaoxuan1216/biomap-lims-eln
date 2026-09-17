import { describe, expect, it } from "vitest";
import {
  ElnError,
  hashSnapshot,
  normalizeElnContent,
} from "./elnService";

describe("ELN immutable snapshot helpers", () => {
  it("normalizes valid block arrays", () => {
    expect(normalizeElnContent(' [ { "type": "text", "text": "结果" } ] '))
      .toBe('[{"type":"text","text":"结果"}]');
  });

  it("rejects non-array and malformed content", () => {
    for (const content of ['{"type":"text"}', "not json"]) {
      expect(() => normalizeElnContent(content)).toThrow(ElnError);
    }
  });

  it("rejects content larger than the ELN limit", () => {
    const oversized = JSON.stringify(["x".repeat(2 * 1024 * 1024)]);
    expect(() => normalizeElnContent(oversized)).toThrow("不能超过 2 MB");
  });

  it("produces deterministic SHA-256 hashes", () => {
    expect(hashSnapshot('{"revision":1}')).toBe(
      "d8560b7658c792bdded69837b055e2ed54708be6123b7bb4cc9fadf261ea091f",
    );
    expect(hashSnapshot('{"revision":2}')).not.toBe(hashSnapshot('{"revision":1}'));
  });
});
