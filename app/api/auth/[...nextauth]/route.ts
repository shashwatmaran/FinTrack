import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/auth";
import { AUTH_RATE_LIMIT, checkRateLimit, clientIp } from "@/lib/server/rate-limit";

export const { GET } = handlers;

/**
 * Auth.js owns every POST under /api/auth, but only the credentials callback
 * verifies a password. Throttling that one path stops credential stuffing and
 * the bcrypt CPU cost that comes with it, without touching session or CSRF
 * traffic — which a signed-in client polls legitimately and often.
 *
 * The limit is applied here rather than inside the provider's `authorize`
 * because that callback receives only the parsed credentials, never the
 * request, so it cannot see the caller's address.
 */
export async function POST(request: NextRequest) {
  if (new URL(request.url).pathname.endsWith("/callback/credentials")) {
    const limit = checkRateLimit(`signin:${clientIp(request)}`, AUTH_RATE_LIMIT);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }
  }

  return handlers.POST(request);
}
