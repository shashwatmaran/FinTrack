import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStore } from "@/lib/server/get-store";

/**
 * Materialises recurring expenses that have come due.
 *
 * Invoked by Vercel Cron (see vercel.json). It is a write endpoint that runs
 * across every group with no acting user, so it is gated on a shared secret
 * rather than a session — and refuses to run at all if that secret is unset,
 * because the safe failure here is "does nothing", not "anyone can trigger
 * charges for every group in the system".
 */
export async function GET(request: Request) {
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error("[fintrack] CRON_SECRET is not set — refusing to run the recurring job");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const provided = request.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const store = await getStore();
    const { created, rulesConsidered } = await store.materializeRecurring(today);

    if (created.length > 0) {
      console.log(
        `[fintrack] recurring job: created ${created.length} expense(s) from ${rulesConsidered} rule(s)`
      );
    }

    return NextResponse.json({
      today,
      rulesConsidered,
      created: created.length,
      expenses: created.map((e) => ({ id: e.id, description: e.description, date: e.date })),
    });
  } catch (error) {
    console.error("[fintrack] recurring job failed:", error);
    return NextResponse.json({ error: "Recurring job failed" }, { status: 500 });
  }
}
