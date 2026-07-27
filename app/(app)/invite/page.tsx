import { Suspense } from "react";
import { AcceptInvite } from "@/components/groups/accept-invite";

/**
 * Inside the (app) group on purpose: the proxy's auth guard sends an
 * unauthenticated visitor to sign in with `?next=/invite?token=…` and returns
 * them here afterwards, so the invite works whether or not they had an account.
 */
export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvite />
    </Suspense>
  );
}
