"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export const queryKeys = {
  currentUser: ["current-user"] as const,
  users: ["users"] as const,
  groups: ["groups"] as const,
  expenses: ["expenses"] as const,
  settlements: ["settlements"] as const,
  notifications: ["notifications"] as const,
  activity: ["activity"] as const,
};

export function useCurrentUser() {
  return useQuery({ queryKey: queryKeys.currentUser, queryFn: api.getCurrentUser });
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: api.getUsers });
}

export function useGroups() {
  return useQuery({ queryKey: queryKeys.groups, queryFn: api.getGroups });
}

export function useExpenses() {
  return useQuery({ queryKey: queryKeys.expenses, queryFn: api.getExpenses });
}

export function useSettlements() {
  return useQuery({ queryKey: queryKeys.settlements, queryFn: api.getSettlements });
}

export function useNotifications() {
  return useQuery({ queryKey: queryKeys.notifications, queryFn: api.getNotifications });
}

export function useActivity() {
  return useQuery({ queryKey: queryKeys.activity, queryFn: api.getActivity });
}

export function useCreateExpense() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createExpense,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.expenses });
      client.invalidateQueries({ queryKey: queryKeys.activity });
    },
  });
}

export function useDeleteExpense() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteExpense,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.expenses }),
  });
}

export function useToggleRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.toggleRecurring,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.expenses }),
  });
}

export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createGroup,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.groups });
      // A new group changes who is visible to you.
      client.invalidateQueries({ queryKey: queryKeys.users });
      client.invalidateQueries({ queryKey: queryKeys.activity });
    },
  });
}

export function useCreateSettlement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createSettlement,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.settlements });
      client.invalidateQueries({ queryKey: queryKeys.activity });
    },
  });
}

export function useResolveSettlement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "confirmed" | "declined" }) =>
      api.resolveSettlement(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.settlements }),
  });
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
}
