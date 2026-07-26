import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Expense } from "@/lib/types";

/**
 * Route-level tests for the recurring cron endpoint.
 *
 * The browser check can only exercise the "nothing due" path, because the
 * seeded rules are not due today. These cover the branch that matters — a run
 * that actually materialises expenses — plus the auth gate, which is the only
 * thing standing between an unauthenticated caller and writes across every
 * group in the system.
 */
const materializeRecurring = vi.fn();
const envMock = { CRON_SECRET: "test-secret" as string | undefined };

vi.mock("@/lib/env", () => ({
  get env() {
    return envMock;
  },
  features: {},
}));
vi.mock("@/lib/server/get-store", () => ({
  getStore: async () => ({ materializeRecurring }),
}));

const { GET } = await import("@/app/api/cron/recurring/route");

const expense = (id: string, date: string): Expense => ({
  id,
  groupId: "g3",
  description: "Broadband",
  category: "utilities",
  amount: 1299,
  payerId: "u1",
  splitMethod: "equal",
  splits: [{ userId: "u1", amount: 1299 }],
  date,
});

const request = (auth?: string) =>
  new Request("http://localhost/api/cron/recurring", {
    headers: auth ? { Authorization: auth } : {},
  });

beforeEach(() => {
  materializeRecurring.mockReset();
  materializeRecurring.mockResolvedValue({ created: [], rulesConsidered: 0 });
  envMock.CRON_SECRET = "test-secret";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("cron auth gate", () => {
  it("401s with no Authorization header", async () => {
    expect((await GET(request())).status).toBe(401);
  });

  it("401s with the wrong secret", async () => {
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
  });

  it("401s when the scheme is missing", async () => {
    expect((await GET(request("test-secret"))).status).toBe(401);
  });

  it("never runs the job for an unauthorised caller", async () => {
    await GET(request("Bearer wrong"));
    expect(materializeRecurring).not.toHaveBeenCalled();
  });

  it("refuses to run at all when CRON_SECRET is unset", async () => {
    // The safe failure is "does nothing", not "anyone can trigger charges".
    envMock.CRON_SECRET = undefined;
    const response = await GET(request("Bearer anything"));

    expect(response.status).toBe(503);
    expect(materializeRecurring).not.toHaveBeenCalled();
  });

  it("accepts the correct secret", async () => {
    expect((await GET(request("Bearer test-secret"))).status).toBe(200);
  });
});

describe("cron job execution", () => {
  it("passes today's date to the store", async () => {
    await GET(request("Bearer test-secret"));
    const today = new Date().toISOString().slice(0, 10);
    expect(materializeRecurring).toHaveBeenCalledWith(today);
  });

  it("reports a run where nothing was due", async () => {
    const body = await (await GET(request("Bearer test-secret"))).json();
    expect(body.created).toBe(0);
    expect(body.expenses).toEqual([]);
  });

  it("reports the expenses it actually created", async () => {
    materializeRecurring.mockResolvedValue({
      created: [expense("e100", "2026-08-01"), expense("e101", "2026-09-01")],
      rulesConsidered: 2,
    });

    const body = await (await GET(request("Bearer test-secret"))).json();
    expect(body.created).toBe(2);
    expect(body.rulesConsidered).toBe(2);
    expect(body.expenses).toEqual([
      { id: "e100", description: "Broadband", date: "2026-08-01" },
      { id: "e101", description: "Broadband", date: "2026-09-01" },
    ]);
  });

  it("does not leak split or payer detail into the job response", async () => {
    materializeRecurring.mockResolvedValue({
      created: [expense("e100", "2026-08-01")],
      rulesConsidered: 1,
    });
    const body = await (await GET(request("Bearer test-secret"))).json();
    expect(body.expenses[0]).not.toHaveProperty("splits");
    expect(body.expenses[0]).not.toHaveProperty("payerId");
  });

  it("500s and does not leak the error when the job throws", async () => {
    materializeRecurring.mockRejectedValue(new Error("mongodb+srv://user:hunter2@host"));

    const response = await GET(request("Bearer test-secret"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("hunter2");
  });
});
