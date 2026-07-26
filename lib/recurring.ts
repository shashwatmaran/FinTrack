import type { RecurringInfo } from "./types";

/**
 * Scheduling maths for recurring expenses. Pure and dependency-free so the
 * awkward cases — month-end rollover, a cron that didn't run for a week — are
 * testable without a database or a clock.
 *
 * Dates are handled as plain `YYYY-MM-DD` strings in UTC. Recurring expenses
 * are calendar events ("rent on the 1st"), not instants, so parsing them into
 * local `Date`s would shift the day for anyone west of UTC.
 */

export type DateString = string;

export function parseDate(date: DateString): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function toDateString(year: number, month: number, day: number): DateString {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The next occurrence after `date`.
 *
 * Monthly rules keep their day-of-month and clamp when the target month is
 * shorter: the 31st becomes the 30th in April and the 28th in a non-leap
 * February. Clamping is applied from the *anchor* day rather than the last
 * result, so a rule anchored on the 31st returns to the 31st in the next long
 * month instead of being permanently dragged down to the 28th.
 */
export function nextOccurrence(
  date: DateString,
  cadence: RecurringInfo["cadence"],
  anchorDay?: number
): DateString {
  const { year, month, day } = parseDate(date);

  if (cadence === "weekly") {
    const shifted = new Date(Date.UTC(year, month - 1, day + 7));
    return shifted.toISOString().slice(0, 10);
  }

  const wanted = anchorDay ?? day;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return toDateString(nextYear, nextMonth, Math.min(wanted, daysInMonth(nextYear, nextMonth)));
}

export interface DueOccurrences {
  /** Dates that should have been charged, oldest first. */
  dates: DateString[];
  /** Where the rule should point after these are materialised. */
  nextRunAt: DateString;
}

/**
 * Every occurrence due on or before `today`, plus the updated `nextRunAt`.
 *
 * Returns a list rather than a single date because the cron may not have run
 * for a while — a deploy gap, a paused project, a laptop that was asleep. If
 * three months of rent were missed, all three should appear rather than one,
 * and the schedule should still land on the correct next date.
 *
 * `maxCatchUp` bounds the damage if a rule's `nextRunAt` is far in the past
 * (bad data, or a restore from an old backup): materialising hundreds of
 * expenses silently would be worse than materialising a few and moving on.
 */
export function dueOccurrences(
  recurring: RecurringInfo,
  today: DateString,
  maxCatchUp = 12
): DueOccurrences {
  if (!recurring.active) return { dates: [], nextRunAt: recurring.nextRunAt };

  const anchorDay = parseDate(recurring.nextRunAt).day;
  const dates: DateString[] = [];
  let cursor = recurring.nextRunAt;

  while (cursor <= today && dates.length < maxCatchUp) {
    dates.push(cursor);
    cursor = nextOccurrence(cursor, recurring.cadence, anchorDay);
  }

  // If the cap was hit, skip the remaining backlog rather than replaying it
  // forever: fast-forward to the next occurrence at or after today.
  if (dates.length === maxCatchUp) {
    while (cursor <= today) cursor = nextOccurrence(cursor, recurring.cadence, anchorDay);
  }

  return { dates, nextRunAt: cursor };
}

/** Human-readable gap until the next run, for the recurring list in the UI. */
export function describeNextRun(nextRunAt: DateString, today: DateString): string {
  if (nextRunAt <= today) return "due now";

  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${nextRunAt}T00:00:00Z`);
  const days = Math.round((to - from) / 86_400_000);

  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 14) return "next week";
  return `in ${Math.round(days / 7)} weeks`;
}
