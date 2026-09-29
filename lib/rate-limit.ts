import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting for the two open write endpoints: event submission and the
 * AI assist.
 *
 * Uses Upstash when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are
 * set. That is the only variant that is correct across more than one serverless
 * instance, because the limit is then shared.
 *
 * Without them it falls back to an in-process Map. That is fine for local
 * development and a single node, and it is NOT a global limit on Vercel — every
 * lambda keeps its own counters, so the effective ceiling is the per-instance
 * limit multiplied by the number of warm instances. `approximate` on the
 * result reports which mode is active so callers can log it.
 */

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
  /** True when the in-process fallback is in use. */
  approximate: boolean;
}

function hasUpstash(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** One limiter per policy, built on first use. */
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowSeconds: number): Ratelimit | null {
  if (!hasUpstash()) return null;

  const key = `${limit}:${windowSeconds}`;
  const cached = limiters.get(key);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    }),
    limiter: Ratelimit.fixedWindow(limit, `${windowSeconds} s`),
    prefix: "devlore:rl",
  });
  limiters.set(key, limiter);
  return limiter;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      // Bound the map. Sweeping expired keys is cheap; a full resort on every
      // insert would not be.
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) {
        const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
        for (let i = 0; i < Math.floor(oldest.length / 4); i++) buckets.delete(oldest[i][0]);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      resetSeconds: windowSeconds,
      approximate: true,
    };
  }

  existing.count += 1;
  return {
    success: existing.count <= limit,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    approximate: true,
  };
}

export async function rateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number }
): Promise<RateLimitResult> {
  const limiter = getLimiter(opts.limit, opts.windowSeconds);

  if (!limiter) return memoryLimit(key, opts.limit, opts.windowSeconds);

  try {
    const { success, limit, remaining, reset } = await limiter.limit(key);
    return {
      success,
      limit,
      remaining,
      resetSeconds: Math.max(1, Math.ceil(reset / 1000)),
      approximate: false,
    };
  } catch {
    // A rate-limit store outage must not take the endpoint down with it. Fail
    // open and say so, rather than turning a Redis blip into an outage.
    return { success: true, limit: opts.limit, remaining: opts.limit, resetSeconds: 0, approximate: true };
  }
}
