import { z } from "zod";
import { sendGroupInviteEmail } from "@/lib/server/email";
import { generateResetToken, hashToken } from "@/lib/server/password-reset";
import { withAuthParamsBody } from "@/lib/server/route-helpers";
import type { GroupInvite } from "@/lib/types";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

/** Long enough to survive a weekend and an inbox nobody checks on holiday. */
const INVITE_TTL_DAYS = 7;

/**
 * Invites someone to a group.
 *
 * The store enforces that the caller is a member — an invite grants sight of
 * everyone's balances in that group, so it is not something an outsider may
 * hand out. The token is generated here and only its hash is stored.
 */
export const POST = withAuthParamsBody<{ groupId: string }, typeof schema, GroupInvite>(
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

    const [group, inviter] = await Promise.all([
      store.getGroups(userId).then((gs) => gs.find((g) => g.id === params.groupId)),
      store.getUserById(userId),
    ]);

    // Additive: the invite exists whether or not the mail lands, and the link
    // can always be shared by hand.
    await sendGroupInviteEmail({
      to: email,
      inviterName: inviter?.name ?? "Someone",
      groupName: group?.name ?? "a group",
      inviteUrl: `${new URL(request.url).origin}/invite?token=${encodeURIComponent(token)}`,
      expiresInDays: INVITE_TTL_DAYS,
    });

    return invite;
  }
);
