import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
  // SignInForm reads the ?next= param, so it must not be prerendered statically.
  return (
    <Suspense fallback={<div className="h-[420px]" />}>
      <SignInForm />
    </Suspense>
  );
}
