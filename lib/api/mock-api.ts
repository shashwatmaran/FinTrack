import { equalSplit } from "@/lib/balances";
import {
  ACTIVITY,
  CURRENT_USER_ID,
  EXPENSES,
  GROUPS,
  NOTIFICATIONS,
  SETTLEMENTS,
  USERS,
} from "@/lib/mock-data";
import type {
  ActivityDayGroup,
  AppUser,
  Expense,
  ExpenseCategory,
  Group,
  GroupType,
  NotificationItem,
  Settlement,
} from "@/lib/types";

/**
 * In-memory stand-in for the future server API. Everything here is the exact
 * shape the real route handlers will return, so `hooks/` can move to `fetch`
 * without component changes. Data resets on reload — persistence lands with
 * the MongoDB Atlas phase.
 */

const LATENCY = 180;

const db = {
  users: [...USERS],
  groups: [...GROUPS],
  expenses: [...EXPENSES],
  settlements: [...SETTLEMENTS],
  notifications: [...NOTIFICATIONS],
  activity: ACTIVITY.map((day) => ({ ...day, items: [...day.items] })),
};

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
}

function nextId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function pushActivity(groupId: string, message: string) {
  const today = db.activity.find((d) => d.day === "Today");
  const item = { id: nextId("a"), groupId, actorId: CURRENT_USER_ID, message, timeLabel: "just now" };
  if (today) today.items.unshift(item);
  else db.activity.unshift({ day: "Today", items: [item] });
}

export async function getCurrentUser(): Promise<AppUser> {
  return delay(db.users.find((u) => u.id === CURRENT_USER_ID)!);
}

export async function getUsers(): Promise<AppUser[]> {
  return delay([...db.users]);
}

export async function getGroups(): Promise<Group[]> {
  return delay([...db.groups]);
}

export async function getExpenses(): Promise<Expense[]> {
  return delay([...db.expenses].sort((a, b) => b.date.localeCompare(a.date)));
}

export async function getSettlements(): Promise<Settlement[]> {
  return delay([...db.settlements]);
}

export async function getNotifications(): Promise<NotificationItem[]> {
  return delay([...db.notifications]);
}

export async function getActivity(): Promise<ActivityDayGroup[]> {
  return delay(db.activity.map((day) => ({ ...day, items: [...day.items] })));
}

export interface CreateExpenseInput {
  groupId: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  payerId: string;
  participantIds: string[];
  date: string;
  notes?: string;
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const expense: Expense = {
    id: nextId("e"),
    groupId: input.groupId,
    description: input.description,
    category: input.category,
    amount: input.amount,
    payerId: input.payerId,
    splitMethod: "equal",
    splits: equalSplit(input.amount, input.participantIds),
    date: input.date,
    notes: input.notes,
  };
  db.expenses.unshift(expense);
  const group = db.groups.find((g) => g.id === input.groupId);
  pushActivity(input.groupId, `You added **${expense.description}** to ${group?.name ?? "a group"}`);
  return delay(expense);
}

export async function deleteExpense(expenseId: string): Promise<{ id: string }> {
  db.expenses = db.expenses.filter((e) => e.id !== expenseId);
  return delay({ id: expenseId });
}

export async function toggleRecurring(expenseId: string): Promise<Expense> {
  const expense = db.expenses.find((e) => e.id === expenseId);
  if (!expense?.recurring) throw new Error("Expense has no recurring rule");
  expense.recurring = { ...expense.recurring, active: !expense.recurring.active };
  return delay(expense);
}

export interface CreateGroupInput {
  name: string;
  type: GroupType;
  memberIds: string[];
}

export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const palette = ["ft-lime", "ft-sky", "ft-pink", "ft-purple", "ft-yellow"] as const;
  const group: Group = {
    id: nextId("g"),
    name: input.name,
    type: input.type,
    color: palette[db.groups.length % palette.length],
    memberIds: Array.from(new Set([CURRENT_USER_ID, ...input.memberIds])),
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.groups.push(group);
  pushActivity(group.id, `You created **${group.name}**`);
  return delay(group);
}

export interface CreateSettlementInput {
  groupId: string;
  toUserId: string;
  amount: number;
  method: string;
}

export async function createSettlement(input: CreateSettlementInput): Promise<Settlement> {
  const settlement: Settlement = {
    id: nextId("s"),
    groupId: input.groupId,
    fromUserId: CURRENT_USER_ID,
    toUserId: input.toUserId,
    amount: input.amount,
    status: "pending",
    method: input.method,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.settlements.unshift(settlement);
  const payee = db.users.find((u) => u.id === input.toUserId);
  pushActivity(input.groupId, `You logged a **${input.method}** payment to ${payee?.name ?? "a member"}`);
  return delay(settlement);
}

export async function resolveSettlement(
  settlementId: string,
  status: "confirmed" | "declined"
): Promise<Settlement> {
  const settlement = db.settlements.find((s) => s.id === settlementId);
  if (!settlement) throw new Error("Settlement not found");
  settlement.status = status;
  return delay(settlement);
}

export async function markNotificationsRead(): Promise<NotificationItem[]> {
  db.notifications = db.notifications.map((n) => ({ ...n, read: true }));
  return delay([...db.notifications]);
}
