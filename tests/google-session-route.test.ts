import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

/** Before `@/lib/env` loads — the endpoint mints a token on the happy path. */
process.env.AUTH_SECRET = "test-secret-not-used-anywhere-real";
process.env.GOOGLE_CLIENT_ID = "web-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_ID_ANDROID = "android-client.apps.googleusercontent.com";

/**
 * Google's signing key, replaced with one this test controls.
 *
 * The endpoint fetches `https://www.googleapis.com/oauth2/v3/certs` through
 * `createRemoteJWKSet`, so the fetch is stubbed to return our public key. That
 * keeps the *real* verification path — signature, issuer, audience, expiry all
 * checked by `jose` exactly as in production — while letting the test mint
 * tokens. Stubbing `jwtVerify` itself would delete the only thing worth testing.
 */
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("googleapis.com/oauth2/v3/certs")) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${input}`);
  })
);

vi.mock("@/lib/server/get-store", () => ({
  getStore: async () => (await import("@/lib/server/memory-store")).memoryStore,
}));

const { POST } = await import("@/app/api/mobile/v1/session/google/route");
const { readMobileToken } = await import("@/lib/server/mobile-token");
const { __resetRateLimitForTests, AUTH_RATE_LIMIT } = await import("@/lib/server/rate-limit");
const { memoryStore } = await import("@/lib/server/memory-store");

const IP = "203.0.113.9";

interface Claims {
  email?: string;
  email_verified?: boolean;
  name?: string;
  aud?: string;
  iss?: string;
  expiresIn?: string;
}

async function googleToken(claims: Claims = {}) {
  const {
    email_verified = true,
    name = "Maya Alvarez",
    aud = "web-client.apps.googleusercontent.com",
    iss = "https://accounts.google.com",
    expiresIn = "1h",
  } = claims;

  /**
   * `email` is handled by key presence rather than by a default, so a test can
   * mint a token with *no* email claim at all. Destructuring with a default
   * cannot express that — `email: undefined` silently takes the default, which
   * is how the "no email" case first passed against code that would have
   * accepted it.
   */
  const payload: Record<string, unknown> = { email_verified, name };
  if ("email" in claims) {
    if (claims.email !== undefined) payload.email = claims.email;
  } else {
    payload.email = "maya.alvarez@email.com";
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

const post = (body: unknown) =>
  POST(
    new Request("http://localhost:3000/api/mobile/v1/session/google", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": IP },
    })
  );

beforeEach(() => {
  __resetRateLimitForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/mobile/v1/session/google", () => {
  it("exchanges a valid Google token for one of ours", async () => {
    const response = await post({ idToken: await googleToken() });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.user.email).toBe("maya.alvarez@email.com");
    expect(typeof body.token).toBe("string");
  });

  it("mints a token this deployment will actually accept", async () => {
    const { token } = await post({ idToken: await googleToken() }).then((r) => r.json());
    const claims = await readMobileToken(
      new Request("http://localhost/api/x", { headers: { authorization: `Bearer ${token}` } })
    );
    expect(claims?.userId).toBe("u1");
  });

  it("matches an existing account rather than creating a duplicate", async () => {
    // Password and Google sign-in for one address must land on one account, or
    // a user's groups quietly split in two.
    const before = await memoryStore.getUserByEmail("maya.alvarez@email.com");
    const body = await post({ idToken: await googleToken() }).then((r) => r.json());
    expect(body.user.id).toBe(before?.id);
  });

  it("creates an account for a first-time Google user", async () => {
    const email = `newcomer-${Date.now()}@example.com`;
    const body = await post({ idToken: await googleToken({ email, name: "New Comer" }) })
      .then((r) => r.json());

    expect(body.user.email).toBe(email);
    expect(body.user.initials).toBe("NC");
  });

  it("never returns the password hash", async () => {
    const raw = JSON.stringify(await post({ idToken: await googleToken() }).then((r) => r.json()));
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("$2");
  });

  // --- the security properties ------------------------------------------

  /**
   * The one that matters most. Without the signature check this endpoint is
   * "sign in as any email you like", because the payload is attacker-controlled.
   */
  it("refuses a token signed by someone else", async () => {
    const foreign = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "maya.alvarez@email.com", email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience("web-client.apps.googleusercontent.com")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(foreign.privateKey);

    expect((await post({ idToken: forged })).status).toBe(401);
  });

  /**
   * Google is only an authority on an address it verified. Skipping this lets a
   * Workspace account with an unverified alias claim someone else's account,
   * since find-or-create matches on email.
   */
  it("refuses an unverified email address", async () => {
    const response = await post({ idToken: await googleToken({ email_verified: false }) });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/verified/i);
  });

  it("refuses a token minted for a different application", async () => {
    // An `aud` we do not recognise is a token issued to someone else's client
    // — replaying it here would be a confused-deputy sign-in.
    const response = await post({
      idToken: await googleToken({ aud: "someone-elses.apps.googleusercontent.com" }),
    });
    expect(response.status).toBe(401);
  });

  it("accepts the Android client id as well as the web one", async () => {
    // Credential Manager mints for whichever client the app presented;
    // accepting only one silently breaks a platform.
    const response = await post({
      idToken: await googleToken({ aud: "android-client.apps.googleusercontent.com" }),
    });
    expect(response.status).toBe(200);
  });

  it("refuses a token from the wrong issuer", async () => {
    const response = await post({ idToken: await googleToken({ iss: "https://evil.example.com" }) });
    expect(response.status).toBe(401);
  });

  it("refuses an expired token", async () => {
    const response = await post({ idToken: await googleToken({ expiresIn: "-1h" }) });
    expect(response.status).toBe(401);
  });

  it("refuses a token carrying no email at all", async () => {
    const response = await post({ idToken: await googleToken({ email: undefined }) });
    expect(response.status).toBe(401);
  });

  it("gives every verification failure the same message", async () => {
    /**
     * Distinguishing expired from wrong-audience from bad-signature would tell
     * someone probing the endpoint which part of a forged token to fix next.
     */
    const expired = await post({ idToken: await googleToken({ expiresIn: "-1h" }) }).then((r) => r.json());
    const wrongAud = await post({ idToken: await googleToken({ aud: "nope" }) }).then((r) => r.json());
    expect(expired.error).toBe(wrongAud.error);
  });

  it("400s a malformed body rather than throwing", async () => {
    expect((await post({})).status).toBe(400);
  });

  // --- throttling --------------------------------------------------------

  it("shares the sign-in rate-limit bucket", async () => {
    // A separate bucket would make this an unthrottled way to hammer the same
    // accounts the password endpoint protects.
    const token = await googleToken();
    for (let i = 0; i < AUTH_RATE_LIMIT.limit; i++) await post({ idToken: token });

    const response = await post({ idToken: token });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
