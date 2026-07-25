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
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type Values = z.infer<typeof schema>;

export function SignInForm() {
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "maya.alvarez@email.com", password: "demo-password" },
  });

  const onSubmit = handleSubmit(() => {
    signIn();
    router.push("/dashboard");
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="text-[30px] font-bold tracking-[-1px]">Welcome back</h2>
      <p className="mt-1.5 mb-6.5 text-[15px] font-medium text-ft-muted">
        Sign in to keep your groups square.
      </p>

      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="maya@example.com" {...register("email")} />
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
      <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
      <FieldError>{errors.password?.message}</FieldError>

      <Button type="submit" size="lg" className="mt-5.5 w-full" shadow disabled={isSubmitting}>
        Sign in
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
        title="OAuth provider setup is deferred until credentials are configured"
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
