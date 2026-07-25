import { equalSplit } from "./balances";
import type {
  ActivityDayGroup,
  AppUser,
  Expense,
  Group,
  NotificationItem,
  Settlement,
} from "./types";

/**
 * Local, in-memory seed data standing in for the future MongoDB Atlas
 * collections described in the README. Every function in `data-store.ts`
 * that reads/writes this data is written so the implementation can be
 * swapped for real API calls later without touching the components that
 * call the hooks in `hooks/`.
 */

export const CURRENT_USER_ID = "u1";

export const USERS: AppUser[] = [
  { id: "u1", name: "Maya Alvarez", email: "maya.alvarez@email.com", initials: "MA", color: "ft-lime" },
  { id: "u2", name: "Jordan Lee", email: "jordan.lee@email.com", initials: "JL", color: "ft-sky" },
  { id: "u3", name: "Sam Patel", email: "sam.patel@email.com", initials: "SP", color: "ft-pink" },
  { id: "u4", name: "Riley Chen", email: "riley.chen@email.com", initials: "RC", color: "ft-purple" },
  { id: "u5", name: "Casey Nguyen", email: "casey.nguyen@email.com", initials: "CN", color: "ft-yellow" },
];

export const GROUPS: Group[] = [
  { id: "g1", name: "Lunch Crew", type: "friends", color: "ft-yellow", memberIds: ["u1", "u2", "u3", "u4"], createdAt: "2026-01-10" },
  { id: "g2", name: "Portugal Trip", type: "trip", color: "ft-sky", memberIds: ["u1", "u2", "u3", "u5"], createdAt: "2026-05-02" },
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

export const EXPENSES: Expense[] = [
  expense("e1", "g1", "Thai takeout", "food", 62.4, "u2", "2026-07-22", ["u1", "u2", "u3", "u4"]),
  expense("e2", "g1", "Coffee run", "food", 18.0, "u1", "2026-07-18", ["u1", "u2", "u3", "u4"]),
  expense("e3", "g1", "Bowling night", "entertainment", 96.0, "u3", "2026-07-10", ["u1", "u2", "u3", "u4"]),
  expense("e4", "g1", "Taco Tuesday", "food", 44.8, "u4", "2026-06-28", ["u1", "u2", "u3", "u4"]),
  expense("e5", "g1", "Movie tickets", "entertainment", 58.0, "u1", "2026-06-14", ["u1", "u2", "u3", "u4"]),
  expense("e6", "g1", "Birthday cake for Sam", "food", 32.0, "u2", "2026-05-30", ["u1", "u2", "u4"]),
  expense("e19", "g1", "Pizza night", "food", 51.2, "u1", "2026-04-18", ["u1", "u2", "u3", "u4"]),
  expense("e22", "g1", "Trivia night entry", "entertainment", 40.0, "u4", "2026-02-20", ["u1", "u2", "u3", "u4"]),

  expense("e7", "g2", "Airbnb Lisbon (4 nights)", "housing", 680.0, "u1", "2026-07-05", ["u1", "u2", "u3", "u5"]),
  expense("e8", "g2", "Group dinner - Time Out Market", "food", 154.2, "u3", "2026-07-06", ["u1", "u2", "u3", "u5"]),
  expense("e9", "g2", "Tuk-tuk tour", "travel", 90.0, "u5", "2026-07-07", ["u1", "u2", "u3", "u5"]),
  expense("e10", "g2", "Groceries", "food", 76.35, "u2", "2026-07-08", ["u1", "u2", "u3", "u5"]),
  expense("e11", "g2", "Surf lesson", "entertainment", 120.0, "u1", "2026-07-09", ["u1", "u3", "u5"]),

  expense("e12", "g3", "Electric bill - July", "utilities", 118.4, "u4", "2026-07-15", ["u1", "u4"], {
    cadence: "monthly",
    nextRunAt: "2026-08-15",
    active: true,
  }),
  expense("e13", "g3", "Internet - July", "utilities", 64.99, "u1", "2026-07-01", ["u1", "u4"], {
    cadence: "monthly",
    nextRunAt: "2026-08-01",
    active: true,
  }),
  expense("e14", "g3", "Cleaning supplies", "housing", 28.5, "u1", "2026-06-20", ["u1", "u4"]),
  expense("e15", "g3", "New couch cushions", "housing", 89.0, "u4", "2026-05-12", ["u1", "u4"]),
  expense("e21", "g3", "Utilities - April", "utilities", 110.0, "u4", "2026-04-15", ["u1", "u4"]),

  expense("e16", "g4", "Weekend groceries", "food", 54.1, "u2", "2026-07-20", ["u1", "u2"]),
  expense("e17", "g4", "Concert tickets", "entertainment", 140.0, "u1", "2026-07-02", ["u1", "u2"]),
  expense("e18", "g4", "Uber to airport", "transport", 38.6, "u2", "2026-06-25", ["u1", "u2"]),
  expense("e20", "g4", "Groceries", "food", 40.0, "u1", "2026-03-05", ["u1", "u2"]),
];

export const SETTLEMENTS: Settlement[] = [
  { id: "s1", groupId: "g2", fromUserId: "u3", toUserId: "u1", amount: 130.0, status: "confirmed", method: "Cash", createdAt: "2026-07-11" },
  { id: "s2", groupId: "g1", fromUserId: "u4", toUserId: "u2", amount: 24.0, status: "pending", method: "Venmo", createdAt: "2026-07-23" },
  { id: "s3", groupId: "g3", fromUserId: "u1", toUserId: "u4", amount: 45.0, status: "confirmed", method: "Bank transfer", createdAt: "2026-06-25" },
  { id: "s4", groupId: "g4", fromUserId: "u2", toUserId: "u1", amount: 60.0, status: "pending", method: "Venmo", createdAt: "2026-07-24" },
];

export const NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", title: "Jordan added an expense", body: "Weekend groceries · $54.10 in Me & Jordan", read: false, timeLabel: "2h ago" },
  { id: "n2", title: "Payment pending", body: "Riley logged $24.00 to Jordan in Lunch Crew — awaiting confirmation", read: false, timeLabel: "5h ago" },
  { id: "n3", title: "Settle up reminder", body: "You owe Jordan $60.00 in Me & Jordan", read: false, timeLabel: "1d ago" },
  { id: "n4", title: "You were added to Portugal Trip", body: "Sam invited you to a new group", read: true, timeLabel: "1d ago" },
  { id: "n5", title: "Sam confirmed your payment", body: "$130.00 in Portugal Trip", read: true, timeLabel: "3d ago" },
  { id: "n6", title: "Monthly report ready", body: "Your July spending breakdown is ready to view", read: true, timeLabel: "4d ago" },
];

export const ACTIVITY: ActivityDayGroup[] = [
  {
    day: "Today",
    items: [
      { id: "a1", groupId: "g4", actorId: "u2", message: "Jordan added **Weekend groceries** ($54.10) to Me & Jordan", timeLabel: "2h ago" },
      { id: "a2", groupId: "g1", actorId: "u4", message: "Riley logged a **$24.00** payment to Jordan in Lunch Crew", timeLabel: "5h ago" },
    ],
  },
  {
    day: "Yesterday",
    items: [
      { id: "a3", groupId: "g2", actorId: "u3", message: "Sam invited you to **Portugal Trip**", timeLabel: "1d ago" },
      { id: "a4", groupId: "g4", actorId: "u2", message: "Jordan logged a **$60.00** payment to you in Me & Jordan", timeLabel: "1d ago" },
    ],
  },
  {
    day: "Jul 20",
    items: [
      { id: "a5", groupId: "g1", actorId: "u2", message: "Jordan added **Thai takeout** ($62.40) to Lunch Crew", timeLabel: "5d ago" },
      { id: "a6", groupId: "g2", actorId: "u5", message: "Casey added **Tuk-tuk tour** ($90.00) to Portugal Trip", timeLabel: "5d ago" },
    ],
  },
];
