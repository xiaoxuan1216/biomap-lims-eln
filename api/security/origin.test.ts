import { describe, expect, it } from "vitest";
import { isTrustedOrigin } from "./origin";

describe("same-origin request validation", () => {
  it("accepts the configured public origin", () => {
    const request = new Request("http://internal:3000/api/trpc/sample.list", {
      headers: { origin: "https://lims.example.com" },
    });
    expect(isTrustedOrigin(request, "https://lims.example.com")).toBe(true);
  });

  it("rejects missing, foreign, and malformed origins", () => {
    expect(
      isTrustedOrigin(
        new Request("https://lims.example.com/api/trpc/x"),
        "https://lims.example.com",
      ),
    ).toBe(false);
    expect(
      isTrustedOrigin(
        new Request("https://lims.example.com/api/trpc/x", {
          headers: { origin: "https://evil.example" },
        }),
        "https://lims.example.com",
      ),
    ).toBe(false);
  });
});
