import { computeDebtFlows, computeNetBalances, simplifyDebts } from "./balances";
import type { AppUser, DebtFlow, Expense, Group, Settlement } from "./types";

export function usersById(users: AppUser[]): Record<string, AppUser> {
  return Object.fromEntries(users.map((u) => [u.id, u]));
}

export function groupsById(groups: Group[]): Record<string, Group> {
  return Object.fromEntries(groups.map((g) => [g.id, g]));
}

/** All members across every group the current user belongs to. */
export function counterparties(
  currentUserId: string,
  groups: Group[],
  users: AppUser[]
): AppUser[] {
  const ids = new Set<string>();
  for (const group of groups) {
    if (!group.memberIds.includes(currentUserId)) continue;
    for (const id of group.memberIds) if (id !== currentUserId) ids.add(id);
  }
  return users.filter((u) => ids.has(u.id));
}

export interface CounterpartyBalance {
  userId: string;
  /** Positive = they owe the current user. Negative = the current user owes them. */
  amount: number;
}

/** Net position with each other person, aggregated across all shared groups. */
export function balancesWithOthers(
  currentUserId: string,
  expenses: Expense[],
  settlements: Settlement[]
): CounterpartyBalance[] {
  const flows = computeDebtFlows(expenses, settlements);
  const totals = new Map<string, number>();
  for (const flow of flows) {
    if (flow.fromUserId === currentUserId) {
      totals.set(flow.toUserId, (totals.get(flow.toUserId) ?? 0) - flow.amount);
    } else if (flow.toUserId === currentUserId) {
      totals.set(flow.fromUserId, (totals.get(flow.fromUserId) ?? 0) + flow.amount);
    }
  }
  return Array.from(totals.entries())
    .map(([userId, amount]) => ({ userId, amount: Math.round(amount * 100) / 100 }))
    .filter((b) => Math.abs(b.amount) > 0.005)
    .sort((a, b) => b.amount - a.amount);
}

export interface HeadlineTotals {
  spentThisMonth: number;
  owed: number;
  owes: number;
  owedPeople: number;
  owesPeople: number;
}

export function headlineTotals(
  currentUserId: string,
  expenses: Expense[],
  settlements: Settlement[],
  now = new Date()
): HeadlineTotals {
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const spentThisMonth = expenses
    .filter((e) => e.date.startsWith(monthKey))
    .flatMap((e) => e.splits.filter((s) => s.userId === currentUserId))
    .reduce((sum, s) => sum + s.amount, 0);

  const balances = balancesWithOthers(currentUserId, expenses, settlements);
  const owedList = balances.filter((b) => b.amount > 0);
  const owesList = balances.filter((b) => b.amount < 0);

  return {
    spentThisMonth: Math.round(spentThisMonth * 100) / 100,
    owed: Math.round(owedList.reduce((s, b) => s + b.amount, 0) * 100) / 100,
    owes: Math.round(-owesList.reduce((s, b) => s + b.amount, 0) * 100) / 100,
    owedPeople: owedList.length,
    owesPeople: owesList.length,
  };
}

/** The current user's net position inside one group. */
export function groupNetForUser(
  currentUserId: string,
  group: Group,
  expenses: Expense[],
  settlements: Settlement[]
): number {
  const groupExpenses = expenses.filter((e) => e.groupId === group.id);
  const groupSettlements = settlements.filter((s) => s.groupId === group.id);
  const net = computeNetBalances(group.memberIds, groupExpenses, groupSettlements);
  return Math.round((net[currentUserId] ?? 0) * 100) / 100;
}

export function groupDebtFlows(
  group: Group,
  expenses: Expense[],
  settlements: Settlement[]
): DebtFlow[] {
  return computeDebtFlows(
    expenses.filter((e) => e.groupId === group.id),
    settlements.filter((s) => s.groupId === group.id)
  );
}

export function suggestedTransfers(
  groups: Group[],
  expenses: Expense[],
  settlements: Settlement[]
): { groupId: string; flows: DebtFlow[] }[] {
  return groups.map((group) => {
    const net = computeNetBalances(
      group.memberIds,
      expenses.filter((e) => e.groupId === group.id),
      settlements.filter((s) => s.groupId === group.id)
    );
    return { groupId: group.id, flows: simplifyDebts(net) };
  });
}

export interface MonthlyPoint {
  key: string;
  label: string;
  amount: number;
}

/** Current user's share of spending for the last `count` months. */
export function monthlySpend(
  currentUserId: string,
  expenses: Expense[],
  count = 6,
  now = new Date()
): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = expenses
      .filter((e) => e.date.startsWith(key))
      .flatMap((e) => e.splits.filter((s) => s.userId === currentUserId))
      .reduce((sum, s) => sum + s.amount, 0);
    points.push({
      key,
      label: date.toLocaleDateString("en-US", { month: "short" }),
      amount: Math.round(amount * 100) / 100,
    });
  }
  return points;
}

export function categoryTotals(
  currentUserId: string,
  expenses: Expense[],
  monthKey?: string
): { category: Expense["category"]; amount: number }[] {
  const totals = new Map<Expense["category"], number>();
  for (const expense of expenses) {
    if (monthKey && !expense.date.startsWith(monthKey)) continue;
    const share = expense.splits
      .filter((s) => s.userId === currentUserId)
      .reduce((sum, s) => sum + s.amount, 0);
    if (share === 0) continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + share);
  }
  return Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

export function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
