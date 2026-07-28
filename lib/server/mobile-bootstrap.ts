import "server-only";

import { buildInsights, type Insight } from "@/lib/insights";
import {
  balancesWithOthers,
  categoryTotals,
  currentMonthKey,
  groupDebtFlows,
  groupNetForUser,
  headlineTotals,
  monthlySpend,
  suggestedTransfers,
  type CounterpartyBalance,
  type HeadlineTotals,
  type MonthlyPoint,
} from "@/lib/selectors";
import type { BootstrapData, DebtFlow, Expense } from "@/lib/types";
import { loadBootstrap } from "./bootstrap";
import type { DataStore } from "./store-types";

/**
 * The web client computes every balance in the browser from the bootstrap
 * payload — roughly 600 lines of pure functions in `lib/balances.ts` and
 * `lib/selectors.ts` with genuinely subtle behaviour: `computeDebtFlows` nets
 * pairwise debts in both directions, `simplifyDebts` is a greedy
 * min-transaction solver, `equalSplit` works in integer paise.
 *
 * Porting that to Kotlin would mean two implementations of the rules deciding
 * what people owe each other, and this repo already has a firm opinion about
 * that shape of problem — it is why `tests/store-contract.ts` exists. Two
 * copies drift, and only one of them runs in the path you happen to be testing.
 *
 * So the phone gets the answers, not the arithmetic. What that costs, honestly:
 * a larger payload, and no local recomputation after a write — the app cannot
 * optimistically update *aggregates*, it must refetch. Lists still update
 * instantly, because `createExpense` and `createSettlement` return the created
 * entity, so only the headline figures lag by one round trip.
 *
 * Everything below is a composition of functions that already exist and are
 * already pure. Nothing new is computed here; if a number is wrong it is wrong
 * on the web too, which is the entire point.
 */

export interface DerivedGroup {
  groupId: string;
  /** The acting user's net position: positive means the group owes them. */
  net: number;
  /** Every member's spend in this group, not just the acting user's share. */
  totalSpent: number;
  expenseCount: number;
  /** Raw pairwise debts. */
  flows: DebtFlow[];
  /** The same debts after greedy minimisation — what "Settle up" lists. */
  simplified: DebtFlow[];
}

export interface DerivedData {
  headline: HeadlineTotals;
  counterparties: CounterpartyBalance[];
  groups: DerivedGroup[];
  monthly: MonthlyPoint[];
  /** Current month only, matching the web insights page. */
  categories: { category: Expense["category"]; amount: number }[];
  insights: Insight[];
  unreadNotifications: number;
}

export interface MobileBootstrapData extends BootstrapData {
  derived: DerivedData;
}

const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

/**
 * `now` is injectable so tests can pin a month rather than passing whenever
 * they happen to run. Every month-sensitive selector below takes it.
 */
export async function loadMobileBootstrap(
  store: DataStore,
  userId: string,
  now = new Date()
): Promise<MobileBootstrapData> {
  const base = await loadBootstrap(store, userId);
  const { groups, expenses, settlements, notifications } = base;

  // One pass for every group's simplified transfers, then indexed — calling
  // `suggestedTransfers` per group would redo the whole netting each time.
  const simplifiedByGroup = new Map(
    suggestedTransfers(groups, expenses, settlements).map((s) => [s.groupId, s.flows])
  );

  const derivedGroups: DerivedGroup[] = groups.map((group) => {
    const groupExpenses = expenses.filter((e) => e.groupId === group.id);
    return {
      groupId: group.id,
      net: groupNetForUser(userId, group, expenses, settlements),
      totalSpent: round2(groupExpenses.reduce((sum, e) => sum + e.amount, 0)),
      expenseCount: groupExpenses.length,
      flows: groupDebtFlows(group, expenses, settlements),
      simplified: simplifiedByGroup.get(group.id) ?? [],
    };
  });

  return {
    ...base,
    derived: {
      headline: headlineTotals(userId, expenses, settlements, now),
      counterparties: balancesWithOthers(userId, expenses, settlements),
      groups: derivedGroups,
      monthly: monthlySpend(userId, expenses, 6, now),
      categories: categoryTotals(userId, expenses, currentMonthKey(now)),
      insights: buildInsights(userId, expenses, now, settlements),
      unreadNotifications: notifications.filter((n) => !n.read).length,
    },
  };
}
