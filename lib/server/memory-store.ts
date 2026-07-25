import "server-only";

import bcrypt from "bcryptjs";
import { equalSplit } from "@/lib/balances";
import {
  ACTIVITY,
  DEMO_PASSWORD,
  DEMO_USER_ID,
  EXPENSES,
  GROUPS,
  NOTIFICATIONS,
  SETTLEMENTS,
  USERS,
} from "@/lib/mock-data";
import { initials as toInitials } from "@/lib/format";
import type { AccentToken, ActivityItem, AppUser, Expense, Group, NotificationItem, Settlement } from "@/lib/types";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type CreateExpenseInput,
  type CreateGroupInput,
  type CreateSettlementInput,
  type DataStore,
} from "./store-types";

/**
 * Process-local store used when MONGODB_URI is absent. State lives on
 * globalThis so it survives Next.js hot reloads in development; it is still
 * per-process, so it is a development convenience, not a production mode.
 */
interface MemoryState {
  users: (AppUser & { passwordHash?: string })[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  notifications: (NotificationItem & { userId: string })[];
  activity: ActivityItem[];
}

declare global {
  var __fintrackMemory: MemoryState | undefined;
}

function seed(): MemoryState {
  // Cost 8 rather than the default 10: this runs on every cold start of the
  // fallback store and the credential it protects is a published demo password.
  const demoHash = bcrypt.hashSync(DEMO_PASSWORD, 8);
  return {
    users: USERS.map((u) => ({ ...u, passwordHash: demoHash })),
    groups: GROUPS.map((g) => ({ ...g })),
    expenses: EXPENSES.map((e) => ({ ...e })),
    settlements: SETTLEMENTS.map((s) => ({ ...s })),
    notifications: NOTIFICATIONS.map((n) => ({ ...n, userId: DEMO_USER_ID })),
    activity: ACTIVITY.map((a) => ({ ...a })),
  };
}

function state(): MemoryState {
  globalThis.__fintrackMemory ??= seed();
  return globalThis.__fintrackMemory;
}

function nextId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const PALETTE: AccentToken[] = ["ft-lime", "ft-sky", "ft-pink", "ft-purple", "ft-yellow"];

function stripSecrets(user: AppUser & { passwordHash?: string }): AppUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

export const memoryStore: DataStore = {
  async getUserById(id) {
    const user = state().users.find((u) => u.id === id);
    return user ? stripSecrets(user) : null;
  },

  async getUserByEmail(email) {
    const user = state().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user ? { ...user } : null;
  },

  async createUser({ name, email, password }) {
    const s = state();
    if (s.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      throw new ValidationError("An account with that email already exists");
    }
    const user = {
      id: nextId("u"),
      name,
      email: email.toLowerCase(),
      initials: toInitials(name),
      color: PALETTE[s.users.length % PALETTE.length],
      passwordHash: await bcrypt.hash(password, 10),
    };
    s.users.push(user);
    return stripSecrets(user);
  },

  async getVisibleUsers(actorId) {
    const s = state();
    const visible = new Set<string>([actorId]);
    for (const group of s.groups) {
      if (!group.memberIds.includes(actorId)) continue;
      for (const id of group.memberIds) visible.add(id);
    }
    return s.users.filter((u) => visible.has(u.id)).map(stripSecrets);
  },

  async getGroups(actorId) {
    return state()
      .groups.filter((g) => g.memberIds.includes(actorId))
      .map((g) => ({ ...g }));
  },

  async createGroup(actorId, input: CreateGroupInput) {
    const s = state();
    const group: Group = {
      id: nextId("g"),
      name: input.name,
      type: input.type,
      color: PALETTE[s.groups.length % PALETTE.length],
      memberIds: Array.from(new Set([actorId, ...input.memberIds])),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    s.groups.push(group);
    s.activity.unshift({
      id: nextId("a"),
      groupId: group.id,
      actorId,
      message: `You created **${group.name}**`,
      createdAt: new Date().toISOString(),
    });
    return { ...group };
  },

  async getExpenses(actorId) {
    const s = state();
    const groupIds = new Set(
      s.groups.filter((g) => g.memberIds.includes(actorId)).map((g) => g.id)
    );
    return s.expenses
      .filter((e) => groupIds.has(e.groupId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => ({ ...e }));
  },

  async createExpense(actorId, input: CreateExpenseInput) {
    const s = state();
    const group = s.groups.find((g) => g.id === input.groupId);
    if (!group) throw new NotFoundError("Group not found");
    if (!group.memberIds.includes(actorId)) throw new ForbiddenError();

    const outsiders = [input.payerId, ...input.participantIds].filter(
      (id) => !group.memberIds.includes(id)
    );
    if (outsiders.length > 0) {
      throw new ValidationError("Everyone on an expense must be a member of the group");
    }

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
    s.expenses.unshift(expense);
    s.activity.unshift({
      id: nextId("a"),
      groupId: group.id,
      actorId,
      message: `You added **${expense.description}** to ${group.name}`,
      createdAt: new Date().toISOString(),
    });
    return { ...expense };
  },

  async deleteExpense(actorId, expenseId) {
    const s = state();
    const expense = s.expenses.find((e) => e.id === expenseId);
    if (!expense) throw new NotFoundError("Expense not found");
    const group = s.groups.find((g) => g.id === expense.groupId);
    if (!group?.memberIds.includes(actorId)) throw new ForbiddenError();

    s.expenses = s.expenses.filter((e) => e.id !== expenseId);
    return { id: expenseId };
  },

  async toggleRecurring(actorId, expenseId) {
    const s = state();
    const expense = s.expenses.find((e) => e.id === expenseId);
    if (!expense) throw new NotFoundError("Expense not found");
    const group = s.groups.find((g) => g.id === expense.groupId);
    if (!group?.memberIds.includes(actorId)) throw new ForbiddenError();
    if (!expense.recurring) throw new ValidationError("Expense has no recurring rule");

    expense.recurring = { ...expense.recurring, active: !expense.recurring.active };
    return { ...expense };
  },

  async getSettlements(actorId) {
    const s = state();
    const groupIds = new Set(
      s.groups.filter((g) => g.memberIds.includes(actorId)).map((g) => g.id)
    );
    return s.settlements.filter((x) => groupIds.has(x.groupId)).map((x) => ({ ...x }));
  },

  async createSettlement(actorId, input: CreateSettlementInput) {
    const s = state();
    const group = s.groups.find((g) => g.id === input.groupId);
    if (!group) throw new NotFoundError("Group not found");
    if (!group.memberIds.includes(actorId)) throw new ForbiddenError();
    if (!group.memberIds.includes(input.toUserId)) {
      throw new ValidationError("The payee must be a member of the group");
    }
    if (input.toUserId === actorId) {
      throw new ValidationError("You can't settle up with yourself");
    }

    const settlement: Settlement = {
      id: nextId("s"),
      groupId: input.groupId,
      fromUserId: actorId,
      toUserId: input.toUserId,
      amount: input.amount,
      status: "pending",
      method: input.method,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    s.settlements.unshift(settlement);

    const payee = s.users.find((u) => u.id === input.toUserId);
    s.activity.unshift({
      id: nextId("a"),
      groupId: group.id,
      actorId,
      message: `You logged a **${input.method}** payment to ${payee?.name ?? "a member"}`,
      createdAt: new Date().toISOString(),
    });
    return { ...settlement };
  },

  async resolveSettlement(actorId, settlementId, status) {
    const s = state();
    const settlement = s.settlements.find((x) => x.id === settlementId);
    if (!settlement) throw new NotFoundError("Settlement not found");

    // Only the recipient may confirm. Either party may decline/cancel.
    if (status === "confirmed" && settlement.toUserId !== actorId) {
      throw new ForbiddenError("Only the person who received the money can confirm it");
    }
    if (settlement.toUserId !== actorId && settlement.fromUserId !== actorId) {
      throw new ForbiddenError();
    }
    if (settlement.status !== "pending") {
      throw new ValidationError("This settlement has already been resolved");
    }

    settlement.status = status;
    return { ...settlement };
  },

  async getNotifications(actorId) {
    return state()
      .notifications.filter((n) => n.userId === actorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ userId: _userId, ...n }) => n);
  },

  async markNotificationsRead(actorId) {
    const s = state();
    for (const notification of s.notifications) {
      if (notification.userId === actorId) notification.read = true;
    }
    return this.getNotifications(actorId);
  },

  async getActivity(actorId) {
    const s = state();
    const groupIds = new Set(
      s.groups.filter((g) => g.memberIds.includes(actorId)).map((g) => g.id)
    );
    return s.activity
      .filter((a) => groupIds.has(a.groupId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ ...a }));
  },
};
