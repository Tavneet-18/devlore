import { createHash, timingSafeEqual } from "node:crypto";

export { clientKey } from "./request-identity";

/**
 * Constant-time secret comparison.
 *
 * Both sides are hashed first so the compared buffers are always the same
 * length — timingSafeEqual throws on a length mismatch, and returning early on
 * "different lengths" is itself a timing oracle. Hashing first means the only
 * thing an attacker learns from timing is nothing.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * In-memory brute-force throttle for the admin login.
 *
 * Per-process and therefore per-instance: on Vercel each lambda has its own
 * memory, so this raises the cost of guessing rather than capping it globally.
 * That is an honest limitation of not having a shared store — the real
 * protection is the password's entropy plus the constant-time compare. If you
 * want a global limit, set UPSTASH_REDIS_REST_URL/TOKEN and the rate limiter
 * will use that instead for the public endpoints.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;

interface Attempt {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

// Deliberately not persisted across invocations.
const attempts = new Map<string, Attempt>();

// Bound the map so a spray of distinct IPs cannot grow it without limit.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  if (attempts.size <= MAX_TRACKED_KEYS) return;
  for (const [key, rec] of attempts) {
    if (rec.lockedUntil < now && now - rec.firstAt > WINDOW_MS) attempts.delete(key);
  }
  // If sweeping was not enough, drop the oldest half.
  if (attempts.size > MAX_TRACKED_KEYS) {
    const sorted = [...attempts.entries()].sort((a, b) => a[1].firstAt - b[1].firstAt);
    for (let i = 0; i < Math.floor(sorted.length / 2); i++) attempts.delete(sorted[i][0]);
  }
}

export interface ThrottleVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

/** Check whether a key may attempt a login, without recording an attempt. */
export function checkThrottle(key: string, now = Date.now()): ThrottleVerdict {
  const rec = attempts.get(key);
  if (!rec) return { allowed: true, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS };
  if (rec.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((rec.lockedUntil - now) / 1000),
      remaining: 0,
    };
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, MAX_ATTEMPTS - rec.count),
  };
}

/** Record a failed attempt. Locks the key once the budget is exhausted. */
export function recordFailure(key: string, now = Date.now()): ThrottleVerdict {
  sweep(now);
  const existing = attempts.get(key);

  // A window that has fully expired starts a fresh budget.
  const rec =
    existing && now - existing.firstAt <= WINDOW_MS
      ? existing
      : { count: 0, firstAt: now, lockedUntil: 0 };

  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = now + LOCK_MS;
  attempts.set(key, rec);

  return rec.lockedUntil > now
    ? { allowed: false, retryAfterSeconds: Math.ceil((rec.lockedUntil - now) / 1000), remaining: 0 }
    : { allowed: true, retryAfterSeconds: 0, remaining: Math.max(0, MAX_ATTEMPTS - rec.count) };
}

/** Clear a key's budget after a successful login. */
export function clearThrottle(key: string) {
  attempts.delete(key);
}
