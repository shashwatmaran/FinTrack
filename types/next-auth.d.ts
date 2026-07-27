import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** The FinTrack user id — every store call is scoped by it. */
      id: string;
      /**
       * The token's `iat`, in seconds. Compared against the user's
       * `passwordChangedAt` so a reset can evict sessions that already exist.
       */
      issuedAt?: number;
    } & DefaultSession["user"];
  }
}
