"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, ButtonLink } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/validation";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await api.resetPassword(token, password);
    } catch (error) {
      // The server says only "no longer valid" — it cannot distinguish an
      // unknown token from an expired or already-used one, and neither can we.
      setFormError(
        error instanceof ApiError ? error.message : "Something went wrong. Try again."
      );
      return;
    }
    setDone(true);
  });

  // A link with no token at all never reached the server; say so up front
  // rather than after a round trip.
  if (!token) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-19 w-19 items-center justify-center rounded-2xl border-[2.5px] border-ft-ink bg-ft-red shadow-neo-md">
          <AlertCircle size={40} strokeWidth={2} />
        </div>
        <h2 className="text-[30px] font-bold tracking-[-1px]">Link incomplete</h2>
        <p className="mt-2.5 mb-6.5 text-[15px] leading-[1.55] font-medium text-ft-muted">
          This reset link is missing its token. Request a new one — some mail clients trim long
          URLs.
        </p>
        <ButtonLink href="/forgot-password" variant="pink" size="lg">
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-19 w-19 animate-ft-pop-tilt items-center justify-center rounded-2xl border-[2.5px] border-ft-ink bg-ft-lime shadow-neo-md">
          <CheckCircle2 size={40} strokeWidth={2} />
        </div>
        <h2 className="text-[30px] font-bold tracking-[-1px]">Password changed</h2>
        <p className="mt-2.5 mb-6.5 text-[15px] leading-[1.55] font-medium text-ft-muted">
          That link has been used up and won&apos;t work again. Sign in with your new password.
        </p>
        <Button size="lg" onClick={() => router.push("/signin")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border-[2.5px] border-ft-ink bg-ft-sky shadow-neo">
        <Lock size={28} strokeWidth={2.2} />
      </div>
      <h2 className="text-[30px] font-bold tracking-[-1px]">Choose a new password</h2>
      <p className="mt-1.5 mb-6.5 text-[15px] leading-[1.5] font-medium text-ft-muted">
        Pick something you haven&apos;t used here before.
      </p>

      {formError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border-2 border-ft-ink bg-ft-red px-3.5 py-3">
          <AlertCircle size={18} strokeWidth={2.4} className="mt-px flex-none" />
          <p className="text-[13px] font-bold">{formError}</p>
        </div>
      )}

      <Label htmlFor="password">New password</Label>
      <Input
        id="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        {...register("password")}
      />
      <FieldError>{errors.password?.message}</FieldError>

      <div className="mt-4.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          {...register("confirm")}
        />
        <FieldError>{errors.confirm?.message}</FieldError>
      </div>

      <Button type="submit" size="lg" className="mt-5.5 w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Change password"}
      </Button>

      <p className="mt-6 text-center text-[13.5px] font-medium text-ft-muted">
        Changed your mind?{" "}
        <Link href="/signin" className="font-bold text-ft-ink underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
