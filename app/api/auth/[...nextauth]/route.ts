import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/auth";
import { AUTH_RATE_LIMIT, checkRequestRateLimit } from "@/lib/server/rate-limit";

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
export const RATE_LIMITED_ERROR = "RateLimited";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);

  if (url.pathname.endsWith("/callback/credentials")) {
    const limit = await checkRequestRateLimit(request, "signin", AUTH_RATE_LIMIT);
    if (!limit.ok) {
      /**
       * Shaped as an Auth.js callback response, not as a bare `{ error }`.
       *
       * The client helper does `new URL(data.url)` on whatever comes back, so a
       * body without a `url` throws "Failed to construct 'URL'" inside
       * `signIn()` — before the caller's error handling runs. The form then
       * showed nothing at all: the user was locked out with no explanation and
       * no reason not to keep retrying, which only extended the window.
       *
       * Returning the same `{ url }` envelope Auth.js emits for a failed
       * sign-in lets the client parse `?error=` normally and hand the caller a
       * real error code.
       */
      return NextResponse.json(
        { url: `${url.origin}/signin?error=${RATE_LIMITED_ERROR}` },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }
  }

  return handlers.POST(request);
}
