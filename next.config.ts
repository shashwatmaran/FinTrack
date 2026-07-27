import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

/**
 * The origin the browser posts crash reports to, derived from the DSN rather
 * than hard-coded — Sentry's ingest host is per-organisation and per-region.
 *
 * Without this in `connect-src`, the CSP blocks every event and the failure is
 * invisible: Sentry stays silent and looks like an app that never crashes.
 */
const sentryIngestOrigin = (() => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
})();

/**
 * Content Security Policy.
 *
 * `script-src` keeps `'unsafe-inline'` because Next injects inline bootstrap
 * and flight-data scripts. Removing it means switching to per-request nonces,
 * which has to be done in `proxy.ts` and opts every route out of static
 * rendering — a real cost for the auth pages, which are currently static. The
 * upgrade is worth making if this ever renders user-supplied HTML; today it
 * does not, and every value that reaches the DOM goes through React's escaping.
 *
 * `'unsafe-eval'` is development-only — the HMR runtime needs it, production
 * does not.
 *
 * `connect-src` allows exactly two things: this origin, and Sentry's ingest
 * host when a DSN is configured. The AI provider is called from the server in
 * `lib/ai/client.ts`, never from the browser, so it does not belong here — if a
 * request to the model provider ever shows up blocked in the browser console,
 * that is a bug worth finding, not a policy to widen.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind and next/font both emit inline <style>; there is no nonce-free way around it.
  "style-src 'self' 'unsafe-inline'",
  // next/font self-hosts at build time, so no external font origin is needed.
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  `connect-src 'self'${sentryIngestOrigin ? ` ${sentryIngestOrigin}` : ""}`,
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  /**
   * `upgrade-insecure-requests` is deliberately absent. With `default-src
   * 'self'` every subresource is same-origin, and HSTS already forces HTTPS on
   * the deployed domain, so it protects nothing here — while breaking
   * `next start` on localhost, where it rewrites same-origin fetches to
   * https://localhost and they fail with ERR_SSL_PROTOCOL_ERROR.
   */
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Redundant with frame-ancestors for modern browsers, kept for older ones.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Cross-origin isolation for the document; keeps other origins from getting a
  // handle on this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework version.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          /**
           * HSTS is meaningless over plain HTTP and is only emitted in
           * production, where Vercel terminates TLS. `preload` is intentionally
           * absent: submitting to the preload list is effectively irreversible
           * for the apex domain, so that belongs to a deliberate decision about
           * a real domain rather than a config default.
           */
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]),
        ],
      },
      {
        // API responses are per-session and must never land in a shared cache.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

/**
 * Sentry's wrapper adds source-map upload and instruments the build. It is only
 * applied when a DSN is present, so a checkout with no credentials builds
 * exactly as it did before — the plugin otherwise emits warnings about a
 * missing org/project on every build.
 *
 * Source maps upload only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and
 * `SENTRY_PROJECT` are set. Without them errors still report, just with
 * minified stack traces — worth adding later, not required to be useful now.
 */
export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      // Hides the source maps from the deployed bundle after upload.
      widenClientFileUpload: true,
      /**
       * Routes browser events through this origin instead of Sentry's, so ad
       * blockers do not silently swallow crash reports. It also means the
       * `connect-src` allowance above is belt-and-braces rather than the only
       * thing keeping reporting alive.
       */
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
