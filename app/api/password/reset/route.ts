import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getStore } from "@/lib/server/get-store";
import { hashToken } from "@/lib/server/password-reset";
import { AUTH_RATE_LIMIT, checkRequestRateLimit } from "@/lib/server/rate-limit";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

/**
 * Consumes a reset token and sets the new password.
 *
 * The store matches on the hash and the expiry together and clears the token in
 * the same operation, so a token cannot be used twice and a replay after expiry
 * finds nothing. This route never learns which of those it was, and neither
 * does the caller — "unknown, expired, or already used" is one answer.
 */
export async function POST(request: Request) {
  // Guessing a 256-bit token is not realistic, but the limit also caps the
  // damage of anything scripted against this endpoint.
  const limit = await checkRequestRateLimit(request, "password-reset", AUTH_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const { token, password } = schema.parse(await request.json().catch(() => null));

    const store = await getStore();
    const changed = await store.consumePasswordReset(hashToken(token), password);

    if (!changed) {
      return NextResponse.json(
        { error: "That reset link is no longer valid. Request a new one." },
        { status: 400 }
      );
    }

    /**
     * Sessions issued before this moment stop working.
     *
     * There is no server-side session to delete — Auth.js cannot use database
     * sessions alongside the Credentials provider — so the store stamps
     * `passwordChangedAt` and every authenticated request compares the token's
     * `iat` against it. Anyone signed in on another device is turned away on
     * their next request, which is usually the point of resetting.
     */
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    console.error("[fintrack] password reset failed:", error);
    return NextResponse.json({ error: "Could not reset your password" }, { status: 500 });
  }
}
