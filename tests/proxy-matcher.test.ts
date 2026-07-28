import { describe, it, expect } from "vitest";
import { vi } from "vitest";

/**
 * The route-guard matcher and the Bearer bypass.
 *
 * This matcher has now caused four silent failures — the Sentry tunnel, the
 * cron route, the generated icons, and (before this file) it would have been
 * mobile auth. The failure is always the same shape: a path that should be
 * reachable without a session is redirected or 401'd *before* the handler that
 * would have answered it, so the response is HTML where JSON or an image was
 * expected and nothing anywhere says why.
 *
 * `auth()` here is the identity wrapper, so the default export is the guard
 * function itself and can be called directly.
 */
vi.mock("@/auth", () => ({
  auth: (handler: unknown) => handler,
}));

const proxy = await import("@/proxy");

const guard = proxy.default as unknown as (
  request: {
    nextUrl: URL;
    auth: { user?: { id: string } } | null;
    headers: Headers;
  }
) => Response | undefined;

/**
 * Anchored, because Next matches the whole path. An unanchored `test()` finds
 * the pattern at *any* offset, so every excluded path would appear to match by
 * starting a character later — the test would pass against a broken matcher,
 * which is worse than not having it.
 */
const MATCHER = new RegExp(`^${proxy.config.matcher[0]!}$`);
/** True when the proxy runs for this path at all. */
const matches = (path: string) => MATCHER.test(path);

const request = (path: string, headers: Record<string, string> = {}) => ({
  nextUrl: new URL(`http://localhost:3000${path}`),
  auth: null,
  headers: new Headers(headers),
});

describe("paths the proxy must not intercept", () => {
  const excluded = [
    "/api/auth/callback/credentials",
    "/api/signup",
    "/api/cron/recurring",
    "/api/health",
    "/api/password/forgot",
    // The native client exchanging credentials for a token. Requiring a session
    // to obtain a session is circular.
    "/api/mobile/v1/session",
    "/api/mobile/v1/session/google",
    /**
     * Android App Links verification. Not under /api/, no image extension, not
     * in PUBLIC_PATHS — so without an exclusion Google's verifier is redirected
     * to /signin, verification fails with no error anywhere, and invite links
     * quietly open the browser instead of the app.
     */
    "/.well-known/assetlinks.json",
    "/icon",
    "/apple-icon",
    "/favicon.ico",
    "/logo.svg",
  ];

  for (const path of excluded) {
    it(`skips ${path}`, () => {
      expect(matches(path)).toBe(false);
    });
  }
});

describe("paths the proxy must still guard", () => {
  const guarded = [
    "/dashboard",
    "/groups",
    "/api/bootstrap",
    "/api/expenses",
    // Authenticated mobile traffic. Only the session exchange is exempt — if
    // the exclusion were `api/mobile` the whole surface would go unguarded.
    "/api/mobile/v1/bootstrap",
  ];

  for (const path of guarded) {
    it(`runs for ${path}`, () => {
      expect(matches(path)).toBe(true);
    });
  }
});

describe("an API call with no credential at all", () => {
  it("401s rather than redirecting", async () => {
    const response = guard(request("/api/bootstrap"))!;
    expect(response.status).toBe(401);
  });

  it("answers JSON, because a redirect would hand fetch an HTML body", async () => {
    const response = guard(request("/api/bootstrap"))!;
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ error: "Not signed in" });
  });
});

/**
 * `signedIn` is read from the session **cookie**, which a phone does not have.
 * Without this exemption a perfectly valid Bearer request is rejected here,
 * one layer above the code that would have accepted it.
 */
describe("an API call carrying a Bearer token", () => {
  it("is passed through to the handler", () => {
    const response = guard(request("/api/bootstrap", { authorization: "Bearer whatever" }));
    expect(response?.status).not.toBe(401);
  });

  it("is not a security decision — the wrapper still verifies it", () => {
    // Anyone can type the word "Bearer". All this does is defer the check to
    // `withAuth*`, which decodes the signature properly and 401s a forgery.
    const response = guard(request("/api/bootstrap", { authorization: "Bearer obviously-fake" }));
    expect(response?.status).not.toBe(401);
  });

  it("does not exempt page routes", () => {
    // A browser navigation never carries this header; honouring it outside
    // /api/ would only widen the exemption for no benefit.
    const response = guard(request("/dashboard", { authorization: "Bearer whatever" }))!;
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/signin");
  });

  it("still 401s a non-Bearer Authorization header", () => {
    const response = guard(request("/api/bootstrap", { authorization: "Basic abc" }))!;
    expect(response.status).toBe(401);
  });
});
