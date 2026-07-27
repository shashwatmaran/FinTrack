// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppUser, Expense, Group, Settlement } from "@/lib/types";

/**
 * Escrow at the UI layer.
 *
 * The store already refuses to let a payer confirm their own payment — that is
 * covered by the contract suite against both implementations. What only exists
 * here is whether the payer is *offered* the button. A control that always
 * fails is worse than no control: it tells the person the app is broken rather
 * than that the action was never theirs to take.
 */
const mutate = vi.fn();
const showToast = vi.fn();

const state = {
  me: undefined as AppUser | undefined,
  users: [] as AppUser[],
  groups: [] as Group[],
  expenses: [] as Expense[],
  settlements: [] as Settlement[],
};

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => ({ data: state.me }),
  useUsers: () => ({ data: state.users }),
  useGroups: () => ({ data: state.groups }),
  useExpenses: () => ({ data: state.expenses }),
  useSettlements: () => ({ data: state.settlements }),
  useResolveSettlement: () => ({ mutate, isPending: false }),
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (s: (x: Record<string, unknown>) => unknown) =>
    s({ showToast, openModal: () => {}, simplifyDebts: false, toggleSimplifyDebts: () => {} }),
}));

const { SettlementsView } = await import("@/components/settlements/settlements-view");

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

const settlement = (from: string, to: string): Settlement => ({
  id: "s1",
  groupId: "g1",
  fromUserId: from,
  toUserId: to,
  amount: 500,
  status: "pending",
  method: "UPI",
  createdAt: "2026-07-06T00:00:00.000Z",
});

beforeEach(() => {
  mutate.mockReset();
  showToast.mockReset();
  state.me = MAYA;
  state.users = [MAYA, JORDAN];
  state.groups = [GROUP];
  state.expenses = [];
  state.settlements = [];
});

const open = () => render(<SettlementsView />);

describe("only the payee can resolve", () => {
  it("offers confirm and dispute when the payment is to you", () => {
    state.settlements = [settlement("u2", "u1")]; // Jordan paid Maya
    open();

    expect(screen.getByRole("button", { name: /confirm received/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dispute/i })).toBeInTheDocument();
  });

  it("offers neither when you are the one who paid", () => {
    // The store would reject it anyway; showing the button would just be a
    // promise the app cannot keep.
    state.settlements = [settlement("u1", "u2")]; // Maya paid Jordan
    open();

    expect(screen.queryByRole("button", { name: /confirm received/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dispute/i })).not.toBeInTheDocument();
  });

  it("says who it is waiting on instead", () => {
    state.settlements = [settlement("u1", "u2")];
    open();
    expect(screen.getByText(/waiting for jordan/i)).toBeInTheDocument();
  });
});

describe("resolving", () => {
  beforeEach(() => {
    state.settlements = [settlement("u2", "u1")];
  });

  it("confirms with the settlement's own id", async () => {
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /confirm received/i }));

    expect(mutate.mock.calls[0][0]).toEqual({ id: "s1", status: "confirmed" });
  });

  it("declines rather than confirming when disputed", async () => {
    // Getting this backwards would move money on a payment the user rejected.
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /dispute/i }));

    expect(mutate.mock.calls[0][0]).toEqual({ id: "s1", status: "declined" });
  });

  it("confirms only after the write succeeds", async () => {
    mutate.mockImplementation((_a, o) => o?.onSuccess?.());
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /confirm received/i }));

    expect(showToast).toHaveBeenCalledWith("Payment confirmed");
  });

  it("says nothing while the write is still in flight", async () => {
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /confirm received/i }));

    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("which settlements appear", () => {
  it("lists a pending one", () => {
    state.settlements = [settlement("u2", "u1")];
    open();
    expect(screen.getByText(/jordan paid you/i)).toBeInTheDocument();
  });

  it("does not offer to resolve one that is already confirmed", () => {
    state.settlements = [{ ...settlement("u2", "u1"), status: "confirmed" }];
    open();
    expect(screen.queryByRole("button", { name: /confirm received/i })).not.toBeInTheDocument();
  });

  it("does not offer to resolve one that was declined", () => {
    state.settlements = [{ ...settlement("u2", "u1"), status: "declined" }];
    open();
    expect(screen.queryByRole("button", { name: /confirm received/i })).not.toBeInTheDocument();
  });
});
