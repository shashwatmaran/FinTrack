import { CATEGORY_META } from "./categories";
import { categoryTotals, currentMonthKey, headlineTotals } from "./selectors";
import { formatCurrency } from "./format";
import type { AccentToken, Expense, Settlement } from "./types";

export interface Insight {
  id: string;
  title: string;
  delta: string;
  tone: "up" | "down" | "flat";
  body: string;
  color: AccentToken;
}

type Change = { delta: string; tone: Insight["tone"] };

/**
 * Above this, a percentage stops informing and starts misleading.
 *
 * Percentage change is only meaningful against a material baseline. A user
 * whose first real month follows a near-empty one gets "+3143%", which is
 * arithmetically true and tells them nothing — and a narrative that repeats it
 * confidently is worse than no narrative. Past this threshold the absolute
 * difference is reported instead, which stays honest at any scale.
 */
const MAX_MEANINGFUL_PERCENT = 300;

function describeChange(current: number, prior: number): Change {
  if (prior <= 0) return { delta: "new", tone: "up" };

  const percent = ((current - prior) / prior) * 100;
  if (Math.abs(percent) > MAX_MEANINGFUL_PERCENT) {
    const diff = current - prior;
    return {
      delta: `${diff >= 0 ? "+" : "-"}${formatCurrency(Math.abs(diff))}`,
      tone: diff > 0 ? "up" : "down",
    };
  }

  return {
    delta: `${percent >= 0 ? "+" : ""}${Math.round(percent)}%`,
    tone: percent > 5 ? "up" : percent < -5 ? "down" : "flat",
  };
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function offsetMonthKey(now: Date, back: number) {
  return monthKey(new Date(now.getFullYear(), now.getMonth() - back, 1));
}

/** The current user's share of one expense. */
function shareOf(expense: Expense, userId: string): number {
  return expense.splits
    .filter((s) => s.userId === userId)
    .reduce((sum, s) => sum + s.amount, 0);
}

function monthShare(userId: string, expenses: Expense[], key: string): number {
  return expenses
    .filter((e) => e.date.startsWith(key))
    .reduce((sum, e) => sum + shareOf(e, userId), 0);
}

/**
 * Median rather than mean: one holiday would drag an average up far enough to
 * make every ordinary month afterwards look like a saving.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

/**
 * Deterministic, locally-computed insights. The model-written narrative layer
 * sits on top of these and never recomputes them — these numbers are the
 * source of truth either way.
 *
 * `settlements` is optional because the insights page can render without it;
 * the settlement-position insight is simply omitted when it isn't supplied.
 */
export function buildInsights(
  currentUserId: string,
  expenses: Expense[],
  now = new Date(),
  settlements: Settlement[] = []
): Insight[] {
  const thisMonth = currentMonthKey(now);
  const lastMonth = offsetMonthKey(now, 1);

  const current = categoryTotals(currentUserId, expenses, thisMonth);
  const previous = categoryTotals(currentUserId, expenses, lastMonth);
  const prevByCategory = new Map(previous.map((c) => [c.category, c.amount]));

  const insights: Insight[] = [];

  const top = current[0];
  if (top) {
    const prior = prevByCategory.get(top.category) ?? 0;
    const label = CATEGORY_META[top.category].label;
    const change = describeChange(top.amount, prior);
    insights.push({
      id: "top-category",
      title: `${label} leads your month`,
      delta: change.delta,
      tone: change.tone,
      body:
        prior > 0
          ? `You've put ${formatCurrency(top.amount)} toward ${label.toLowerCase()} this month, versus ${formatCurrency(prior)} last month.`
          : `${formatCurrency(top.amount)} so far — there's no prior month to compare against yet.`,
      color: CATEGORY_META[top.category].color,
    });
  }

  const currentTotal = round2(current.reduce((sum, c) => sum + c.amount, 0));
  const previousTotal = round2(previous.reduce((sum, c) => sum + c.amount, 0));
  if (currentTotal > 0 || previousTotal > 0) {
    const change = describeChange(currentTotal, previousTotal);
    insights.push({
      id: "month-over-month",
      title: "Month over month",
      delta: change.delta,
      tone: change.tone,
      body: `Your share this month is ${formatCurrency(currentTotal)}, against ${formatCurrency(previousTotal)} last month across every group.`,
      color: change.tone === "up" ? "ft-red" : "ft-green",
    });
  }

  const thisMonthExpenses = expenses.filter((e) => e.date.startsWith(thisMonth));
  const biggest = [...thisMonthExpenses].sort((a, b) => b.amount - a.amount)[0];
  const biggestShare = biggest ? round2(shareOf(biggest, currentUserId)) : 0;

  if (biggest) {
    insights.push({
      id: "largest-expense",
      title: "Largest single expense",
      delta: formatCurrency(biggest.amount),
      tone: "flat",
      body: `"${biggest.description}" was the biggest line item this month. Your share was ${formatCurrency(biggestShare)}.`,
      color: "ft-sky",
    });
  }

  /**
   * The reframing fact.
   *
   * "Spending is up" and "there was one big trip" are separate cards that
   * usually describe the same event. Removing the largest item and comparing
   * what's left against the user's own median says whether the underlying
   * habit moved at all — which is the thing neither other card answers.
   */
  if (biggest && thisMonthExpenses.length > 1) {
    const baseline = round2(
      median([1, 2, 3].map((back) => monthShare(currentUserId, expenses, offsetMonthKey(now, back))))
    );
    if (baseline > 0) {
      const underlying = round2(currentTotal - biggestShare);
      const change = describeChange(underlying, baseline);
      /**
       * The comparison is stated in words, not left to the reader of the fact
       * sheet to infer.
       *
       * A model handed two numbers and a median will occasionally characterise
       * the gap wrongly — "close to your usual pace" when the figure is eight
       * times over. The numeric guard cannot catch that, because every number
       * in the sentence is real. So the direction is computed here, with the
       * rest of the arithmetic, and the model only has to repeat it.
       */
      const direction =
        underlying > baseline * 1.1
          ? "above"
          : underlying < baseline * 0.9
            ? "below"
            : "in line with";
      insights.push({
        id: "underlying-spend",
        title: "Excluding your largest expense",
        delta: change.delta,
        tone: change.tone,
        body: `Set that one aside and your month is ${formatCurrency(underlying)} — ${direction} your ${formatCurrency(baseline)} median for the previous three months.`,
        color: change.tone === "up" ? "ft-red" : "ft-green",
      });
    }
  }

  /**
   * What the user actually has to act on. Absent from the insights page
   * entirely before now, despite being the only figure here that implies a
   * next step.
   */
  if (settlements.length > 0 || expenses.length > 0) {
    const totals = headlineTotals(currentUserId, expenses, settlements, now);
    const net = round2(totals.owed - totals.owes);

    if (totals.owed > 0 || totals.owes > 0) {
      const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
      insights.push({
        id: "settlement-position",
        title: net >= 0 ? "You're owed more than you owe" : "You owe more than you're owed",
        delta: `${net >= 0 ? "+" : "-"}${formatCurrency(Math.abs(net))}`,
        tone: net >= 0 ? "up" : "down",
        body: `${formatCurrency(totals.owed)} is coming to you from ${people(totals.owedPeople)}, and you owe ${formatCurrency(totals.owes)} to ${people(totals.owesPeople)}.`,
        color: net >= 0 ? "ft-green" : "ft-yellow",
      });
    }
  }

  /**
   * How much of the month was already decided. Recurring rules are commitments
   * the user cannot flex this month, so separating them says how much of the
   * total was ever a choice.
   */
  const recurringShare = round2(
    thisMonthExpenses.filter((e) => e.recurring).reduce((sum, e) => sum + shareOf(e, currentUserId), 0)
  );
  if (recurringShare > 0 && currentTotal > 0) {
    const percent = Math.round((recurringShare / currentTotal) * 100);
    insights.push({
      id: "fixed-commitments",
      title: "Committed before the month started",
      delta: `${percent}%`,
      tone: "flat",
      body: `${formatCurrency(recurringShare)} of your ${formatCurrency(currentTotal)} came from recurring expenses.`,
      color: "ft-purple",
    });
  }

  return insights;
}
