"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useSessionStore } from "@/stores/session-store";

const schema = z.object({
  name: z.string().min(2, "Tell us your name"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  terms: z.literal(true, { message: "Please accept the terms to continue" }),
});

type Values = z.infer<typeof schema>;

export function SignUpForm() {
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(() => {
    signIn();
    router.push("/dashboard");
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="text-[30px] font-bold tracking-[-1px]">Create your account</h2>
      <p className="mt-1.5 mb-6.5 text-[15px] font-medium text-ft-muted">
        Free forever for up to 3 groups.
      </p>

      <Label htmlFor="name">Full name</Label>
      <Input id="name" placeholder="Maya Alvarez" {...register("name")} />
      <FieldError>{errors.name?.message}</FieldError>

      <div className="mt-4.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="maya@example.com" {...register("email")} />
        <FieldError>{errors.email?.message}</FieldError>
      </div>

      <div className="mt-4.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
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

      <Button type="submit" variant="accent" size="lg" className="mt-5.5 w-full">
        Create account
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
