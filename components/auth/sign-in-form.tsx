"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { signInSchema, type SignInValues } from "@/lib/validation";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await signIn("credentials", { ...values, redirect: false });

    if (result?.error) {
      // Deliberately vague: don't reveal whether the email exists.
      setFormError("That email and password don't match an account.");
      return;
    }

    const next = searchParams.get("next");
    router.push(next?.startsWith("/") ? next : "/dashboard");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="text-[30px] font-bold tracking-[-1px]">Welcome back</h2>
      <p className="mt-1.5 mb-6.5 text-[15px] font-medium text-ft-muted">
        Sign in to keep your groups square.
      </p>

      {formError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border-2 border-ft-ink bg-ft-red px-3.5 py-3">
          <AlertCircle size={18} strokeWidth={2.4} className="mt-px flex-none" />
          <p className="text-[13px] font-bold">{formError}</p>
        </div>
      )}

      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        placeholder="maya@example.com"
        {...register("email")}
      />
      <FieldError>{errors.email?.message}</FieldError>

      <div className="mt-4.5 mb-[7px] flex items-center justify-between">
        <Label htmlFor="password" className="mb-0">
          Password
        </Label>
        <Link
          href="/forgot-password"
          className="text-[12.5px] font-bold underline underline-offset-2"
        >
          Forgot?
        </Link>
      </div>
      <Input
        id="password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        {...register("password")}
      />
      <FieldError>{errors.password?.message}</FieldError>

      <Button type="submit" size="lg" className="mt-5.5 w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <div className="my-5.5 flex items-center gap-3">
        <span className="h-0.5 flex-1 bg-ft-ink/25" />
        <span className="text-[12.5px] font-semibold text-ft-muted">or</span>
        <span className="h-0.5 flex-1 bg-ft-ink/25" />
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        title="Google sign-in needs OAuth client credentials"
        disabled
      >
        Continue with Google — coming soon
      </Button>

      <p className="mt-6 text-center text-[13.5px] font-medium text-ft-muted">
        New here?{" "}
        <Link href="/signup" className="font-bold text-ft-ink underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </form>
  );
}
