import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { signInSchema } from "@/lib/validation";

/**
 * Auth.js v5 with email + password.
 *
 * The session strategy is JWT because the Credentials provider does not
 * support database sessions. The user record itself still lives in the store,
 * so switching to OAuth later is additive rather than a rewrite.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/signin" },
  providers: [
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
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
