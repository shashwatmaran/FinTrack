import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { safeNextPath } from "@/lib/safe-next";

const PUBLIC_PATHS = ["/signin", "/signup", "/forgot-password", "/reset-password"];

/**
 * Route protection, server-side. Previously the shell redirected after
 * hydration, which meant unauthenticated HTML was briefly served; now an
 * unauthenticated request never reaches an app page at all.
 *
 * This is Next 16's `proxy` convention — the rename of `middleware`.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.auth?.user?.id);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isApi = pathname.startsWith("/api/");

  if (!signedIn && !isApi && !isPublic) {
    const url = new URL("/signin", request.nextUrl);
    /**
     * The query string comes too, not just the path.
     *
     * `/invite?token=…` is the whole reason: sending only the pathname dropped
     * the token before sign-in, so anyone following an invite while signed out
     * arrived at an invite page with nothing to redeem. The token is the
     * message; the path is just where to deliver it.
     */
    const next = safeNextPath(`${pathname}${request.nextUrl.search}`);
    if (next && next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // API routes must answer with JSON. Redirecting them to the sign-in page
  // would hand `fetch` an HTML body, which fails to parse and surfaces as a
  // generic error instead of an expired-session signal the client can act on.
  if (!signedIn && isApi) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (signedIn && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  /**
   * Everything except Next internals and static assets, minus four API paths
   * that are legitimately reachable without a session:
   *   api/auth   — the sign-in flow itself
   *   api/signup — account creation
   *   api/cron   — Vercel Cron, which presents a bearer secret, not a cookie;
   *                the route enforces that itself
   *   api/password — reset request and reset submit. Both are for someone who
   *                cannot sign in, so a session requirement would be circular.
   *   api/health — deployment diagnostic. It has to answer when auth is the
   *                broken thing, so requiring a session would make it useless
   *                in precisely the case it exists for.
   *   monitoring — Sentry's tunnel (`tunnelRoute` in next.config.ts). Crash
   *                reports have to get out from the signed-out pages too, and
   *                a sign-in error is exactly the kind worth hearing about.
   */
  matcher: [
    "/((?!api/auth|api/signup|api/cron|api/health|api/password|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
