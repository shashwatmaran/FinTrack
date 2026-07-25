"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Placeholder session. Auth.js replaces this once AUTH_SECRET and the
 * MongoDB adapter are configured; until then any credentials sign in as the
 * seeded demo user so the full app is explorable.
 */
interface SessionState {
  signedIn: boolean;
  hydrated: boolean;
  signIn: () => void;
  signOut: () => void;
  setHydrated: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      signedIn: false,
      hydrated: false,
      signIn: () => set({ signedIn: true }),
      signOut: () => set({ signedIn: false }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "fintrack-session",
      partialize: (state) => ({ signedIn: state.signedIn }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
);
