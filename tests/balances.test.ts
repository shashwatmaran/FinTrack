import { describe, it, expect } from "vitest";
import {
  computeDebtFlows,
  computeNetBalances,
  equalSplit,
  simplifyDebts,
} from "@/lib/balances";
import type { Expense, Settlement } from "@/lib/types";

/** Terse expense builder — these tests only care about money and identity. */
function expense(
  id: string,
  payerId: string,
  amount: number,
  participants: string[],
  groupId = "g1"
): Expense {
  return {
    id,
    groupId,
    description: id,
    category: "food",
    amount,
    payerId,
    splitMethod: "equal",
    splits: equalSplit(amount, participants),
    date: "2026-07-01",
  };
}

function settlement(
  id: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  status: Settlement["status"] = "confirmed",
  groupId = "g1"
): Settlement {
  return { id, groupId, fromUserId, toUserId, amount, status, method: "Cash", createdAt: "2026-07-02" };
}

const cents = (n: number) => Math.round(n * 100);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("equalSplit", () => {
  it("splits evenly when the amount divides cleanly", () => {
    expect(equalSplit(60, ["a", "b", "c"])).toEqual([
      { userId: "a", amount: 20 },
      { userId: "b", amount: 20 },
      { userId: "c", amount: 20 },
    ]);
  });

  it("distributes the remainder one cent at a time instead of rounding each share", () => {
    // 10 / 3 = 3.333... Rounding each share would give 3.33 x 3 = 9.99 and lose a cent.
    const splits = equalSplit(10, ["a", "b", "c"]);
    expect(splits.map((s) => s.amount)).toEqual([3.34, 3.33, 3.33]);
    expect(sum(splits.map((s) => cents(s.amount)))).toBe(1000);
  });

  it("always sums exactly to the total, for every awkward amount", () => {
    const amounts = [0.01, 0.02, 10, 20.01, 33.33, 99.99, 100.05, 154.2, 1234.56, 0.05];
    const sizes = [1, 2, 3, 4, 5, 6, 7, 8];

    for (const amount of amounts) {
      for (const size of sizes) {
        const users = Array.from({ length: size }, (_, i) => `u${i}`);
        const splits = equalSplit(amount, users);
        expect(
          sum(splits.map((s) => cents(s.amount))),
          `${amount} across ${size} people`
        ).toBe(cents(amount));
      }
    }
  });

  it("never differs by more than a cent between participants", () => {
    const splits = equalSplit(100, ["a", "b", "c", "d", "e", "f", "g"]);
    const values = splits.map((s) => cents(s.amount));
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it("gives the whole amount to a single participant", () => {
    expect(equalSplit(41.37, ["solo"])).toEqual([{ userId: "solo", amount: 41.37 }]);
  });
});

describe("computeNetBalances", () => {
  const members = ["a", "b", "c"];

  it("credits the payer and debits each participant", () => {
    const net = computeNetBalances(members, [expense("e1", "a", 30, members)], []);
    expect(net.a).toBeCloseTo(20, 6); // paid 30, owes 10
    expect(net.b).toBeCloseTo(-10, 6);
    expect(net.c).toBeCloseTo(-10, 6);
  });

  it("always sums to zero — money is conserved", () => {
    const net = computeNetBalances(
      members,
      [
        expense("e1", "a", 30, members),
        expense("e2", "b", 10, members),
        expense("e3", "c", 99.99, members),
      ],
      [settlement("s1", "b", "a", 5)]
    );
    expect(sum(Object.values(net).map(cents))).toBe(0);
  });

  it("counts confirmed settlements", () => {
    const net = computeNetBalances(members, [expense("e1", "a", 30, members)], [
      settlement("s1", "b", "a", 10),
    ]);
    expect(net.a).toBeCloseTo(10, 6);
    expect(net.b).toBeCloseTo(0, 6);
  });

  it("ignores pending and declined settlements — escrow must not move balances", () => {
    const base = computeNetBalances(members, [expense("e1", "a", 30, members)], []);
    for (const status of ["pending", "declined"] as const) {
      const net = computeNetBalances(members, [expense("e1", "a", 30, members)], [
        settlement("s1", "b", "a", 10, status),
      ]);
      expect(net, `${status} settlement must not change balances`).toEqual(base);
    }
  });

  it("returns zero for a member with no activity", () => {
    const net = computeNetBalances(["a", "b", "loner"], [expense("e1", "a", 10, ["a", "b"])], []);
    expect(net.loner).toBe(0);
  });
});

describe("computeDebtFlows", () => {
  it("says a participant owes the payer their share", () => {
    const flows = computeDebtFlows([expense("e1", "a", 20, ["a", "b"])], []);
    expect(flows).toEqual([{ fromUserId: "b", toUserId: "a", amount: 10 }]);
  });

  it("never says someone owes themselves", () => {
    const flows = computeDebtFlows([expense("e1", "a", 20, ["a"])], []);
    expect(flows).toEqual([]);
  });

  it("nets opposing debts between the same pair into one direction", () => {
    const flows = computeDebtFlows(
      [
        expense("e1", "a", 20, ["a", "b"]), // b owes a 10
        expense("e2", "b", 6, ["a", "b"]), // a owes b 3
      ],
      []
    );
    expect(flows).toEqual([{ fromUserId: "b", toUserId: "a", amount: 7 }]);
  });

  it("flips direction when the reverse debt is larger", () => {
    const flows = computeDebtFlows(
      [
        expense("e1", "a", 10, ["a", "b"]), // b owes a 5
        expense("e2", "b", 40, ["a", "b"]), // a owes b 20
      ],
      []
    );
    expect(flows).toEqual([{ fromUserId: "a", toUserId: "b", amount: 15 }]);
  });

  it("drops a pair entirely when they cancel out exactly", () => {
    const flows = computeDebtFlows(
      [expense("e1", "a", 20, ["a", "b"]), expense("e2", "b", 20, ["a", "b"])],
      []
    );
    expect(flows).toEqual([]);
  });

  it("reduces a debt by a confirmed settlement", () => {
    const flows = computeDebtFlows([expense("e1", "a", 20, ["a", "b"])], [
      settlement("s1", "b", "a", 4),
    ]);
    expect(flows).toEqual([{ fromUserId: "b", toUserId: "a", amount: 6 }]);
  });

  it("clears a debt paid off exactly", () => {
    const flows = computeDebtFlows([expense("e1", "a", 20, ["a", "b"])], [
      settlement("s1", "b", "a", 10),
    ]);
    expect(flows).toEqual([]);
  });

  it("ignores pending settlements", () => {
    const flows = computeDebtFlows([expense("e1", "a", 20, ["a", "b"])], [
      settlement("s1", "b", "a", 10, "pending"),
    ]);
    expect(flows).toEqual([{ fromUserId: "b", toUserId: "a", amount: 10 }]);
  });

  it("never emits a zero or negative amount", () => {
    const flows = computeDebtFlows(
      [expense("e1", "a", 30, ["a", "b", "c"]), expense("e2", "b", 30, ["a", "b", "c"])],
      [settlement("s1", "c", "a", 10)]
    );
    for (const flow of flows) expect(flow.amount).toBeGreaterThan(0);
  });
});

describe("simplifyDebts", () => {
  it("collapses a chain into a single transfer", () => {
    // a owes b 10, b owes c 10  ->  a pays c 10, b is square.
    const flows = simplifyDebts({ a: -10, b: 0, c: 10 });
    expect(flows).toEqual([{ fromUserId: "a", toUserId: "c", amount: 10 }]);
  });

  it("conserves every balance it settles", () => {
    const net = { a: -30, b: -20, c: 25, d: 25 };
    const flows = simplifyDebts(net);

    const applied = { ...net };
    for (const f of flows) {
      applied[f.fromUserId as keyof typeof applied] += f.amount;
      applied[f.toUserId as keyof typeof applied] -= f.amount;
    }
    for (const [id, value] of Object.entries(applied)) {
      expect(cents(value), `${id} should be settled`).toBe(0);
    }
  });

  it("needs at most n-1 transfers", () => {
    const net = { a: -15, b: -25, c: -10, d: 20, e: 30 };
    expect(simplifyDebts(net).length).toBeLessThanOrEqual(Object.keys(net).length - 1);
  });

  it("returns nothing when everyone is square", () => {
    expect(simplifyDebts({ a: 0, b: 0, c: 0 })).toEqual([]);
  });

  it("ignores sub-cent dust rather than emitting noise transfers", () => {
    expect(simplifyDebts({ a: 0.001, b: -0.001 })).toEqual([]);
  });

  it("produces no more transfers than the raw debt map", () => {
    const members = ["a", "b", "c", "d"];
    const expenses = [
      expense("e1", "a", 40, members),
      expense("e2", "b", 20, members),
      expense("e3", "c", 12, members),
      expense("e4", "d", 8, members),
    ];
    const raw = computeDebtFlows(expenses, []);
    const simplified = simplifyDebts(computeNetBalances(members, expenses, []));
    expect(simplified.length).toBeLessThanOrEqual(raw.length);
  });
});
