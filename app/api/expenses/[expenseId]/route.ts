import { withAuthParams } from "@/lib/server/route-helpers";

export const DELETE = withAuthParams<{ expenseId: string }, { id: string }>(
  ({ expenseId }, { userId, store }) => store.deleteExpense(userId, expenseId)
);
