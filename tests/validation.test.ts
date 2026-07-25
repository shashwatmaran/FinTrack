import { describe, it, expect } from "vitest";
import { equalSplit } from "@/lib/balances";
import {
  createExpenseSchema,
  createGroupSchema,
  createSettlementSchema,
  resolveSettlementSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";

const validExpense = {
  groupId: "g1",
  description: "Thai takeout",
  category: "food",
  amount: 62.4,
  payerId: "u1",
  participantIds: ["u1", "u2"],
  date: "2026-07-25",
};

describe("signUpSchema", () => {
  it("accepts a well-formed signup", () => {
    expect(
      signUpSchema.safeParse({ name: "Maya Alvarez", email: "m@x.com", password: "supersecret1" })
        .success
    ).toBe(true);
  });

  it("trims surrounding whitespace from the name", () => {
    const parsed = signUpSchema.parse({
      name: "  Maya Alvarez  ", email: "m@x.com", password: "supersecret1",
    });
    expect(parsed.name).toBe("Maya Alvarez");
  });

  it("rejects passwords under 8 characters", () => {
    const result = signUpSchema.safeParse({ name: "Maya", email: "m@x.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      signUpSchema.safeParse({ name: "Maya", email: "not-an-email", password: "supersecret1" }).success
    ).toBe(false);
  });

  it("rejects an absurdly long password rather than hashing it", () => {
    expect(
      signUpSchema.safeParse({ name: "Maya", email: "m@x.com", password: "a".repeat(500) }).success
    ).toBe(false);
  });
});

describe("signInSchema", () => {
  it("does not impose a length minimum on the password", () => {
    // Sign-in must accept whatever is typed; only sign-up enforces strength.
    expect(signInSchema.safeParse({ email: "m@x.com", password: "x" }).success).toBe(true);
  });

  it("still requires a password to be present", () => {
    expect(signInSchema.safeParse({ email: "m@x.com", password: "" }).success).toBe(false);
  });
});

describe("createExpenseSchema", () => {
  it("accepts a valid expense", () => {
    expect(createExpenseSchema.safeParse(validExpense).success).toBe(true);
  });

  it("rejects zero and negative amounts", () => {
    for (const amount of [0, -0.01, -100]) {
      expect(createExpenseSchema.safeParse({ ...validExpense, amount }).success, `${amount}`).toBe(
        false
      );
    }
  });

  it("rejects more than two decimal places — money is cents", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, amount: 10.123 }).success).toBe(false);
  });

  it("accepts exactly two decimal places", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, amount: 10.99 }).success).toBe(true);
  });

  it("rejects an implausibly large amount", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, amount: 5_000_000 }).success).toBe(false);
  });

  it("rejects a non-numeric amount instead of coercing it", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, amount: "60" }).success).toBe(false);
  });

  it("requires at least one participant", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, participantIds: [] }).success).toBe(false);
  });

  it("rejects an unknown category", () => {
    expect(createExpenseSchema.safeParse({ ...validExpense, category: "crypto" }).success).toBe(false);
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    for (const date of ["25-07-2026", "2026/07/25", "today", ""]) {
      expect(createExpenseSchema.safeParse({ ...validExpense, date }).success, date).toBe(false);
    }
  });

  it("rejects an over-long description", () => {
    expect(
      createExpenseSchema.safeParse({ ...validExpense, description: "x".repeat(200) }).success
    ).toBe(false);
  });

  it("treats notes as optional", () => {
    const { notes: _notes, ...withoutNotes } = { ...validExpense, notes: "hi" };
    expect(createExpenseSchema.safeParse(withoutNotes).success).toBe(true);
  });

  it("only accepts amounts that split back to exactly the total", () => {
    // This is why sub-cent precision is rejected: equalSplit works in whole
    // cents, so an amount it cannot represent would be stored alongside splits
    // that do not reconstruct it.
    const candidates = [0.01, 0.1, 1, 10.99, 62.4, 100.05, 33.33, 999999, 10.123, 0.005, 1 / 3];

    for (const amount of candidates) {
      if (!createExpenseSchema.safeParse({ ...validExpense, amount }).success) continue;
      for (const size of [1, 2, 3, 4, 5, 6, 7]) {
        const users = Array.from({ length: size }, (_, i) => `u${i}`);
        const total = equalSplit(amount, users).reduce((s, x) => s + Math.round(x.amount * 100), 0);
        expect(total, `${amount} across ${size}`).toBe(Math.round(amount * 100));
      }
    }
  });
});

describe("createGroupSchema", () => {
  it("accepts a valid group and defaults members to empty", () => {
    const parsed = createGroupSchema.parse({ name: "Portugal Trip", type: "trip" });
    expect(parsed.memberIds).toEqual([]);
  });

  it("rejects a one-character name", () => {
    expect(createGroupSchema.safeParse({ name: "x", type: "trip" }).success).toBe(false);
  });

  it("rejects an unknown group type", () => {
    expect(createGroupSchema.safeParse({ name: "Valid", type: "cult" }).success).toBe(false);
  });
});

describe("createSettlementSchema", () => {
  it("accepts a valid settlement", () => {
    expect(
      createSettlementSchema.safeParse({ groupId: "g1", toUserId: "u2", amount: 25, method: "Venmo" })
        .success
    ).toBe(true);
  });

  it("has no field for the payer — it can never be client-supplied", () => {
    const parsed = createSettlementSchema.parse({
      groupId: "g1", toUserId: "u2", amount: 25, method: "Venmo", fromUserId: "u9",
    });
    expect(parsed).not.toHaveProperty("fromUserId");
  });

  it("rejects a non-positive amount", () => {
    expect(
      createSettlementSchema.safeParse({ groupId: "g1", toUserId: "u2", amount: 0, method: "Cash" })
        .success
    ).toBe(false);
  });
});

describe("resolveSettlementSchema", () => {
  it("accepts confirmed and declined", () => {
    expect(resolveSettlementSchema.safeParse({ status: "confirmed" }).success).toBe(true);
    expect(resolveSettlementSchema.safeParse({ status: "declined" }).success).toBe(true);
  });

  it("refuses to move a settlement back to pending", () => {
    expect(resolveSettlementSchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});
