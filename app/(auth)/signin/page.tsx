import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { features } from "@/lib/env";

export default function SignInPage() {
  // SignInForm reads the ?next= param, so it must not be prerendered statically.
  return (
    <Suspense fallback={<div className="h-[420px]" />}>
      {/*
        Passed down rather than read in the component: `features` is derived
        from server-side env, and a client bundle only ever sees NEXT_PUBLIC_*
        names — reading it there would always report Google as unavailable.
      */}
      <SignInForm googleEnabled={features.oauthGoogle} />
    </Suspense>
  );
}
