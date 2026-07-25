import { withAuthParams } from "@/lib/server/route-helpers";

/** Toggles a recurring rule between active and paused. */
export const POST = withAuthParams<{ expenseId: string }, unknown>(
  ({ expenseId }, { userId, store }) => store.toggleRecurring(userId, expenseId)
);
