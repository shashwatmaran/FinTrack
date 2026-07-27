// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityItem, AppUser, Group } from "@/lib/types";

/**
 * The activity feed is read-only, so the interesting parts are the two places
 * it could go wrong quietly: the `**bold**` markers in stored messages, which
 * are rendered without dangerouslySetInnerHTML and so must not become an
 * injection point, and the group filter, which decides whether you are shown
 * events from a group you are looking at or all of them.
 */
const state = {
  me: undefined as AppUser | undefined,
  users: [] as AppUser[],
  groups: [] as Group[],
  items: [] as ActivityItem[],
  filter: "all",
};
const setFilter = vi.fn((next: string) => {
  state.filter = next;
});

vi.mock("@/hooks/use-fintrack-data", () => ({
  useCurrentUser: () => ({ data: state.me }),
  useUsers: () => ({ data: state.users }),
  useGroups: () => ({ data: state.groups }),
  useActivity: () => ({ data: state.items }),
}));
vi.mock("@/stores/ui-store", () => ({
  useUiStore: (s: (x: Record<string, unknown>) => unknown) =>
    s({ activityGroupFilter: state.filter, setActivityGroupFilter: setFilter }),
}));

const { ActivityView } = await import("@/components/activity/activity-view");

const user = (id: string, name: string): AppUser => ({
  id,
  name,
  email: `${id}@example.com`,
  initials: name.slice(0, 2).toUpperCase(),
  color: "ft-lime",
});
const MAYA = user("u1", "Maya Alvarez");

const group = (id: string, name: string): Group => ({
  id,
  name,
  type: "friends",
  color: "ft-lime",
  memberIds: ["u1"],
  createdAt: "2026-07-01",
});

const item = (id: string, groupId: string, message: string): ActivityItem => ({
  id,
  groupId,
  actorId: "u1",
  message,
  createdAt: new Date().toISOString(),
});

beforeEach(() => {
  setFilter.mockClear();
  state.me = MAYA;
  state.users = [MAYA];
  state.groups = [group("g1", "Lunch Crew"), group("g2", "Flatmates")];
  state.items = [];
  state.filter = "all";
});

const open = () => render(<ActivityView />);

describe("rendering stored messages", () => {
  it("renders **bold** as emphasis rather than literal asterisks", () => {
    state.items = [item("a1", "g1", "You added **Thai takeout**")];
    open();

    expect(screen.getByText("Thai takeout").tagName).toBe("STRONG");
    expect(document.body.textContent).not.toContain("**");
  });

  it("keeps the surrounding text intact", () => {
    state.items = [item("a1", "g1", "You added **Thai takeout** to Lunch Crew")];
    open();
    expect(document.body.textContent).toContain("You added Thai takeout to Lunch Crew");
  });

  it("treats markup in a stored message as text, never as HTML", () => {
    // Messages embed user-written descriptions. Rendering them as HTML would
    // turn an expense name into script execution.
    state.items = [item("a1", "g1", 'You added **<img src=x onerror="alert(1)">**')];
    open();

    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).toContain("<img src=x");
  });

  it("renders a message with no markers at all", () => {
    state.items = [item("a1", "g1", "Plain message")];
    open();
    expect(screen.getByText(/plain message/i)).toBeInTheDocument();
  });
});

describe("the group filter", () => {
  beforeEach(() => {
    state.items = [item("a1", "g1", "Lunch thing"), item("a2", "g2", "Flat thing")];
  });

  it("shows every group by default", () => {
    open();
    expect(screen.getByText(/lunch thing/i)).toBeInTheDocument();
    expect(screen.getByText(/flat thing/i)).toBeInTheDocument();
  });

  it("shows only the selected group's events", () => {
    state.filter = "g1";
    open();

    expect(screen.getByText(/lunch thing/i)).toBeInTheDocument();
    expect(screen.queryByText(/flat thing/i)).not.toBeInTheDocument();
  });

  it("offers a filter per group you belong to", () => {
    open();
    expect(screen.getByRole("button", { name: "Lunch Crew" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flatmates" })).toBeInTheDocument();
  });

  it("does not offer a group you are not a member of", () => {
    state.groups = [...state.groups, { ...group("g9", "Someone Else's"), memberIds: ["u2"] }];
    open();
    expect(screen.queryByRole("button", { name: /someone else/i })).not.toBeInTheDocument();
  });

  it("selects a group when its filter is clicked", async () => {
    const u = userEvent.setup();
    open();
    await u.click(screen.getByRole("button", { name: "Lunch Crew" }));
    expect(setFilter).toHaveBeenCalledWith("g1");
  });
});

describe("empty and loading", () => {
  it("shows the skeleton until the user resolves", () => {
    state.me = undefined;
    open();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows an empty state, not a skeleton, when there is simply nothing yet", () => {
    // The bug this mirrors stranded new accounts on a permanent skeleton.
    state.items = [];
    open();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});
