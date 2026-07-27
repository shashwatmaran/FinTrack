import "server-only";

import { env } from "@/lib/env";

/**
 * The origin to put in a link someone else will open.
 *
 * Deriving this from the incoming request is wrong for anything emailed. The
 * request origin is whatever instance happened to handle the call — a laptop
 * running `npm run dev`, or an internal address behind a proxy — and an invite
 * sent from localhost arrives as a link only the sender can open.
 *
 * Precedence, most to least authoritative:
 *   1. APP_URL                          — set it and it wins, always
 *   2. VERCEL_PROJECT_PRODUCTION_URL    — the stable production domain
 *   3. the request's own origin         — right in local development
 *
 * A preview deployment's own URL is deliberately not used: those are torn down,
 * and a reset link that 404s next week is worse than one pointing at
 * production.
 */
export function appOrigin(request?: Request): string {
  const explicit = env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}

/**
 * True when a link built from this origin cannot work for anyone else.
 *
 * Worth saying out loud rather than silently sending a dead link: in
 * development that is expected, in production it means APP_URL is missing.
 */
export function isLocalOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(origin);
}

/** Builds an absolute link, warning when the result is only useful locally. */
export function appLink(path: string, request?: Request): string {
  const origin = appOrigin(request);

  if (isLocalOrigin(origin) && process.env.NODE_ENV === "production") {
    console.warn(
      `[fintrack] building a localhost link (${path}) in production — set APP_URL, ` +
        "or recipients will get a link only the server can open"
    );
  }

  return `${origin}${path}`;
}
