// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Regression cover for the sign-in form.
 *
 * Every bug this file guards was invisible to the rest of the suite: the route
 * returned the right status, the store behaved, and the form still left the
 * user staring at a button that did nothing. The rule being enforced is that
 * **a submit always produces feedback** — silence is the failure mode that
 * makes a working app look broken and drives the retries that deepen a lockout.
 */
const signIn = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
const searchParams = new URLSearchParams();

vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => searchParams,
}));

const { SignInForm } = await import("@/components/auth/sign-in-form");

async function submit(email = "maya.alvarez@email.com", password = "demo1234") {
  const user = userEvent.setup();
  render(<SignInForm />);
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
  return user;
}

/** Any visible error banner text, or null when the form said nothing. */
function errorText(): string | null {
  const alert = document.querySelector('form [class*="ft-red"] p');
  return alert?.textContent?.trim() ?? null;
}

beforeEach(() => {
  signIn.mockReset();
  push.mockReset();
  refresh.mockReset();
  searchParams.delete("next");
});

describe("successful sign-in", () => {
  it("sends the typed credentials to the credentials provider", async () => {
    signIn.mockResolvedValue({ ok: true });
    await submit();

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "maya.alvarez@email.com",
        password: "demo1234",
        redirect: false,
      })
    );
  });

  it("navigates to the dashboard", async () => {
    signIn.mockResolvedValue({ ok: true });
    await submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("returns the user to where they were headed", async () => {
    searchParams.set("next", "/groups/g1");
    signIn.mockResolvedValue({ ok: true });
    await submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/groups/g1"));
  });

  it("ignores an absolute next target", async () => {
    // An open redirect would let a phishing link bounce off our sign-in page.
    searchParams.set("next", "https://evil.example.com/steal");
    signIn.mockResolvedValue({ ok: true });
    await submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("failed sign-in always says something", () => {
  it("reports bad credentials without revealing whether the email exists", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    await submit();

    await waitFor(() => expect(errorText()).toMatch(/don't match/i));
    expect(errorText()).not.toMatch(/no account|not registered/i);
  });

  it("does not blame credentials when the database is unreachable", async () => {
    // Auth.js reports `Configuration` when authorize() throws.
    signIn.mockResolvedValue({ error: "Configuration" });
    await submit();

    await waitFor(() => expect(errorText()).toBeTruthy());
    expect(errorText()).not.toMatch(/don't match/i);
  });

  it("explains a rate limit as a rate limit", async () => {
    signIn.mockResolvedValue({ error: "RateLimited" });
    await submit();
    await waitFor(() => expect(errorText()).toMatch(/too many/i));
  });

  it("never leaves the form silent when signIn throws", async () => {
    // The exact regression: Auth.js threw "Failed to construct 'URL'" on a
    // rate-limit response, the throw escaped before setFormError ran, and the
    // user saw nothing at all.
    signIn.mockRejectedValue(new TypeError("Failed to construct 'URL': Invalid URL"));
    await submit();

    await waitFor(() => expect(errorText()).toBeTruthy());
  });

  it("does not navigate away when sign-in failed", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    await submit();

    await waitFor(() => expect(errorText()).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });

  it("clears a previous error when the user submits again", async () => {
    signIn.mockResolvedValue({ error: "CredentialsSignin" });
    const user = await submit();
    await waitFor(() => expect(errorText()).toBeTruthy());

    signIn.mockResolvedValue({ ok: true });
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(errorText()).toBeNull());
  });
});

describe("client-side validation", () => {
  it("does not call signIn when the email is malformed", async () => {
    await submit("not-an-email", "demo1234");
    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeInTheDocument());
    expect(signIn).not.toHaveBeenCalled();
  });

  it("does not call signIn with an empty password", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), "maya.alvarez@email.com");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(signIn).not.toHaveBeenCalled());
  });
});

describe("deferred integrations stay visible but disabled", () => {
  it("shows Google sign-in as unavailable rather than hiding it", async () => {
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: /google/i })).toBeDisabled();
  });
});
