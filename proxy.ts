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

  /**
   * API routes must answer with JSON. Redirecting them to the sign-in page
   * would hand `fetch` an HTML body, which fails to parse and surfaces as a
   * generic error instead of an expired-session signal the client can act on.
   *
   * `signedIn` comes from `request.auth`, which reads the session **cookie**.
   * The native client has no cookie — it sends a Bearer token — so without the
   * exemption below a perfectly valid mobile request is rejected here, before
   * ever reaching the handler that would accept it.
   *
   * Presence of the header is not a security decision. It only defers the check
   * to `withAuth*`, which verifies the signature properly; anyone can send the
   * word "Bearer" and will simply be 401'd one layer down. This proxy was never
   * what enforced API auth — it is a redundant early exit.
   */
  const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ") ?? false;
  if (!signedIn && isApi && !hasBearer) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (signedIn && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  /**
   * Everything except Next internals and static assets, minus the paths that
   * are legitimately reachable without a session:
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
   *   icon,      — the generated favicon and touch icon. They have no file
   *   apple-icon   extension, so the image rule at the end does not cover them,
   *                and without this a signed-out visitor's browser asks for the
   *                tab icon and is handed the sign-in page's HTML.
   *   api/mobile/v1/session
   *              — the native client exchanging credentials for a Bearer token.
   *                Same argument as api/auth: it is how you get a session, so
   *                requiring one is circular. Covers the `/google` variant too.
   *   .well-known — Android App Links verification fetches
   *                `/.well-known/assetlinks.json` unauthenticated. It is not
   *                under /api/, has no image extension, and is not public, so
   *                without this Google's verifier is redirected to /signin.
   *                Verification then fails with no error anywhere and invite
   *                links quietly open the browser instead of the app — the same
   *                silent failure the generated icons had.
   */
  matcher: [
    "/((?!api/auth|api/signup|api/cron|api/health|api/password|api/mobile/v1/session|monitoring|icon|apple-icon|\\.well-known|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
