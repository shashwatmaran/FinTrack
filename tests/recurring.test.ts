import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  describeNextRun,
  dueOccurrences,
  nextOccurrence,
} from "@/lib/recurring";
import type { RecurringInfo } from "@/lib/types";

const monthly = (nextRunAt: string, active = true): RecurringInfo => ({
  cadence: "monthly",
  nextRunAt,
  active,
});
const weekly = (nextRunAt: string, active = true): RecurringInfo => ({
  cadence: "weekly",
  nextRunAt,
  active,
});

describe("daysInMonth", () => {
  it("knows month lengths", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("handles leap years", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28); // divisible by 100, not 400
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
  });
});

describe("nextOccurrence — weekly", () => {
  it("adds seven days", () => {
    expect(nextOccurrence("2026-07-01", "weekly")).toBe("2026-07-08");
  });

  it("crosses a month boundary", () => {
    expect(nextOccurrence("2026-07-28", "weekly")).toBe("2026-08-04");
  });

  it("crosses a year boundary", () => {
    expect(nextOccurrence("2026-12-29", "weekly")).toBe("2027-01-05");
  });

  it("crosses a leap day", () => {
    expect(nextOccurrence("2028-02-26", "weekly")).toBe("2028-03-04");
  });
});

describe("nextOccurrence — monthly", () => {
  it("keeps the same day of month", () => {
    expect(nextOccurrence("2026-07-15", "monthly")).toBe("2026-08-15");
  });

  it("crosses a year boundary", () => {
    expect(nextOccurrence("2026-12-10", "monthly")).toBe("2027-01-10");
  });

  it("clamps the 31st into a 30-day month", () => {
    expect(nextOccurrence("2026-03-31", "monthly")).toBe("2026-04-30");
  });

  it("clamps into February", () => {
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextOccurrence("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  it("returns to the anchor day after a short month", () => {
    // The bug this guards: clamping from the previous *result* would leave a
    // rent-on-the-31st rule stuck on the 28th for the rest of the year.
    expect(nextOccurrence("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextOccurrence("2026-04-30", "monthly", 31)).toBe("2026-05-31");
  });
});

describe("dueOccurrences", () => {
  it("returns nothing when the next run is in the future", () => {
    const result = dueOccurrences(monthly("2026-08-01"), "2026-07-25");
    expect(result.dates).toEqual([]);
    expect(result.nextRunAt).toBe("2026-08-01");
  });

  it("returns the occurrence due exactly today", () => {
    const result = dueOccurrences(monthly("2026-07-25"), "2026-07-25");
    expect(result.dates).toEqual(["2026-07-25"]);
    expect(result.nextRunAt).toBe("2026-08-25");
  });

  it("skips a paused rule entirely and leaves its schedule untouched", () => {
    const result = dueOccurrences(monthly("2026-01-01", false), "2026-07-25");
    expect(result.dates).toEqual([]);
    expect(result.nextRunAt).toBe("2026-01-01");
  });

  it("catches up every missed occurrence after a long outage", () => {
    // Cron hadn't run since April; three months of rent are owed.
    const result = dueOccurrences(monthly("2026-04-01"), "2026-07-25");
    expect(result.dates).toEqual(["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"]);
    expect(result.nextRunAt).toBe("2026-08-01");
  });

  it("catches up weekly rules", () => {
    const result = dueOccurrences(weekly("2026-07-01"), "2026-07-25");
    expect(result.dates).toEqual(["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22"]);
    expect(result.nextRunAt).toBe("2026-07-29");
  });

  it("preserves the anchor day across a short month while catching up", () => {
    const result = dueOccurrences(monthly("2026-01-31"), "2026-04-15");
    expect(result.dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(result.nextRunAt).toBe("2026-04-30");
  });

  it("caps catch-up so bad data can't materialise hundreds of expenses", () => {
    const result = dueOccurrences(monthly("2020-01-01"), "2026-07-25", 12);
    expect(result.dates).toHaveLength(12);
  });

  it("fast-forwards past the backlog when the cap is hit", () => {
    // Having capped, the schedule must still land in the future — otherwise
    // every subsequent run would replay the same 12 and never converge.
    const result = dueOccurrences(monthly("2020-01-01"), "2026-07-25", 12);
    expect(result.nextRunAt > "2026-07-25").toBe(true);
  });

  it("converges: replaying until nothing is due terminates", () => {
    let rule = monthly("2020-01-01");
    let total = 0;
    for (let pass = 0; pass < 20; pass++) {
      const { dates, nextRunAt } = dueOccurrences(rule, "2026-07-25", 12);
      total += dates.length;
      rule = monthly(nextRunAt);
      if (dates.length === 0) break;
    }
    expect(dueOccurrences(rule, "2026-07-25").dates).toEqual([]);
    expect(total).toBeGreaterThan(0);
  });

  it("never returns a date after today", () => {
    const { dates } = dueOccurrences(weekly("2026-01-01"), "2026-07-25", 100);
    expect(dates.every((d) => d <= "2026-07-25")).toBe(true);
  });

  it("always advances nextRunAt past today when something was due", () => {
    const { nextRunAt } = dueOccurrences(monthly("2026-07-01"), "2026-07-25");
    expect(nextRunAt > "2026-07-25").toBe(true);
  });
});

describe("describeNextRun", () => {
  it("flags an overdue rule", () => {
    expect(describeNextRun("2026-07-20", "2026-07-25")).toBe("due now");
    expect(describeNextRun("2026-07-25", "2026-07-25")).toBe("due now");
  });

  it("describes near-term runs", () => {
    expect(describeNextRun("2026-07-26", "2026-07-25")).toBe("tomorrow");
    expect(describeNextRun("2026-07-28", "2026-07-25")).toBe("in 3 days");
  });

  it("describes longer gaps in weeks", () => {
    expect(describeNextRun("2026-08-03", "2026-07-25")).toBe("next week");
    expect(describeNextRun("2026-08-25", "2026-07-25")).toBe("in 4 weeks");
  });
});
