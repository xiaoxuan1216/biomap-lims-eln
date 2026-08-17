import { describe, expect, it } from "vitest";
import { credentialsMatch, LoginRateLimiter, normalizeUsername } from "./localAuth";

describe("native BioMap authentication", () => {
  it("normalizes account names without changing passwords", () => {
    expect(normalizeUsername("  Lab.Admin  ")).toBe("lab.admin");
    expect(credentialsMatch(" LAB.ADMIN ", "CaseSensitive!", "lab.admin", "CaseSensitive!")).toBe(true);
    expect(credentialsMatch("lab.admin", "casesensitive!", "lab.admin", "CaseSensitive!")).toBe(false);
  });

  it("rejects an incorrect account or password", () => {
    expect(credentialsMatch("other", "correct-password", "admin", "correct-password")).toBe(false);
    expect(credentialsMatch("admin", "wrong-password", "admin", "correct-password")).toBe(false);
  });

  it("locks repeated failures and clears successful sessions", () => {
    const limiter = new LoginRateLimiter(3, 1_000, 5_000);
    expect(limiter.recordFailure("client:admin", 100)).toBe(0);
    expect(limiter.recordFailure("client:admin", 200)).toBe(0);
    expect(limiter.recordFailure("client:admin", 300)).toBe(5_000);
    expect(limiter.retryAfterMs("client:admin", 1_300)).toBe(4_000);
    limiter.clear("client:admin");
    expect(limiter.retryAfterMs("client:admin", 1_300)).toBe(0);
  });

  it("resets failed attempts after the observation window", () => {
    const limiter = new LoginRateLimiter(2, 1_000, 5_000);
    limiter.recordFailure("client:admin", 100);
    expect(limiter.retryAfterMs("client:admin", 1_101)).toBe(0);
    expect(limiter.recordFailure("client:admin", 1_101)).toBe(0);
  });
});
