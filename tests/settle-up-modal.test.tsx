// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { equalSplit } from "@/lib/balances";
import type { AppUser, Expense, Group, Settlement } from "@/lib/types";

/**
 * Logging a payment is a claim, not a transfer — the balance does not move
 * until the payee confirms. These cover what the UI is responsible for: that
 * the claim it submits is the one shown, and that it says plainly the money
 * hasn't moved yet.
 */
const mutate = vi.fn();
const showToast = vi.fn();
const onClose = vi.fn();

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
  useCreateSettlement: () => ({ mutate, isPending: false }),
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (s: (x: { showToast: typeof showToast }) => unknown) => s({ showToast }),
}));

const { SettleUpModal } = await import("@/components/modals/settle-up-modal");

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

/** Jordan paid, so Maya owes half. */
const OWED: Expense = {
  id: "e1",
  groupId: "g1",
  description: "Dinner",
  category: "food",
  amount: 1000,
  payerId: "u2",
  splitMethod: "equal",
  splits: equalSplit(1000, ["u1", "u2"]),
  date: "2026-07-05",
};

beforeEach(() => {
  mutate.mockReset();
  showToast.mockReset();
  onClose.mockReset();
  state.me = MAYA;
  state.users = [MAYA, JORDAN];
  state.groups = [GROUP];
  state.expenses = [OWED];
  state.settlements = [];
});

const open = () => render(<SettleUpModal onClose={onClose} />);
const submit = (u: ReturnType<typeof userEvent.setup>) =>
  u.click(screen.getByRole("button", { name: /log payment|settle|confirm/i }));

describe("what gets submitted", () => {
  it("only ever offers a method the dropdown lists", async () => {
    // The default was "Venmo", which was not among the options — anyone who
    // left the field alone submitted a method the UI never offered.
    const u = userEvent.setup();
    open();
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const offered = Array.from(
      screen.getByLabelText(/method/i).querySelectorAll("option")
    ).map((o) => (o as HTMLOptionElement).value);

    expect(offered).toContain(mutate.mock.calls[0][0].method);
  });

  it("sends the amount as a number", async () => {
    const u = userEvent.setup();
    open();
    await u.clear(screen.getByLabelText(/amount/i));
    await u.type(screen.getByLabelText(/amount/i), "250.75");
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].amount).toBe(250.75);
  });

  it("sends the payee that is selected", async () => {
    const u = userEvent.setup();
    open();
    await u.selectOptions(screen.getByLabelText(/who did you pay/i), "u2");
    await submit(u);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].toUserId).toBe("u2");
  });

  it("never offers you as your own payee", () => {
    // The store rejects it, but the option should not exist at all.
    open();
    const options = Array.from(
      screen.getByLabelText(/who did you pay/i).querySelectorAll("option")
    ).map((o) => (o as HTMLOptionElement).value);

    expect(options).not.toContain("u1");
  });

  it("refuses a zero amount", async () => {
    const u = userEvent.setup();
    open();
    await u.clear(screen.getByLabelText(/amount/i));
    await u.type(screen.getByLabelText(/amount/i), "0");
    await submit(u);

    await waitFor(() => expect(screen.getByText(/above 0/i)).toBeInTheDocument());
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe("escrow is stated, not implied", () => {
  it("says the balance does not move until the payee confirms", () => {
    open();
    expect(screen.getByText(/only update on confirmation/i)).toBeInTheDocument();
  });

  it("names the person who has to confirm", () => {
    open();
    expect(screen.getByText(/jordan confirms/i)).toBeInTheDocument();
  });

  it("says the payment is awaiting confirmation, not that it is done", async () => {
    mutate.mockImplementation((_p, o) => o?.onSuccess?.());
    const u = userEvent.setup();
    open();
    await submit(u);

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(String(showToast.mock.calls[0][0])).toMatch(/waiting for confirmation/i);
  });
});

describe("the suggested amount", () => {
  it("prefills what would clear the balance", () => {
    // Maya owes Jordan 500 of the 1000 dinner.
    open();
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe("500");
  });

  it("explains where that number came from", () => {
    open();
    expect(screen.getByText(/clears your balance/i)).toBeInTheDocument();
  });

  it("prefills nothing when you owe nobody", () => {
    state.expenses = [];
    open();
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe("");
  });
});
