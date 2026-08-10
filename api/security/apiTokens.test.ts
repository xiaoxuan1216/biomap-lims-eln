import { describe, expect, it } from "vitest";
import {
  authenticateApiToken,
  canWrite,
  parseApiTokens,
} from "./apiTokens";

const readToken = "read-secret-that-is-at-least-24-chars";
const writeToken = "write:secret:that:may:contain:colons";

describe("API token configuration", () => {
  it("parses explicit read and write scopes", () => {
    const configured = parseApiTokens(
      `reader:${readToken}:read,robot:${writeToken}:write`,
    );
    expect(configured).toHaveLength(2);
    expect(authenticateApiToken(configured, readToken)).toMatchObject({
      tokenName: "reader",
      scope: "read",
    });
    expect(canWrite(authenticateApiToken(configured, writeToken)!)).toBe(true);
  });

  it("rejects legacy, short, and unknown-scope entries", () => {
    const configured = parseApiTokens(
      `legacy:${readToken},short:tiny:read,bad:${readToken}:admin`,
    );
    expect(configured).toEqual([]);
  });

  it("does not authenticate an incorrect token", () => {
    const configured = parseApiTokens(`reader:${readToken}:read`);
    expect(authenticateApiToken(configured, `${readToken}-wrong`)).toBeNull();
  });
});
