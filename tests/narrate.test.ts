import { describe, it, expect } from "vitest";
import { containsUnsupportedNumbers, insightsHash } from "@/lib/ai/narrate";
import type { Insight } from "@/lib/insights";

/**
 * The number guard is the safety mechanism that makes it acceptable to run a
 * small open-weight model against financial data: the model may only restate
 * figures it was given, never derive new ones. A plausible-looking wrong
 * rupee amount is worse than no narrative at all.
 */
const FACTS = [
  "- Food leads your month (+18%): You've put ₹12,400.00 toward food this month, versus ₹10,500.00 last month.",
  "- Largest single expense (₹48,000.00): \"Homestay in Goa\" was the biggest line item.",
].join("\n");

describe("containsUnsupportedNumbers", () => {
  it("accepts a narrative that only restates given figures", () => {
    const text =
      "You spent ₹12,400.00 on food this month, up from ₹10,500.00. Your largest single expense was ₹48,000.00.";
    expect(containsUnsupportedNumbers(text, FACTS)).toBe(false);
  });

  it("accepts prose with no numbers at all", () => {
    expect(containsUnsupportedNumbers("Food was your biggest category this month.", FACTS)).toBe(
      false
    );
  });

  it("rejects a total the model computed for itself", () => {
    // 12,400 + 48,000 = 60,400 — arithmetic the model was never asked to do.
    const text = "Across both, you spent ₹60,400.00 this month.";
    expect(containsUnsupportedNumbers(text, FACTS)).toBe(true);
  });

  it("rejects an invented percentage", () => {
    expect(containsUnsupportedNumbers("Food is 45% of your spending.", FACTS)).toBe(true);
  });

  it("rejects a subtly altered figure", () => {
    // A transposed digit is exactly the failure that must never reach a user.
    expect(containsUnsupportedNumbers("You spent ₹12,500.00 on food.", FACTS)).toBe(true);
  });

  it("rejects a figure assembled from fragments of two real ones", () => {
    // "12" appears in ₹12,400 and "500" in ₹10,500 — a naive digit-run check
    // would wave this through even though ₹12,500.00 was never a fact.
    expect(containsUnsupportedNumbers("Food came to ₹12,500.00.", FACTS)).toBe(true);
  });

  it("treats the same value written with different precision as supported", () => {
    // ₹48,000 and ₹48,000.00 are the same figure — don't discard on formatting.
    expect(containsUnsupportedNumbers("Your biggest expense was ₹48,000.", FACTS)).toBe(false);
  });

  it("accepts the percentage that was supplied", () => {
    expect(containsUnsupportedNumbers("Food is up 18% on last month.", FACTS)).toBe(false);
  });
});

describe("insightsHash", () => {
  const insight = (over: Partial<Insight> = {}): Insight => ({
    id: "top-category",
    title: "Food leads your month",
    delta: "+18%",
    tone: "up",
    body: "You've put ₹12,400.00 toward food.",
    color: "ft-yellow",
    ...over,
  });

  it("is stable for identical inputs", () => {
    expect(insightsHash([insight()])).toBe(insightsHash([insight()]));
  });

  it("changes when a figure changes", () => {
    expect(insightsHash([insight()])).not.toBe(
      insightsHash([insight({ body: "You've put ₹13,000.00 toward food." })])
    );
  });

  it("changes when the delta changes", () => {
    expect(insightsHash([insight()])).not.toBe(insightsHash([insight({ delta: "+22%" })]));
  });

  it("changes when an insight is added", () => {
    expect(insightsHash([insight()])).not.toBe(
      insightsHash([insight(), insight({ id: "month-over-month" })])
    );
  });

  it("ignores presentation-only fields so a colour tweak doesn't force regeneration", () => {
    expect(insightsHash([insight()])).toBe(insightsHash([insight({ color: "ft-red" })]));
  });
});
