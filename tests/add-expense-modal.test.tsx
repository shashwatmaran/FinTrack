// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppUser, Group } from "@/lib/types";

/**
 * The split form is the highest-stakes screen in the app: it is where money is
 * divided between real people. The domain maths is covered in balances.test.ts,
 * so these assert the things that only exist in the UI — that what the user is
 * shown is what gets submitted, and that the form cannot send a split the
 * server would be right to reject.
 */
const mutate = vi.fn();
const showToast = vi.fn();
const onClose = vi.fn();

const state = {
  me: undefined as AppUser | undefined,
  users: [] as AppUser[],
  groups: [] as Group[],
  isPending: false,
};

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => ({ data: state.me }),
  useUsers: () => ({ data: state.users }),
  useGroups: () => ({ data: state.groups }),
  useCreateExpense: () => ({ mutate, isPending: state.isPending }),
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (selector: (s: { showToast: typeof showToast }) => unknown) =>
    selector({ showToast }),
}));

const { AddExpenseModal } = await import("@/components/modals/add-expense-modal");

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

const group = (id: string, name: string, memberIds: string[]): Group => ({
  id,
  name,
  type: "friends",
  color: "ft-lime",
  memberIds,
  createdAt: "2026-07-01",
});

const TRIO = group("g1", "Lunch Crew", ["u1", "u2", "u3"]);
const PAIR = group("g2", "Flatmates", ["u1", "u2"]);

beforeEach(() => {
  mutate.mockReset();
  showToast.mockReset();
  onClose.mockReset();
  state.me = MAYA;
  state.users = [MAYA, JORDAN, SAM];
  state.groups = [TRIO, PAIR];
  state.isPending = false;
});

const open = () => render(<AddExpenseModal onClose={onClose} />);

/** Every amount shown in the split preview, as numbers. */
function previewAmounts(): number[] {
  const heading = screen.queryByText("Split preview");
  if (!heading) return [];
  const panel = heading.parentElement!;
  return Array.from(panel.querySelectorAll("span"))
    .map((el) => el.textContent ?? "")
    .filter((t) => t.startsWith("₹"))
    .map((t) => Number(t.replace(/[₹,]/g, "")));
}

async function fillBasics(u: ReturnType<typeof userEvent.setup>, amount: string) {
  await u.type(screen.getByLabelText(/what was it for/i), "Thai takeout");
  await u.clear(screen.getByLabelText(/^amount$/i));
  await u.type(screen.getByLabelText(/^amount$/i), amount);
}

describe("split preview", () => {
  it("shows a share for everyone selected", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");

    await waitFor(() => expect(previewAmounts()).toHaveLength(3));
  });

  it("always sums to the amount entered, even when it does not divide evenly", async () => {
    // ₹10 across three cannot split evenly. The remainder is distributed a
    // paisa at a time; a preview that drops it would show the user a total
    // that does not match what they typed.
    const u = userEvent.setup();
    open();
    await fillBasics(u, "10");

    await waitFor(() => expect(previewAmounts()).toHaveLength(3));
    const total = previewAmounts().reduce((a, b) => a + b, 0);
    expect(Number(total.toFixed(2))).toBe(10);
  });

  it("re-splits when a participant is removed", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");
    await waitFor(() => expect(previewAmounts()).toHaveLength(3));

    await u.click(screen.getByRole("button", { name: /sam/i }));

    await waitFor(() => expect(previewAmounts()).toEqual([15, 15]));
  });

  it("shows nothing before an amount is entered", () => {
    open();
    expect(screen.queryByText("Split preview")).not.toBeInTheDocument();
  });
});

describe("what gets submitted", () => {
  it("sends the amount as a number, not the typed string", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "1250.50");
    await u.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].amount).toBe(1250.5);
  });

  it("sends exactly the participants shown in the preview", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");
    await u.click(screen.getByRole("button", { name: /sam/i }));
    await waitFor(() => expect(previewAmounts()).toHaveLength(2));

    await u.click(screen.getByRole("button", { name: /add expense/i }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].participantIds).toEqual(["u1", "u2"]);
  });

  it("omits empty notes rather than sending a blank string", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");
    await u.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].notes).toBeUndefined();
  });

  it("closes and confirms only after the write succeeds", async () => {
    mutate.mockImplementation((_payload, opts) => opts?.onSuccess?.());
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");
    await u.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Expense added"));
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the write is still in flight", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");
    await u.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    // No onSuccess fired, so nothing should have been confirmed or dismissed.
    expect(onClose).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe("the form cannot submit a split the server should reject", () => {
  it("refuses a zero amount", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "0");
    await u.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(screen.getByText(/above 0/i)).toBeInTheDocument());
    expect(mutate).not.toHaveBeenCalled();
  });

  it("refuses an expense with no description", async () => {
    const u = userEvent.setup();
    open();
    await u.type(screen.getByLabelText(/^amount$/i), "30");
    await u.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });

  it("refuses a split with nobody in it", async () => {
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");
    for (const name of [/you/i, /jordan/i, /sam/i]) {
      await u.click(screen.getByRole("button", { name }));
    }
    await u.click(screen.getByRole("button", { name: /add expense/i }));

    await waitFor(() => expect(screen.getByText(/at least one person/i)).toBeInTheDocument());
    expect(mutate).not.toHaveBeenCalled();
  });

  it("resets participants when the group changes", async () => {
    // Otherwise switching groups would submit members of the previous one —
    // people who are not in the group the expense belongs to.
    const u = userEvent.setup();
    open();
    await fillBasics(u, "30");
    await waitFor(() => expect(previewAmounts()).toHaveLength(3));

    await u.selectOptions(screen.getByLabelText(/^group$/i), "g2");

    await waitFor(() => expect(previewAmounts()).toHaveLength(2));
    await u.click(screen.getByRole("button", { name: /add expense/i }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].participantIds).toEqual(["u1", "u2"]);
    expect(mutate.mock.calls[0][0].groupId).toBe("g2");
  });
});

describe("with no groups yet", () => {
  beforeEach(() => {
    state.groups = [];
  });

  it("explains why instead of rendering an unusable form", () => {
    open();
    expect(screen.getByText(/create a group first/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^amount$/i)).not.toBeInTheDocument();
  });
});

describe("dismissal", () => {
  it("closes on Escape", async () => {
    const u = userEvent.setup();
    open();
    await u.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes from the header button", async () => {
    const u = userEvent.setup();
    open();
    await u.click(within(screen.getByRole("dialog")).getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });
});
