import { describe, it, expect } from "vitest";
import { equalSplit } from "@/lib/balances";
import {
  balancesWithOthers,
  categoryTotals,
  counterparties,
  groupActivityByDay,
  groupNetForUser,
  headlineTotals,
  monthlySpend,
} from "@/lib/selectors";
import type { AppUser, Expense, Group, Settlement } from "@/lib/types";

const users: AppUser[] = [
  { id: "me", name: "Me Myself", email: "me@x.com", initials: "MM", color: "ft-lime" },
  { id: "b", name: "Bea Bee", email: "b@x.com", initials: "BB", color: "ft-sky" },
  { id: "c", name: "Cal Cee", email: "c@x.com", initials: "CC", color: "ft-pink" },
  { id: "outsider", name: "Otto Out", email: "o@x.com", initials: "OO", color: "ft-red" },
];

const groups: Group[] = [
  { id: "g1", name: "Flat", type: "home", color: "ft-lime", memberIds: ["me", "b"], createdAt: "2026-01-01" },
  { id: "g2", name: "Trip", type: "trip", color: "ft-sky", memberIds: ["me", "c"], createdAt: "2026-01-01" },
  { id: "g3", name: "Not mine", type: "other", color: "ft-red", memberIds: ["b", "outsider"], createdAt: "2026-01-01" },
];

function expense(
  id: string,
  groupId: string,
  payerId: string,
  amount: number,
  participants: string[],
  date: string,
  category: Expense["category"] = "food"
): Expense {
  return {
    id, groupId, description: id, category, amount, payerId,
    splitMethod: "equal", splits: equalSplit(amount, participants), date,
  };
}

const settle = (id: string, from: string, to: string, amount: number, status: Settlement["status"]): Settlement => ({
  id, groupId: "g1", fromUserId: from, toUserId: to, amount, status, method: "Cash", createdAt: "2026-07-02",
});

describe("counterparties", () => {
  it("returns everyone sharing a group, excluding yourself", () => {
    const ids = counterparties("me", groups, users).map((u) => u.id).sort();
    expect(ids).toEqual(["b", "c"]);
  });

  it("excludes people only in groups you don't belong to", () => {
    expect(counterparties("me", groups, users).map((u) => u.id)).not.toContain("outsider");
  });
});

describe("balancesWithOthers", () => {
  it("reports a positive amount when someone owes you", () => {
    const balances = balancesWithOthers("me", [expense("e1", "g1", "me", 20, ["me", "b"], "2026-07-01")], []);
    expect(balances).toEqual([{ userId: "b", amount: 10 }]);
  });

  it("reports a negative amount when you owe someone", () => {
    const balances = balancesWithOthers("me", [expense("e1", "g1", "b", 20, ["me", "b"], "2026-07-01")], []);
    expect(balances).toEqual([{ userId: "b", amount: -10 }]);
  });

  it("aggregates the same person across different groups", () => {
    // Same counterparty, two groups, opposite directions.
    const expenses = [
      expense("e1", "g1", "me", 20, ["me", "b"], "2026-07-01"), // b owes me 10
      expense("e2", "g3", "b", 8, ["me", "b"], "2026-07-01"), // I owe b 4
    ];
    expect(balancesWithOthers("me", expenses, [])).toEqual([{ userId: "b", amount: 6 }]);
  });

  it("omits people you are square with", () => {
    const expenses = [
      expense("e1", "g1", "me", 20, ["me", "b"], "2026-07-01"),
      expense("e2", "g1", "b", 20, ["me", "b"], "2026-07-01"),
    ];
    expect(balancesWithOthers("me", expenses, [])).toEqual([]);
  });

  it("ignores expenses between two other people", () => {
    const expenses = [expense("e1", "g3", "b", 50, ["b", "outsider"], "2026-07-01")];
    expect(balancesWithOthers("me", expenses, [])).toEqual([]);
  });
});

describe("headlineTotals", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("counts only your share of this month's expenses", () => {
    const expenses = [
      expense("e1", "g1", "b", 100, ["me", "b"], "2026-07-05"), // my share 50
      expense("e2", "g1", "me", 30, ["me", "b"], "2026-07-06"), // my share 15
      expense("e3", "g1", "b", 999, ["me", "b"], "2026-06-30"), // last month, excluded
    ];
    expect(headlineTotals("me", expenses, [], now).spentThisMonth).toBe(65);
  });

  it("excludes expenses you are not a participant in", () => {
    const expenses = [expense("e1", "g3", "b", 80, ["b", "outsider"], "2026-07-05")];
    expect(headlineTotals("me", expenses, [], now).spentThisMonth).toBe(0);
  });

  it("splits owed and owes into separate positive figures with people counts", () => {
    const expenses = [
      expense("e1", "g1", "me", 20, ["me", "b"], "2026-07-05"), // b owes me 10
      expense("e2", "g2", "c", 40, ["me", "c"], "2026-07-05"), // I owe c 20
    ];
    const totals = headlineTotals("me", expenses, [], now);
    expect(totals.owed).toBe(10);
    expect(totals.owes).toBe(20);
    expect(totals.owedPeople).toBe(1);
    expect(totals.owesPeople).toBe(1);
  });

  it("reports zeros for a brand-new account", () => {
    expect(headlineTotals("me", [], [], now)).toEqual({
      spentThisMonth: 0, owed: 0, owes: 0, owedPeople: 0, owesPeople: 0,
    });
  });
});

describe("groupNetForUser", () => {
  it("scopes the calculation to one group", () => {
    const expenses = [
      expense("e1", "g1", "me", 20, ["me", "b"], "2026-07-01"),
      expense("e2", "g2", "c", 50, ["me", "c"], "2026-07-01"),
    ];
    expect(groupNetForUser("me", groups[0], expenses, [])).toBe(10);
    expect(groupNetForUser("me", groups[1], expenses, [])).toBe(-25);
  });

  it("ignores pending settlements", () => {
    const expenses = [expense("e1", "g1", "me", 20, ["me", "b"], "2026-07-01")];
    expect(groupNetForUser("me", groups[0], expenses, [settle("s1", "b", "me", 10, "pending")])).toBe(10);
    expect(groupNetForUser("me", groups[0], expenses, [settle("s1", "b", "me", 10, "confirmed")])).toBe(0);
  });
});

describe("monthlySpend", () => {
  it("returns one point per month, oldest first, labelled", () => {
    const points = monthlySpend("me", [], 6, new Date("2026-07-15T12:00:00Z"));
    expect(points).toHaveLength(6);
    expect(points.map((p) => p.label)).toEqual(["Feb", "Mar", "Apr", "May", "Jun", "Jul"]);
    expect(points.at(-1)!.key).toBe("2026-07");
  });

  it("attributes each expense to its own month", () => {
    const expenses = [
      expense("e1", "g1", "b", 100, ["me", "b"], "2026-07-05"),
      expense("e2", "g1", "b", 40, ["me", "b"], "2026-06-05"),
    ];
    const points = monthlySpend("me", expenses, 3, new Date("2026-07-15T12:00:00Z"));
    expect(points.find((p) => p.key === "2026-07")!.amount).toBe(50);
    expect(points.find((p) => p.key === "2026-06")!.amount).toBe(20);
    expect(points.find((p) => p.key === "2026-05")!.amount).toBe(0);
  });

  it("crosses a year boundary correctly", () => {
    const points = monthlySpend("me", [], 3, new Date("2026-01-10T12:00:00Z"));
    expect(points.map((p) => p.key)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("categoryTotals", () => {
  it("sums your share per category, largest first", () => {
    const expenses = [
      expense("e1", "g1", "b", 100, ["me", "b"], "2026-07-01", "food"), // 50
      expense("e2", "g1", "b", 40, ["me", "b"], "2026-07-02", "travel"), // 20
      expense("e3", "g1", "b", 20, ["me", "b"], "2026-07-03", "food"), // 10
    ];
    expect(categoryTotals("me", expenses, "2026-07")).toEqual([
      { category: "food", amount: 60 },
      { category: "travel", amount: 20 },
    ]);
  });

  it("omits categories you have no share in", () => {
    const expenses = [expense("e1", "g3", "b", 90, ["b", "outsider"], "2026-07-01", "housing")];
    expect(categoryTotals("me", expenses, "2026-07")).toEqual([]);
  });
});

describe("groupActivityByDay", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const item = (id: string, createdAt: string) => ({
    id, groupId: "g1", actorId: "b", message: id, createdAt,
  });

  it("labels the current and previous day in words", () => {
    const days = groupActivityByDay(
      [item("today", "2026-07-25T09:00:00Z"), item("yesterday", "2026-07-24T09:00:00Z")],
      now
    );
    expect(days.map((d) => d.day)).toEqual(["Today", "Yesterday"]);
  });

  it("falls back to a date for older entries", () => {
    const days = groupActivityByDay([item("old", "2026-07-20T09:00:00Z")], now);
    expect(days[0].day).toBe("Jul 20");
  });

  it("orders days and the items inside them newest first", () => {
    const days = groupActivityByDay(
      [
        item("older", "2026-07-20T09:00:00Z"),
        item("early-today", "2026-07-25T01:00:00Z"),
        item("late-today", "2026-07-25T23:00:00Z"),
      ],
      now
    );
    expect(days[0].items.map((i) => i.id)).toEqual(["late-today", "early-today"]);
    expect(days.at(-1)!.items.map((i) => i.id)).toEqual(["older"]);
  });

  it("returns nothing for an empty feed", () => {
    expect(groupActivityByDay([], now)).toEqual([]);
  });
});
