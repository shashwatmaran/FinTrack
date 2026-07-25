import { withAuthParamsBody } from "@/lib/server/route-helpers";
import { resolveSettlementSchema } from "@/lib/validation";

/**
 * Confirm or decline a pending settlement. The store enforces that only the
 * recipient can confirm — this endpoint deliberately doesn't re-check, so
 * there is exactly one place that rule lives.
 */
export const PATCH = withAuthParamsBody<
  { settlementId: string },
  typeof resolveSettlementSchema,
  unknown
>(resolveSettlementSchema, ({ settlementId }, body, { userId, store }) =>
  store.resolveSettlement(userId, settlementId, body.status)
);
