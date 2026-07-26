import { describe, it, expect } from "vitest";
import { signInErrorMessage } from "@/lib/auth-errors";

/**
 * The message a signed-out user sees is the only signal they get, so these
 * assert the distinction that actually matters: a wrong password must not read
 * like an outage, and an outage must not read like a wrong password.
 */
describe("signInErrorMessage", () => {
  it("tells a user with bad credentials to check them", () => {
    expect(signInErrorMessage("CredentialsSignin")).toMatch(/don't match/i);
  });

  it("does not blame credentials when authorize threw", () => {
    // Auth.js reports `Configuration` when the provider throws — which is what
    // an unreachable database looks like from the browser.
    const message = signInErrorMessage("Configuration");
    expect(message).not.toMatch(/don't match/i);
    expect(message).toMatch(/on our side|try again/i);
  });

  it("treats an unrecognised code as our problem, not the user's", () => {
    const message = signInErrorMessage("SomethingAuthJsAddedLater");
    expect(message).not.toMatch(/don't match/i);
  });

  it("explains a rate limit as a rate limit", () => {
    expect(signInErrorMessage("RateLimited")).toMatch(/too many/i);
  });

  it("never reveals whether the account exists", () => {
    for (const code of ["CredentialsSignin", "Configuration", "RateLimited", "Unknown"]) {
      expect(signInErrorMessage(code)).not.toMatch(/no account|not registered|unknown email/i);
    }
  });
});
