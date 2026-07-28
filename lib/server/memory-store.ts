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
import { formatCurrency, initials as toInitials } from "@/lib/format";
import { dueOccurrences } from "@/lib/recurring";
import { sendSettlementRequestEmail } from "./email";
import type { AccentToken, ActivityItem, AppUser, Expense, Group, GroupInvite, NotificationItem, Settlement } from "@/lib/types";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type CreateExpenseInput,
  type CreateGroupInput,
  type CreateSettlementInput,
  type DataStore,
  type StoredNarrative,
} from "./store-types";

/**
 * Process-local store used when MONGODB_URI is absent. State lives on
 * globalThis so it survives Next.js hot reloads in development; it is still
 * per-process, so it is a development convenience, not a production mode.
 */
/** Mirrors the reset fields on `UserDoc`; the token itself is never stored. */
interface StoredUser extends AppUser {
  passwordHash?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
  passwordChangedAt?: string;
}

interface MemoryState {
  users: StoredUser[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  notifications: (NotificationItem & { userId: string })[];
  activity: ActivityItem[];
  narratives: Map<string, StoredNarrative>;
  invites: (GroupInvite & { tokenHash: string })[];
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
    narratives: new Map(),
    invites: [],
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

function stripSecrets(user: StoredUser): AppUser {
  const {
    passwordHash: _passwordHash,
    resetTokenHash: _resetTokenHash,
    resetTokenExpiresAt: _resetTokenExpiresAt,
    passwordChangedAt: _passwordChangedAt,
    ...safe
  } = user;
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

  async updateUser(actorId, { name }) {
    const user = state().users.find((u) => u.id === actorId);
    if (!user) throw new NotFoundError("User not found");

    user.name = name;
    // Recomputed, never taken from the client: initials that disagree with the
    // name would show one thing on an avatar and another on the row beside it.
    user.initials = toInitials(name);
    return stripSecrets(user);
  },

  async setPasswordResetToken(email, tokenHash, expiresAt) {
    const user = state().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;
    // Overwrites any previous token, so requesting a new link invalidates the
    // old one rather than leaving several valid at once.
    user.resetTokenHash = tokenHash;
    user.resetTokenExpiresAt = expiresAt;
    return stripSecrets(user);
  },

  async consumePasswordReset(tokenHash, newPassword) {
    const user = state().users.find((u) => u.resetTokenHash === tokenHash);
    // Expiry is checked before anything is written, and the token is cleared in
    // the same step — a second attempt with the same token finds nothing.
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt <= new Date().toISOString()) {
      return false;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    // Stamped alongside the new password: any token issued before this instant
    // stops being accepted.
    user.passwordChangedAt = new Date().toISOString();
    delete user.resetTokenHash;
    delete user.resetTokenExpiresAt;
    return true;
  },

  async passwordChangedAt(userId) {
    return state().users.find((u) => u.id === userId)?.passwordChangedAt ?? null;
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

  async createGroupInvite(actorId, input) {
    const s = state();
    const group = s.groups.find((g) => g.id === input.groupId);
    if (!group) throw new NotFoundError("Group not found");
    // Membership is the authorization: an invite exposes everyone's balances
    // in that group, so only someone already inside may hand one out.
    if (!group.memberIds.includes(actorId)) throw new ForbiddenError();

    const invite = {
      id: nextId("i"),
      groupId: group.id,
      email: input.email.toLowerCase(),
      invitedBy: actorId,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      tokenHash: input.tokenHash,
    };
    s.invites.push(invite);

    const { tokenHash: _tokenHash, ...safe } = invite;
    return safe;
  },

  async listGroupInvites(actorId, groupId) {
    const s = state();
    const group = s.groups.find((g) => g.id === groupId);
    if (!group) throw new NotFoundError("Group not found");
    // The same rule as issuing one: a pending invite is an email address
    // belonging to someone outside the group, so only a member may read it.
    if (!group.memberIds.includes(actorId)) throw new ForbiddenError();

    const now = new Date().toISOString();
    return s.invites
      .filter((i) => i.groupId === groupId && i.status === "pending" && i.expiresAt > now)
      .map(({ tokenHash: _tokenHash, ...safe }) => safe);
  },

  async acceptGroupInvite(actorId, tokenHash) {
    const s = state();
    const invite = s.invites.find((i) => i.tokenHash === tokenHash);

    // Unknown, expired and spent are one answer on purpose — telling them
    // apart would let a used token confirm that a group exists.
    if (!invite || invite.expiresAt <= new Date().toISOString()) {
      throw new ValidationError("That invite link is no longer valid");
    }

    const group = s.groups.find((g) => g.id === invite.groupId);
    if (!group) throw new ValidationError("That invite link is no longer valid");

    // Already a member: succeed without adding a duplicate, so following the
    // link twice is harmless rather than an error the user cannot act on.
    if (!group.memberIds.includes(actorId)) {
      group.memberIds.push(actorId);
      s.activity.unshift({
        id: nextId("a"),
        groupId: group.id,
        actorId,
        message: `You joined **${group.name}**`,
        createdAt: new Date().toISOString(),
      });
    }
    invite.status = "accepted";

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

    const actorName = s.users.find((u) => u.id === actorId)?.name.split(" ")[0] ?? "Someone";
    for (const split of expense.splits) {
      // Everyone but the person who just did it — they were there.
      if (split.userId === actorId) continue;
      s.notifications.unshift({
        id: nextId("n"),
        userId: split.userId,
        title: `${actorName} added an expense`,
        body: `${expense.description} · ${formatCurrency(split.amount)} in ${group.name}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
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

    // The payee is the only one who can confirm, so they must be told.
    const payerName = s.users.find((u) => u.id === actorId)?.name.split(" ")[0] ?? "Someone";
    s.notifications.unshift({
      id: nextId("n"),
      userId: input.toUserId,
      title: "Payment awaiting your confirmation",
      body: `${payerName} logged ${formatCurrency(input.amount)} via ${input.method} in ${group.name}`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    // Additive and non-blocking: sendSettlementRequestEmail never throws, and
    // the settlement is already recorded whether or not the mail goes out.
    if (payee?.email) {
      await sendSettlementRequestEmail({
        to: payee.email,
        payerName,
        amount: formatCurrency(input.amount),
        groupName: group.name,
      });
    }

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

    // Tell the payer either way — their balance only moves on confirmation.
    const resolverName =
      s.users.find((u) => u.id === actorId)?.name.split(" ")[0] ?? "The other person";
    s.notifications.unshift({
      id: nextId("n"),
      userId: settlement.fromUserId === actorId ? settlement.toUserId : settlement.fromUserId,
      title: status === "confirmed" ? "Payment confirmed" : "Payment declined",
      body:
        status === "confirmed"
          ? `${resolverName} confirmed ${formatCurrency(settlement.amount)}`
          : `${resolverName} declined ${formatCurrency(settlement.amount)} — the balance is unchanged`,
      read: false,
      createdAt: new Date().toISOString(),
    });
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

  async getNarrative(actorId) {
    const stored = state().narratives.get(actorId);
    return stored ? { ...stored } : null;
  },

  async saveNarrative(actorId, narrative) {
    state().narratives.set(actorId, { ...narrative });
  },

  async materializeRecurring(today) {
    const s = state();
    const templates = s.expenses.filter((e) => e.recurring?.active && e.recurring.nextRunAt <= today);
    const created: Expense[] = [];

    for (const template of templates) {
      const { dates, nextRunAt } = dueOccurrences(template.recurring!, today);
      // Advance the schedule first: the same ordering the Mongo store uses to
      // claim a rule, so a second run in the same day finds nothing.
      template.recurring = { ...template.recurring!, nextRunAt };

      const group = s.groups.find((g) => g.id === template.groupId);
      for (const date of dates) {
        const expense: Expense = {
          ...template,
          id: nextId("e"),
          date,
          // Generated expenses are not themselves templates.
          recurring: undefined,
          splits: template.splits.map((split) => ({ ...split })),
        };
        s.expenses.unshift(expense);
        created.push(expense);

        s.activity.unshift({
          id: nextId("a"),
          groupId: template.groupId,
          actorId: template.payerId,
          message: `**${template.description}** recurred in ${group?.name ?? "a group"}`,
          createdAt: new Date().toISOString(),
        });

        for (const split of expense.splits) {
          s.notifications.unshift({
            id: nextId("n"),
            userId: split.userId,
            title: "Recurring expense added",
            body: `${template.description} · ${formatCurrency(split.amount)} in ${group?.name ?? "a group"}`,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return { created, rulesConsidered: templates.length };
  },
};
