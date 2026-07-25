import { withAuth, withAuthBody } from "@/lib/server/route-helpers";
import { createSettlementSchema } from "@/lib/validation";

export const GET = withAuth(({ userId, store }) => store.getSettlements(userId));

export const POST = withAuthBody(createSettlementSchema, (body, { userId, store }) =>
  store.createSettlement(userId, body)
);
