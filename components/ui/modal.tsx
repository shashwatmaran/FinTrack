"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  headerClassName,
  className,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  headerClassName?: string;
  className?: string;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/45 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "my-auto w-full max-w-lg animate-ft-pop overflow-hidden rounded-xl border-[3px] border-ft-ink bg-ft-bg shadow-neo-lg",
          className
        )}
      >
        <div
          className={cn(
            "flex items-start justify-between gap-4 border-b-[3px] border-ft-ink bg-ft-lime px-5 py-4",
            headerClassName
          )}
        >
          <div>
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] font-medium text-ft-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-md border-2 border-ft-ink bg-white shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <X size={16} strokeWidth={2.6} />
          </button>
        </div>
        <div className="ft-scroll max-h-[70vh] overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
