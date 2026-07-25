import "server-only";

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

/** Test-only: clears all windows between cases. */
export function __resetRateLimitForTests(): void {
  globalThis.__fintrackRateLimit = new Map();
}
