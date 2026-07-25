import type { DebtFlow, Expense, Settlement } from "./types";

/**
 * Net balance per user within a set of expenses + confirmed settlements.
 * Positive = the group owes this user money. Negative = this user owes the group.
 * Pending settlements stay in escrow and are intentionally excluded until confirmed.
 */
export function computeNetBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[]
): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries(memberIds.map((id) => [id, 0]));

  for (const expense of expenses) {
    net[expense.payerId] = (net[expense.payerId] ?? 0) + expense.amount;
    for (const split of expense.splits) {
      net[split.userId] = (net[split.userId] ?? 0) - split.amount;
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== "confirmed") continue;
    net[settlement.fromUserId] = (net[settlement.fromUserId] ?? 0) + settlement.amount;
    net[settlement.toUserId] = (net[settlement.toUserId] ?? 0) - settlement.amount;
  }

  return net;
}

/**
 * Pairwise "who owes whom" derived directly from splits, netted against the
 * counterparty and against confirmed settlements between that pair. This is
 * the raw "debt map" before simplification.
 */
export function computeDebtFlows(
  expenses: Expense[],
  settlements: Settlement[]
): DebtFlow[] {
  const pairwise = new Map<string, number>(); // key `${a}>${b}` = amount a owes b

  const add = (from: string, to: string, amount: number) => {
    if (from === to || amount === 0) return;
    const forward = `${from}>${to}`;
    const backward = `${to}>${from}`;
    if (pairwise.has(backward)) {
      const existing = pairwise.get(backward)!;
      const remainder = existing - amount;
      if (remainder > 0) {
        pairwise.set(backward, remainder);
      } else {
        pairwise.delete(backward);
        if (remainder < 0) pairwise.set(forward, -remainder);
      }
      return;
    }
    pairwise.set(forward, (pairwise.get(forward) ?? 0) + amount);
  };

  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.userId === expense.payerId) continue;
      add(split.userId, expense.payerId, split.amount);
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== "confirmed") continue;
    add(settlement.toUserId, settlement.fromUserId, settlement.amount);
  }

  return Array.from(pairwise.entries())
    .map(([key, amount]) => {
      const [fromUserId, toUserId] = key.split(">");
      return { fromUserId, toUserId, amount: Math.round(amount * 100) / 100 };
    })
    .filter((flow) => flow.amount > 0.005);
}

/** Greedy minimum-transaction settlement suggestion from net balances. */
export function simplifyDebts(net: Record<string, number>): DebtFlow[] {
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, amount] of Object.entries(net)) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.005) creditors.push({ id, amount: rounded });
    else if (rounded < -0.005) debtors.push({ id, amount: -rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const flows: DebtFlow[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);
    flows.push({ fromUserId: debtor.id, toUserId: creditor.id, amount: Math.round(amount * 100) / 100 });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount <= 0.005) ci++;
    if (debtor.amount <= 0.005) di++;
  }

  return flows;
}

export function equalSplit(amount: number, userIds: string[]): { userId: string; amount: number }[] {
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / userIds.length);
  const remainder = cents - base * userIds.length;
  return userIds.map((userId, i) => ({
    userId,
    amount: (base + (i < remainder ? 1 : 0)) / 100,
  }));
}
