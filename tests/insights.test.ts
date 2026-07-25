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
        expense("small", 20, "2026-07-01"),
        expense("Airbnb", 680, "2026-07-05"),
        expense("medium", 100, "2026-07-06"),
      ],
      NOW
    );
    const largest = insights.find((i) => i.id === "largest-expense");
    expect(largest?.delta).toBe("$680.00");
    expect(largest?.body).toContain("Airbnb");
    expect(largest?.body).toContain("$340.00"); // half of 680
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
    ]);
  });
});
