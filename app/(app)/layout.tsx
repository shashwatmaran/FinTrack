import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { auth } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";
import { makeQueryClient } from "@/lib/query-client";
import { loadBootstrap } from "@/lib/server/bootstrap";
import { getStore } from "@/lib/server/get-store";
import { queryKeys } from "@/lib/query-keys";

/**
 * The signed-in shell, server-rendered with its data already in the query
 * cache.
 *
 * The prefetch belongs here rather than on an individual page because the shell
 * itself reads it — the nav, the notification badge and every page below all
 * subscribe to the same bootstrap query. Prefetching one level lower left the
 * shell outside the boundary, so it issued the request anyway and the round
 * trip came back.
 *
 * Reading the store here runs next to the database instead of making the
 * browser ask for the data after the HTML lands, which is two sequential round
 * trips before anything but a skeleton appears.
 *
 * Failures are not caught on purpose: an unreachable database throws and
 * `app/(app)/error.tsx` renders. Falling back to a client fetch would just
 * restore the round trip on the slowest possible path.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const queryClient = makeQueryClient();

  // The proxy guarantees a session here; this narrows the type and covers the
  // window where one expires between the two checks.
  const userId = session?.user?.id;
  if (userId) {
    const store = await getStore();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.bootstrap,
      queryFn: () => loadBootstrap(store, userId),
    });
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AppShell>{children}</AppShell>
    </HydrationBoundary>
  );
}
