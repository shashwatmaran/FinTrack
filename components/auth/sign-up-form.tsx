"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { safeNextPath } from "@/lib/safe-next";
import { signUpSchema } from "@/lib/validation";

const formSchema = signUpSchema.extend({
  terms: z.literal(true, { message: "Please accept the terms to continue" }),
});

type Values = z.infer<typeof formSchema>;

export function SignUpForm() {
  const router = useRouter();
  /**
   * Someone following an invite with no account arrives here, so the
   * destination has to survive signup as well as sign-in — otherwise the token
   * is lost at the last step of the very journey it exists for.
   */
  const nextPath = safeNextPath(useSearchParams().get("next"));
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async ({ terms: _terms, ...values }) => {
    setFormError(null);
    try {
      await api.signUp(values);
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Could not create your account. Try again."
      );
      return;
    }

    // Account exists; establish the session through the same provider that
    // normal sign-in uses rather than minting a token here.
    //
    // Everything past this point must still say the account was created. The
    // signup succeeded, so telling the user it failed would send them back to
    // create a duplicate and hit "email already registered".
    let result: Awaited<ReturnType<typeof signIn>> | undefined;
    try {
      result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });
    } catch {
      setFormError("Account created, but signing you in failed. Try signing in.");
      return;
    }

    if (result?.error) {
      setFormError(
        result.error === "RateLimited"
          ? "Account created. Too many sign-in attempts from this network — wait a minute, then sign in."
          : "Account created, but sign-in failed. Try signing in."
      );
      return;
    }

    router.push(nextPath ?? "/dashboard");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="text-[30px] font-bold tracking-[-1px]">Create your account</h2>
      <p className="mt-1.5 mb-6.5 text-[15px] font-medium text-ft-muted">
        Free forever for up to 3 groups.
      </p>

      {formError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[10px] border-2 border-ft-ink bg-ft-red px-3.5 py-3">
          <AlertCircle size={18} strokeWidth={2.4} className="mt-px flex-none" />
          <p className="text-[13px] font-bold">{formError}</p>
        </div>
      )}

      <Label htmlFor="name">Full name</Label>
      <Input id="name" autoComplete="name" placeholder="Maya Alvarez" {...register("name")} />
      <FieldError>{errors.name?.message}</FieldError>

      <div className="mt-4.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="maya@example.com"
          {...register("email")}
        />
        <FieldError>{errors.email?.message}</FieldError>
      </div>

      <div className="mt-4.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          {...register("password")}
        />
        <FieldError>{errors.password?.message}</FieldError>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.4] font-semibold">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 flex-none accent-ft-lime"
          {...register("terms")}
        />
        <span>
          I agree to the <span className="font-bold underline">Terms</span> &amp;{" "}
          <span className="font-bold underline">Privacy Policy</span>.
        </span>
      </label>
      <FieldError>{errors.terms?.message}</FieldError>

      <Button
        type="submit"
        variant="accent"
        size="lg"
        className="mt-5.5 w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="mt-6 text-center text-[13.5px] font-medium text-ft-muted">
        Already have an account?{" "}
        <Link href="/signin" className="font-bold text-ft-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
