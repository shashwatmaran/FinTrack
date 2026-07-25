import { CATEGORY_META } from "./categories";
import { categoryTotals, currentMonthKey } from "./selectors";
import { formatCurrency } from "./format";
import type { AccentToken, Expense } from "./types";

export interface Insight {
  id: string;
  title: string;
  delta: string;
  tone: "up" | "down" | "flat";
  body: string;
  color: AccentToken;
}

function previousMonthKey(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Deterministic, locally-computed insights. The LLM-written narrative layer
 * described in the README sits on top of these once an API key is configured —
 * these numbers stay the source of truth either way.
 */
export function buildInsights(
  currentUserId: string,
  expenses: Expense[],
  now = new Date()
): Insight[] {
  const thisMonth = currentMonthKey(now);
  const lastMonth = previousMonthKey(now);

  const current = categoryTotals(currentUserId, expenses, thisMonth);
  const previous = categoryTotals(currentUserId, expenses, lastMonth);
  const prevByCategory = new Map(previous.map((c) => [c.category, c.amount]));

  const insights: Insight[] = [];

  const top = current[0];
  if (top) {
    const prior = prevByCategory.get(top.category) ?? 0;
    const change = prior > 0 ? ((top.amount - prior) / prior) * 100 : 100;
    insights.push({
      id: "top-category",
      title: `${CATEGORY_META[top.category].label} leads your month`,
      delta: prior > 0 ? `${change >= 0 ? "+" : ""}${Math.round(change)}%` : "new",
      tone: change > 5 ? "up" : change < -5 ? "down" : "flat",
      body:
        prior > 0
          ? `You've put ${formatCurrency(top.amount)} toward ${CATEGORY_META[top.category].label.toLowerCase()} this month, versus ${formatCurrency(prior)} last month.`
          : `${formatCurrency(top.amount)} so far — there's no prior month to compare against yet.`,
      color: CATEGORY_META[top.category].color,
    });
  }

  const currentTotal = current.reduce((sum, c) => sum + c.amount, 0);
  const previousTotal = previous.reduce((sum, c) => sum + c.amount, 0);
  if (currentTotal > 0 || previousTotal > 0) {
    const change = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 100;
    insights.push({
      id: "month-over-month",
      title: "Month over month",
      delta: previousTotal > 0 ? `${change >= 0 ? "+" : ""}${Math.round(change)}%` : "new",
      tone: change > 5 ? "up" : change < -5 ? "down" : "flat",
      body: `Your share this month is ${formatCurrency(currentTotal)}, against ${formatCurrency(previousTotal)} last month across every group.`,
      color: change > 5 ? "ft-red" : "ft-green",
    });
  }

  const biggest = [...expenses]
    .filter((e) => e.date.startsWith(thisMonth))
    .sort((a, b) => b.amount - a.amount)[0];
  if (biggest) {
    insights.push({
      id: "largest-expense",
      title: "Largest single expense",
      delta: formatCurrency(biggest.amount),
      tone: "flat",
      body: `"${biggest.description}" was the biggest line item this month. Your share was ${formatCurrency(
        biggest.splits.filter((s) => s.userId === currentUserId).reduce((sum, s) => sum + s.amount, 0)
      )}.`,
      color: "ft-sky",
    });
  }

  return insights;
}
