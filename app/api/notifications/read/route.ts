import { withAuth } from "@/lib/server/route-helpers";

export const POST = withAuth(({ userId, store }) => store.markNotificationsRead(userId));
