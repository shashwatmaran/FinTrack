import "server-only";

import { encode, getToken } from "@auth/core/jwt";
import { env } from "@/lib/env";

/**
 * Bearer tokens for the native client.
 *
 * This is not a second auth system. `@auth/core/jwt` already reads the
 * `Authorization` header as well as the session cookie, and `encode`/`getToken`
 * are the same primitives the web session is built from — so the whole of
 * mobile auth is a matter of minting with the right salt and verifying with the
 * same one.
 */

/**
 * Deliberately not the session cookie's name, which is the default salt.
 *
 * A mobile token and a web session token are then different ciphertexts derived
 * from the same secret, so one cannot be dropped into the other's slot. It also
 * removes a real footgun: the cookie name is `__Secure-authjs.session-token` in
 * production and `authjs.session-token` in development, so a salt derived from
 * it would work locally and fail in production with no error at all — `decode`
 * just returns null and every request reads as signed out.
 */
export const MOBILE_TOKEN_SALT = "fintrack.mobile.v1";

/** Matches the web session's 30 days, set in `auth.ts`. */
export const MOBILE_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * The oldest app build this deployment will still serve.
 *
 * Returned on every `/api/mobile/v1` response. The web client ships with its
 * server; an Android build lives on someone's phone for months, so this is the
 * only lever for retiring one — the app shows a blocking "update required"
 * screen rather than rendering a payload it cannot read. Raising it is a
 * deliberate act: within `v1`, response changes must stay additive.
 */
export const MIN_SUPPORTED_BUILD = 1;

/**
 * Throws rather than returning null.
 *
 * A deployment without `AUTH_SECRET` cannot verify anything, and treating that
 * as "nobody is signed in" would present a total misconfiguration as an
 * ordinary 401 — the exact silent failure §11 is about. A 500 with a server log
 * is the honest answer.
 */
function requireSecret(): string {
  const secret = env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured; cannot issue or verify mobile tokens");
  return secret;
}

export interface MintedMobileToken {
  token: string;
  /** ISO, so the client can decide to re-authenticate before a request fails. */
  expiresAt: string;
}

/**
 * `sub` is the store's user id, not anything Auth.js derives — every
 * authorization check in the app keys off it.
 *
 * `encode` sets `iat` itself, which is what makes `sessionOutlivedItsPassword`
 * work on these tokens with no extra code: a password reset evicts a phone the
 * same way it evicts a browser.
 */
export async function mintMobileToken(userId: string): Promise<MintedMobileToken> {
  const token = await encode({
    salt: MOBILE_TOKEN_SALT,
    secret: requireSecret(),
    maxAge: MOBILE_TOKEN_MAX_AGE,
    token: { sub: userId },
  });

  return {
    token,
    expiresAt: new Date(Date.now() + MOBILE_TOKEN_MAX_AGE * 1000).toISOString(),
  };
}

export interface MobileTokenClaims {
  userId: string;
  /** Seconds since the epoch, as `iat` is. */
  issuedAt: number | undefined;
}

/**
 * Verifies a Bearer token and returns its claims, or null for anything that
 * isn't one.
 *
 * Only the `authorization` header is forwarded, never the whole request.
 * `getToken` prefers a cookie when one is present and would then try to decode
 * a *web* session token with the *mobile* salt — which fails, returns null, and
 * would make a perfectly valid Bearer request from a browser-ish client read as
 * signed out. Handing it a header bag with one entry removes that path.
 */
export async function readMobileToken(request: Request): Promise<MobileTokenClaims | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const claims = await getToken({
    req: { headers: { authorization } },
    secret: requireSecret(),
    salt: MOBILE_TOKEN_SALT,
  });

  if (typeof claims?.sub !== "string" || claims.sub.length === 0) return null;

  return {
    userId: claims.sub,
    issuedAt: typeof claims.iat === "number" ? claims.iat : undefined,
  };
}
