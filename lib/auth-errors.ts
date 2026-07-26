/**
 * Turns an Auth.js sign-in error code into something the user can act on.
 *
 * The distinction that matters is credentials versus infrastructure. Auth.js
 * returns `CredentialsSignin` when `authorize` returns null — a genuine bad
 * password — and `Configuration` when `authorize` *threw*, which is what an
 * unreachable database looks like from the client.
 *
 * Collapsing both into "wrong password" sends users to re-check credentials
 * that were never the problem, and hides an outage from the one person who
 * would otherwise report it. That is exactly how a misconfigured deployment
 * gets mistaken for a broken login form.
 *
 * No branch reveals whether an account exists.
 */
export const SIGN_IN_ERRORS = {
  rateLimited: "RateLimited",
  badCredentials: "CredentialsSignin",
} as const;

export function signInErrorMessage(code: string): string {
  switch (code) {
    case SIGN_IN_ERRORS.rateLimited:
      return "Too many sign-in attempts from this network. Wait about a minute, then try again.";
    case SIGN_IN_ERRORS.badCredentials:
      return "That email and password don't match an account.";
    default:
      // Configuration, CallbackRouteError, and anything Auth.js adds later.
      return "We can't sign you in right now — something on our side isn't responding. Try again in a moment.";
  }
}
