"use client";

import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 border-[2.5px] border-ft-ink font-bold cursor-pointer transition-transform disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ft-ink focus-visible:ring-offset-2 focus-visible:ring-offset-ft-bg",
  {
    variants: {
      variant: {
        primary: "bg-ft-lime",
        secondary: "bg-white",
        accent: "bg-ft-yellow",
        pink: "bg-ft-pink",
        purple: "bg-ft-purple",
        danger: "bg-ft-red",
        ink: "bg-ft-ink text-white",
        ghost: "border-transparent bg-transparent shadow-none",
      },
      size: {
        sm: "rounded-[7px] px-3.5 py-2 text-[13px]",
        md: "rounded-lg px-[18px] py-2.5 text-sm",
        lg: "rounded-[9px] px-5 py-3.5 text-[15.5px]",
        icon: "rounded-[7px] h-[42px] w-[42px] p-0",
      },
      shadow: {
        true: "shadow-neo-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        false: "",
      },
    },
    defaultVariants: { variant: "primary", size: "md", shadow: true },
  }
);

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shadow, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, shadow }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export interface ButtonLinkProps
  extends Omit<React.ComponentProps<typeof Link>, "color">,
    VariantProps<typeof buttonVariants> {}

/** Same visual treatment as Button, but renders an anchor for navigation. */
export function ButtonLink({ className, variant, size, shadow, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(buttonVariants({ variant, size, shadow }), className)} {...props} />
  );
}
