"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import type { BootstrapData, NotificationItem } from "@/lib/types";

// Defined in lib/query-keys.ts, not here: a server component importing from a
// "use client" module gets a proxy that cannot cross the RSC boundary.
export { queryKeys } from "@/lib/query-keys";

/**
 * Every shell hook funnels through here. TanStack dedupes by query key, so the
 * shared `queryFn` runs once per cache entry no matter how many components
 * subscribe, and `select` narrows the result without triggering another fetch.
 */
function useBootstrap<T>(select: (data: BootstrapData) => T) {
  return useQuery({ queryKey: queryKeys.bootstrap, queryFn: api.getBootstrap, select });
}

export function useCurrentUser() {
  return useBootstrap((d) => d.me);
}

export function useUsers() {
  return useBootstrap((d) => d.users);
}

export function useGroups() {
  return useBootstrap((d) => d.groups);
}

export function useExpenses() {
  return useBootstrap((d) => d.expenses);
}

export function useSettlements() {
  return useBootstrap((d) => d.settlements);
}

export function useNotifications() {
  return useBootstrap((d) => d.notifications);
}

/** Its own query: only the activity page reads it, so it stays off every other page load. */
export function useActivity() {
  return useQuery({ queryKey: queryKeys.activity, queryFn: api.getActivity });
}

export function useInsightNarrative() {
  return useQuery({
    queryKey: queryKeys.narrative,
    queryFn: api.getInsightNarrative,
    // Generation can take a couple of seconds on a small model; don't re-run
    // it just because the window regained focus.
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Every write invalidates the whole bootstrap payload rather than one slice.
 *
 * That is coarser than before but strictly more correct: a new expense also
 * changes balances, a new group also changes who is visible, and a settlement
 * changes both. Picking slices per mutation was a standing invitation to miss
 * one and leave a stale panel on screen. Refetching all of it is one request —
 * the same request the page already makes.
 */
function useShellMutation<TArgs = void, TResult = unknown>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  options: { activity?: boolean; narrative?: boolean } = {}
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.bootstrap });
      if (options.activity) client.invalidateQueries({ queryKey: queryKeys.activity });
      if (options.narrative) client.invalidateQueries({ queryKey: queryKeys.narrative });
    },
  });
}

export function useCreateExpense() {
  // Spending changed, so the cached narrative's facts are stale.
  return useShellMutation(api.createExpense, { activity: true, narrative: true });
}

export function useDeleteExpense() {
  return useShellMutation(api.deleteExpense, { activity: true, narrative: true });
}

export function useToggleRecurring() {
  return useShellMutation(api.toggleRecurring);
}

export function useCreateGroup() {
  return useShellMutation(api.createGroup, { activity: true });
}

export function useCreateSettlement() {
  return useShellMutation(api.createSettlement, { activity: true });
}

export function useResolveSettlement() {
  return useShellMutation(({ id, status }: { id: string; status: "confirmed" | "declined" }) =>
    api.resolveSettlement(id, status)
  );
}

export function useMarkNotificationsRead() {
  // Explicit type arguments: this is the one mutation that takes none, and
  // inference would otherwise make `mutate()` demand an argument.
  return useShellMutation<void, NotificationItem[]>(api.markNotificationsRead);
}
