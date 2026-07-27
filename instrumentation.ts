import * as Sentry from "@sentry/nextjs";

/**
 * Server and edge error reporting.
 *
 * Stays a no-op without `SENTRY_DSN`, matching every other integration here:
 * the app runs end-to-end with no credentials set, and each feature checks its
 * own flag rather than assuming a client exists.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    /**
     * Off by default, and deliberately so.
     *
     * `sendDefaultPii` attaches request headers, cookies and the client IP to
     * every event. This app holds balances, settlements and expense
     * descriptions people wrote about their own lives; a crash report is not a
     * reason to ship that to a third party. Errors carry a stack and a route,
     * which is what actually helps.
     */
    sendDefaultPii: false,

    /**
     * Performance traces bill against a separate quota from errors. Errors are
     * the reason this exists, so traces are sampled thinly in production and
     * off in development, where the local terminal already shows everything.
     */
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Ties an event to the deploy that produced it.
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}

/**
 * Next calls this for errors thrown in server components, route handlers and
 * the request pipeline — the paths a client-side handler never sees.
 */
export const onRequestError = Sentry.captureRequestError;
