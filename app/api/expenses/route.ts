import { withAuth, withAuthBody } from "@/lib/server/route-helpers";
import { createExpenseSchema } from "@/lib/validation";

export const GET = withAuth(({ userId, store }) => store.getExpenses(userId));

export const POST = withAuthBody(createExpenseSchema, (body, { userId, store }) =>
  store.createExpense(userId, body)
);
