import { withAuth } from "@/lib/server/route-helpers";

export const GET = withAuth(async ({ userId, store }) => {
  const user = await store.getUserById(userId);
  if (!user) throw new Error("Signed-in user no longer exists");
  return user;
});
