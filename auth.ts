import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { features } from "@/lib/env";
import { signInSchema } from "@/lib/validation";

/**
 * Auth.js v5 with email + password.
 *
 * The session strategy is JWT because the Credentials provider does not
 * support database sessions. The user record itself still lives in the store,
 * so switching to OAuth later is additive rather than a rewrite.
 */
/**
 * Google is added only when its credentials exist.
 *
 * Auth.js throws at startup for a provider with an undefined client id, so a
 * checkout without the credentials has to not list it at all — the sign-in page
 * reads the same flag and shows the button as unavailable instead.
 */
const providers: NextAuthConfig["providers"] = [];

if (features.oauthGoogle) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Google is the authority on whether the address is real and verified;
      // that is the whole reason to accept it as an identity.
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin" },
  providers: [
    ...providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Imported lazily so the MongoDB driver stays out of any bundle that
        // only needs the auth config (middleware, for instance).
        const { getStore } = await import("@/lib/server/get-store");
        const store = await getStore();
        const user = await store.getUserByEmail(email);

        // Compare against a dummy hash when the account is missing so the
        // response time doesn't reveal whether an email is registered.
        const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
        const ok = await bcrypt.compare(password, hash);
        if (!user || !ok) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    /**
     * Google users still need a record in our own store.
     *
     * There is no Auth.js database adapter here — sessions are JWTs — so
     * nothing persists an OAuth user automatically. Every part of the app keys
     * off our own user id, so the token's `sub` has to be that, not Google's.
     *
     * A first-time Google user gets an account with a random, unguessable
     * password. They cannot sign in with it, which is the point: password
     * sign-in for that address stays closed until they deliberately set one
     * through the reset flow.
     */
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        // Imported lazily so the driver stays out of the edge bundle that only
        // needs the session check.
        const { getStore } = await import("@/lib/server/get-store");
        const store = await getStore();

        const existing = await store.getUserByEmail(profile.email);
        const record =
          existing ??
          (await store.createUser({
            name: profile.name ?? profile.email.split("@")[0]!,
            email: profile.email,
            password: randomBytes(32).toString("base64url"),
          }));

        token.sub = record.id;
        return token;
      }

      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      /**
       * When this token was issued, surfaced so route handlers can refuse one
       * that predates a password change. `iat` is standard JWT and Auth.js
       * sets it; without carrying it onto the session there is no way to tell
       * an old token from a new one, and a reset would not evict anybody.
       */
      if (typeof token.iat === "number") session.user.issuedAt = token.iat;
      return session;
    },
  },
});
