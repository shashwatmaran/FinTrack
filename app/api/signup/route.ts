import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getStore } from "@/lib/server/get-store";
import {
  SIGNUP_RATE_LIMIT,
  checkRateLimit,
  clientIp,
} from "@/lib/server/rate-limit";
import { ValidationError } from "@/lib/server/store-types";
import { signUpSchema } from "@/lib/validation";

/**
 * The only write endpoint reachable while signed out. It creates the account
 * but does not establish a session — the client signs in immediately
 * afterwards through Auth.js so there is a single code path issuing tokens.
 */
export async function POST(request: Request) {
  // Rate-limited before parsing: account creation is unauthenticated and runs
  // bcrypt, so it is both a spam vector and a CPU-exhaustion vector.
  const limit = checkRateLimit(`signup:${clientIp(request)}`, SIGNUP_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const body = signUpSchema.parse(await request.json().catch(() => null));
    const store = await getStore();
    const user = await store.createUser(body);
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[fintrack] signup failed:", error);
    return NextResponse.json({ error: "Could not create your account" }, { status: 500 });
  }
}
