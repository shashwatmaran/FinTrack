import { NextResponse } from "next/server";
import { features } from "@/lib/env";

/**
 * Deployment diagnostic: answers "why is this environment behaving differently
 * from local?" in one request.
 *
 * It exists because the three failure modes of a fresh deploy are
 * indistinguishable from the browser. A missing `MONGODB_URI` silently falls
 * back to the in-memory store (the app *works*, but data resets); a set-but-
 * unreachable cluster surfaces as a sign-in failure; a missing `AUTH_SECRET`
 * also surfaces as a sign-in failure. Telling those apart otherwise means
 * reading platform logs.
 *
 * Deliberately detail-free: booleans and status words only. No connection
 * string, no hostname, no database name, no document counts, no error text —
 * a driver error message routinely contains the full URI including credentials,
 * which is exactly what must never be served to an unauthenticated caller.
 */
export const dynamic = "force-dynamic";

type DbStatus = "connected" | "in-memory" | "unreachable";

export async function GET() {
  let database: DbStatus = "in-memory";

  if (features.database) {
    try {
      // Imported lazily so the driver stays out of the bundle when unused.
      const { getDb } = await import("@/lib/db/client");
      const db = await getDb();
      await db.command({ ping: 1 });
      database = "connected";
    } catch (error) {
      // Logged in full server-side, reported as one word to the caller.
      console.error("[fintrack] health check: database unreachable:", error);
      database = "unreachable";
    }
  }

  const authUrlIsLocalhost = /localhost|127\.0\.0\.1/.test(process.env.AUTH_URL ?? "");
  // Localhost is the correct value in development — it only indicates a
  // misconfiguration once the app is actually deployed.
  const misroutedAuth = authUrlIsLocalhost && process.env.NODE_ENV === "production";
  const healthy = database !== "unreachable" && features.auth && !misroutedAuth;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      /**
       * `features.auth` requires MONGODB_URI as well as AUTH_SECRET, so report
       * the secret separately — otherwise a missing database makes it look like
       * the secret is missing too, which sends you after the wrong variable.
       */
      authSecret: Boolean(process.env.AUTH_SECRET),
      /**
       * Reported because copying `.env.local` into a hosting dashboard carries
       * `AUTH_URL=http://localhost:3000` with it. Auth.js then authenticates
       * correctly and redirects the browser to localhost, which looks exactly
       * like a failed sign-in. The value itself is never echoed — only whether
       * it points somewhere that cannot be right in a deployment.
       */
      authUrlIsLocalhost,
      aiNarratives: features.aiInsights,
      scheduledJobs: features.scheduledJobs,
      /**
       * The remaining integrations, each a plain boolean.
       *
       * These exist because "I added the variables" and "the running
       * deployment has them" are different statements — Vercel bakes env vars
       * in at build time, so a change without a redeploy leaves the old build
       * running with the old (absent) values, and every affected feature just
       * stays quietly dark.
       */
      googleSignIn: features.oauthGoogle,
      email: features.email,
      errorReporting: features.errorReporting,
      sharedRateLimit: features.sharedRateLimit,
      /** Which commit is actually serving this, so "did it deploy?" is answerable. */
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
