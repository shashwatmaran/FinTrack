import "server-only";

import { RedisUnavailableError, isRedisConfigured, pipeline } from "./redis";

/**
 * Fixed-window rate limiter, in process memory.
 *
 * This protects the two unauthenticated endpoints — signup and sign-in — from
 * credential stuffing and from bcrypt-driven resource exhaustion (each attempt
 * costs a deliberate ~100ms of CPU, so a few hundred concurrent attempts will
 * saturate a server long before the database notices).
 *
 * The counters live per process, which means N instances allow N times the
 * limit. That is a real limitation, not an oversight: it still stops the
 * single-source floods that make up the bulk of this traffic, and it needs no
 * extra infrastructure. Move the counters to Redis (or Vercel KV) when the app
 * runs on more than one instance and the ceiling has to be exact.
 */
interface Window {
  count: number;
  resetAt: number;
}

declare global {
  var __fintrackRateLimit: Map<string, Window> | undefined;
}

function store(): Map<string, Window> {
  globalThis.__fintrackRateLimit ??= new Map();
  return globalThis.__fintrackRateLimit;
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets — the value for the Retry-After header. */
  retryAfter: number;
}

/** Sweeps expired windows so a flood of unique keys can't grow the map forever. */
function evictExpired(now: number) {
  const map = store();
  if (map.size < 5000) return;
  for (const [key, window] of map) {
    if (window.resetAt <= now) map.delete(key);
  }
}

export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  evictExpired(now);

  const map = store();
  const existing = map.get(key);

  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { ok: true, remaining: rule.limit - 1, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  return existing.count > rule.limit
    ? { ok: false, remaining: 0, retryAfter }
    : { ok: true, remaining: rule.limit - existing.count, retryAfter: 0 };
}

/**
 * Best-effort client address. Behind Vercel the left-most `x-forwarded-for`
 * entry is the real client; the header is spoofable when the app is exposed
 * directly, so this is a throttle, not an authorization boundary.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export const AUTH_RATE_LIMIT: RateLimitRule = { limit: 10, windowMs: 60_000 };
export const SIGNUP_RATE_LIMIT: RateLimitRule = { limit: 5, windowMs: 15 * 60_000 };

/**
 * Rate limits a request by caller address.
 *
 * Local requests carry no `x-forwarded-for`, so `clientIp` returns "unknown"
 * and every caller on the machine — browser tabs, test scripts, a second
 * developer — lands in one shared bucket. In development that reliably locks
 * you out of your own app, which is the opposite of the intent, so the check is
 * skipped there.
 *
 * In production it is *not* skipped: failing open on a missing header would let
 * anyone bypass the limit by stripping it. Vercel always sets the header, so an
 * "unknown" address in production means the deployment is behind something that
 * doesn't — worth a loud warning, not a silent exemption.
 */
export async function checkRequestRateLimit(
  request: Request,
  prefix: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const ip = clientIp(request);

  if (ip === "unknown") {
    if (process.env.NODE_ENV === "development") {
      return { ok: true, remaining: rule.limit, retryAfter: 0 };
    }
    console.warn(
      "[fintrack] rate limiting an 'unknown' client address — is the proxy setting x-forwarded-for?"
    );
  }

  const key = `${prefix}:${ip}`;

  if (isRedisConfigured()) {
    try {
      return await checkSharedRateLimit(key, rule);
    } catch (error) {
      /**
       * Fall back rather than fail either way.
       *
       * Failing closed would lock every user out of sign-in whenever Redis
       * hiccups — turning a dependency outage into a total outage. Failing
       * fully open would drop the protection entirely. The in-process counter
       * is weaker but still stops a single-source flood, which is the traffic
       * this exists for.
       */
      console.warn(
        "[fintrack] shared rate limit unavailable, using per-process counters:",
        error instanceof RedisUnavailableError ? error.message : error
      );
    }
  }

  return checkRateLimit(key, rule);
}

/**
 * Fixed window in Redis, in one round trip.
 *
 * `EXPIRE ... NX` sets the TTL only when the key has none, so the window is
 * anchored to the first request in it. Refreshing the TTL on every request
 * would let a steady stream of traffic hold the key alive forever and never
 * reset the count.
 */
async function checkSharedRateLimit(
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const seconds = Math.ceil(rule.windowMs / 1000);
  const [countRaw, , ttlRaw] = await pipeline([
    ["INCR", key],
    ["EXPIRE", key, seconds, "NX"],
    ["TTL", key],
  ]);

  const count = Number(countRaw);
  if (!Number.isFinite(count)) throw new RedisUnavailableError("INCR did not return a number");

  const ttl = Number(ttlRaw);
  // -1 means no TTL was set, which would strand the key; treat it as a full window.
  const retryAfter = Number.isFinite(ttl) && ttl > 0 ? ttl : seconds;

  return count > rule.limit
    ? { ok: false, remaining: 0, retryAfter }
    : { ok: true, remaining: rule.limit - count, retryAfter: 0 };
}

/** Test-only: clears all windows between cases. */
export function __resetRateLimitForTests(): void {
  globalThis.__fintrackRateLimit = new Map();
}
