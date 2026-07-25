"use client";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ModalHost } from "@/components/modals/modal-host";
import { Toast } from "@/components/shell/toast";

/**
 * Purely presentational. Access control lives in `middleware.ts`, so by the
 * time this renders the request is already known to be authenticated.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
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
