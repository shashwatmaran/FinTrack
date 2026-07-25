import "server-only";

import bcrypt from "bcryptjs";
import { MongoServerError } from "mongodb";
import { equalSplit } from "@/lib/balances";
import { collections, type ActivityDoc, type ExpenseDoc, type GroupDoc, type NotificationDoc, type SettlementDoc, type UserDoc } from "@/lib/db/collections";
import { ensureIndexes } from "@/lib/db/indexes";
import { initials as toInitials } from "@/lib/format";
import type { AccentToken, ActivityItem, AppUser, Expense, Group, NotificationItem, Settlement } from "@/lib/types";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type CreateExpenseInput,
  type CreateGroupInput,
  type CreateSettlementInput,
  type CreateUserInput,
  type DataStore,
} from "./store-types";

const PALETTE: AccentToken[] = ["ft-lime", "ft-sky", "ft-pink", "ft-purple", "ft-yellow"];
const DUPLICATE_KEY = 11000;

function nextId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function db() {
  await ensureIndexes();
  return collections();
}

function toUser(doc: UserDoc): AppUser {
  return { id: doc._id, name: doc.name, email: doc.email, initials: doc.initials, color: doc.color };
}

function toGroup(doc: GroupDoc): Group {
  return {
    id: doc._id,
    name: doc.name,
    type: doc.type,
    color: doc.color,
    memberIds: doc.memberIds,
    createdAt: doc.createdAt,
  };
}

function toExpense(doc: ExpenseDoc): Expense {
  return {
    id: doc._id,
    groupId: doc.groupId,
    description: doc.description,
    category: doc.category,
    amount: doc.amount,
    payerId: doc.payerId,
    splitMethod: doc.splitMethod,
    splits: doc.splits,
    date: doc.date,
    notes: doc.notes,
    recurring: doc.recurring,
  };
}

function toSettlement(doc: SettlementDoc): Settlement {
  return {
    id: doc._id,
    groupId: doc.groupId,
    fromUserId: doc.fromUserId,
    toUserId: doc.toUserId,
    amount: doc.amount,
    status: doc.status,
    method: doc.method,
    createdAt: doc.createdAt,
  };
}

function toNotification(doc: NotificationDoc): NotificationItem {
  return { id: doc._id, title: doc.title, body: doc.body, read: doc.read, createdAt: doc.createdAt };
}

function toActivity(doc: ActivityDoc): ActivityItem {
  return {
    id: doc._id,
    groupId: doc.groupId,
    actorId: doc.actorId,
    message: doc.message,
    createdAt: doc.createdAt,
  };
}

/** Group ids the actor belongs to — the basis of every access check below. */
async function memberGroupIds(actorId: string): Promise<string[]> {
  const { groups } = await db();
  const docs = await groups.find({ memberIds: actorId }, { projection: { _id: 1 } }).toArray();
  return docs.map((d) => d._id);
}

/** Loads a group only if the actor is a member; throws otherwise. */
async function requireMembership(actorId: string, groupId: string): Promise<GroupDoc> {
  const { groups } = await db();
  const group = await groups.findOne({ _id: groupId });
  if (!group) throw new NotFoundError("Group not found");
  if (!group.memberIds.includes(actorId)) throw new ForbiddenError();
  return group;
}

async function recordActivity(groupId: string, actorId: string, message: string) {
  const { activity } = await db();
  await activity.insertOne({
    _id: nextId("a"),
    groupId,
    actorId,
    message,
    createdAt: new Date().toISOString(),
  });
}

export const mongoStore: DataStore = {
  async getUserById(id) {
    const { users } = await db();
    const doc = await users.findOne({ _id: id });
    return doc ? toUser(doc) : null;
  },

  async getUserByEmail(email) {
    const { users } = await db();
    const doc = await users.findOne({ email: email.toLowerCase() });
    return doc ? { ...toUser(doc), passwordHash: doc.passwordHash } : null;
  },

  async createUser({ name, email, password }: CreateUserInput) {
    const { users } = await db();
    const count = await users.estimatedDocumentCount();
    const doc: UserDoc = {
      _id: nextId("u"),
      name,
      email: email.toLowerCase(),
      initials: toInitials(name),
      color: PALETTE[count % PALETTE.length],
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: new Date().toISOString(),
    };

    try {
      await users.insertOne(doc);
    } catch (error) {
      // The unique index on email is the authority here, not a prior read —
      // that closes the race between two concurrent signups.
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
        throw new ValidationError("An account with that email already exists");
      }
      throw error;
    }
    return toUser(doc);
  },

  async getVisibleUsers(actorId) {
    const { groups, users } = await db();
    const memberGroups = await groups
      .find({ memberIds: actorId }, { projection: { memberIds: 1 } })
      .toArray();
    const visible = new Set<string>([actorId]);
    for (const group of memberGroups) for (const id of group.memberIds) visible.add(id);

    const docs = await users.find({ _id: { $in: Array.from(visible) } }).toArray();
    return docs.map(toUser);
  },

  async getGroups(actorId) {
    const { groups } = await db();
    const docs = await groups.find({ memberIds: actorId }).sort({ createdAt: -1 }).toArray();
    return docs.map(toGroup);
  },

  async createGroup(actorId, input: CreateGroupInput) {
    const { groups, users } = await db();

    const memberIds = Array.from(new Set([actorId, ...input.memberIds]));
    const found = await users.countDocuments({ _id: { $in: memberIds } });
    if (found !== memberIds.length) throw new ValidationError("One or more members don't exist");

    const count = await groups.estimatedDocumentCount();
    const doc: GroupDoc = {
      _id: nextId("g"),
      name: input.name,
      type: input.type,
      color: PALETTE[count % PALETTE.length],
      memberIds,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    await groups.insertOne(doc);
    await recordActivity(doc._id, actorId, `You created **${doc.name}**`);
    return toGroup(doc);
  },

  async getExpenses(actorId) {
    const { expenses } = await db();
    const groupIds = await memberGroupIds(actorId);
    const docs = await expenses
      .find({ groupId: { $in: groupIds } })
      .sort({ date: -1 })
      .toArray();
    return docs.map(toExpense);
  },

  async createExpense(actorId, input: CreateExpenseInput) {
    const { expenses } = await db();
    const group = await requireMembership(actorId, input.groupId);

    const outsiders = [input.payerId, ...input.participantIds].filter(
      (id) => !group.memberIds.includes(id)
    );
    if (outsiders.length > 0) {
      throw new ValidationError("Everyone on an expense must be a member of the group");
    }

    const doc: ExpenseDoc = {
      _id: nextId("e"),
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
    await expenses.insertOne(doc);
    await recordActivity(group._id, actorId, `You added **${doc.description}** to ${group.name}`);
    return toExpense(doc);
  },

  async deleteExpense(actorId, expenseId) {
    const { expenses } = await db();
    const doc = await expenses.findOne({ _id: expenseId });
    if (!doc) throw new NotFoundError("Expense not found");
    await requireMembership(actorId, doc.groupId);

    await expenses.deleteOne({ _id: expenseId });
    return { id: expenseId };
  },

  async toggleRecurring(actorId, expenseId) {
    const { expenses } = await db();
    const doc = await expenses.findOne({ _id: expenseId });
    if (!doc) throw new NotFoundError("Expense not found");
    await requireMembership(actorId, doc.groupId);
    if (!doc.recurring) throw new ValidationError("Expense has no recurring rule");

    const updated = await expenses.findOneAndUpdate(
      { _id: expenseId },
      { $set: { "recurring.active": !doc.recurring.active } },
      { returnDocument: "after" }
    );
    if (!updated) throw new NotFoundError("Expense not found");
    return toExpense(updated);
  },

  async getSettlements(actorId) {
    const { settlements } = await db();
    const groupIds = await memberGroupIds(actorId);
    const docs = await settlements
      .find({ groupId: { $in: groupIds } })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(toSettlement);
  },

  async createSettlement(actorId, input: CreateSettlementInput) {
    const { settlements, users } = await db();
    const group = await requireMembership(actorId, input.groupId);

    if (!group.memberIds.includes(input.toUserId)) {
      throw new ValidationError("The payee must be a member of the group");
    }
    if (input.toUserId === actorId) throw new ValidationError("You can't settle up with yourself");

    const doc: SettlementDoc = {
      _id: nextId("s"),
      groupId: input.groupId,
      fromUserId: actorId,
      toUserId: input.toUserId,
      amount: input.amount,
      status: "pending",
      method: input.method,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    await settlements.insertOne(doc);

    const payee = await users.findOne({ _id: input.toUserId }, { projection: { name: 1 } });
    await recordActivity(
      group._id,
      actorId,
      `You logged a **${input.method}** payment to ${payee?.name ?? "a member"}`
    );
    return toSettlement(doc);
  },

  async resolveSettlement(actorId, settlementId, status) {
    const { settlements } = await db();
    const doc = await settlements.findOne({ _id: settlementId });
    if (!doc) throw new NotFoundError("Settlement not found");

    if (status === "confirmed" && doc.toUserId !== actorId) {
      throw new ForbiddenError("Only the person who received the money can confirm it");
    }
    if (doc.toUserId !== actorId && doc.fromUserId !== actorId) throw new ForbiddenError();

    // Conditioning the update on status:"pending" makes the transition atomic,
    // so a double-click can't confirm an already-declined settlement.
    const updated = await settlements.findOneAndUpdate(
      { _id: settlementId, status: "pending" },
      { $set: { status } },
      { returnDocument: "after" }
    );
    if (!updated) throw new ValidationError("This settlement has already been resolved");
    return toSettlement(updated);
  },

  async getNotifications(actorId) {
    const { notifications } = await db();
    const docs = await notifications
      .find({ userId: actorId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return docs.map(toNotification);
  },

  async markNotificationsRead(actorId) {
    const { notifications } = await db();
    await notifications.updateMany({ userId: actorId, read: false }, { $set: { read: true } });
    return this.getNotifications(actorId);
  },

  async getActivity(actorId) {
    const { activity } = await db();
    const groupIds = await memberGroupIds(actorId);
    const docs = await activity
      .find({ groupId: { $in: groupIds } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return docs.map(toActivity);
  },

  async getNarrative(actorId) {
    const { narratives } = await db();
    const doc = await narratives.findOne({ _id: actorId });
    if (!doc) return null;
    return {
      text: doc.text,
      model: doc.model,
      generatedAt: doc.generatedAt,
      inputHash: doc.inputHash,
    };
  },

  async saveNarrative(actorId, narrative) {
    const { narratives } = await db();
    // Keyed on the user id, so regenerating replaces rather than accumulates.
    // `replaceOne` takes the document without _id — it comes from the filter.
    await narratives.replaceOne({ _id: actorId }, { ...narrative }, { upsert: true });
  },
};
