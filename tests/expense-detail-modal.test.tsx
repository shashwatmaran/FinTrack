// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { equalSplit } from "@/lib/balances";
import type { AppUser, Expense, Group } from "@/lib/types";

/**
 * The detail modal restates one expense from the reader's point of view: what
 * they owe on it, or what they are owed. That reframing is done here and
 * nowhere else, so getting it backwards is invisible to every server-side
 * test — the API returns the same expense either way.
 */
const mutate = vi.fn();
const showToast = vi.fn();
const onClose = vi.fn();

const state = {
  me: undefined as AppUser | undefined,
  users: [] as AppUser[],
  groups: [] as Group[],
  expenses: [] as Expense[],
};

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => ({ data: state.me }),
  useUsers: () => ({ data: state.users }),
  useGroups: () => ({ data: state.groups }),
  useExpenses: () => ({ data: state.expenses }),
  useDeleteExpense: () => ({ mutate, isPending: false }),
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (s: (x: { showToast: typeof showToast }) => unknown) => s({ showToast }),
}));

const { ExpenseDetailModal } = await import("@/components/modals/expense-detail-modal");

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

const expense = (payerId: string, over = {}): Expense => ({
  id: "e1",
  groupId: "g1",
  description: "Thai takeout",
  category: "food",
  amount: 1000,
  payerId,
  splitMethod: "equal",
  splits: equalSplit(1000, ["u1", "u2"]),
  date: "2026-07-05",
  ...over,
});

beforeEach(() => {
  mutate.mockReset();
  showToast.mockReset();
  onClose.mockReset();
  state.me = MAYA;
  state.users = [MAYA, JORDAN];
  state.groups = [GROUP];
  state.expenses = [expense("u1")];
});

const open = () => render(<ExpenseDetailModal expenseId="e1" onClose={onClose} />);

describe("your position on the expense", () => {
  it("shows what you are owed when you paid", () => {
    // Maya paid 1000 and her own share is 500, so she is owed 500 — not 1000.
    state.expenses = [expense("u1")];
    open();
    expect(screen.getByText(/you're owed ₹500\.00/i)).toBeInTheDocument();
  });

  it("shows what you owe when someone else paid", () => {
    state.expenses = [expense("u2")];
    open();
    expect(screen.getByText(/^you owe ₹500\.00$/i)).toBeInTheDocument();
  });

  it("never presents the full amount as your position", () => {
    // Showing the expense total as what you are owed overstates it by your
    // own share, which is the easy mistake here.
    state.expenses = [expense("u1")];
    open();
    expect(screen.queryByText(/you're owed ₹1,000\.00/i)).not.toBeInTheDocument();
  });

  it("says who paid", () => {
    state.expenses = [expense("u2")];
    open();
    expect(screen.getByText(/jordan lee paid/i)).toBeInTheDocument();
  });

  it("says 'You paid' rather than your own name", () => {
    state.expenses = [expense("u1")];
    open();
    expect(screen.getByText(/you paid/i)).toBeInTheDocument();
  });
});

describe("the split breakdown", () => {
  it("lists a row per participant", () => {
    open();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
  });

  it("marks which participant paid", () => {
    open();
    expect(screen.getByText("paid")).toBeInTheDocument();
  });

  it("shows the shares in rupees", () => {
    open();
    expect(screen.getAllByText("₹500.00").length).toBeGreaterThanOrEqual(2);
  });
});

describe("notes", () => {
  it("shows them when present", () => {
    state.expenses = [expense("u1", { notes: "Split the tip evenly" })];
    open();
    expect(screen.getByText(/split the tip evenly/i)).toBeInTheDocument();
  });

  it("omits the section entirely when there are none", () => {
    open();
    expect(screen.queryByText(/^notes$/i)).not.toBeInTheDocument();
  });
});

describe("deleting", () => {
  it("deletes by the expense's own id", async () => {
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /delete/i }));
    expect(mutate.mock.calls[0][0]).toBe("e1");
  });

  it("closes and confirms only after the delete succeeds", async () => {
    mutate.mockImplementation((_id, o) => o?.onSuccess?.());
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /delete/i }));

    expect(showToast).toHaveBeenCalledWith("Expense deleted");
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open while the delete is in flight", async () => {
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: /delete/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("an expense that is already gone", () => {
  it("says so instead of rendering a broken shell", () => {
    // Someone else can delete it while this modal is open.
    state.expenses = [];
    open();
    expect(screen.getByText(/no longer exists/i)).toBeInTheDocument();
  });

  it("offers no delete button for it", () => {
    state.expenses = [];
    open();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
