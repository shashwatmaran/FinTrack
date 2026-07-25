"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ModalHost } from "@/components/modals/modal-host";
import { Toast } from "@/components/shell/toast";
import { useSessionStore } from "@/stores/session-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const signedIn = useSessionStore((s) => s.signedIn);
  const hydrated = useSessionStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && !signedIn) router.replace("/signin");
  }, [hydrated, signedIn, router]);

  if (!hydrated || !signedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ft-bg">
        <span className="rounded-[10px] border-[2.5px] border-ft-ink bg-white px-5 py-3 text-sm font-bold shadow-neo">
          Loading FinTrack…
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-ft-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="ft-scroll flex-1 overflow-auto px-5 pt-6.5 pb-15 md:px-7.5">
          {children}
        </main>
      </div>
      <ModalHost />
      <Toast />
    </div>
  );
}
