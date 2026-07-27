"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorScreen } from "@/components/common/error-screen";

/**
 * Error boundary for the signed-in area. Renders inside `AppShell`, so a failed
 * page leaves the navigation intact and the user can move somewhere else
 * instead of hitting a dead end.
 *
 * See `app/error.tsx` for why the message is development-only.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A no-op when SENTRY_DSN is unset, so the console line stays the fallback.
    Sentry.captureException(error);
    console.error("[fintrack] page error", error);
  }, [error]);

  return (
    <ErrorScreen
      contained
      icon={AlertTriangle}
      accent="bg-ft-red"
      title="This page didn't load"
      description="Something went wrong fetching it. Your data is safe — nothing was saved or changed by this error."
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
