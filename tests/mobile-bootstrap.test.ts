import { describe, it, expect } from "vitest";
import { memoryStore } from "@/lib/server/memory-store";
import { loadMobileBootstrap } from "@/lib/server/mobile-bootstrap";
import { buildInsights } from "@/lib/insights";
import {
  balancesWithOthers,
  categoryTotals,
  currentMonthKey,
  groupDebtFlows,
  groupNetForUser,
  headlineTotals,
  monthlySpend,
  suggestedTransfers,
} from "@/lib/selectors";

/**
 * The derived payload is the whole argument of §3: the phone gets answers, not
 * arithmetic, so that "who owes whom" has exactly one implementation.
 *
 * That only holds if `derived` is genuinely a composition of the same selectors
 * the web calls — so every assertion here compares the payload against the
 * selector directly rather than against a hard-coded number. A literal would
 * pass just as happily if the endpoint quietly grew its own maths, which is the
 * one failure this file is for.
 */
const DEMO = "u1";

/** Pinned: half of these selectors bucket by month, and "this month" moves. */
const NOW = new Date("2026-07-28T12:00:00Z");

const load = () => loadMobileBootstrap(memoryStore, DEMO, NOW);

async function inputs() {
  const payload = await load();
  return { payload, ...payload };
}

describe("the raw payload", () => {
  it("still carries everything /api/bootstrap does", async () => {
    const payload = await load();
    expect(payload.me.id).toBe(DEMO);
    expect(payload.users.length).toBeGreaterThan(0);
    expect(payload.groups.length).toBeGreaterThan(0);
    expect(payload.expenses.length).toBeGreaterThan(0);
    expect(payload.settlements).toBeDefined();
    expect(payload.notifications).toBeDefined();
  });

  it("leaves activity out, exactly as the web does", async () => {
    // One screen reads it; bundling it would make every launch fetch a feed
    // nobody is looking at.
    expect(await load()).not.toHaveProperty("activity");
  });
});

describe("derived values agree with the selectors the web uses", () => {
  it("headline totals", async () => {
    const { payload, expenses, settlements } = await inputs();
    expect(payload.derived.headline).toEqual(headlineTotals(DEMO, expenses, settlements, NOW));
  });

  it("counterparty balances", async () => {
    const { payload, expenses, settlements } = await inputs();
    expect(payload.derived.counterparties).toEqual(
      balancesWithOthers(DEMO, expenses, settlements)
    );
  });

  it("monthly spend", async () => {
    const { payload, expenses } = await inputs();
    expect(payload.derived.monthly).toEqual(monthlySpend(DEMO, expenses, 6, NOW));
  });

  it("category totals, scoped to the current month", async () => {
    const { payload, expenses } = await inputs();
    expect(payload.derived.categories).toEqual(
      categoryTotals(DEMO, expenses, currentMonthKey(NOW))
    );
  });

  it("insights", async () => {
    const { payload, expenses, settlements } = await inputs();
    expect(payload.derived.insights).toEqual(buildInsights(DEMO, expenses, NOW, settlements));
  });

  it("per-group net, flows and simplified transfers", async () => {
    const { payload, groups, expenses, settlements } = await inputs();
    const simplified = new Map(
      suggestedTransfers(groups, expenses, settlements).map((s) => [s.groupId, s.flows])
    );

    for (const group of groups) {
      const derived = payload.derived.groups.find((g) => g.groupId === group.id)!;
      expect(derived.net).toBe(groupNetForUser(DEMO, group, expenses, settlements));
      expect(derived.flows).toEqual(groupDebtFlows(group, expenses, settlements));
      expect(derived.simplified).toEqual(simplified.get(group.id));
    }
  });

  it("covers every group, so no screen has to handle a missing entry", async () => {
    const { payload, groups } = await inputs();
    expect(payload.derived.groups.map((g) => g.groupId).sort()).toEqual(
      groups.map((g) => g.id).sort()
    );
  });
});

describe("figures the prototype needs that the web never computed", () => {
  it("totals a group's whole spend, not just the viewer's share", async () => {
    const { payload, expenses } = await inputs();
    const g1 = payload.derived.groups.find((g) => g.groupId === "g1")!;
    const expected = expenses
      .filter((e) => e.groupId === "g1")
      .reduce((sum, e) => sum + e.amount, 0);

    expect(g1.totalSpent).toBe(Math.round(expected * 100) / 100);
  });

  it("counts a group's expenses", async () => {
    const { payload, expenses } = await inputs();
    const g1 = payload.derived.groups.find((g) => g.groupId === "g1")!;
    expect(g1.expenseCount).toBe(expenses.filter((e) => e.groupId === "g1").length);
  });

  it("counts unread notifications for the badge", async () => {
    const { payload, notifications } = await inputs();
    expect(payload.derived.unreadNotifications).toBe(
      notifications.filter((n) => !n.read).length
    );
  });
});

describe("a brand-new account", () => {
  it("gets zeroes and empty lists, never a missing `derived`", async () => {
    /**
     * "Empty is not loading" — the client decides between a skeleton and an
     * empty state from `Resource`, not from the shape of the payload. An absent
     * block here would push it back to guessing.
     */
    const fresh = await memoryStore.createUser({
      name: "Nobody Yet",
      email: `nobody-${Date.now()}@example.com`,
      password: "supersecret1",
    });
    const { derived } = await loadMobileBootstrap(memoryStore, fresh.id, NOW);

    expect(derived.groups).toEqual([]);
    expect(derived.counterparties).toEqual([]);
    expect(derived.categories).toEqual([]);
    expect(derived.headline.owed).toBe(0);
    expect(derived.headline.owes).toBe(0);
    expect(derived.unreadNotifications).toBe(0);
  });

  it("still returns six months of chart points, all zero", async () => {
    // A chart with no points renders as broken; a chart of zeroes renders as
    // "nothing yet", which is the truth.
    const fresh = await memoryStore.createUser({
      name: "Nobody Else",
      email: `nobody-else-${Date.now()}@example.com`,
      password: "supersecret1",
    });
    const { derived } = await loadMobileBootstrap(memoryStore, fresh.id, NOW);

    expect(derived.monthly).toHaveLength(6);
    expect(derived.monthly.every((p) => p.amount === 0)).toBe(true);
  });

  it("never reports -0, which survives JSON and breaks equality checks", async () => {
    const fresh = await memoryStore.createUser({
      name: "Nobody Third",
      email: `nobody-third-${Date.now()}@example.com`,
      password: "supersecret1",
    });
    const { derived } = await loadMobileBootstrap(memoryStore, fresh.id, NOW);

    expect(Object.is(derived.headline.owes, -0)).toBe(false);
    expect(Object.is(derived.headline.spentThisMonth, -0)).toBe(false);
  });
});
