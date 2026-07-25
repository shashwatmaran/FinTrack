import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border-2 border-ft-ink bg-white px-2.5 py-[3px] text-[10.5px] font-bold",
        className
      )}
      {...props}
    />
  );
}

export function Pill({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border-2 border-ft-ink bg-white px-3 py-[5px] text-xs font-bold",
        className
      )}
      {...props}
    />
  );
}
