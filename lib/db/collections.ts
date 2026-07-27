import "server-only";

import type { Collection } from "mongodb";
import { getDb } from "./client";
import type {
  AccentToken,
  ExpenseCategory,
  ExpenseSplit,
  GroupType,
  RecurringInfo,
  SettlementStatus,
  SplitMethod,
} from "@/lib/types";

/**
 * Documents use the domain id as `_id` (a string, not an ObjectId) so nothing
 * has to be mapped between the database and the domain types.
 */

export interface UserDoc {
  _id: string;
  name: string;
  email: string;
  initials: string;
  color: AccentToken;
  /** Absent for seeded demo accounts that have not set a password. */
  passwordHash?: string;
  /**
   * A pending password reset. The token itself is never stored — only its
   * SHA-256 — so a database dump cannot be replayed as an account takeover.
   * Both fields are cleared the moment the token is used.
   */
  resetTokenHash?: string;
  resetTokenExpiresAt?: string;
  createdAt: string;
}

export interface GroupDoc {
  _id: string;
  name: string;
  type: GroupType;
  color: AccentToken;
  memberIds: string[];
  createdAt: string;
}

export interface ExpenseDoc {
  _id: string;
  groupId: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  payerId: string;
  splitMethod: SplitMethod;
  splits: ExpenseSplit[];
  date: string;
  notes?: string;
  recurring?: RecurringInfo;
}

export interface SettlementDoc {
  _id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: SettlementStatus;
  method: string;
  createdAt: string;
}

export interface NotificationDoc {
  _id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface ActivityDoc {
  _id: string;
  groupId: string;
  actorId: string;
  message: string;
  createdAt: string;
}

/**
 * A pending group invitation.
 *
 * Only the token's SHA-256 is stored, for the same reason as password resets:
 * the token is a bearer credential — here for group membership, and group
 * membership is what makes another person's balances visible.
 */
export interface InviteDoc {
  _id: string;
  groupId: string;
  email: string;
  invitedBy: string;
  tokenHash: string;
  status: "pending" | "accepted";
  createdAt: string;
  expiresAt: string;
}

/** One cached narrative per user — `_id` is the user id. */
export interface NarrativeDoc {
  _id: string;
  text: string;
  model: string;
  generatedAt: string;
  inputHash: string;
}

export async function collections() {
  const db = await getDb();
  return {
    users: db.collection<UserDoc>("users"),
    groups: db.collection<GroupDoc>("groups"),
    expenses: db.collection<ExpenseDoc>("expenses"),
    settlements: db.collection<SettlementDoc>("settlements"),
    notifications: db.collection<NotificationDoc>("notifications"),
    activity: db.collection<ActivityDoc>("activity"),
    narratives: db.collection<NarrativeDoc>("narratives"),
    invites: db.collection<InviteDoc>("invites"),
  };
}

export type Collections = Awaited<ReturnType<typeof collections>>;
export type UsersCollection = Collection<UserDoc>;
