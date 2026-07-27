import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetRateLimitForTests } from "@/lib/server/rate-limit";

/**
 * The Redis-backed limiter.
 *
 * Per-process counters mean one bucket per serverless instance, so the real
 * ceiling is N times the configured limit. Sharing them in Redis makes the
 * number mean something — but it also puts a network dependency in front of
 * sign-in, so how it behaves when that dependency is down matters as much as
 * how it behaves when it is up.
 */
// vi.mock factories are hoisted above the file's own declarations, so anything
// they close over has to be hoisted with them.
const { pipeline, configured, RedisUnavailableError } = vi.hoisted(() => {
  class RedisUnavailableError extends Error {}
  return { pipeline: vi.fn(), configured: { value: true }, RedisUnavailableError };
});

vi.mock("@/lib/server/redis", () => ({
  RedisUnavailableError,
  isRedisConfigured: () => configured.value,
  pipeline,
}));

const { checkRequestRateLimit } = await import("@/lib/server/rate-limit");

const RULE = { limit: 3, windowMs: 60_000 };
const req = (ip = "203.0.113.9") =>
  new Request("http://localhost/api/signup", { headers: { "x-forwarded-for": ip } });

/** Upstash returns one `{ result }` per command, in order. */
const reply = (count: number, ttl = 60) => [count, 1, ttl];

beforeEach(() => {
  __resetRateLimitForTests();
  configured.value = true;
  pipeline.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("when Redis is available", () => {
  it("allows a request under the limit", async () => {
    pipeline.mockResolvedValue(reply(1));
    expect((await checkRequestRateLimit(req(), "signin", RULE)).ok).toBe(true);
  });

  it("blocks once the count passes the limit", async () => {
    pipeline.mockResolvedValue(reply(4));
    expect((await checkRequestRateLimit(req(), "signin", RULE)).ok).toBe(false);
  });

  it("allows exactly up to the limit, not one fewer", async () => {
    pipeline.mockResolvedValue(reply(3));
    const result = await checkRequestRateLimit(req(), "signin", RULE);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("reports Retry-After from the key's TTL", async () => {
    pipeline.mockResolvedValue(reply(9, 42));
    expect((await checkRequestRateLimit(req(), "signin", RULE)).retryAfter).toBe(42);
  });

  it("anchors the window to the first request, not the latest", async () => {
    // EXPIRE ... NX only sets a TTL when there is none. Refreshing it on every
    // request would let steady traffic hold the key alive and never reset.
    pipeline.mockResolvedValue(reply(1));
    await checkRequestRateLimit(req(), "signin", RULE);

    const commands = pipeline.mock.calls[0][0] as unknown[][];
    const expire = commands.find((c) => c[0] === "EXPIRE")!;
    expect(expire).toContain("NX");
  });

  it("scopes the key by prefix and address", async () => {
    pipeline.mockResolvedValue(reply(1));
    await checkRequestRateLimit(req("198.51.100.4"), "signup", RULE);

    const key = (pipeline.mock.calls[0][0] as unknown[][])[0][1];
    expect(key).toBe("signup:198.51.100.4");
  });

  it("falls back to a full window when the key has no TTL", async () => {
    // TTL -1 means the key would never expire; treating it as 0 would report
    // Retry-After: 0 and invite an immediate retry that also fails.
    pipeline.mockResolvedValue(reply(9, -1));
    expect((await checkRequestRateLimit(req(), "signin", RULE)).retryAfter).toBe(60);
  });
});

describe("when Redis is down", () => {
  beforeEach(() => {
    pipeline.mockRejectedValue(new RedisUnavailableError("timed out"));
  });

  it("still allows sign-in rather than locking everyone out", async () => {
    // Failing closed would turn a dependency outage into a total outage.
    expect((await checkRequestRateLimit(req(), "signin", RULE)).ok).toBe(true);
  });

  it("keeps enforcing a limit via per-process counters", async () => {
    // Failing fully open would drop the protection entirely.
    for (let i = 0; i < RULE.limit; i++) await checkRequestRateLimit(req(), "signin", RULE);
    expect((await checkRequestRateLimit(req(), "signin", RULE)).ok).toBe(false);
  });

  it("says so in the logs rather than degrading silently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkRequestRateLimit(req(), "signin", RULE);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/per-process/i);
  });

  it("logs our message, not the transport's", async () => {
    // redis.ts attaches the original as `cause` rather than copying it into the
    // message, precisely so this log line cannot echo a credential. See
    // redis.test.ts for the assertion on the source.
    pipeline.mockRejectedValue(
      new RedisUnavailableError("Redis unreachable", {
        cause: new Error("connect https://db.upstash.io token=AX7sHIGHLYSECRET"),
      })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkRequestRateLimit(req(), "signin", RULE);

    expect(JSON.stringify(warn.mock.calls)).not.toContain("HIGHLYSECRET");
  });
});

describe("when Redis is not configured", () => {
  beforeEach(() => {
    configured.value = false;
  });

  it("never calls it", async () => {
    await checkRequestRateLimit(req(), "signin", RULE);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("still enforces the limit in process", async () => {
    for (let i = 0; i < RULE.limit; i++) await checkRequestRateLimit(req(), "signin", RULE);
    expect((await checkRequestRateLimit(req(), "signin", RULE)).ok).toBe(false);
  });
});
