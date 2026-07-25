"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, Info, Lock, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (sentTo) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-19 w-19 animate-ft-pop-tilt items-center justify-center rounded-2xl border-[2.5px] border-ft-ink bg-ft-lime shadow-neo-md">
          <Mail size={40} strokeWidth={2} />
        </div>
        <h2 className="text-[30px] font-bold tracking-[-1px]">Check your email</h2>
        <p className="mt-2.5 text-[15px] leading-[1.55] font-medium text-ft-muted">
          We&apos;ll send a reset link to{" "}
          <span className="font-bold text-ft-ink">{sentTo}</span> once transactional email is
          connected — the link will expire in 30 minutes.
        </p>
        <div className="my-6.5 flex items-center gap-3 rounded-[10px] border-[2.5px] border-ft-ink bg-white px-4.5 py-4 text-left shadow-neo-sm">
          <Info size={22} strokeWidth={2.2} className="flex-none" />
          <span className="text-[13px] leading-[1.4] font-medium">
            Email delivery needs a provider API key, so this screen is a preview for now.
          </span>
        </div>
        <Link href="/signin" className="text-[13.5px] font-bold underline underline-offset-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((values) => setSentTo(values.email))} noValidate>
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

      <Button type="submit" variant="pink" size="lg" className="mt-5.5 w-full">
        Send reset link
      </Button>
    </form>
  );
}
