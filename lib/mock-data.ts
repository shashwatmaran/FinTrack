import { equalSplit } from "./balances";
import type {
  ActivityItem,
  AppUser,
  Expense,
  Group,
  NotificationItem,
  Settlement,
} from "./types";

/**
 * Seed dataset. Used two ways: it populates the in-memory store when
 * MONGODB_URI is absent, and `scripts/seed.ts` writes the same records into
 * Atlas so both modes show identical data.
 */

/** Password for every seeded account, in both memory and seeded Atlas data. */
export const DEMO_PASSWORD = "demo1234";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Seed timestamps are relative to load time so the feed never looks stale. */
function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/** The account the seeded notifications and demo sign-in belong to. */
export const DEMO_USER_ID = "u1";

export const USERS: AppUser[] = [
  { id: "u1", name: "Maya Alvarez", email: "maya.alvarez@email.com", initials: "MA", color: "ft-lime" },
  { id: "u2", name: "Jordan Lee", email: "jordan.lee@email.com", initials: "JL", color: "ft-sky" },
  { id: "u3", name: "Sam Patel", email: "sam.patel@email.com", initials: "SP", color: "ft-pink" },
  { id: "u4", name: "Riley Chen", email: "riley.chen@email.com", initials: "RC", color: "ft-purple" },
  { id: "u5", name: "Casey Nguyen", email: "casey.nguyen@email.com", initials: "CN", color: "ft-yellow" },
];

export const GROUPS: Group[] = [
  { id: "g1", name: "Lunch Crew", type: "friends", color: "ft-yellow", memberIds: ["u1", "u2", "u3", "u4"], createdAt: "2026-01-10" },
  { id: "g2", name: "Goa Trip", type: "trip", color: "ft-sky", memberIds: ["u1", "u2", "u3", "u5"], createdAt: "2026-05-02" },
  { id: "g3", name: "Apartment 4B", type: "home", color: "ft-pink", memberIds: ["u1", "u4"], createdAt: "2025-11-01" },
  { id: "g4", name: "Me & Jordan", type: "couple", color: "ft-purple", memberIds: ["u1", "u2"], createdAt: "2026-02-14" },
];

function expense(
  id: string,
  groupId: string,
  description: string,
  category: Expense["category"],
  amount: number,
  payerId: string,
  date: string,
  participantIds: string[],
  recurring?: Expense["recurring"]
): Expense {
  return {
    id,
    groupId,
    description,
    category,
    amount,
    payerId,
    splitMethod: "equal",
    splits: equalSplit(amount, participantIds),
    date,
    recurring,
  };
}

/** All amounts are INR. See `CURRENCY` in lib/format.ts — the app is single-currency. */
export const EXPENSES: Expense[] = [
  expense("e1", "g1", "Thai takeout", "food", 1240, "u2", "2026-07-22", ["u1", "u2", "u3", "u4"]),
  expense("e2", "g1", "Coffee run", "food", 480, "u1", "2026-07-18", ["u1", "u2", "u3", "u4"]),
  expense("e3", "g1", "Bowling night", "entertainment", 2400, "u3", "2026-07-10", ["u1", "u2", "u3", "u4"]),
  expense("e4", "g1", "Chaat crawl", "food", 1120, "u4", "2026-06-28", ["u1", "u2", "u3", "u4"]),
  expense("e5", "g1", "Movie tickets", "entertainment", 1600, "u1", "2026-06-14", ["u1", "u2", "u3", "u4"]),
  expense("e6", "g1", "Birthday cake for Sam", "food", 850, "u2", "2026-05-30", ["u1", "u2", "u4"]),
  expense("e19", "g1", "Pizza night", "food", 1280, "u1", "2026-04-18", ["u1", "u2", "u3", "u4"]),
  expense("e22", "g1", "Trivia night entry", "entertainment", 800, "u4", "2026-02-20", ["u1", "u2", "u3", "u4"]),

  expense("e7", "g2", "Homestay in Goa (4 nights)", "housing", 48000, "u1", "2026-07-05", ["u1", "u2", "u3", "u5"]),
  expense("e8", "g2", "Group dinner - beach shack", "food", 9600, "u3", "2026-07-06", ["u1", "u2", "u3", "u5"]),
  expense("e9", "g2", "Scooter rental", "travel", 5400, "u5", "2026-07-07", ["u1", "u2", "u3", "u5"]),
  expense("e10", "g2", "Groceries", "food", 4800, "u2", "2026-07-08", ["u1", "u2", "u3", "u5"]),
  expense("e11", "g2", "Surf lesson", "entertainment", 7200, "u1", "2026-07-09", ["u1", "u3", "u5"]),

  expense("e12", "g3", "Electricity bill - July", "utilities", 3400, "u4", "2026-07-15", ["u1", "u4"], {
    cadence: "monthly",
    nextRunAt: "2026-08-15",
    active: true,
  }),
  expense("e13", "g3", "Broadband - July", "utilities", 1299, "u1", "2026-07-01", ["u1", "u4"], {
    cadence: "monthly",
    nextRunAt: "2026-08-01",
    active: true,
  }),
  expense("e14", "g3", "Cleaning supplies", "housing", 740, "u1", "2026-06-20", ["u1", "u4"]),
  expense("e15", "g3", "New couch cushions", "housing", 5200, "u4", "2026-05-12", ["u1", "u4"]),
  expense("e21", "g3", "Utilities - April", "utilities", 3150, "u4", "2026-04-15", ["u1", "u4"]),

  expense("e16", "g4", "Weekend groceries", "food", 2850, "u2", "2026-07-20", ["u1", "u2"]),
  expense("e17", "g4", "Concert tickets", "entertainment", 7000, "u1", "2026-07-02", ["u1", "u2"]),
  expense("e18", "g4", "Cab to airport", "transport", 950, "u2", "2026-06-25", ["u1", "u2"]),
  expense("e20", "g4", "Groceries", "food", 2100, "u1", "2026-03-05", ["u1", "u2"]),
];

export const SETTLEMENTS: Settlement[] = [
  { id: "s1", groupId: "g2", fromUserId: "u3", toUserId: "u1", amount: 7800, status: "confirmed", method: "Cash", createdAt: "2026-07-11" },
  { id: "s2", groupId: "g1", fromUserId: "u4", toUserId: "u2", amount: 1450, status: "pending", method: "UPI", createdAt: "2026-07-23" },
  { id: "s3", groupId: "g3", fromUserId: "u1", toUserId: "u4", amount: 2600, status: "confirmed", method: "Bank transfer", createdAt: "2026-06-25" },
  { id: "s4", groupId: "g4", fromUserId: "u2", toUserId: "u1", amount: 3500, status: "pending", method: "UPI", createdAt: "2026-07-24" },
];

/** Notifications belong to the demo user; the seed script scopes them to u1. */
export const NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", title: "Jordan added an expense", body: "Weekend groceries · ₹2,850.00 in Me & Jordan", read: false, createdAt: ago(2 * HOUR) },
  { id: "n2", title: "Payment pending", body: "Riley logged ₹1,450.00 to Jordan in Lunch Crew — awaiting confirmation", read: false, createdAt: ago(5 * HOUR) },
  { id: "n3", title: "Settle up reminder", body: "You owe Jordan ₹3,500.00 in Me & Jordan", read: false, createdAt: ago(DAY) },
  { id: "n4", title: "You were added to Goa Trip", body: "Sam invited you to a new group", read: true, createdAt: ago(DAY + 3 * HOUR) },
  { id: "n5", title: "Sam confirmed your payment", body: "₹7,800.00 in Goa Trip", read: true, createdAt: ago(3 * DAY) },
  { id: "n6", title: "Monthly report ready", body: "Your July spending breakdown is ready to view", read: true, createdAt: ago(4 * DAY) },
];

export const ACTIVITY: ActivityItem[] = [
  { id: "a1", groupId: "g4", actorId: "u2", message: "Jordan added **Weekend groceries** (₹2,850.00) to Me & Jordan", createdAt: ago(2 * HOUR) },
  { id: "a2", groupId: "g1", actorId: "u4", message: "Riley logged a **₹1,450.00** payment to Jordan in Lunch Crew", createdAt: ago(5 * HOUR) },
  { id: "a3", groupId: "g2", actorId: "u3", message: "Sam invited you to **Goa Trip**", createdAt: ago(DAY + 2 * HOUR) },
  { id: "a4", groupId: "g4", actorId: "u2", message: "Jordan logged a **₹3,500.00** payment to you in Me & Jordan", createdAt: ago(DAY + 6 * HOUR) },
  { id: "a5", groupId: "g1", actorId: "u2", message: "Jordan added **Thai takeout** (₹1,240.00) to Lunch Crew", createdAt: ago(5 * DAY) },
  { id: "a6", groupId: "g2", actorId: "u5", message: "Casey added **Scooter rental** (₹5,400.00) to Goa Trip", createdAt: ago(5 * DAY + 3 * HOUR) },
];
