import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  AUTH_RATE_LIMIT,
  SIGNUP_RATE_LIMIT,
  __resetRateLimitForTests,
  checkRateLimit,
  clientIp,
} from "@/lib/server/rate-limit";

beforeEach(() => {
  __resetRateLimitForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

const RULE = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    for (let i = 0; i < RULE.limit; i++) {
      expect(checkRateLimit("k", RULE).ok, `request ${i + 1}`).toBe(true);
    }
  });

  it("rejects the request after the limit", () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit("k", RULE);
    const blocked = checkRateLimit("k", RULE);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("counts down remaining accurately", () => {
    expect(checkRateLimit("k", RULE).remaining).toBe(2);
    expect(checkRateLimit("k", RULE).remaining).toBe(1);
    expect(checkRateLimit("k", RULE).remaining).toBe(0);
  });

  it("keeps separate counters per key", () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit("a", RULE);
    expect(checkRateLimit("a", RULE).ok).toBe(false);
    // A different caller must be unaffected by the first one's flood.
    expect(checkRateLimit("b", RULE).ok).toBe(true);
  });

  it("reports a positive Retry-After only when blocked", () => {
    expect(checkRateLimit("k", RULE).retryAfter).toBe(0);
    for (let i = 0; i < RULE.limit; i++) checkRateLimit("k", RULE);
    expect(checkRateLimit("k", RULE).retryAfter).toBeGreaterThan(0);
  });

  it("allows again once the window expires", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-25T12:00:00Z"));
    for (let i = 0; i < RULE.limit; i++) checkRateLimit("k", RULE);
    expect(checkRateLimit("k", RULE).ok).toBe(false);

    vi.setSystemTime(new Date("2026-07-25T12:01:01Z")); // past windowMs
    expect(checkRateLimit("k", RULE).ok).toBe(true);
  });

  it("stays blocked for the whole window, not just one call", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-25T12:00:00Z"));
    for (let i = 0; i < RULE.limit; i++) checkRateLimit("k", RULE);

    vi.setSystemTime(new Date("2026-07-25T12:00:30Z")); // still inside the window
    expect(checkRateLimit("k", RULE).ok).toBe(false);
  });

  it("uses a stricter rule for signup than for sign-in", () => {
    // Account creation is rarer and more costly than a retry of a typo'd password.
    expect(SIGNUP_RATE_LIMIT.limit).toBeLessThan(AUTH_RATE_LIMIT.limit);
    expect(SIGNUP_RATE_LIMIT.windowMs).toBeGreaterThan(AUTH_RATE_LIMIT.windowMs);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/api/signup", { headers });

  it("takes the left-most x-forwarded-for entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" }))).toBe(
      "203.0.113.9"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(clientIp(req({ "x-forwarded-for": "  203.0.113.9  " }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("returns a stable placeholder when no address header is present", () => {
    // All unknown callers then share one bucket — deliberately conservative.
    expect(clientIp(req({}))).toBe("unknown");
  });
});
