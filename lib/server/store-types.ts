import type {
  ActivityItem,
  AppUser,
  Expense,
  ExpenseCategory,
  Group,
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

  /** Everyone who shares at least one group with `actorId`, plus the actor. */
  getVisibleUsers(actorId: string): Promise<AppUser[]>;

  getGroups(actorId: string): Promise<Group[]>;
  createGroup(actorId: string, input: CreateGroupInput): Promise<Group>;

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
