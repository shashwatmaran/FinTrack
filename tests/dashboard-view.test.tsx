// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AppUser, Expense, Group } from "@/lib/types";

/**
 * Regression cover for "empty is not loading".
 *
 * A query that has resolved to `[]` is a real answer; only a pending query is
 * loading. Conflating them left every newly created account on a skeleton that
 * never resolved — the app looked permanently broken to exactly the users who
 * had never seen it work. Server-side tests cannot see this: the API was
 * returning a correct empty array the whole time.
 */
type Q<T> = { data: T; isPending: boolean };
const q = <T,>(data: T, isPending = false): Q<T> => ({ data, isPending });

const state = {
  user: q<AppUser | undefined>(undefined, true),
  users: q<AppUser[]>([]),
  groups: q<Group[]>([], true),
  expenses: q<Expense[]>([], true),
  settlements: q<unknown[]>([]),
};

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => state.user,
  useUsers: () => state.users,
  useGroups: () => state.groups,
  useExpenses: () => state.expenses,
  useSettlements: () => state.settlements,
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (selector: (s: { openModal: () => void }) => unknown) =>
    selector({ openModal: () => {} }),
}));
// The chart renders to canvas/SVG and is not what these assertions are about.
vi.mock("@/components/dashboard/spend-chart", () => ({ SpendChart: () => null }));

const { DashboardView } = await import("@/components/dashboard/dashboard-view");

const USER: AppUser = {
  id: "u1",
  name: "Maya Alvarez",
  email: "maya@example.com",
  initials: "MA",
  color: "ft-lime",
};
const GROUP: Group = {
  id: "g1",
  name: "Lunch Crew",
  type: "friends",
  memberIds: ["u1"],
  color: "ft-lime",
  createdAt: "2026-07-01",
};

/** The skeleton renders placeholder blocks, not text — detect it structurally. */
const skeletonShown = () => document.querySelectorAll(".animate-pulse").length > 0;

beforeEach(() => {
  state.user = q(undefined, true);
  state.users = q([]);
  state.groups = q([], true);
  state.expenses = q([], true);
  state.settlements = q([]);
});

describe("while queries are pending", () => {
  it("shows the skeleton", () => {
    render(<DashboardView />);
    expect(skeletonShown()).toBe(true);
  });

  it("keeps showing it when the user has loaded but groups have not", () => {
    state.user = q(USER);
    state.groups = q([], true);
    render(<DashboardView />);
    expect(skeletonShown()).toBe(true);
  });
});

describe("a resolved but empty account", () => {
  beforeEach(() => {
    state.user = q(USER);
    state.users = q([USER]);
    state.groups = q([]);
    state.expenses = q([]);
  });

  it("does NOT show the skeleton", () => {
    // The bug: `groups.length === 0` was treated as still loading, so a brand
    // new account never got past this point.
    render(<DashboardView />);
    expect(skeletonShown()).toBe(false);
  });

  it("shows onboarding instead", () => {
    render(<DashboardView />);
    expect(screen.getByText(/welcome to fintrack/i)).toBeInTheDocument();
  });

  it("offers the action that resolves the empty state", () => {
    render(<DashboardView />);
    expect(screen.getByRole("button", { name: /create your first group/i })).toBeInTheDocument();
  });
});

describe("a populated account", () => {
  beforeEach(() => {
    state.user = q(USER);
    state.users = q([USER]);
    state.groups = q([GROUP]);
    state.expenses = q([
      {
        id: "e1",
        groupId: "g1",
        description: "Homestay in Goa",
        category: "travel",
        amount: 48000,
        payerId: "u1",
        splitMethod: "equal",
        splits: [{ userId: "u1", amount: 48000 }],
        date: `${new Date().toISOString().slice(0, 7)}-05`,
      },
    ]);
  });

  it("renders the dashboard rather than onboarding", () => {
    render(<DashboardView />);
    expect(screen.queryByText(/welcome to fintrack/i)).not.toBeInTheDocument();
    expect(skeletonShown()).toBe(false);
  });

  it("shows the group", () => {
    render(<DashboardView />);
    expect(screen.getByText("Lunch Crew")).toBeInTheDocument();
  });

  it("formats money as rupees", () => {
    render(<DashboardView />);
    // Single currency by design; a bare number or a $ here is a real defect.
    expect(document.body.textContent).toMatch(/₹/);
    expect(document.body.textContent).not.toMatch(/\$/);
  });
});
