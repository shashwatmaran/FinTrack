import { z } from "zod";
import { hashToken } from "@/lib/server/password-reset";
import { withAuthBody } from "@/lib/server/route-helpers";
import type { Group } from "@/lib/types";

const schema = z.object({ token: z.string().min(1) });

/**
 * Redeems an invite for the signed-in user.
 *
 * Authenticated on purpose: joining a group attaches *this* account to it, so
 * there has to be an account. The `/invite` page sends people through sign-in
 * first and returns them here.
 */
export const POST = withAuthBody<typeof schema, Group>(schema, ({ token }, { userId, store }) =>
  store.acceptGroupInvite(userId, hashToken(token))
);
