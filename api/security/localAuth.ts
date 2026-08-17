import { createHash, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOCKOUT_MS = 15 * 60 * 1000;

type AttemptState = {
  count: number;
  windowEndsAt: number;
  lockedUntil: number;
};

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function credentialsMatch(
  username: string,
  password: string,
  expectedUsername: string,
  expectedPassword: string,
): boolean {
  const usernameMatches = timingSafeEqual(
    digest(normalizeUsername(username)),
    digest(normalizeUsername(expectedUsername)),
  );
  const passwordMatches = timingSafeEqual(digest(password), digest(expectedPassword));
  return usernameMatches && passwordMatches;
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;

  constructor(
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    windowMs = DEFAULT_WINDOW_MS,
    lockoutMs = DEFAULT_LOCKOUT_MS,
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.lockoutMs = lockoutMs;
  }

  retryAfterMs(key: string, now = Date.now()): number {
    const state = this.attempts.get(key);
    if (!state) return 0;
    if (state.lockedUntil > now) return state.lockedUntil - now;
    if (state.windowEndsAt <= now) this.attempts.delete(key);
    return 0;
  }

  recordFailure(key: string, now = Date.now()): number {
    const existing = this.attempts.get(key);
    const state =
      !existing || existing.windowEndsAt <= now
        ? { count: 0, windowEndsAt: now + this.windowMs, lockedUntil: 0 }
        : existing;

    state.count += 1;
    if (state.count >= this.maxAttempts) state.lockedUntil = now + this.lockoutMs;
    this.attempts.set(key, state);
    return Math.max(0, state.lockedUntil - now);
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}

export const localLoginRateLimiter = new LoginRateLimiter();
