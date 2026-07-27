"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ErrorScreen } from "@/components/common/error-screen";
import { ApiError, api } from "@/lib/api/client";

/**
 * Redeems an invite as soon as the page loads.
 *
 * The page sits behind the proxy's auth guard, so an unauthenticated visitor is
 * sent to sign in with `?next=` pointing back here and lands on this component
 * with a session. That keeps the token in the URL through exactly one redirect
 * and avoids a "click to join" step that adds nothing.
 */
export function AcceptInvite() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  // React runs effects twice in development; redeeming twice is harmless but
  // the second attempt would race the redirect.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    api
      .acceptInvite(token)
      .then((group) => {
        router.replace(`/groups/${group.id}`);
        router.refresh();
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Couldn't join that group. Try again.")
      );
  }, [token, router]);

  if (!token) {
    return (
      <ErrorScreen
        contained
        icon={AlertCircle}
        accent="bg-ft-red"
        title="Invite link incomplete"
        description="This link is missing its token. Ask whoever invited you to send a new one — some mail clients trim long URLs."
        actions={
          <ButtonLink href="/groups" size="lg">
            Go to your groups
          </ButtonLink>
        }
      />
    );
  }

  if (error) {
    return (
      <ErrorScreen
        contained
        icon={AlertCircle}
        accent="bg-ft-red"
        title="That invite didn't work"
        description={error}
        actions={
          <ButtonLink href="/groups" size="lg">
            Go to your groups
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ErrorScreen
      contained
      icon={Users}
      accent="bg-ft-lime"
      title="Joining the group…"
      description="One moment while we add you."
    />
  );
}
