import "server-only";

import { randomBytes } from "node:crypto";
import type { AppUser } from "@/lib/types";
import type { DataStore } from "./store-types";

/**
 * Find-or-create for an OAuth identity, in one place.
 *
 * Extracted from the `jwt` callback in `auth.ts` when the mobile Google
 * endpoint needed the same behaviour. It is the argument this repo already
 * makes for `tests/store-contract.ts`: two copies of an account-provisioning
 * rule will drift, and only one of them runs in the path you happen to be
 * testing. A web sign-in and a phone sign-in that disagree about whether an
 * account exists is not a bug anyone would find quickly.
 *
 * The password is random and unguessable on purpose. A first-time Google user
 * gets an account they cannot sign into with a password — which is the point:
 * password sign-in for that address stays closed until they deliberately open
 * it through the reset flow. Generating something predictable here would hand
 * out a second, weaker way into every OAuth account.
 */
export async function findOrCreateOAuthUser(
  store: DataStore,
  profile: { email: string; name?: string | null }
): Promise<AppUser> {
  const existing = await store.getUserByEmail(profile.email);
  if (existing) {
    // Rebuilt rather than returned: `getUserByEmail` carries the password hash.
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      initials: existing.initials,
      color: existing.color,
    };
  }

  return store.createUser({
    name: profile.name?.trim() || profile.email.split("@")[0]!,
    email: profile.email,
    password: randomBytes(32).toString("base64url"),
  });
}
