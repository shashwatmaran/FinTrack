"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Info, Lock, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api/client";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  /**
   * The confirmation is shown whatever the server says.
   *
   * The endpoint answers identically for a known and an unknown address, and
   * this screen has to as well — showing "no account with that email" here
   * would hand back exactly the account-existence signal the endpoint is
   * careful not to leak. Even a failed request lands on the same screen.
   */
  const onSubmit = handleSubmit(async ({ email }) => {
    await api.requestPasswordReset(email).catch(() => {});
    setSentTo(email);
  });

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-19 w-19 animate-ft-pop-tilt items-center justify-center rounded-2xl border-[2.5px] border-ft-ink bg-ft-lime shadow-neo-md">
          <Mail size={40} strokeWidth={2} />
        </div>
        <h2 className="text-[30px] font-bold tracking-[-1px]">Check your email</h2>
        <p className="mt-2.5 text-[15px] leading-[1.55] font-medium text-ft-muted">
          If an account exists for{" "}
          <span className="font-bold text-ft-ink">{sentTo}</span>, a reset link is on its way. It
          expires in 30 minutes and can only be used once.
        </p>
        <div className="my-6.5 flex items-center gap-3 rounded-[10px] border-[2.5px] border-ft-ink bg-white px-4.5 py-4 text-left shadow-neo-sm">
          <Info size={22} strokeWidth={2.2} className="flex-none" />
          <span className="text-[13px] leading-[1.4] font-medium">
            We don&apos;t say whether that address has an account — that would let anyone check
            who is registered here.
          </span>
        </div>
        <Link href="/signin" className="text-[13.5px] font-bold underline underline-offset-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Link
        href="/signin"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-bold"
      >
        <ChevronLeft size={16} strokeWidth={2.6} />
        Back to sign in
      </Link>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border-[2.5px] border-ft-ink bg-ft-sky shadow-neo">
        <Lock size={28} strokeWidth={2.2} />
      </div>
      <h2 className="text-[30px] font-bold tracking-[-1px]">Reset your password</h2>
      <p className="mt-1.5 mb-6.5 text-[15px] leading-[1.5] font-medium text-ft-muted">
        Enter the email tied to your account and we&apos;ll send a reset link.
      </p>

      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="maya@example.com" {...register("email")} />
      <FieldError>{errors.email?.message}</FieldError>

      <Button type="submit" variant="pink" size="lg" className="mt-5.5 w-full" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
