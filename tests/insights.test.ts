import { describe, it, expect } from "vitest";
import { equalSplit } from "@/lib/balances";
import { buildInsights } from "@/lib/insights";
import type { Expense } from "@/lib/types";

const NOW = new Date("2026-07-15T12:00:00Z");

function expense(
  id: string,
  amount: number,
  date: string,
  category: Expense["category"] = "food",
  participants = ["me", "other"]
): Expense {
  return {
    id, groupId: "g1", description: id, category, amount, payerId: "other",
    splitMethod: "equal", splits: equalSplit(amount, participants), date,
  };
}

describe("buildInsights", () => {
  it("returns nothing when there is no spending at all", () => {
    expect(buildInsights("me", [], NOW)).toEqual([]);
  });

  it("names the biggest category of the current month", () => {
    const insights = buildInsights(
      "me",
      [
        expense("e1", 100, "2026-07-01", "food"), // my share 50
        expense("e2", 40, "2026-07-02", "travel"), // my share 20
      ],
      NOW
    );
    const top = insights.find((i) => i.id === "top-category");
    expect(top?.title).toContain("Food");
  });

  it("marks a brand-new category as 'new' rather than dividing by zero", () => {
    const insights = buildInsights("me", [expense("e1", 100, "2026-07-01", "food")], NOW);
    expect(insights.find((i) => i.id === "top-category")?.delta).toBe("new");
    expect(insights.find((i) => i.id === "month-over-month")?.delta).toBe("new");
  });

  it("computes a month-over-month percentage against the previous month", () => {
    const insights = buildInsights(
      "me",
      [
        expense("e1", 200, "2026-07-01"), // this month, my share 100
        expense("e2", 100, "2026-06-01"), // last month, my share 50
      ],
      NOW
    );
    const mom = insights.find((i) => i.id === "month-over-month");
    expect(mom?.delta).toBe("+100%");
    expect(mom?.tone).toBe("up");
  });

  it("reports a decrease as a negative delta trending down", () => {
    const insights = buildInsights(
      "me",
      [expense("e1", 50, "2026-07-01"), expense("e2", 200, "2026-06-01")],
      NOW
    );
    const mom = insights.find((i) => i.id === "month-over-month");
    expect(mom?.delta).toBe("-75%");
    expect(mom?.tone).toBe("down");
  });

  it("treats a roughly flat month as flat", () => {
    const insights = buildInsights(
      "me",
      [expense("e1", 100, "2026-07-01"), expense("e2", 100, "2026-06-01")],
      NOW
    );
    expect(insights.find((i) => i.id === "month-over-month")?.tone).toBe("flat");
  });

  it("identifies the largest single expense of the month and your share of it", () => {
    const insights = buildInsights(
      "me",
      [
        expense("small", 2000, "2026-07-01"),
        expense("Homestay", 48000, "2026-07-05"),
        expense("medium", 10000, "2026-07-06"),
      ],
      NOW
    );
    const largest = insights.find((i) => i.id === "largest-expense");
    expect(largest?.delta).toBe("₹48,000.00");
    expect(largest?.body).toContain("Homestay");
    expect(largest?.body).toContain("₹24,000.00"); // half of 48,000
  });

  it("ignores expenses outside the current month when picking the largest", () => {
    const insights = buildInsights(
      "me",
      [expense("this-month", 50, "2026-07-01"), expense("huge-last-month", 5000, "2026-06-01")],
      NOW
    );
    expect(insights.find((i) => i.id === "largest-expense")?.body).toContain("this-month");
  });

  it("excludes expenses you have no share in from the category totals", () => {
    const insights = buildInsights(
      "me",
      [expense("theirs", 500, "2026-07-01", "housing", ["other", "third"])],
      NOW
    );
    expect(insights.find((i) => i.id === "top-category")).toBeUndefined();
  });

  it("produces stable ids so the UI can key on them", () => {
    const insights = buildInsights(
      "me",
      [expense("e1", 100, "2026-07-01"), expense("e2", 60, "2026-06-01")],
      NOW
    );
    expect(insights.map((i) => i.id)).toEqual([
      "top-category",
      "month-over-month",
      "largest-expense",
      // "other" paid and split with "me", so there is a real debt to report.
      "settlement-position",
    ]);
  });
});

describe("percentage changes stay meaningful", () => {
  /**
   * The bug this guards: a month following a near-empty one produced deltas
   * like "+3143%". Arithmetically true, useless to read, and actively harmful
   * once a model restates it as a finding.
   */
  it("does not report an absurd percentage against a tiny baseline", () => {
    const insights = buildInsights(
      "me",
      [expense("big", 24_000, "2026-07-01"), expense("tiny", 740, "2026-06-01")],
      NOW
    );

    for (const insight of insights) {
      const percent = /(-?\d+)%/.exec(insight.delta);
      if (percent) expect(Math.abs(Number(percent[1]))).toBeLessThanOrEqual(300);
    }
  });

  it("falls back to the absolute difference instead", () => {
    const insights = buildInsights(
      "me",
      [expense("big", 24_000, "2026-07-01"), expense("tiny", 740, "2026-06-01")],
      NOW
    );
    const mom = insights.find((i) => i.id === "month-over-month")!;

    expect(mom.delta).not.toMatch(/%/);
    expect(mom.delta).toMatch(/^\+₹/);
  });

  it("still uses a percentage when the baseline is material", () => {
    const insights = buildInsights(
      "me",
      [expense("a", 1200, "2026-07-01"), expense("b", 1000, "2026-06-01")],
      NOW
    );
    expect(insights.find((i) => i.id === "month-over-month")!.delta).toMatch(/^\+\d+%$/);
  });

  it("calls a first month 'new' rather than dividing by zero", () => {
    const insights = buildInsights("me", [expense("a", 500, "2026-07-01")], NOW);
    expect(insights.find((i) => i.id === "month-over-month")!.delta).toBe("new");
  });
});

describe("insights the cards did not previously carry", () => {
  it("reframes a spike by removing the largest expense", () => {
    const expenses = [
      expense("trip", 40_000, "2026-07-02"),
      expense("lunch", 400, "2026-07-03"),
      expense("apr", 1000, "2026-04-05"),
      expense("may", 1000, "2026-05-05"),
      expense("jun", 1000, "2026-06-05"),
    ];
    const underlying = buildInsights("me", expenses, NOW).find(
      (i) => i.id === "underlying-spend"
    )!;

    expect(underlying).toBeDefined();
    // Share of the 400 lunch is 200; the 500 median is the prior three months.
    expect(underlying.body).toContain("₹200.00");
    expect(underlying.body).toContain("₹500.00");
    expect(underlying.tone).toBe("down");
  });

  /**
   * The model was observed calling a figure eight times its median "close to
   * your usual pace". Every number in that sentence was real, so the numeric
   * guard could not catch it. Stating the direction in words moves the
   * judgement out of the model and into arithmetic.
   */
  it("states the comparison in words so the model never has to judge it", () => {
    const above = buildInsights(
      "me",
      [
        expense("trip", 40_000, "2026-07-02"),
        expense("rest", 8000, "2026-07-03"),
        expense("apr", 1000, "2026-04-05"),
        expense("may", 1000, "2026-05-05"),
        expense("jun", 1000, "2026-06-05"),
      ],
      NOW
    ).find((i) => i.id === "underlying-spend")!;
    expect(above.body).toContain("above your");

    const below = buildInsights(
      "me",
      [
        expense("trip", 40_000, "2026-07-02"),
        expense("rest", 100, "2026-07-03"),
        expense("apr", 4000, "2026-04-05"),
        expense("may", 4000, "2026-05-05"),
        expense("jun", 4000, "2026-06-05"),
      ],
      NOW
    ).find((i) => i.id === "underlying-spend")!;
    expect(below.body).toContain("below your");
  });

  it("omits the reframing when it would restate the total", () => {
    // A single expense means "excluding it" is just zero — nothing to say.
    const insights = buildInsights("me", [expense("only", 900, "2026-07-01")], NOW);
    expect(insights.find((i) => i.id === "underlying-spend")).toBeUndefined();
  });

  it("omits the reframing without a baseline to compare against", () => {
    const insights = buildInsights(
      "me",
      [expense("a", 900, "2026-07-01"), expense("b", 100, "2026-07-02")],
      NOW
    );
    expect(insights.find((i) => i.id === "underlying-spend")).toBeUndefined();
  });

  it("reports what the user owes and is owed", () => {
    const position = buildInsights("me", [expense("a", 1000, "2026-07-01")], NOW).find(
      (i) => i.id === "settlement-position"
    )!;

    expect(position).toBeDefined();
    // "other" paid 1000 and my share is 500, so I owe 500.
    expect(position.body).toContain("₹500.00");
    expect(position.tone).toBe("down");
  });

  it("separates recurring commitments from discretionary spend", () => {
    const rent: Expense = {
      ...expense("rent", 2000, "2026-07-01", "housing"),
      recurring: { cadence: "monthly", nextRunAt: "2026-08-01", active: true },
    };
    const fixed = buildInsights("me", [rent, expense("food", 2000, "2026-07-02")], NOW).find(
      (i) => i.id === "fixed-commitments"
    )!;

    expect(fixed).toBeDefined();
    expect(fixed.delta).toBe("50%");
  });

  it("says nothing about commitments when there are none", () => {
    const insights = buildInsights("me", [expense("a", 900, "2026-07-01")], NOW);
    expect(insights.find((i) => i.id === "fixed-commitments")).toBeUndefined();
  });
});
