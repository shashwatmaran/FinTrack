// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppUser } from "@/lib/types";

/**
 * Creating a group decides who can see whose balances from then on, so the
 * assertions here are about membership: that the people submitted are the
 * people selected, and that the creator is never left out of their own group.
 */
const mutate = vi.fn();
const showToast = vi.fn();
const onClose = vi.fn();

const state = { me: undefined as AppUser | undefined, users: [] as AppUser[] };

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => ({ data: state.me }),
  useUsers: () => ({ data: state.users }),
  useCreateGroup: () => ({ mutate, isPending: false }),
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (s: (x: { showToast: typeof showToast }) => unknown) => s({ showToast }),
}));

const { CreateGroupModal } = await import("@/components/modals/create-group-modal");

const user = (id: string, name: string): AppUser => ({
  id,
  name,
  email: `${id}@example.com`,
  initials: name.slice(0, 2).toUpperCase(),
  color: "ft-lime",
});
const MAYA = user("u1", "Maya Alvarez");
const JORDAN = user("u2", "Jordan Lee");
const SAM = user("u3", "Sam Patel");

beforeEach(() => {
  mutate.mockReset();
  showToast.mockReset();
  onClose.mockReset();
  state.me = MAYA;
  state.users = [MAYA, JORDAN, SAM];
});

const open = () => render(<CreateGroupModal onClose={onClose} />);
const submit = (u: ReturnType<typeof userEvent.setup>) =>
  u.click(screen.getByRole("button", { name: /create group|create$/i }));

describe("membership", () => {
  it("never offers you as someone to add — you are already in it", () => {
    open();
    expect(screen.queryByRole("button", { name: /maya/i })).not.toBeInTheDocument();
  });

  it("submits exactly the people picked", async () => {
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/name/i), "Goa Trip");
    await u.click(screen.getByRole("button", { name: /jordan/i }));
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].memberIds).toEqual(["u2"]);
  });

  it("drops someone deselected before submitting", async () => {
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/name/i), "Goa Trip");
    await u.click(screen.getByRole("button", { name: /jordan/i }));
    await u.click(screen.getByRole("button", { name: /sam/i }));
    await u.click(screen.getByRole("button", { name: /jordan/i })); // undo
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].memberIds).toEqual(["u3"]);
  });

  it("allows a group with nobody else in it yet", async () => {
    // A group you invite people to later is legitimate; requiring a member up
    // front would block the invite flow that exists for exactly this.
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/name/i), "Just me for now");
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].memberIds).toEqual([]);
  });
});

describe("validation", () => {
  it("refuses an unnamed group", async () => {
    const u = userEvent.setup();
    open();
    await submit(u);

    await waitFor(() => expect(screen.getByText(/give the group a name/i)).toBeInTheDocument());
    expect(mutate).not.toHaveBeenCalled();
  });

  it("refuses a one-character name", async () => {
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/name/i), "x");
    await submit(u);

    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });
});

describe("submission", () => {
  it("sends the selected type", async () => {
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/name/i), "Goa Trip");
    await u.selectOptions(screen.getByLabelText(/type/i), "trip");
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].type).toBe("trip");
  });

  it("closes and confirms only after the write succeeds", async () => {
    mutate.mockImplementation((_p, o) => o?.onSuccess?.());
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/name/i), "Goa Trip");
    await submit(u);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Group created"));
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open while the write is in flight", async () => {
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/name/i), "Goa Trip");
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
