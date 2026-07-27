import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { appLink } from "@/lib/server/app-url";
import { getStore } from "@/lib/server/get-store";
import { sendPasswordResetEmail } from "@/lib/server/email";
import {
  RESET_TOKEN_TTL_MS,
  generateResetToken,
  hashToken,
  resetTokenExpiry,
} from "@/lib/server/password-reset";
import { SIGNUP_RATE_LIMIT, checkRequestRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({ email: z.string().email() });

/**
 * Requests a reset link.
 *
 * **The response never varies.** Same status, same body, whether or not an
 * account exists — otherwise this endpoint is a way to enumerate who has an
 * account here, and in an app about who owes whom that is worth something to
 * an attacker.
 *
 * The email either goes out or it doesn't; the caller cannot tell.
 */
export async function POST(request: Request) {
  // Reuses the signup budget: both are unauthenticated, both send mail, and
  // both are a way to spend someone else's quota.
  const limit = await checkRequestRateLimit(request, "password-forgot", SIGNUP_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  // Sent on every path, including the ones that do nothing.
  const acknowledged = NextResponse.json({ ok: true });

  try {
    const { email } = schema.parse(await request.json().catch(() => null));

    const token = generateResetToken();
    const store = await getStore();
    const user = await store.setPasswordResetToken(email, hashToken(token), resetTokenExpiry());

    if (user) {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name.split(" ")[0] ?? "there",
        // Not the request's origin — see lib/server/app-url.ts.
        resetUrl: appLink(`/reset-password?token=${encodeURIComponent(token)}`, request),
        expiresInMinutes: RESET_TOKEN_TTL_MS / 60_000,
      });
    }

    return acknowledged;
  } catch (error) {
    // A malformed body is the caller's mistake and safe to name; anything else
    // is logged and still acknowledged, so a database outage does not become an
    // account-existence signal either.
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    console.error("[fintrack] password reset request failed:", error);
    return acknowledged;
  }
}
