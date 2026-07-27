// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppUser, Group } from "@/lib/types";

/**
 * Invites hand back a link rather than emailing one.
 *
 * The previous version claimed "they have a link to join" whether or not the
 * provider accepted it, which was untrue for every recipient but the account
 * owner. Now the link is the deliverable, and the assertions are that it is
 * actually shown and that the screen is honest about what it did.
 */
const inviteToGroup = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);
const onClose = vi.fn();

const state = { me: undefined as AppUser | undefined, groups: [] as Group[] };

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => ({ data: state.me }),
  useGroups: () => ({ data: state.groups }),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, api: { inviteToGroup: (...a: unknown[]) => inviteToGroup(...a) } };
});

const { InviteModal } = await import("@/components/modals/invite-modal");

const MAYA: AppUser = {
  id: "u1",
  name: "Maya Alvarez",
  email: "u1@example.com",
  initials: "MA",
  color: "ft-lime",
};
const GROUP: Group = {
  id: "g1",
  name: "Lunch Crew",
  type: "friends",
  color: "ft-lime",
  memberIds: ["u1"],
  createdAt: "2026-07-01",
};

const URL_ = "https://fintrack.example.com/invite?token=abc123";

beforeEach(() => {
  inviteToGroup.mockReset().mockResolvedValue({
    invite: { id: "i1", groupId: "g1", email: "jordan@example.com", status: "pending" },
    url: URL_,
    expiresInDays: 7,
  });
  writeText.mockClear();
  onClose.mockReset();
  state.me = MAYA;
  state.groups = [GROUP];
  // `navigator.clipboard` is getter-only, so assignment throws.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

const open = () => render(<InviteModal onClose={onClose} />);

/**
 * userEvent.setup() installs its own clipboard stub, so ours has to go back
 * afterwards or the copy assertions watch the wrong object.
 */
function setupUser() {
  const u = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return u;
}

async function createInvite(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText(/their email/i), "jordan@example.com");
  await u.click(screen.getByRole("button", { name: /create invite link/i }));
}

describe("creating an invite", () => {
  it("shows the link it got back", async () => {
    const u = userEvent.setup();
    open();
    await createInvite(u);

    await waitFor(() => expect(screen.getByTestId("invite-url")).toHaveTextContent(URL_));
  });

  it("copies the link to the clipboard", async () => {
    const u = setupUser();
    open();
    await createInvite(u);
    await waitFor(() => expect(screen.getByRole("button", { name: /copy link/i })).toBeVisible());

    await u.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("still shows the link when the clipboard is refused", async () => {
    // Permission can be denied; the text is on screen to select by hand.
    writeText.mockRejectedValue(new Error("denied"));
    const u = setupUser();
    open();
    await createInvite(u);
    await waitFor(() => expect(screen.getByRole("button", { name: /copy link/i })).toBeVisible());

    await u.click(screen.getByRole("button", { name: /copy link/i }));
    expect(screen.getByTestId("invite-url")).toHaveTextContent(URL_);
  });

  it("warns that the link cannot be recovered", async () => {
    // Only the hash is stored, so this really is the one chance to see it.
    const u = userEvent.setup();
    open();
    await createInvite(u);

    await waitFor(() => expect(screen.getByText(/isn't recoverable later/i)).toBeInTheDocument());
  });

  it("sends the group and email to the API", async () => {
    const u = userEvent.setup();
    open();
    await createInvite(u);

    await waitFor(() => expect(inviteToGroup).toHaveBeenCalledWith("g1", "jordan@example.com"));
  });
});

describe("honesty about email", () => {
  it("never claims anything was sent", async () => {
    const u = userEvent.setup();
    open();
    await createInvite(u);

    await waitFor(() => expect(screen.getByTestId("invite-url")).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/invite sent|we've emailed|on its way/i);
  });

  it("says up front that the address is only a label", () => {
    open();
    expect(screen.getByText(/nothing is emailed/i)).toBeInTheDocument();
  });

  it("says what joining exposes", () => {
    // An invite grants sight of everyone's balances in that group.
    open();
    expect(screen.getByText(/see every expense and balance/i)).toBeInTheDocument();
  });
});

describe("failure and validation", () => {
  it("surfaces an API error instead of a link", async () => {
    inviteToGroup.mockRejectedValue(new Error("nope"));
    const u = userEvent.setup();
    open();
    await createInvite(u);

    await waitFor(() =>
      expect(screen.getByText(/couldn't create that invite/i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId("invite-url")).not.toBeInTheDocument();
  });

  it("refuses a malformed address", async () => {
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/their email/i), "not-an-email");
    await u.click(screen.getByRole("button", { name: /create invite link/i }));

    await waitFor(() => expect(inviteToGroup).not.toHaveBeenCalled());
  });

  it("explains itself when you have no groups yet", () => {
    state.groups = [];
    open();
    expect(screen.getByText(/create a group first/i)).toBeInTheDocument();
  });
});
