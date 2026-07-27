import "server-only";

import bcrypt from "bcryptjs";
import { MongoServerError } from "mongodb";
import { equalSplit } from "@/lib/balances";
import { collections, type ActivityDoc, type ExpenseDoc, type GroupDoc, type InviteDoc, type NotificationDoc, type SettlementDoc, type UserDoc } from "@/lib/db/collections";
import { ensureIndexes } from "@/lib/db/indexes";
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

/** Drops `tokenHash` — the invite is returned to a client, the hash is not. */
function toInvite(doc: InviteDoc): GroupInvite {
  return {
    id: doc._id,
    groupId: doc.groupId,
    email: doc.email,
    invitedBy: doc.invitedBy,
    status: doc.status,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
  };
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

async function notify(
  entries: { userId: string; title: string; body: string }[]
): Promise<void> {
  if (entries.length === 0) return;
  const { notifications } = await db();
  const now = new Date().toISOString();
  await notifications.insertMany(
    entries.map((e) => ({ _id: nextId("n"), ...e, read: false, createdAt: now }))
  );
}

/** First name, for notification copy. */
async function firstName(userId: string): Promise<string> {
  const { users } = await db();
  const doc = await users.findOne({ _id: userId }, { projection: { name: 1 } });
  return doc?.name.split(" ")[0] ?? "Someone";
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

  async setPasswordResetToken(email, tokenHash, expiresAt) {
    const { users } = await db();
    // Overwrites any previous token, so requesting a new link invalidates the
    // old one rather than leaving several valid at once.
    const doc = await users.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt } },
      { returnDocument: "after" }
    );
    return doc ? toUser(doc) : null;
  },

  async consumePasswordReset(tokenHash, newPassword) {
    const { users } = await db();
    /**
     * Expiry is part of the match, not a check afterwards, and the token is
     * cleared in the same operation. Two requests racing with one token means
     * only the first matches — the second finds nothing to update.
     */
    const updated = await users.findOneAndUpdate(
      { resetTokenHash: tokenHash, resetTokenExpiresAt: { $gt: new Date().toISOString() } },
      {
        $set: {
          passwordHash: await bcrypt.hash(newPassword, 10),
          // Stamped in the same write as the new password: any token issued
          // before this instant stops being accepted.
          passwordChangedAt: new Date().toISOString(),
        },
        $unset: { resetTokenHash: "", resetTokenExpiresAt: "" },
      },
      { returnDocument: "after" }
    );
    return Boolean(updated);
  },

  async passwordChangedAt(userId) {
    const { users } = await db();
    const doc = await users.findOne(
      { _id: userId },
      { projection: { passwordChangedAt: 1 } }
    );
    return doc?.passwordChangedAt ?? null;
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

  async createGroupInvite(actorId, input) {
    const { invites } = await db();
    // Membership is the authorization: an invite exposes everyone's balances
    // in that group, so only someone already inside may hand one out.
    const group = await requireMembership(actorId, input.groupId);

    const doc: InviteDoc = {
      _id: nextId("i"),
      groupId: group._id,
      email: input.email.toLowerCase(),
      invitedBy: actorId,
      tokenHash: input.tokenHash,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
    };
    await invites.insertOne(doc);
    return toInvite(doc);
  },

  async acceptGroupInvite(actorId, tokenHash) {
    const { invites, groups } = await db();
    const invite = await invites.findOne({ tokenHash });

    // Unknown, expired and spent are one answer on purpose — telling them
    // apart would let a used token confirm that a group exists.
    if (!invite || invite.expiresAt <= new Date().toISOString()) {
      throw new ValidationError("That invite link is no longer valid");
    }

    const group = await groups.findOne({ _id: invite.groupId });
    if (!group) throw new ValidationError("That invite link is no longer valid");

    // Already a member: succeed without adding a duplicate, so following the
    // link twice is harmless rather than an error the user cannot act on.
    if (!group.memberIds.includes(actorId)) {
      await groups.updateOne({ _id: group._id }, { $addToSet: { memberIds: actorId } });
      await recordActivity(group._id, actorId, `You joined **${group.name}**`);
    }
    await invites.updateOne({ _id: invite._id }, { $set: { status: "accepted" } });

    const updated = await groups.findOne({ _id: group._id });
    return toGroup(updated ?? group);
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

    const actorName = await firstName(actorId);
    await notify(
      // Everyone but the person who just did it — they were there.
      doc.splits
        .filter((split) => split.userId !== actorId)
        .map((split) => ({
          userId: split.userId,
          title: `${actorName} added an expense`,
          body: `${doc.description} · ${formatCurrency(split.amount)} in ${group.name}`,
        }))
    );
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

    const payee = await users.findOne(
      { _id: input.toUserId },
      { projection: { name: 1, email: 1 } }
    );
    await recordActivity(
      group._id,
      actorId,
      `You logged a **${input.method}** payment to ${payee?.name ?? "a member"}`
    );

    // The payee is the only one who can confirm, so they must be told.
    const payerName = await firstName(actorId);
    await notify([
      {
        userId: input.toUserId,
        title: "Payment awaiting your confirmation",
        body: `${payerName} logged ${formatCurrency(input.amount)} via ${input.method} in ${group.name}`,
      },
    ]);

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

    // Tell the other party either way — the balance only moves on confirmation.
    const resolverName = await firstName(actorId);
    await notify([
      {
        userId: doc.fromUserId === actorId ? doc.toUserId : doc.fromUserId,
        title: status === "confirmed" ? "Payment confirmed" : "Payment declined",
        body:
          status === "confirmed"
            ? `${resolverName} confirmed ${formatCurrency(doc.amount)}`
            : `${resolverName} declined ${formatCurrency(doc.amount)} — the balance is unchanged`,
      },
    ]);
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

  async materializeRecurring(today) {
    const { expenses, groups, activity, notifications } = await db();

    const templates = await expenses
      .find({ "recurring.active": true, "recurring.nextRunAt": { $lte: today } })
      .toArray();

    const created: Expense[] = [];

    for (const template of templates) {
      const rule = template.recurring!;
      const { dates, nextRunAt } = dueOccurrences(rule, today);
      if (dates.length === 0) continue;

      // Claim the rule by advancing it, conditioned on the value we read.
      // Two concurrent cron invocations would otherwise both see the same
      // nextRunAt and each create a full set of expenses — the failure mode
      // that silently double-charges everyone in the group.
      const claimed = await expenses.findOneAndUpdate(
        { _id: template._id, "recurring.nextRunAt": rule.nextRunAt },
        { $set: { "recurring.nextRunAt": nextRunAt } },
        { returnDocument: "after" }
      );
      if (!claimed) continue; // another run got there first

      const group = await groups.findOne({ _id: template.groupId }, { projection: { name: 1 } });
      const now = new Date().toISOString();

      for (const date of dates) {
        const doc: ExpenseDoc = {
          _id: nextId("e"),
          groupId: template.groupId,
          description: template.description,
          category: template.category,
          amount: template.amount,
          payerId: template.payerId,
          splitMethod: template.splitMethod,
          splits: template.splits,
          date,
          ...(template.notes ? { notes: template.notes } : {}),
          // Generated expenses are not themselves templates.
        };
        await expenses.insertOne(doc);
        created.push(toExpense(doc));

        await activity.insertOne({
          _id: nextId("a"),
          groupId: template.groupId,
          actorId: template.payerId,
          message: `**${template.description}** recurred in ${group?.name ?? "a group"}`,
          createdAt: now,
        });

        if (doc.splits.length > 0) {
          await notifications.insertMany(
            doc.splits.map((split) => ({
              _id: nextId("n"),
              userId: split.userId,
              title: "Recurring expense added",
              body: `${template.description} · ${formatCurrency(split.amount)} in ${group?.name ?? "a group"}`,
              read: false,
              createdAt: now,
            }))
          );
        }
      }
    }

    return { created, rulesConsidered: templates.length };
  },
};
