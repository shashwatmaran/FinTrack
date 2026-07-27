import { z } from "zod";
import { appLink } from "@/lib/server/app-url";
import { generateResetToken, hashToken } from "@/lib/server/password-reset";
import { withAuthParamsBody } from "@/lib/server/route-helpers";
import type { GroupInvite } from "@/lib/types";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

/** Long enough to survive a weekend and an inbox nobody checks on holiday. */
const INVITE_TTL_DAYS = 7;

export interface CreatedInvite {
  invite: GroupInvite;
  /** The only time this link is ever available — the store keeps just its hash. */
  url: string;
  expiresInDays: number;
}

/**
 * Creates an invite and hands the link straight back to whoever asked for it.
 *
 * Deliberately does not send anything. Delivery is the inviter's problem: they
 * already have a way to reach the person they are inviting, and routing it
 * through an email provider bought a dependency that could fail silently while
 * the UI insisted the invite had been sent.
 *
 * The store enforces that the caller is a member — an invite grants sight of
 * everyone's balances in that group, so it is not something an outsider may
 * hand out. The token is generated here and only its hash is stored, which is
 * why this response is the one chance to see it.
 */
export const POST = withAuthParamsBody<{ groupId: string }, typeof schema, CreatedInvite>(
  schema,
  async (params, { email }, { userId, store, request }) => {
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();

    const invite = await store.createGroupInvite(userId, {
      groupId: params.groupId,
      email,
      tokenHash: hashToken(token),
      expiresAt,
    });

    return {
      invite,
      // Not the request's origin: a link built on a dev server is one only the
      // sender can open. See lib/server/app-url.ts.
      url: appLink(`/invite?token=${encodeURIComponent(token)}`, request),
      expiresInDays: INVITE_TTL_DAYS,
    };
  }
);
