"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { signUpSchema } from "@/lib/validation";

const formSchema = signUpSchema.extend({
  terms: z.literal(true, { message: "Please accept the terms to continue" }),
});

type Values = z.infer<typeof formSchema>;

export function SignUpForm() {
  const router = useRouter();
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
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (result?.error) {
      setFormError("Account created, but sign-in failed. Try signing in.");
      return;
    }

    router.push("/dashboard");
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
