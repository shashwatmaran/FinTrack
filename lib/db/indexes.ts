import "server-only";

import { collections } from "./collections";

let ensured: Promise<void> | null = null;

/**
 * Index creation is idempotent, so it runs once per process on first database
 * access rather than as a separate migration step.
 */
async function createIndexes(): Promise<void> {
  const { users, groups, expenses, settlements, notifications, activity } = await collections();

  await Promise.all([
    // Sign-in looks users up by email; it must be unique.
    users.createIndex({ email: 1 }, { unique: true, name: "email_unique" }),

    // "Which groups am I in?" — the single hottest query in the app.
    groups.createIndex({ memberIds: 1 }, { name: "memberIds" }),

    expenses.createIndex({ groupId: 1, date: -1 }, { name: "groupId_date" }),
    expenses.createIndex({ "splits.userId": 1 }, { name: "splits_userId" }),
    // Sparse: only recurring expenses carry this field, and the cron job that
    // materialises them scans exclusively on it.
    expenses.createIndex(
      { "recurring.nextRunAt": 1 },
      { name: "recurring_nextRunAt", sparse: true }
    ),

    settlements.createIndex({ groupId: 1, createdAt: -1 }, { name: "groupId_createdAt" }),
    settlements.createIndex({ fromUserId: 1, status: 1 }, { name: "fromUserId_status" }),
    settlements.createIndex({ toUserId: 1, status: 1 }, { name: "toUserId_status" }),

    notifications.createIndex({ userId: 1, createdAt: -1 }, { name: "userId_createdAt" }),
    activity.createIndex({ groupId: 1, createdAt: -1 }, { name: "groupId_createdAt" }),
  ]);
}

export function ensureIndexes(): Promise<void> {
  ensured ??= createIndexes().catch((error) => {
    // Reset so a transient failure (cluster still provisioning) can be retried.
    ensured = null;
    throw error;
  });
  return ensured;
}
