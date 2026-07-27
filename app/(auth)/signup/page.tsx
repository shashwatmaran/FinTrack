import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  // SignUpForm reads the ?next= param, so it must not be prerendered statically.
  return (
    <Suspense fallback={<div className="h-[520px]" />}>
      <SignUpForm />
    </Suspense>
  );
}
