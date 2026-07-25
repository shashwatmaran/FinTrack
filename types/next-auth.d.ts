import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** The FinTrack user id — every store call is scoped by it. */
      id: string;
    } & DefaultSession["user"];
  }
}
