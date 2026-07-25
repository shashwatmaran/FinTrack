import { describe, it, expect, beforeEach } from "vitest";
import type { DataStore } from "@/lib/server/store-types";

/**
 * One behavioural contract, executed against every DataStore implementation.
 *
 * This is the point of the exercise: `memory-store` and `mongo-store` are
 * separate code, but only one of them runs in production. Without a shared
 * suite, an authorization rule can silently exist in one and not the other.
 * Anything added to the interface belongs here, not in an implementation's
 * own test file.
 */
export interface StoreHarness {
  name: string;
  /** Fresh store, seeded with the standard demo dataset. */
  create(): Promise<DataStore>;
}

const DEMO = "u1"; // Maya — member of g1..g4
const OTHER = "u2"; // Jordan — shares g1, g2, g4 with Maya
const STRANGER_GROUP = "g3"; // Maya + Riley (u4) only

export function runStoreContract(harness: StoreHarness) {
  describe(`DataStore contract: ${harness.name}`, () => {
    let store: DataStore;

    beforeEach(async () => {
      store = await harness.create();
    });

    describe("users", () => {
      it("finds a seeded user by email, case-insensitively", async () => {
        const upper = await store.getUserByEmail("MAYA.ALVAREZ@EMAIL.COM");
        expect(upper?.id).toBe(DEMO);
      });

      it("returns a bcrypt hash, never a plaintext password", async () => {
        const user = await store.getUserByEmail("maya.alvarez@email.com");
        expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(JSON.stringify(user)).not.toContain("demo1234");
      });

      it("does not expose passwordHash from getUserById", async () => {
        const user = await store.getUserById(DEMO);
        expect(user).toBeTruthy();
        expect(JSON.stringify(user)).not.toContain("passwordHash");
      });

      it("returns null for an unknown user rather than throwing", async () => {
        expect(await store.getUserById("nope")).toBeNull();
        expect(await store.getUserByEmail("nobody@example.com")).toBeNull();
      });

      it("creates an account with a hashed password", async () => {
        const user = await store.createUser({
          name: "New Person",
          email: "New.Person@Example.com",
          password: "supersecret1",
        });
        expect(user.id).toBeTruthy();
        expect(user.email).toBe("new.person@example.com"); // normalised
        expect(user.initials).toBe("NP");

        const stored = await store.getUserByEmail("new.person@example.com");
        expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(stored?.passwordHash).not.toContain("supersecret1");
      });

      it("rejects a duplicate email regardless of case", async () => {
        await expect(
          store.createUser({ name: "Impostor", email: "MAYA.ALVAREZ@email.com", password: "whatever1" })
        ).rejects.toThrow(/already exists/i);
      });
    });

    describe("visibility scoping", () => {
      it("shows only people who share a group with you", async () => {
        const visible = await store.getVisibleUsers(DEMO);
        expect(visible.map((u) => u.id).sort()).toEqual(["u1", "u2", "u3", "u4", "u5"]);
      });

      it("shows a brand-new account nobody but itself", async () => {
        const fresh = await store.createUser({
          name: "Solo Person", email: "solo@example.com", password: "supersecret1",
        });
        const visible = await store.getVisibleUsers(fresh.id);
        expect(visible.map((u) => u.id)).toEqual([fresh.id]);
      });

      it("gives a new account no groups, expenses, settlements or activity", async () => {
        const fresh = await store.createUser({
          name: "Empty Person", email: "empty@example.com", password: "supersecret1",
        });
        expect(await store.getGroups(fresh.id)).toEqual([]);
        expect(await store.getExpenses(fresh.id)).toEqual([]);
        expect(await store.getSettlements(fresh.id)).toEqual([]);
        expect(await store.getActivity(fresh.id)).toEqual([]);
      });

      it("only returns groups you belong to", async () => {
        const groups = await store.getGroups(DEMO);
        expect(groups.every((g) => g.memberIds.includes(DEMO))).toBe(true);
      });

      it("only returns expenses from your groups", async () => {
        const groupIds = new Set((await store.getGroups(DEMO)).map((g) => g.id));
        const expenses = await store.getExpenses(DEMO);
        expect(expenses.length).toBeGreaterThan(0);
        expect(expenses.every((e) => groupIds.has(e.groupId))).toBe(true);
      });

      it("returns expenses newest first", async () => {
        const dates = (await store.getExpenses(DEMO)).map((e) => e.date);
        expect([...dates].sort().reverse()).toEqual(dates);
      });
    });

    describe("createExpense", () => {
      const base = {
        description: "Contract test dinner",
        category: "food" as const,
        amount: 40,
        date: "2026-07-25",
      };

      it("splits evenly and stores splits summing to the amount", async () => {
        const expense = await store.createExpense(DEMO, {
          ...base, groupId: "g1", payerId: DEMO, participantIds: ["u1", "u2", "u3", "u4"],
        });
        expect(expense.splits.map((s) => s.amount)).toEqual([10, 10, 10, 10]);
        const total = expense.splits.reduce((s, x) => s + x.amount, 0);
        expect(Math.round(total * 100)).toBe(Math.round(expense.amount * 100));
      });

      it("persists so a subsequent read sees it", async () => {
        const created = await store.createExpense(DEMO, {
          ...base, groupId: "g1", payerId: DEMO, participantIds: ["u1", "u2"],
        });
        const found = (await store.getExpenses(DEMO)).find((e) => e.id === created.id);
        expect(found?.description).toBe(base.description);
      });

      it("records an activity entry", async () => {
        const before = (await store.getActivity(DEMO)).length;
        await store.createExpense(DEMO, {
          ...base, groupId: "g1", payerId: DEMO, participantIds: ["u1", "u2"],
        });
        expect((await store.getActivity(DEMO)).length).toBe(before + 1);
      });

      it("refuses a group you are not a member of", async () => {
        const outsider = await store.createUser({
          name: "Outsider", email: "outsider@example.com", password: "supersecret1",
        });
        await expect(
          store.createExpense(outsider.id, {
            ...base, groupId: "g1", payerId: outsider.id, participantIds: [outsider.id],
          })
        ).rejects.toThrow();
      });

      it("refuses a group that does not exist", async () => {
        await expect(
          store.createExpense(DEMO, {
            ...base, groupId: "no-such-group", payerId: DEMO, participantIds: [DEMO],
          })
        ).rejects.toThrow(/not found/i);
      });

      it("refuses participants who are not members of the group", async () => {
        // u5 (Casey) is in g2 but not g3.
        await expect(
          store.createExpense(DEMO, {
            ...base, groupId: STRANGER_GROUP, payerId: DEMO, participantIds: ["u1", "u5"],
          })
        ).rejects.toThrow(/member of the group/i);
      });

      it("refuses a payer who is not a member of the group", async () => {
        await expect(
          store.createExpense(DEMO, {
            ...base, groupId: STRANGER_GROUP, payerId: "u5", participantIds: ["u1"],
          })
        ).rejects.toThrow(/member of the group/i);
      });
    });

    describe("deleteExpense", () => {
      it("removes an expense in your group", async () => {
        const created = await store.createExpense(DEMO, {
          description: "Doomed", category: "food", amount: 10, date: "2026-07-25",
          groupId: "g1", payerId: DEMO, participantIds: ["u1", "u2"],
        });
        await store.deleteExpense(DEMO, created.id);
        expect((await store.getExpenses(DEMO)).find((e) => e.id === created.id)).toBeUndefined();
      });

      it("refuses to delete an expense from someone else's group", async () => {
        const outsider = await store.createUser({
          name: "Outsider2", email: "outsider2@example.com", password: "supersecret1",
        });
        const target = (await store.getExpenses(DEMO))[0];
        await expect(store.deleteExpense(outsider.id, target.id)).rejects.toThrow();
        // and it must still be there
        expect((await store.getExpenses(DEMO)).find((e) => e.id === target.id)).toBeTruthy();
      });

      it("reports a missing expense as not found", async () => {
        await expect(store.deleteExpense(DEMO, "no-such-expense")).rejects.toThrow(/not found/i);
      });
    });

    describe("toggleRecurring", () => {
      it("flips the active flag and back", async () => {
        const recurring = (await store.getExpenses(DEMO)).find((e) => e.recurring);
        expect(recurring, "seed data should contain a recurring expense").toBeTruthy();
        const initial = recurring!.recurring!.active;

        const once = await store.toggleRecurring(DEMO, recurring!.id);
        expect(once.recurring!.active).toBe(!initial);
        const twice = await store.toggleRecurring(DEMO, recurring!.id);
        expect(twice.recurring!.active).toBe(initial);
      });

      it("refuses an expense with no recurring rule", async () => {
        const plain = (await store.getExpenses(DEMO)).find((e) => !e.recurring);
        await expect(store.toggleRecurring(DEMO, plain!.id)).rejects.toThrow(/recurring/i);
      });

      it("refuses when you are not in the group", async () => {
        const outsider = await store.createUser({
          name: "Outsider3", email: "outsider3@example.com", password: "supersecret1",
        });
        const recurring = (await store.getExpenses(DEMO)).find((e) => e.recurring)!;
        await expect(store.toggleRecurring(outsider.id, recurring.id)).rejects.toThrow();
      });
    });

    describe("createGroup", () => {
      it("always includes the creator, even if omitted", async () => {
        const group = await store.createGroup(DEMO, {
          name: "Fresh Group", type: "friends", memberIds: [OTHER],
        });
        expect(group.memberIds).toContain(DEMO);
        expect(group.memberIds).toContain(OTHER);
      });

      it("does not duplicate the creator when they are listed", async () => {
        const group = await store.createGroup(DEMO, {
          name: "Dedup Group", type: "friends", memberIds: [DEMO, DEMO, OTHER],
        });
        expect(group.memberIds.filter((id) => id === DEMO)).toHaveLength(1);
      });

      it("makes the group immediately visible to the creator", async () => {
        const group = await store.createGroup(DEMO, {
          name: "Visible Group", type: "trip", memberIds: [],
        });
        expect((await store.getGroups(DEMO)).map((g) => g.id)).toContain(group.id);
      });
    });

    describe("settlements — escrow rules", () => {
      it("creates as pending, never confirmed", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        expect(s.status).toBe("pending");
      });

      it("takes fromUserId from the caller, not the input", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        expect(s.fromUserId).toBe(DEMO);
      });

      it("refuses a payee outside the group", async () => {
        await expect(
          store.createSettlement(DEMO, {
            groupId: STRANGER_GROUP, toUserId: "u5", amount: 10, method: "Cash",
          })
        ).rejects.toThrow(/member of the group/i);
      });

      it("refuses settling with yourself", async () => {
        await expect(
          store.createSettlement(DEMO, {
            groupId: STRANGER_GROUP, toUserId: DEMO, amount: 10, method: "Cash",
          })
        ).rejects.toThrow(/yourself/i);
      });

      it("refuses a group you are not in", async () => {
        const outsider = await store.createUser({
          name: "Outsider4", email: "outsider4@example.com", password: "supersecret1",
        });
        await expect(
          store.createSettlement(outsider.id, {
            groupId: "g1", toUserId: DEMO, amount: 10, method: "Cash",
          })
        ).rejects.toThrow();
      });

      it("does NOT let the payer confirm their own payment", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        await expect(store.resolveSettlement(DEMO, s.id, "confirmed")).rejects.toThrow(
          /received the money/i
        );

        const after = (await store.getSettlements(DEMO)).find((x) => x.id === s.id);
        expect(after?.status).toBe("pending");
      });

      it("lets the payer cancel their own logged payment", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        const declined = await store.resolveSettlement(DEMO, s.id, "declined");
        expect(declined.status).toBe("declined");
      });

      it("lets the recipient confirm", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        const confirmed = await store.resolveSettlement("u4", s.id, "confirmed");
        expect(confirmed.status).toBe("confirmed");
      });

      it("refuses an unrelated third party", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        await expect(store.resolveSettlement("u3", s.id, "declined")).rejects.toThrow();
      });

      it("refuses to resolve the same settlement twice", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        await store.resolveSettlement("u4", s.id, "confirmed");
        await expect(store.resolveSettlement("u4", s.id, "declined")).rejects.toThrow(
          /already been resolved/i
        );
      });

      it("resolves exactly once under concurrent conflicting requests", async () => {
        const s = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP, toUserId: "u4", amount: 15, method: "Venmo",
        });
        const results = await Promise.allSettled([
          store.resolveSettlement("u4", s.id, "confirmed"),
          store.resolveSettlement("u4", s.id, "declined"),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      });

      it("reports a missing settlement as not found", async () => {
        await expect(store.resolveSettlement(DEMO, "no-such-settlement", "confirmed")).rejects.toThrow(
          /not found/i
        );
      });
    });

    describe("notifications", () => {
      it("returns the demo user's notifications newest first", async () => {
        const list = await store.getNotifications(DEMO);
        expect(list.length).toBeGreaterThan(0);
        const dates = list.map((n) => n.createdAt);
        expect([...dates].sort().reverse()).toEqual(dates);
      });

      it("marks all as read and stays read", async () => {
        expect((await store.getNotifications(DEMO)).some((n) => !n.read)).toBe(true);
        const after = await store.markNotificationsRead(DEMO);
        expect(after.every((n) => n.read)).toBe(true);
        expect((await store.getNotifications(DEMO)).every((n) => n.read)).toBe(true);
      });

      it("does not leak another user's notifications", async () => {
        const fresh = await store.createUser({
          name: "No Notifs", email: "nonotifs@example.com", password: "supersecret1",
        });
        expect(await store.getNotifications(fresh.id)).toEqual([]);
      });
    });

    describe("activity", () => {
      it("is scoped to your groups", async () => {
        const groupIds = new Set((await store.getGroups(DEMO)).map((g) => g.id));
        const activity = await store.getActivity(DEMO);
        expect(activity.length).toBeGreaterThan(0);
        expect(activity.every((a) => groupIds.has(a.groupId))).toBe(true);
      });

      it("is ordered newest first", async () => {
        const dates = (await store.getActivity(DEMO)).map((a) => a.createdAt);
        expect([...dates].sort().reverse()).toEqual(dates);
      });
    });
  });
}
