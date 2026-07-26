import "server-only";

import { NotFoundError, type DataStore } from "./store-types";
import type { BootstrapData } from "@/lib/types";

export type { BootstrapData };

/*
 * The client used to fetch this as five separate requests. On a persistent
 * server that costs almost nothing, but on serverless each one is its own
 * function invocation — its own cold start and its own database connection —
 * so a single page load paid that overhead five times. Measured on Vercel:
 * ~200ms of invocation overhead per call, and a dashboard that took 755ms to
 * assemble against 154ms locally.
 *
 * Activity is deliberately absent from the payload: only one page reads it,
 * and including it would make every page load fetch a feed nobody is looking
 * at.
 */

/**
 * Used by both `/api/bootstrap` and the server-rendered dashboard, so the two
 * paths cannot drift into disagreeing about what the page needs.
 *
 * The store calls run concurrently. They are independent reads against the same
 * connection pool, and issuing them in sequence would stack five round trips
 * for no reason.
 */
export async function loadBootstrap(
  store: DataStore,
  userId: string
): Promise<BootstrapData> {
  const [me, users, groups, expenses, settlements, notifications] = await Promise.all([
    store.getUserById(userId),
    store.getVisibleUsers(userId),
    store.getGroups(userId),
    store.getExpenses(userId),
    store.getSettlements(userId),
    store.getNotifications(userId),
  ]);

  // A signed-in session whose user has been deleted. Treated as not-found
  // rather than returning a payload with a null `me` the client must guard.
  if (!me) throw new NotFoundError("User not found");

  return { me, users, groups, expenses, settlements, notifications };
}
