import { z } from "zod";
import { withAuth, withAuthBody } from "@/lib/server/route-helpers";
import type { AppUser } from "@/lib/types";

export const GET = withAuth(async ({ userId, store }) => {
  const user = await store.getUserById(userId);
  if (!user) throw new Error("Signed-in user no longer exists");
  return user;
});

/**
 * Name matches `signUpSchema`, so an account cannot be edited into a state
 * signup would have rejected.
 *
 * There is no `email` field, and that is the feature: email is both the
 * sign-in identity and where a password reset is delivered, so accepting a new
 * one without proving control of that inbox would hand the account to whoever
 * typed it. Changing it needs a verification round trip — a separate feature.
 */
const schema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
});

/**
 * Edits the signed-in user's own profile.
 *
 * No id in the path or the body: the store takes the acting user as the
 * subject, so "may I edit this person?" is not a question this endpoint is
 * capable of getting wrong.
 */
export const PATCH = withAuthBody<typeof schema, AppUser>(schema, async (body, { userId, store }) =>
  store.updateUser(userId, body)
);
