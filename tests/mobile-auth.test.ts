import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Bearer authentication for the native client.
 *
 * The web has no cookie-free path, so every one of these behaviours is new and
 * none of them fails loudly on its own: a salt mismatch makes `decode` return
 * `null`, which reads as "signed out" with nothing in any log. That is the
 * failure mode this file exists to catch.
 *
 * Set before `@/lib/env` is imported — it parses `process.env` at module load,
 * and every mint and verify below needs a secret to derive a key from.
 */
process.env.AUTH_SECRET = "test-secret-not-used-anywhere-real";

const authMock = vi.fn();
const passwordChangedAt = vi.fn().mockResolvedValue(null);
const storeMock = { passwordChangedAt };

vi.mock("@/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/server/get-store", () => ({ getStore: async () => storeMock }));

const { encode } = await import("@auth/core/jwt");
const { MOBILE_TOKEN_SALT, MOBILE_TOKEN_MAX_AGE, mintMobileToken, readMobileToken } = await import(
  "@/lib/server/mobile-token"
);
const { withAuth } = await import("@/lib/server/route-helpers");

const SECRET = process.env.AUTH_SECRET;

const bearer = (token: string) =>
  new Request("http://localhost/api/bootstrap", { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => {
  // Signed out by default: these tests are about the credential that is *not*
  // a cookie.
  authMock.mockReset().mockResolvedValue(null);
  passwordChangedAt.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("minting and reading a mobile token", () => {
  it("round-trips the user id through the Authorization header", async () => {
    const { token } = await mintMobileToken("u1");
    expect(await readMobileToken(bearer(token))).toMatchObject({ userId: "u1" });
  });

  it("stamps an issue time", async () => {
    // Without `iat` the password-reset eviction cannot tell an old token from a
    // new one, and `sessionOutlivedItsPassword` fails closed on every request.
    const { token } = await mintMobileToken("u1");
    const claims = await readMobileToken(bearer(token));
    expect(typeof claims?.issuedAt).toBe("number");
  });

  it("reports an expiry the client can act on before a request fails", async () => {
    const { expiresAt } = await mintMobileToken("u1");
    const seconds = (new Date(expiresAt).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(MOBILE_TOKEN_MAX_AGE - 60);
  });

  it("returns null with no Authorization header", async () => {
    expect(await readMobileToken(new Request("http://localhost/api/bootstrap"))).toBeNull();
  });

  it("returns null for a scheme that is not Bearer", async () => {
    const { token } = await mintMobileToken("u1");
    const request = new Request("http://localhost/api/bootstrap", {
      headers: { authorization: `Basic ${token}` },
    });
    expect(await readMobileToken(request)).toBeNull();
  });

  it("returns null for a token that is not a token", async () => {
    expect(await readMobileToken(bearer("not-a-jwe"))).toBeNull();
  });

  /**
   * The §11 risk, made visible.
   *
   * A web session token is a valid JWE minted from the same secret. If the
   * mobile salt were the cookie name — or drifted to it — this would decode and
   * the two credential types would be interchangeable.
   */
  it("refuses a token minted with the web session's salt", async () => {
    const webToken = await encode({
      salt: "authjs.session-token",
      secret: SECRET,
      token: { sub: "u1" },
    });
    expect(await readMobileToken(bearer(webToken))).toBeNull();
  });

  it("refuses a token minted with the production cookie name as salt", async () => {
    // The same mistake, in the form that works locally and fails in production.
    const prodSalted = await encode({
      salt: "__Secure-authjs.session-token",
      secret: SECRET,
      token: { sub: "u1" },
    });
    expect(await readMobileToken(bearer(prodSalted))).toBeNull();
  });

  it("refuses a token minted from a different secret", async () => {
    const foreign = await encode({
      salt: MOBILE_TOKEN_SALT,
      secret: "some-other-deployments-secret",
      token: { sub: "u1" },
    });
    expect(await readMobileToken(bearer(foreign))).toBeNull();
  });

  it("refuses a token carrying no subject", async () => {
    const anonymous = await encode({ salt: MOBILE_TOKEN_SALT, secret: SECRET, token: {} });
    expect(await readMobileToken(bearer(anonymous))).toBeNull();
  });

  it("refuses an expired token", async () => {
    const stale = await encode({
      salt: MOBILE_TOKEN_SALT,
      secret: SECRET,
      maxAge: -60,
      token: { sub: "u1" },
    });
    expect(await readMobileToken(bearer(stale))).toBeNull();
  });
});

/**
 * The fallback lives in `resolveActor`, behind all four `withAuth*` wrappers,
 * so proving it through `withAuth` proves it for every endpoint in the app at
 * once — which is the reason it was put there.
 */
describe("withAuth against a Bearer token", () => {
  const handler = () => withAuth(async ({ userId }) => ({ userId }));

  it("accepts a valid one with no cookie in sight", async () => {
    const { token } = await mintMobileToken("u1");
    const response = await handler()(bearer(token));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "u1" });
  });

  it("401s when the header is absent", async () => {
    const response = await handler()(new Request("http://localhost/api/bootstrap"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Not signed in");
  });

  it("401s a token minted with the wrong salt", async () => {
    const webToken = await encode({
      salt: "authjs.session-token",
      secret: SECRET,
      token: { sub: "u1" },
    });
    expect((await handler()(bearer(webToken))).status).toBe(401);
  });

  it("never runs the handler for a token it rejected", async () => {
    const body = vi.fn().mockResolvedValue({});
    await withAuth(body)(bearer("garbage"));
    expect(body).not.toHaveBeenCalled();
  });

  it("prefers a cookie session when one is present", async () => {
    authMock.mockResolvedValue({ user: { id: "cookie-user", issuedAt: Math.floor(Date.now() / 1000) } });
    const { token } = await mintMobileToken("u1");

    expect(await (await handler()(bearer(token))).json()).toEqual({ userId: "cookie-user" });
  });

  /**
   * A password reset has to evict a phone the same way it evicts a browser.
   * `encode` stamps `iat`, so this needs no mobile-specific code — but it is
   * exactly the kind of thing that silently would not work.
   */
  it("refuses a token issued before the password changed", async () => {
    const { token } = await mintMobileToken("u1");
    passwordChangedAt.mockResolvedValue(new Date(Date.now() + 3_600_000).toISOString());

    const response = await handler()(bearer(token));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/password changed/i);
  });

  it("says why, so the user knows they were not simply logged out", async () => {
    const { token } = await mintMobileToken("u1");
    passwordChangedAt.mockResolvedValue(new Date(Date.now() + 3_600_000).toISOString());

    const error = (await (await handler()(bearer(token))).json()).error;
    expect(error).not.toBe("Not signed in");
  });

  it("accepts a token issued after the password changed", async () => {
    passwordChangedAt.mockResolvedValue(new Date(Date.now() - 3_600_000).toISOString());
    const { token } = await mintMobileToken("u1");

    expect((await handler()(bearer(token))).status).toBe(200);
  });
});
