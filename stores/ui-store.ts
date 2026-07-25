"use client";

import { create } from "zustand";

export type ModalKind =
  | { type: "add-expense"; groupId?: string }
  | { type: "create-group" }
  | { type: "expense-detail"; expenseId: string }
  | { type: "settle-up"; toUserId?: string; groupId?: string }
  | { type: "invite" }
  | { type: "export" }
  | { type: "change-password" };

interface UiState {
  modal: ModalKind | null;
  notificationsOpen: boolean;
  toast: string | null;
  simplifyDebts: boolean;
  expenseGroupFilter: string;
  activityGroupFilter: string;
  openModal: (modal: ModalKind) => void;
  closeModal: () => void;
  toggleNotifications: () => void;
  closeNotifications: () => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  toggleSimplify: () => void;
  setExpenseGroupFilter: (groupId: string) => void;
  setActivityGroupFilter: (groupId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  modal: null,
  notificationsOpen: false,
  toast: null,
  simplifyDebts: false,
  expenseGroupFilter: "all",
  activityGroupFilter: "all",
  openModal: (modal) => set({ modal, notificationsOpen: false }),
  closeModal: () => set({ modal: null }),
  toggleNotifications: () => set((s) => ({ notificationsOpen: !s.notificationsOpen })),
  closeNotifications: () => set({ notificationsOpen: false }),
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
  toggleSimplify: () => set((s) => ({ simplifyDebts: !s.simplifyDebts })),
  setExpenseGroupFilter: (expenseGroupFilter) => set({ expenseGroupFilter }),
  setActivityGroupFilter: (activityGroupFilter) => set({ activityGroupFilter }),
}));
