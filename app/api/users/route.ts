import { withAuth } from "@/lib/server/route-helpers";

/** Only people who share a group with the caller — never the whole user table. */
export const GET = withAuth(({ userId, store }) => store.getVisibleUsers(userId));
