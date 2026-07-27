import * as Sentry from "@sentry/nextjs";

/**
 * Browser error reporting.
 *
 * Reads `NEXT_PUBLIC_SENTRY_DSN` rather than `SENTRY_DSN`: only `NEXT_PUBLIC_*`
 * names are inlined into the client bundle. The DSN is not a secret — it is
 * designed to ship to browsers, and it only permits *writing* events — so
 * mirroring the value under both names is safe. The auth token that would let
 * someone *read* your issues is a different credential and is not used here.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // See instrumentation.ts — this app's data does not belong in crash reports.
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

    /**
     * Noise that is not a bug in this app: extensions injecting scripts, and
     * the abort a browser reports when the user navigates mid-request.
     */
    ignoreErrors: [
      "ResizeObserver loop",
      "AbortError",
      "Non-Error promise rejection captured",
    ],
  });
}

/** Lets Sentry tie an error to the navigation that was in flight. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
