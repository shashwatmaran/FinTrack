import { describe, it, expect, beforeEach, vi } from "vitest";

/** Before `@/lib/env` loads — the endpoint mints a token on the happy path. */
process.env.AUTH_SECRET = "test-secret-not-used-anywhere-real";

const { memoryStore } = await import("@/lib/server/memory-store");
vi.mock("@/lib/server/get-store", () => ({
  getStore: async () => (await import("@/lib/server/memory-store")).memoryStore,
}));

const { POST } = await import("@/app/api/mobile/v1/session/route");
const { readMobileToken } = await import("@/lib/server/mobile-token");
const { __resetRateLimitForTests, checkRequestRateLimit, AUTH_RATE_LIMIT } = await import(
  "@/lib/server/rate-limit"
);
const { DEMO_PASSWORD } = await import("@/lib/mock-data");

const EMAIL = "maya.alvarez@email.com";

/**
 * A fixed address. Without one `clientIp` returns "unknown" and the limiter
 * takes its development exemption, so the bucket-sharing test would pass
 * whether or not the buckets were actually shared.
 */
const IP = "203.0.113.9";

const signIn = (body: unknown, ip = IP) =>
  POST(
    new Request("http://localhost:3000/api/mobile/v1/session", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    })
  );

const good = () => signIn({ email: EMAIL, password: DEMO_PASSWORD });

beforeEach(() => {
  __resetRateLimitForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/mobile/v1/session", () => {
  it("hands back a token for correct credentials", async () => {
    const response = await good();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe(EMAIL);
  });

  it("mints a token this deployment will actually accept", async () => {
    // The salt has to match on both sides. When it doesn't, sign-in appears to
    // succeed and every request afterwards reads as signed out.
    const { token } = await good().then((r) => r.json());
    const request = new Request("http://localhost/api/x", {
      headers: { authorization: `Bearer ${token}` },
    });

    const claims = await readMobileToken(request);
    expect(claims?.userId).toBe("u1");
  });

  it("sets `sub` to the store's user id, not an Auth.js one", async () => {
    // Every authorization check in the app keys off it.
    const body = await good().then((r) => r.json());
    const stored = await memoryStore.getUserByEmail(EMAIL);
    expect(body.user.id).toBe(stored?.id);
  });

  it("reports when the token expires", async () => {
    const { expiresAt } = await good().then((r) => r.json());
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("carries the minimum supported build", async () => {
    // The only lever for retiring an install that has been on a phone for
    // months; without it an old build renders a payload it cannot read.
    const body = await good().then((r) => r.json());
    expect(typeof body.minSupportedBuild).toBe("number");
  });

  it("never returns the password hash", async () => {
    // `getUserByEmail` returns it alongside the profile, so a spread would ship it.
    const raw = JSON.stringify(await good().then((r) => r.json()));
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("$2");
  });

  it("401s a wrong password", async () => {
    const response = await signIn({ email: EMAIL, password: "wrong-password" });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Email or password is incorrect");
  });

  it("401s an unknown account with the same message", async () => {
    // Distinguishing the two would turn this into an account-enumeration oracle.
    const response = await signIn({ email: "nobody@example.com", password: DEMO_PASSWORD });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Email or password is incorrect");
  });

  it("issues no token on a failed attempt", async () => {
    const body = await signIn({ email: EMAIL, password: "wrong-password" }).then((r) => r.json());
    expect(body.token).toBeUndefined();
  });

  it("answers a plain error, not an Auth.js redirect envelope", async () => {
    /**
     * The web's `{ url }` envelope exists only because the browser helper does
     * `new URL(data.url)`. A native client wants an error it can render.
     */
    const response = await signIn({ email: EMAIL, password: "wrong-password" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(body.url).toBeUndefined();
  });

  it("400s a malformed body rather than throwing", async () => {
    expect((await signIn({ email: "not-an-email", password: "x" })).status).toBe(400);
  });

  it("400s a body that is not JSON at all", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/mobile/v1/session", {
        method: "POST",
        body: "{not json",
        headers: { "x-forwarded-for": IP },
      })
    );
    expect(response.status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("429s once the window is exhausted", async () => {
    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
      await signIn({ email: EMAIL, password: "wrong-password" });
    }
    const response = await signIn({ email: EMAIL, password: "wrong-password" });

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("limits correct credentials too, not just failures", async () => {
    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) await good();
    expect((await good()).status).toBe(429);
  });

  /**
   * The assertion this file exists for.
   *
   * A dedicated bucket would make this endpoint an unthrottled bypass of the
   * credential-stuffing protection on `/api/auth/callback/credentials` — same
   * passwords, same accounts, a fresh budget. Sharing the key means switching
   * endpoints gains an attacker nothing.
   */
  it("shares the web sign-in bucket rather than opening a second one", async () => {
    const request = () =>
      new Request("http://localhost/api/auth/callback/credentials", {
        headers: { "x-forwarded-for": IP },
      });

    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
      await signIn({ email: EMAIL, password: "wrong-password" });
    }

    // The web's bucket is now exhausted by mobile traffic alone.
    expect((await checkRequestRateLimit(request(), "signin", AUTH_RATE_LIMIT)).ok).toBe(false);
  });

  it("exhausts in the other direction too", async () => {
    const request = () =>
      new Request("http://localhost/api/auth/callback/credentials", {
        headers: { "x-forwarded-for": IP },
      });

    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
      await checkRequestRateLimit(request(), "signin", AUTH_RATE_LIMIT);
    }
    expect((await good()).status).toBe(429);
  });

  it("does not let one address exhaust another's budget", async () => {
    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) {
      await signIn({ email: EMAIL, password: "wrong-password" });
    }
    expect((await signIn({ email: EMAIL, password: DEMO_PASSWORD }, "198.51.100.4")).status).toBe(200);
  });

  it("does not reach bcrypt once limited", async () => {
    // The CPU cost is the thing being protected; checking after the compare
    // would leave the exhaustion vector open.
    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) await good();

    const started = Date.now();
    await good();
    expect(Date.now() - started).toBeLessThan(50);
  });
});
