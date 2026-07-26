"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorScreen } from "@/components/common/error-screen";

/**
 * Route-level error boundary. Catches render and data errors anywhere below the
 * root layout.
 *
 * `error.message` is shown only in development. Next.js already replaces server
 * error messages with a generic string in production, but a client-side throw
 * keeps its real message — and in an app that handles balances and settlements,
 * an unredacted message is exactly the wrong thing to paint on the screen.
 * `error.digest` is the hash Next logs alongside the real stack, so it is what
 * actually correlates a user report with the server logs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with Sentry.captureException once SENTRY_DSN is configured.
    console.error("[fintrack] unhandled error", error);
  }, [error]);

  return (
    <ErrorScreen
      icon={AlertTriangle}
      accent="bg-ft-red"
      title="Something went wrong"
      description="This page failed to load. Your data is safe — nothing was saved or changed by this error."
      detail={
        process.env.NODE_ENV === "development"
          ? error.message
          : error.digest && `Reference: ${error.digest}`
      }
      actions={
        <>
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/dashboard" variant="secondary" size="lg">
            Back to dashboard
          </ButtonLink>
        </>
      }
    />
  );
}
