import type {
  ActivityItem,
  AppUser,
  Expense,
  Group,
  NotificationItem,
  Settlement,
} from "@/lib/types";
import type {
  CreateExpenseValues,
  CreateGroupValues,
  CreateSettlementValues,
} from "@/lib/validation";

/** Surfaces the server's error message so forms can show something useful. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    // An expired or cleared session should send the user to sign in rather
    // than surfacing a failed query on every panel of the dashboard.
    if (response.status === 401 && typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname);
      if (!window.location.pathname.startsWith("/signin")) {
        window.location.href = `/signin?next=${next}`;
      }
    }

    throw new ApiError(body?.error ?? `Request failed (${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  getCurrentUser: () => request<AppUser>("/me"),
  getUsers: () => request<AppUser[]>("/users"),

  getGroups: () => request<Group[]>("/groups"),
  createGroup: (body: CreateGroupValues) =>
    request<Group>("/groups", { method: "POST", body: json(body) }),

  getExpenses: () => request<Expense[]>("/expenses"),
  createExpense: (body: CreateExpenseValues) =>
    request<Expense>("/expenses", { method: "POST", body: json(body) }),
  deleteExpense: (expenseId: string) =>
    request<{ id: string }>(`/expenses/${expenseId}`, { method: "DELETE" }),
  toggleRecurring: (expenseId: string) =>
    request<Expense>(`/expenses/${expenseId}/recurring`, { method: "POST" }),

  getSettlements: () => request<Settlement[]>("/settlements"),
  createSettlement: (body: CreateSettlementValues) =>
    request<Settlement>("/settlements", { method: "POST", body: json(body) }),
  resolveSettlement: (settlementId: string, status: "confirmed" | "declined") =>
    request<Settlement>(`/settlements/${settlementId}`, {
      method: "PATCH",
      body: json({ status }),
    }),

  getNotifications: () => request<NotificationItem[]>("/notifications"),
  markNotificationsRead: () =>
    request<NotificationItem[]>("/notifications/read", { method: "POST" }),

  getActivity: () => request<ActivityItem[]>("/activity"),

  getInsightNarrative: () =>
    request<{
      narrative: { text: string; model: string; generatedAt: string } | null;
      status: "ok" | "not-configured" | "unavailable";
    }>("/insights/narrative"),

  signUp: (body: { name: string; email: string; password: string }) =>
    request<{ id: string; email: string }>("/signup", { method: "POST", body: json(body) }),
};
