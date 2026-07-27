import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Reset token policy, kept out of the stores.
 *
 * The store only ever sees `hashToken(token)`. Storing the token itself would
 * make a database dump equivalent to a set of account takeovers, which is the
 * whole reason a reset link is dangerous in the first place.
 */

/** Thirty minutes, which is what the UI has always told people. */
export const RESET_TOKEN_TTL_MS = 30 * 60_000;

/**
 * 32 bytes from a CSPRNG. This is a bearer credential for an account — a
 * predictable value is an account takeover, so `Math.random` is not an option.
 */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256, not bcrypt.
 *
 * bcrypt's cost exists to make guessing a *low-entropy* human password
 * expensive. This token already has 256 bits of entropy, so there is nothing
 * to brute force, and a slow hash on a lookup path would only be a way to
 * exhaust the server.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetTokenExpiry(now = new Date()): string {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString();
}

/**
 * Compares two hex digests without leaking their difference through timing.
 *
 * Only used where a caller-supplied value is compared to a stored one outside
 * a database query; the stores match on the hash directly.
 */
export function tokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
