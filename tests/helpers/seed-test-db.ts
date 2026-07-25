import bcrypt from "bcryptjs";
import type { Db } from "mongodb";
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

const COLLECTIONS = [
  "users",
  "groups",
  "expenses",
  "settlements",
  "notifications",
  "activity",
] as const;

// Hashing is the slowest thing in the suite; do it once for the whole run.
let demoHash: string | undefined;
function hash(): string {
  demoHash ??= bcrypt.hashSync(DEMO_PASSWORD, 8);
  return demoHash;
}

/**
 * Resets a test database to the demo dataset.
 *
 * Uses deleteMany rather than dropping collections on purpose: dropping would
 * also drop the indexes, and `ensureIndexes` is memoised per process, so the
 * unique email index would silently not come back for later tests.
 */
export async function seedTestDb(db: Db): Promise<void> {
  await Promise.all(COLLECTIONS.map((name) => db.collection(name).deleteMany({})));

  await db.collection("users").insertMany(
    USERS.map((u) => ({
      _id: u.id,
      name: u.name,
      email: u.email.toLowerCase(),
      initials: u.initials,
      color: u.color,
      passwordHash: hash(),
      createdAt: "2026-01-01T00:00:00.000Z",
    })) as never
  );

  await db.collection("groups").insertMany(
    GROUPS.map((g) => ({
      _id: g.id,
      name: g.name,
      type: g.type,
      color: g.color,
      memberIds: g.memberIds,
      createdAt: g.createdAt,
    })) as never
  );

  await db.collection("expenses").insertMany(
    EXPENSES.map((e) => ({
      _id: e.id,
      groupId: e.groupId,
      description: e.description,
      category: e.category,
      amount: e.amount,
      payerId: e.payerId,
      splitMethod: e.splitMethod,
      splits: e.splits,
      date: e.date,
      ...(e.notes ? { notes: e.notes } : {}),
      ...(e.recurring ? { recurring: e.recurring } : {}),
    })) as never
  );

  await db.collection("settlements").insertMany(
    SETTLEMENTS.map((s) => ({
      _id: s.id,
      groupId: s.groupId,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amount: s.amount,
      status: s.status,
      method: s.method,
      createdAt: s.createdAt,
    })) as never
  );

  await db.collection("notifications").insertMany(
    NOTIFICATIONS.map((n) => ({
      _id: n.id,
      userId: DEMO_USER_ID,
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt,
    })) as never
  );

  await db.collection("activity").insertMany(
    ACTIVITY.map((a) => ({
      _id: a.id,
      groupId: a.groupId,
      actorId: a.actorId,
      message: a.message,
      createdAt: a.createdAt,
    })) as never
  );
}
