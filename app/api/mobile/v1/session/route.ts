import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ZodError } from "zod";
import { getStore } from "@/lib/server/get-store";
import { MIN_SUPPORTED_BUILD, mintMobileToken } from "@/lib/server/mobile-token";
import { AUTH_RATE_LIMIT, checkRequestRateLimit } from "@/lib/server/rate-limit";
import { signInSchema } from "@/lib/validation";
import type { AppUser } from "@/lib/types";

/**
 * Email + password sign-in for the native client.
 *
 * The web signs in through Auth.js, which answers with a `Set-Cookie` and an
 * `{ url }` envelope the browser helper resolves. A phone has neither a cookie
 * jar we control nor a URL to follow, so this hands back the token directly and
 * reports failure as a plain `401` — not a redirect, and not the envelope.
 *
 * It is a second entry point to the same credential check, which makes the
 * things it must not skip more important than the things it does.
 */
export async function POST(request: Request) {
  /**
   * The `"signin"` bucket, not a new one.
   *
   * A separate bucket would make this endpoint an unthrottled bypass of the
   * credential-stuffing protection on `/api/auth/callback/credentials` — same
   * passwords, same accounts, a fresh budget. Sharing the key means an attacker
   * gains nothing by switching endpoints. Checked before parsing, since bcrypt
   * is the expensive part and the point is to not reach it.
   */
  const limit = await checkRequestRateLimit(request, "signin", AUTH_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const { email, password } = signInSchema.parse(await request.json().catch(() => null));

    const store = await getStore();
    const user = await store.getUserByEmail(email);

    // The dummy-hash comparison from `auth.ts:authorize`, for the same reason:
    // without it a missing account returns in microseconds and a real one takes
    // bcrypt's deliberate ~100ms, which is a usable oracle for which addresses
    // are registered.
    const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) {
      return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
    }

    const { token, expiresAt } = await mintMobileToken(user.id);

    // Rebuilt field by field rather than spread: `getUserByEmail` returns the
    // password hash alongside the profile, and a spread would ship it.
    const me: AppUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      initials: user.initials,
      color: user.color,
    };

    return NextResponse.json({ token, expiresAt, user: me, minSupportedBuild: MIN_SUPPORTED_BUILD });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    console.error("[fintrack] mobile sign-in failed:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
