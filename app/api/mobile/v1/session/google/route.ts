import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { ZodError } from "zod";
import { env } from "@/lib/env";
import { getStore } from "@/lib/server/get-store";
import { MIN_SUPPORTED_BUILD, mintMobileToken } from "@/lib/server/mobile-token";
import { findOrCreateOAuthUser } from "@/lib/server/oauth-user";
import { AUTH_RATE_LIMIT, checkRequestRateLimit } from "@/lib/server/rate-limit";
import type { AppUser } from "@/lib/types";

/**
 * Google sign-in for the native client.
 *
 * Android uses Credential Manager, which yields a **Google ID token** rather
 * than an OAuth authorization code — so this is not the web's flow with a
 * different redirect, it is a different exchange entirely. There is no code, no
 * client secret and no callback: the app already holds a signed assertion, and
 * this endpoint's job is to verify it and mint our own session from it.
 */
const schema = z.object({
  idToken: z.string().min(1, "Missing Google credential"),
});

/**
 * Google's public keys, fetched once and cached by `jose` with the response's
 * own cache headers. Constructed at module scope so a cold start pays for the
 * fetch once rather than per request.
 */
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

/** Both are valid issuers; Google has used the bare host historically. */
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export async function POST(request: Request) {
  /**
   * The same `"signin"` bucket as every other credential path. A separate one
   * would make this an unthrottled way to hammer the same accounts.
   */
  const limit = await checkRequestRateLimit(request, "signin", AUTH_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  /**
   * Which clients this deployment will accept a token for.
   *
   * Both, deliberately — the web client and the Android client. Credential
   * Manager mints for whichever the app presented, and `serverClientId` on the
   * app side is the *Web* id, so in practice the web id is the one that
   * arrives. Accepting only one is how a platform breaks silently later.
   */
  const audiences = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_ID_ANDROID].filter(
    (id): id is string => Boolean(id)
  );

  if (audiences.length === 0) {
    // A deployment without Google configured says so plainly rather than
    // failing verification in a way that reads as a bad token.
    return NextResponse.json(
      { error: "Google sign-in isn't configured for this deployment" },
      { status: 501 }
    );
  }

  try {
    const { idToken } = schema.parse(await request.json().catch(() => null));

    /**
     * `jwtVerify` checks the signature against Google's JWKS and enforces
     * `iss`, `aud` and expiry. Doing any of that by hand — or worse, decoding
     * the token without verifying — is the classic way this endpoint becomes
     * an "any email you like" login.
     */
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: audiences,
    });

    const email = typeof payload.email === "string" ? payload.email : null;

    /**
     * `email_verified` is not optional to check.
     *
     * Google is only an authority on an address it has actually verified, and
     * that is the entire reason to accept it as an identity. Without this, a
     * Workspace account with an unverified alias could claim an address
     * belonging to someone else's FinTrack account — and
     * `findOrCreateOAuthUser` matches on email.
     */
    if (!email || payload.email_verified !== true) {
      return NextResponse.json(
        { error: "That Google account has no verified email address" },
        { status: 401 }
      );
    }

    const store = await getStore();
    const user: AppUser = await findOrCreateOAuthUser(store, {
      email,
      name: typeof payload.name === "string" ? payload.name : null,
    });

    const { token, expiresAt } = await mintMobileToken(user.id);

    return NextResponse.json({
      token,
      expiresAt,
      user,
      minSupportedBuild: MIN_SUPPORTED_BUILD,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    /**
     * Every verification failure is one message.
     *
     * Expired, wrong audience, bad signature and malformed all mean the same
     * thing to a caller who should simply retry the sign-in — and
     * distinguishing them would tell someone probing the endpoint exactly which
     * part of a forged token to fix next. Logged server-side, where it is
     * useful and not a hint.
     */
    console.error("[fintrack] google sign-in failed:", error);
    return NextResponse.json(
      { error: "Couldn't verify that Google sign-in. Try again." },
      { status: 401 }
    );
  }
}
