import { QueryClient } from "@tanstack/react-query";

/**
 * Query defaults, shared by the browser client and the per-request server one.
 *
 * They have to match: a server-prefetched entry that the browser considers
 * stale on arrival gets refetched immediately, which would spend the round trip
 * the prefetch was meant to save.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
