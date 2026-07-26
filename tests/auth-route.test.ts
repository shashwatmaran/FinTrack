import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetRateLimitForTests } from "@/lib/server/rate-limit";

/**
 * Guards the shape of the rate-limited sign-in response.
 *
 * This is a regression test for a silent failure: the endpoint used to answer
 * with a bare `{ error }`, and the Auth.js client helper does
 * `new URL(data.url)` on whatever comes back. With no `url` field that throws
 * inside `signIn()` before the caller's error handling runs, so the sign-in
 * form rendered nothing at all — a locked-out user saw a button that did
 * nothing and no reason not to keep retrying, which only extended the window.
 *
 * The assertion that matters is not "returns 429" but "returns a body the
 * client can parse an error code out of".
 */
const handlersPost = vi.fn(async () => new Response(null, { status: 200 }));

vi.mock("@/auth", () => ({
  handlers: { GET: vi.fn(), POST: handlersPost },
}));

const { POST, RATE_LIMITED_ERROR } = await import("@/app/api/auth/[...nextauth]/route");

// A fixed address, so the limiter counts these together and does not take the
// development exemption for unknown callers.
const signInRequest = () =>
  new Request("http://localhost:3000/api/auth/callback/credentials", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9" },
  });

const sessionRequest = () =>
  new Request("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9" },
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = (request: Request) => POST(request as any);

beforeEach(() => {
  __resetRateLimitForTests();
  handlersPost.mockClear();
});

async function exhaust() {
  // AUTH_RATE_LIMIT is 10/min; drive past it.
  for (let i = 0; i < 10; i++) await post(signInRequest());
}

describe("sign-in rate limiting", () => {
  it("passes normal attempts through to Auth.js", async () => {
    const res = await post(signInRequest());
    expect(res.status).toBe(200);
    expect(handlersPost).toHaveBeenCalledOnce();
  });

  it("returns 429 once the window is exhausted", async () => {
    await exhaust();
    expect((await post(signInRequest())).status).toBe(429);
  });

  it("stops calling Auth.js once limited", async () => {
    await exhaust();
    handlersPost.mockClear();
    await post(signInRequest());
    // The bcrypt work is the cost being avoided; reaching the handler defeats it.
    expect(handlersPost).not.toHaveBeenCalled();
  });

  it("sets Retry-After", async () => {
    await exhaust();
    const res = await post(signInRequest());
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("answers with a body carrying a parseable url", async () => {
    await exhaust();
    const body = await (await post(signInRequest())).json();

    expect(typeof body.url).toBe("string");
    // The exact failure being guarded: this constructor threw before.
    expect(() => new URL(body.url)).not.toThrow();
  });

  it("encodes the error code the client reads out of that url", async () => {
    await exhaust();
    const body = await (await post(signInRequest())).json();

    expect(new URL(body.url).searchParams.get("error")).toBe(RATE_LIMITED_ERROR);
  });

  it("does not throttle non-credential auth traffic", async () => {
    await exhaust();
    // Session and CSRF polling is legitimate and frequent for a signed-in
    // client; throttling it would sign people out at random.
    const res = await post(sessionRequest());
    expect(res.status).toBe(200);
  });
});
