// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { equalSplit } from "@/lib/balances";
import type { AppUser, Expense, Group, Settlement } from "@/lib/types";

/**
 * Group detail is where a balance is stated as a sentence — "You're owed X" vs
 * "You owe X". Getting the direction backwards is the worst bug this screen
 * could have, and it is invisible to the server suite: the API returns the same
 * expenses either way and the sign is decided here.
 */
const openModal = vi.fn();

const state = {
  me: undefined as AppUser | undefined,
  users: [] as AppUser[],
  groups: [] as Group[],
  expenses: [] as Expense[],
  settlements: [] as Settlement[],
  pending: false,
};

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => ({ data: state.me, isPending: state.pending }),
  useUsers: () => ({ data: state.users }),
  useGroups: () => ({ data: state.groups, isPending: state.pending }),
  useExpenses: () => ({ data: state.expenses }),
  useSettlements: () => ({ data: state.settlements }),
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (selector: (s: { openModal: typeof openModal }) => unknown) =>
    selector({ openModal }),
}));

const { GroupDetailView } = await import("@/components/groups/group-detail-view");

const user = (id: string, name: string): AppUser => ({
  id,
  name,
  email: `${id}@example.com`,
  initials: name.slice(0, 2).toUpperCase(),
  color: "ft-lime",
});
const MAYA = user("u1", "Maya Alvarez");
const JORDAN = user("u2", "Jordan Lee");

const GROUP: Group = {
  id: "g1",
  name: "Lunch Crew",
  type: "friends",
  color: "ft-lime",
  memberIds: ["u1", "u2"],
  createdAt: "2026-07-01",
};

/** An expense `payer` covered, split evenly between both members. */
const expense = (id: string, amount: number, payerId: string): Expense => ({
  id,
  groupId: "g1",
  description: `expense ${id}`,
  category: "food",
  amount,
  payerId,
  splitMethod: "equal",
  splits: equalSplit(amount, ["u1", "u2"]),
  date: "2026-07-05",
});

beforeEach(() => {
  openModal.mockReset();
  state.me = MAYA;
  state.users = [MAYA, JORDAN];
  state.groups = [GROUP];
  state.expenses = [];
  state.settlements = [];
  state.pending = false;
});

const open = () => render(<GroupDetailView groupId="g1" />);

describe("which way the balance reads", () => {
  it("says you are owed when you paid", () => {
    // Maya paid ₹1000, Jordan's half is ₹500 — Maya is up ₹500.
    state.expenses = [expense("e1", 1000, "u1")];
    open();
    expect(screen.getByText(/you're owed ₹500\.00/i)).toBeInTheDocument();
  });

  it("says you owe when someone else paid", () => {
    state.expenses = [expense("e1", 1000, "u2")];
    open();
    expect(screen.getByText(/^you owe ₹500\.00$/i)).toBeInTheDocument();
  });

  it("never shows a negative amount in the sentence", () => {
    // "You owe -₹500.00" would be nonsense; the sign lives in the wording.
    state.expenses = [expense("e1", 1000, "u2")];
    open();
    expect(screen.queryByText(/-₹/)).not.toBeInTheDocument();
  });

  it("says settled when the group nets out", () => {
    state.expenses = [expense("e1", 1000, "u1"), expense("e2", 1000, "u2")];
    open();
    expect(screen.getByText(/all settled up/i)).toBeInTheDocument();
  });

  it("says settled when there is nothing at all", () => {
    open();
    expect(screen.getByText(/all settled up/i)).toBeInTheDocument();
  });
});

describe("confirmed settlements move the balance, pending ones do not", () => {
  const settlement = (status: Settlement["status"]): Settlement => ({
    id: "s1",
    groupId: "g1",
    fromUserId: "u2",
    toUserId: "u1",
    amount: 500,
    status,
    method: "upi",
    createdAt: "2026-07-06T00:00:00.000Z",
  });

  beforeEach(() => {
    state.expenses = [expense("e1", 1000, "u1")]; // Maya owed ₹500
  });

  it("a confirmed payment clears the debt", () => {
    state.settlements = [settlement("confirmed")];
    open();
    expect(screen.getByText(/all settled up/i)).toBeInTheDocument();
  });

  it("a pending payment leaves it outstanding", () => {
    // Escrow: claiming to have paid must not move the balance on its own.
    state.settlements = [settlement("pending")];
    open();
    expect(screen.getByText(/you're owed ₹500\.00/i)).toBeInTheDocument();
  });

  it("a declined payment leaves it outstanding", () => {
    state.settlements = [settlement("declined")];
    open();
    expect(screen.getByText(/you're owed ₹500\.00/i)).toBeInTheDocument();
  });
});

describe("access", () => {
  it("shows not-found for a group you are not a member of", () => {
    // The API deliberately does not distinguish "missing" from "forbidden",
    // and neither should this.
    state.groups = [];
    open();
    expect(screen.getByText(/group not found/i)).toBeInTheDocument();
  });

  it("does not show not-found while the groups query is still pending", () => {
    // Treating an unresolved query as "no access" would flash a false error at
    // every member on every load.
    state.groups = [];
    state.pending = true;
    open();
    expect(screen.queryByText(/group not found/i)).not.toBeInTheDocument();
  });
});

describe("actions carry the group", () => {
  it("opens settle-up scoped to this group", async () => {
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /settle up/i }));
    expect(openModal).toHaveBeenCalledWith({ type: "settle-up", groupId: "g1" });
  });

  it("opens add-expense scoped to this group", async () => {
    // Without the groupId the modal would default to the first group, quietly
    // filing the expense somewhere else.
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /add expense/i }));
    expect(openModal).toHaveBeenCalledWith({ type: "add-expense", groupId: "g1" });
  });
});
