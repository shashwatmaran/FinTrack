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

      describe("updateUser", () => {
        it("renames the acting user", async () => {
          const updated = await store.updateUser(DEMO, { name: "Maya A" });
          expect(updated.name).toBe("Maya A");
          expect((await store.getUserById(DEMO))?.name).toBe("Maya A");
        });

        it("recomputes initials from the new name", async () => {
          // Derived, not client-supplied: an avatar that disagreed with the
          // name printed next to it would be a bug with no obvious cause.
          const updated = await store.updateUser(DEMO, { name: "Priya Sharma" });
          expect(updated.initials).toBe("PS");
        });

        /**
         * There is no target id in the signature, so "may I edit this person?"
         * is a question the store cannot be asked. This test pins that the
         * *acting* user is the one who changes — the only way to get it wrong
         * would be a future overload taking a subject.
         */
        it("changes nobody but the actor", async () => {
          const before = await store.getUserById(OTHER);
          await store.updateUser(DEMO, { name: "Maya A" });
          expect((await store.getUserById(OTHER))?.name).toBe(before?.name);
        });

        it("leaves the email and password alone", async () => {
          const before = await store.getUserByEmail("maya.alvarez@email.com");
          await store.updateUser(DEMO, { name: "Maya A" });

          const after = await store.getUserByEmail("maya.alvarez@email.com");
          expect(after?.id).toBe(DEMO);
          expect(after?.passwordHash).toBe(before?.passwordHash);
        });

        it("never returns the password hash", async () => {
          const updated = await store.updateUser(DEMO, { name: "Maya A" });
          expect(JSON.stringify(updated)).not.toContain("passwordHash");
        });

        it("refuses an account that does not exist", async () => {
          await expect(store.updateUser("nope", { name: "Ghost" })).rejects.toThrow();
        });
      });
    });

    describe("password reset", () => {
      const HASH = "a".repeat(64);
      const future = () => new Date(Date.now() + 60_000).toISOString();
      const past = () => new Date(Date.now() - 60_000).toISOString();

      it("records a token against a known address", async () => {
        const user = await store.setPasswordResetToken(
          "maya.alvarez@email.com",
          HASH,
          future()
        );
        expect(user?.id).toBe(DEMO);
      });

      it("matches the address case-insensitively", async () => {
        expect(
          await store.setPasswordResetToken("MAYA.ALVAREZ@EMAIL.COM", HASH, future())
        ).toBeTruthy();
      });

      it("returns null for an unknown address rather than throwing", async () => {
        // The route answers identically either way; it needs a value, not an
        // exception, to do that.
        expect(await store.setPasswordResetToken("nobody@example.com", HASH, future())).toBeNull();
      });

      it("never exposes the token hash on the returned user", async () => {
        const user = await store.setPasswordResetToken("maya.alvarez@email.com", HASH, future());
        expect(JSON.stringify(user)).not.toContain(HASH);
      });

      it("sets the new password when the token is valid", async () => {
        await store.setPasswordResetToken("maya.alvarez@email.com", HASH, future());
        expect(await store.consumePasswordReset(HASH, "brand-new-password")).toBe(true);

        const user = await store.getUserByEmail("maya.alvarez@email.com");
        expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
        expect(user?.passwordHash).not.toContain("brand-new-password");
      });

      it("refuses a token that has already been used", async () => {
        await store.setPasswordResetToken("maya.alvarez@email.com", HASH, future());
        await store.consumePasswordReset(HASH, "first-password");

        expect(await store.consumePasswordReset(HASH, "second-password")).toBe(false);
      });

      it("refuses an expired token", async () => {
        await store.setPasswordResetToken("maya.alvarez@email.com", HASH, past());
        expect(await store.consumePasswordReset(HASH, "too-late-password")).toBe(false);
      });

      it("refuses a token nobody issued", async () => {
        expect(await store.consumePasswordReset("b".repeat(64), "whatever1")).toBe(false);
      });

      it("leaves the old password working when the token is rejected", async () => {
        const before = (await store.getUserByEmail("maya.alvarez@email.com"))?.passwordHash;
        await store.consumePasswordReset("c".repeat(64), "attacker-password");

        const after = (await store.getUserByEmail("maya.alvarez@email.com"))?.passwordHash;
        expect(after).toBe(before);
      });

      it("has no password-change stamp before any reset", async () => {
        expect(await store.passwordChangedAt(DEMO)).toBeNull();
      });

      it("stamps the change so older sessions can be refused", async () => {
        // Sessions are JWTs; this timestamp is the only thing that can evict
        // one that already exists.
        const before = new Date().toISOString();
        await store.setPasswordResetToken("maya.alvarez@email.com", HASH, future());
        await store.consumePasswordReset(HASH, "brand-new-password");

        const changed = await store.passwordChangedAt(DEMO);
        expect(changed).toBeTruthy();
        expect(changed! >= before).toBe(true);
      });

      it("leaves other accounts unstamped", async () => {
        await store.setPasswordResetToken("maya.alvarez@email.com", HASH, future());
        await store.consumePasswordReset(HASH, "brand-new-password");

        expect(await store.passwordChangedAt(OTHER)).toBeNull();
      });

      it("does not stamp when the reset was refused", async () => {
        await store.consumePasswordReset("f".repeat(64), "attacker-password");
        expect(await store.passwordChangedAt(DEMO)).toBeNull();
      });

      it("never exposes the stamp on a user read", async () => {
        await store.setPasswordResetToken("maya.alvarez@email.com", HASH, future());
        await store.consumePasswordReset(HASH, "brand-new-password");

        expect(JSON.stringify(await store.getUserById(DEMO))).not.toContain("passwordChangedAt");
      });

      it("returns null for an unknown user rather than throwing", async () => {
        expect(await store.passwordChangedAt("nope")).toBeNull();
      });

      it("invalidates an earlier token when a new one is requested", async () => {
        const first = "d".repeat(64);
        await store.setPasswordResetToken("maya.alvarez@email.com", first, future());
        await store.setPasswordResetToken("maya.alvarez@email.com", HASH, future());

        expect(await store.consumePasswordReset(first, "from-old-link")).toBe(false);
        expect(await store.consumePasswordReset(HASH, "from-new-link")).toBe(true);
      });
    });

    describe("group invites", () => {
      const HASH = "e".repeat(64);
      const future = () => new Date(Date.now() + 60_000).toISOString();
      const past = () => new Date(Date.now() - 60_000).toISOString();

      const invite = (actor: string, groupId: string, tokenHash = HASH, expiresAt = future()) =>
        store.createGroupInvite(actor, {
          groupId,
          email: "newcomer@example.com",
          tokenHash,
          expiresAt,
        });

      it("lets a member invite someone", async () => {
        const created = await invite(DEMO, "g1");
        expect(created.groupId).toBe("g1");
        expect(created.status).toBe("pending");
      });

      it("normalises the invited address", async () => {
        const created = await store.createGroupInvite(DEMO, {
          groupId: "g1",
          email: "New.Comer@Example.COM",
          tokenHash: HASH,
          expiresAt: future(),
        });
        expect(created.email).toBe("new.comer@example.com");
      });

      it("never returns the token hash", async () => {
        expect(JSON.stringify(await invite(DEMO, "g1"))).not.toContain(HASH);
      });

      it("refuses to let a non-member invite", async () => {
        // An invite grants sight of everyone's balances in that group.
        await expect(invite(OTHER, STRANGER_GROUP)).rejects.toThrow();
      });

      it("refuses an invite to a group that does not exist", async () => {
        await expect(invite(DEMO, "nope")).rejects.toThrow();
      });

      it("adds the accepting user to the group", async () => {
        const newcomer = await store.createUser({
          name: "New Comer",
          email: "newcomer@example.com",
          password: "supersecret1",
        });
        await invite(DEMO, STRANGER_GROUP);

        const group = await store.acceptGroupInvite(newcomer.id, HASH);
        expect(group.memberIds).toContain(newcomer.id);

        // And the group is now genuinely visible to them.
        const theirGroups = await store.getGroups(newcomer.id);
        expect(theirGroups.map((g) => g.id)).toContain(STRANGER_GROUP);
      });

      it("is idempotent when the link is followed twice", async () => {
        const newcomer = await store.createUser({
          name: "New Comer",
          email: "newcomer@example.com",
          password: "supersecret1",
        });
        await invite(DEMO, STRANGER_GROUP);

        await store.acceptGroupInvite(newcomer.id, HASH);
        const again = await store.acceptGroupInvite(newcomer.id, HASH);

        expect(again.memberIds.filter((id) => id === newcomer.id)).toHaveLength(1);
      });

      it("refuses an expired invite", async () => {
        await invite(DEMO, STRANGER_GROUP, HASH, past());
        await expect(store.acceptGroupInvite(OTHER, HASH)).rejects.toThrow(/no longer valid/i);
      });

      it("refuses a token nobody issued", async () => {
        await expect(store.acceptGroupInvite(OTHER, "f".repeat(64))).rejects.toThrow(
          /no longer valid/i
        );
      });

      it("does not add anyone to the group when the invite is rejected", async () => {
        const before = (await store.getGroups(DEMO)).find((g) => g.id === STRANGER_GROUP);
        await store.acceptGroupInvite(OTHER, "f".repeat(64)).catch(() => {});

        const after = (await store.getGroups(DEMO)).find((g) => g.id === STRANGER_GROUP);
        expect(after?.memberIds).toEqual(before?.memberIds);
      });

      describe("listing outstanding invites", () => {
        it("lists what a member has sent", async () => {
          await invite(DEMO, "g1");
          const pending = await store.listGroupInvites(DEMO, "g1");

          expect(pending).toHaveLength(1);
          expect(pending[0]!.email).toBe("newcomer@example.com");
          expect(pending[0]!.status).toBe("pending");
        });

        /**
         * The rule worth having a test for. A pending invite is the email
         * address of someone who has not joined, so listing them is the same
         * disclosure `createGroupInvite` guards — read instead of written.
         */
        it("refuses to list them for a non-member", async () => {
          await invite(DEMO, STRANGER_GROUP);
          await expect(store.listGroupInvites(OTHER, STRANGER_GROUP)).rejects.toThrow();
        });

        it("does not leak the address through the error path", async () => {
          await invite(DEMO, STRANGER_GROUP);
          const error = await store
            .listGroupInvites(OTHER, STRANGER_GROUP)
            .then(() => null, (e: Error) => e);

          expect(error).toBeTruthy();
          expect(String(error)).not.toContain("newcomer@example.com");
        });

        it("refuses a group that does not exist", async () => {
          await expect(store.listGroupInvites(DEMO, "nope")).rejects.toThrow();
        });

        it("never returns the token hash", async () => {
          await invite(DEMO, "g1");
          expect(JSON.stringify(await store.listGroupInvites(DEMO, "g1"))).not.toContain(HASH);
        });

        it("is empty for a group with no invites", async () => {
          // Empty is a resolved answer, not a missing one — a client that reads
          // it as "still loading" strands the screen on a skeleton.
          expect(await store.listGroupInvites(DEMO, "g1")).toEqual([]);
        });

        it("omits an expired invite", async () => {
          // The accept path already refuses it, so listing it would offer an
          // action that cannot succeed.
          await invite(DEMO, "g1", HASH, past());
          expect(await store.listGroupInvites(DEMO, "g1")).toEqual([]);
        });

        it("omits one that has been accepted", async () => {
          const newcomer = await store.createUser({
            name: "New Comer",
            email: "newcomer@example.com",
            password: "supersecret1",
          });
          await invite(DEMO, STRANGER_GROUP);
          await store.acceptGroupInvite(newcomer.id, HASH);

          expect(await store.listGroupInvites(DEMO, STRANGER_GROUP)).toEqual([]);
        });

        it("scopes to the group asked for", async () => {
          await invite(DEMO, "g1");
          await invite(DEMO, "g2", "d".repeat(64));

          const first = await store.listGroupInvites(DEMO, "g1");
          expect(first).toHaveLength(1);
          expect(first[0]!.groupId).toBe("g1");
        });
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

    describe("materializeRecurring", () => {
      // Seed data has two active monthly rules in g3, both with 2026-08 next runs.
      const AFTER_BOTH_DUE = "2026-08-20";
      const BEFORE_ANY_DUE = "2026-07-26";

      it("creates nothing when no rule is due", async () => {
        const before = (await store.getExpenses(DEMO)).length;
        const result = await store.materializeRecurring(BEFORE_ANY_DUE);

        expect(result.created).toEqual([]);
        expect((await store.getExpenses(DEMO)).length).toBe(before);
      });

      it("materialises rules that have come due", async () => {
        const result = await store.materializeRecurring(AFTER_BOTH_DUE);
        expect(result.created.length).toBeGreaterThan(0);
      });

      it("copies the template's amount, payer and splits", async () => {
        const template = (await store.getExpenses(DEMO)).find((e) => e.recurring)!;
        const result = await store.materializeRecurring(AFTER_BOTH_DUE);
        const generated = result.created.find((e) => e.description === template.description)!;

        expect(generated.amount).toBe(template.amount);
        expect(generated.payerId).toBe(template.payerId);
        expect(generated.splits).toEqual(template.splits);
        expect(generated.groupId).toBe(template.groupId);
      });

      it("does not make generated expenses into templates themselves", async () => {
        // Otherwise each run would multiply the number of active rules.
        const result = await store.materializeRecurring(AFTER_BOTH_DUE);
        expect(result.created.every((e) => !e.recurring)).toBe(true);
      });

      it("is idempotent — a second run the same day creates nothing", async () => {
        const first = await store.materializeRecurring(AFTER_BOTH_DUE);
        expect(first.created.length).toBeGreaterThan(0);

        const second = await store.materializeRecurring(AFTER_BOTH_DUE);
        expect(second.created).toEqual([]);
      });

      it("advances the rule past the day it ran", async () => {
        await store.materializeRecurring(AFTER_BOTH_DUE);
        const rules = (await store.getExpenses(DEMO)).filter((e) => e.recurring);

        expect(rules.length).toBeGreaterThan(0);
        expect(rules.every((e) => e.recurring!.nextRunAt > AFTER_BOTH_DUE)).toBe(true);
      });

      it("skips paused rules", async () => {
        const template = (await store.getExpenses(DEMO)).find((e) => e.recurring)!;
        await store.toggleRecurring(DEMO, template.id); // pause it

        const result = await store.materializeRecurring(AFTER_BOTH_DUE);
        expect(result.created.some((e) => e.description === template.description)).toBe(false);
      });

      it("leaves a paused rule's schedule untouched", async () => {
        const template = (await store.getExpenses(DEMO)).find((e) => e.recurring)!;
        const originalNextRun = template.recurring!.nextRunAt;
        await store.toggleRecurring(DEMO, template.id);

        await store.materializeRecurring(AFTER_BOTH_DUE);
        const after = (await store.getExpenses(DEMO)).find((e) => e.id === template.id)!;
        expect(after.recurring!.nextRunAt).toBe(originalNextRun);
      });

      it("catches up several missed occurrences in one run", async () => {
        // Nothing ran for roughly four months.
        const result = await store.materializeRecurring("2026-11-20");
        const byTemplate = new Map<string, number>();
        for (const e of result.created) {
          byTemplate.set(e.description, (byTemplate.get(e.description) ?? 0) + 1);
        }
        expect([...byTemplate.values()].every((n) => n >= 3)).toBe(true);
      });

      it("notifies every participant of a generated expense", async () => {
        const before = (await store.getNotifications(DEMO)).length;
        await store.materializeRecurring(AFTER_BOTH_DUE);
        expect((await store.getNotifications(DEMO)).length).toBeGreaterThan(before);
      });

      it("records activity for generated expenses", async () => {
        const before = (await store.getActivity(DEMO)).length;
        await store.materializeRecurring(AFTER_BOTH_DUE);
        expect((await store.getActivity(DEMO)).length).toBeGreaterThan(before);
      });

      it("makes generated expenses visible through the normal read path", async () => {
        const result = await store.materializeRecurring(AFTER_BOTH_DUE);
        const ids = new Set((await store.getExpenses(DEMO)).map((e) => e.id));
        expect(result.created.every((e) => ids.has(e.id))).toBe(true);
      });
    });

    describe("event notifications", () => {
      it("notifies the other participants when someone adds an expense", async () => {
        const before = (await store.getNotifications(OTHER)).length;
        await store.createExpense(DEMO, {
          groupId: "g1",
          description: "Notify test",
          category: "food",
          amount: 400,
          payerId: DEMO,
          participantIds: [DEMO, OTHER],
          date: "2026-07-25",
        });
        expect((await store.getNotifications(OTHER)).length).toBe(before + 1);
      });

      it("does not notify the person who added it", async () => {
        const before = (await store.getNotifications(DEMO)).length;
        await store.createExpense(DEMO, {
          groupId: "g1",
          description: "Self notify test",
          category: "food",
          amount: 400,
          payerId: DEMO,
          participantIds: [DEMO, OTHER],
          date: "2026-07-25",
        });
        expect((await store.getNotifications(DEMO)).length).toBe(before);
      });

      it("notifies the payee that a payment needs confirming", async () => {
        const before = (await store.getNotifications("u4")).length;
        await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP,
          toUserId: "u4",
          amount: 500,
          method: "UPI",
        });
        expect((await store.getNotifications("u4")).length).toBe(before + 1);
      });

      it("notifies the payer when their payment is confirmed", async () => {
        const settlement = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP,
          toUserId: "u4",
          amount: 500,
          method: "UPI",
        });
        const before = (await store.getNotifications(DEMO)).length;
        await store.resolveSettlement("u4", settlement.id, "confirmed");
        expect((await store.getNotifications(DEMO)).length).toBe(before + 1);
      });

      it("notifies the payer when their payment is declined", async () => {
        const settlement = await store.createSettlement(DEMO, {
          groupId: STRANGER_GROUP,
          toUserId: "u4",
          amount: 500,
          method: "UPI",
        });
        const before = (await store.getNotifications(DEMO)).length;
        await store.resolveSettlement("u4", settlement.id, "declined");
        expect((await store.getNotifications(DEMO)).length).toBe(before + 1);
      });
    });

    describe("insight narratives", () => {
      const narrative = {
        text: "You spent more on food this month.",
        model: "llama-3.3-70b",
        generatedAt: "2026-07-25T10:00:00.000Z",
        inputHash: "abc123",
      };

      it("returns null before anything has been saved", async () => {
        expect(await store.getNarrative(DEMO)).toBeNull();
      });

      it("round-trips a saved narrative", async () => {
        await store.saveNarrative(DEMO, narrative);
        expect(await store.getNarrative(DEMO)).toEqual(narrative);
      });

      it("replaces rather than accumulating on regeneration", async () => {
        await store.saveNarrative(DEMO, narrative);
        await store.saveNarrative(DEMO, { ...narrative, text: "Updated.", inputHash: "def456" });

        const stored = await store.getNarrative(DEMO);
        expect(stored?.text).toBe("Updated.");
        expect(stored?.inputHash).toBe("def456");
      });

      it("scopes narratives per user", async () => {
        await store.saveNarrative(DEMO, narrative);
        const other = await store.createUser({
          name: "Narrative Other",
          email: "narrative-other@example.com",
          password: "supersecret1",
        });

        expect(await store.getNarrative(other.id)).toBeNull();
        expect((await store.getNarrative(DEMO))?.text).toBe(narrative.text);
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
