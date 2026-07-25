import { withAuth, withAuthBody } from "@/lib/server/route-helpers";
import { createGroupSchema } from "@/lib/validation";

export const GET = withAuth(({ userId, store }) => store.getGroups(userId));

export const POST = withAuthBody(createGroupSchema, (body, { userId, store }) =>
  store.createGroup(userId, body)
);
