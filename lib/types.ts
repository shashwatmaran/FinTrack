export type AccentToken =
  | "ft-lime"
  | "ft-yellow"
  | "ft-pink"
  | "ft-sky"
  | "ft-green"
  | "ft-red"
  | "ft-purple";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  color: AccentToken;
}

export type GroupType = "trip" | "home" | "couple" | "friends" | "other";

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  color: AccentToken;
  memberIds: string[];
  createdAt: string;
}

export type ExpenseCategory =
  | "food"
  | "transport"
  | "housing"
  | "entertainment"
  | "shopping"
  | "travel"
  | "utilities"
  | "other";

export type SplitMethod = "equal" | "exact" | "percentage";

export interface ExpenseSplit {
  userId: string;
  amount: number;
}

export interface RecurringInfo {
  cadence: "weekly" | "monthly";
  nextRunAt: string;
  active: boolean;
}

export interface Expense {
  id: string;
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

export type SettlementStatus = "pending" | "confirmed" | "declined";

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: SettlementStatus;
  method: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  groupId: string;
  actorId: string;
  message: string;
  createdAt: string;
}

export interface ActivityDayGroup {
  day: string;
  items: ActivityItem[];
}

export interface DebtFlow {
  fromUserId: string;
  toUserId: string;
  amount: number;
}
