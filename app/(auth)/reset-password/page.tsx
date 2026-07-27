import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// useSearchParams needs a Suspense boundary for this page to prerender.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
