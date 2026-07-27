import type {
  ActivityItem,
  AppUser,
  Expense,
  ExpenseCategory,
  Group,
  GroupInvite,
  GroupType,
  NotificationItem,
  Settlement,
} from "@/lib/types";

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

export interface CreateGroupInput {
  name: string;
  type: GroupType;
  memberIds: string[];
}

export interface CreateSettlementInput {
  groupId: string;
  toUserId: string;
  amount: number;
  method: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
}

export interface CreateInviteInput {
  groupId: string;
  email: string;
  tokenHash: string;
  expiresAt: string;
}

/**
 * The contract every read and write in the app goes through. Two
 * implementations exist: MongoDB when MONGODB_URI is configured, and an
 * in-process store otherwise. Route handlers depend on this interface only,
 * so neither implementation leaks into the HTTP layer.
 *
 * Every method takes the acting user's id. Authorization is enforced here
 * rather than in the route handlers so a missed check in a new endpoint
 * cannot expose another user's data.
 */
export interface DataStore {
  getUserById(id: string): Promise<AppUser | null>;
  getUserByEmail(email: string): Promise<(AppUser & { passwordHash?: string }) | null>;
  createUser(input: CreateUserInput): Promise<AppUser>;

  /**
   * Password reset. Both methods are unauthenticated by nature — the caller is
   * someone who cannot sign in — so neither takes an acting user. Like
   * `materializeRecurring`, that makes the calling route the only boundary,
   * and `/api/password/*` is the only place either may be reached from.
   *
   * The store never sees the token itself, only a hash of it. A database dump
   * must not be enough to take over an account.
   */
  setPasswordResetToken(
    email: string,
    tokenHash: string,
    expiresAt: string
  ): Promise<AppUser | null>;

  /**
   * Consumes a reset token and sets the new password. Returns false when the
   * token is unknown, expired, or already used — the caller cannot tell which,
   * and neither can the user.
   */
  consumePasswordReset(tokenHash: string, newPassword: string): Promise<boolean>;

  /**
   * When this user's password last changed, or null if it never has.
   *
   * Read on every authenticated request to decide whether a token predates the
   * change. Sessions are JWTs — there is nothing to delete server-side — so
   * this comparison is the only thing that evicts a session someone else is
   * holding after a reset.
   */
  passwordChangedAt(userId: string): Promise<string | null>;

  /** Everyone who shares at least one group with `actorId`, plus the actor. */
  getVisibleUsers(actorId: string): Promise<AppUser[]>;

  getGroups(actorId: string): Promise<Group[]>;
  createGroup(actorId: string, input: CreateGroupInput): Promise<Group>;

  /**
   * Invites someone to a group. Only a member may invite, since an invite hands
   * out visibility of everyone else's balances in that group.
   *
   * As with password resets the store receives only the token's hash.
   */
  createGroupInvite(actorId: string, input: CreateInviteInput): Promise<GroupInvite>;

  /**
   * Redeems an invite for the acting user, who must already have an account.
   *
   * Throws `ValidationError` when the token is unknown, expired or spent — the
   * three are not distinguished, so a spent token cannot be used to probe which
   * groups exist. Redeeming twice is a no-op that still returns the group.
   */
  acceptGroupInvite(actorId: string, tokenHash: string): Promise<Group>;

  getExpenses(actorId: string): Promise<Expense[]>;
  createExpense(actorId: string, input: CreateExpenseInput): Promise<Expense>;
  deleteExpense(actorId: string, expenseId: string): Promise<{ id: string }>;
  toggleRecurring(actorId: string, expenseId: string): Promise<Expense>;

  getSettlements(actorId: string): Promise<Settlement[]>;
  createSettlement(actorId: string, input: CreateSettlementInput): Promise<Settlement>;
  resolveSettlement(
    actorId: string,
    settlementId: string,
    status: "confirmed" | "declined"
  ): Promise<Settlement>;

  getNotifications(actorId: string): Promise<NotificationItem[]>;
  markNotificationsRead(actorId: string): Promise<NotificationItem[]>;

  getActivity(actorId: string): Promise<ActivityItem[]>;

  /**
   * Cached model-written narrative for the insights page. Stored per user with
   * the hash of the facts it was written from, so it can be invalidated when
   * the underlying numbers change.
   */
  getNarrative(actorId: string): Promise<StoredNarrative | null>;
  saveNarrative(actorId: string, narrative: StoredNarrative): Promise<void>;

  /**
   * Materialises every recurring expense due on or before `today`.
   *
   * Unlike every other method here this is **not** scoped to an acting user —
   * it is the scheduled job, running across all groups. It must therefore be
   * reachable only from the cron endpoint, never from a user-facing route.
   *
   * Idempotent: a rule's `nextRunAt` is advanced as part of claiming it, so
   * running twice in a day produces nothing the second time.
   */
  materializeRecurring(today: string): Promise<MaterializeResult>;
}

export interface MaterializeResult {
  /** Expenses actually created, oldest occurrence first. */
  created: Expense[];
  /** Recurring rules examined, whether or not anything was due. */
  rulesConsidered: number;
}

export interface StoredNarrative {
  text: string;
  model: string;
  generatedAt: string;
  inputHash: string;
}

/** Thrown for authorization failures; route handlers map this to HTTP 403. */
export class ForbiddenError extends Error {
  constructor(message = "You don't have access to this resource") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Thrown when a referenced document doesn't exist; maps to HTTP 404. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Thrown for invalid input that passed schema validation; maps to HTTP 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
