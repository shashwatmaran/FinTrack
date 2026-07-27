import { z } from "zod";

/**
 * Schemas shared by the forms and the API route handlers, so the client and
 * the server can never disagree about what a valid payload looks like.
 */

export const signInSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

/** One definition of "an acceptable password", used by signup and by reset. */
export const passwordSchema = z.string().min(8, "At least 8 characters").max(200);

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: passwordSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

const categories = [
  "food",
  "transport",
  "housing",
  "entertainment",
  "shopping",
  "travel",
  "utilities",
  "other",
] as const;

const money = z
  .number()
  .positive("Enter an amount above 0")
  .max(1_000_000, "That amount looks too large")
  /**
   * Reject sub-cent precision. This matters beyond tidiness: `equalSplit`
   * works in whole cents, so an amount like 10.123 would be stored alongside
   * splits that sum to 10.12 — breaking the invariant that splits reconstruct
   * the total.
   *
   * The epsilon is required because `10.99 * 100` is 1099.0000000000002 in
   * binary floating point; an exact integer comparison would reject valid money.
   */
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, "At most 2 decimal places");

export const createExpenseSchema = z.object({
  groupId: z.string().min(1, "Pick a group"),
  description: z.string().trim().min(2, "Give the expense a name").max(120),
  category: z.enum(categories),
  amount: money,
  payerId: z.string().min(1),
  participantIds: z.array(z.string().min(1)).min(1, "Select at least one person"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  notes: z.string().trim().max(500).optional(),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, "Give the group a name").max(60),
  type: z.enum(["trip", "home", "couple", "friends", "other"]),
  memberIds: z.array(z.string().min(1)).default([]),
});

export const createSettlementSchema = z.object({
  groupId: z.string().min(1, "Pick a group"),
  toUserId: z.string().min(1, "Pick who you paid"),
  amount: money,
  method: z.string().trim().min(1).max(40),
});

export const resolveSettlementSchema = z.object({
  status: z.enum(["confirmed", "declined"]),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type CreateExpenseValues = z.infer<typeof createExpenseSchema>;
export type CreateGroupValues = z.infer<typeof createGroupSchema>;
export type CreateSettlementValues = z.infer<typeof createSettlementSchema>;
