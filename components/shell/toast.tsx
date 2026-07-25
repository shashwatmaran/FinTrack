"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { useUiStore } from "@/stores/ui-store";

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const clearToast = useUiStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clearToast, 2800);
    return () => clearTimeout(id);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-70 flex -translate-x-1/2 animate-ft-pop items-center gap-2.5 rounded-[10px] border-[2.5px] border-ft-ink bg-ft-lime px-4.5 py-3 text-sm font-bold shadow-neo-md"
    >
      <Check size={17} strokeWidth={3} />
      {toast}
    </div>
  );
}
