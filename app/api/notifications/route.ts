import { withAuth } from "@/lib/server/route-helpers";

export const GET = withAuth(({ userId, store }) => store.getNotifications(userId));
