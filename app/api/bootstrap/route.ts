import { loadBootstrap, type BootstrapData } from "@/lib/server/bootstrap";
import { withAuth } from "@/lib/server/route-helpers";

/**
 * One request for everything the signed-in shell needs.
 *
 * The individual endpoints still exist and still enforce their own
 * authorization — this is a read-path optimisation, not a replacement. See
 * `lib/server/bootstrap.ts` for why five calls became one.
 */
export const GET = withAuth<BootstrapData>(({ userId, store }) =>
  loadBootstrap(store, userId)
);
