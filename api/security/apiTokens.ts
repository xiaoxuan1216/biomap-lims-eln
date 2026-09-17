import { createHash, timingSafeEqual } from "node:crypto";

export type ApiScope = "read" | "write";

export type ApiTokenConfig = {
  name: string;
  tokenHash: Buffer;
  scope: ApiScope;
};

export type ApiTokenIdentity = {
  tokenName: string;
  scope: ApiScope;
  fingerprint: string;
};

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/**
 * Format: name:secret:read or name:secret:write (comma-separated).
 * Malformed entries are ignored so a configuration typo fails closed.
 */
export function parseApiTokens(value: string): ApiTokenConfig[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const firstSeparator = entry.indexOf(":");
      const lastSeparator = entry.lastIndexOf(":");
      if (firstSeparator <= 0 || lastSeparator <= firstSeparator + 1) return [];

      const name = entry.slice(0, firstSeparator).trim();
      const token = entry.slice(firstSeparator + 1, lastSeparator).trim();
      const scope = entry.slice(lastSeparator + 1).trim();
      if (!name || token.length < 24 || (scope !== "read" && scope !== "write")) {
        return [];
      }
      return [{ name, tokenHash: hashToken(token), scope }];
    });
}

export function authenticateApiToken(
  configuredTokens: ApiTokenConfig[],
  candidate: string,
): ApiTokenIdentity | null {
  if (!candidate) return null;
  const candidateHash = hashToken(candidate);
  for (const configured of configuredTokens) {
    if (timingSafeEqual(configured.tokenHash, candidateHash)) {
      return {
        tokenName: configured.name,
        scope: configured.scope,
        fingerprint: candidateHash.subarray(0, 8).toString("hex"),
      };
    }
  }
  return null;
}

export function canWrite(identity: ApiTokenIdentity): boolean {
  return identity.scope === "write";
}
