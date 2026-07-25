import { generateNarrative, insightsHash } from "@/lib/ai/narrate";
import { isAiConfigured } from "@/lib/ai/client";
import { buildInsights } from "@/lib/insights";
import { withAuth } from "@/lib/server/route-helpers";

export interface NarrativeResponse {
  /** Null when the model isn't configured or generation was rejected. */
  narrative: { text: string; model: string; generatedAt: string } | null;
  /** Lets the UI explain *why* there's no narrative instead of hiding silently. */
  status: "ok" | "not-configured" | "unavailable";
}

/**
 * Returns the cached narrative, regenerating it only when the underlying
 * numbers have changed.
 *
 * Generation happens here rather than inside the expense write for two
 * reasons: awaiting a model call would add seconds to every "add expense",
 * and fire-and-forget work after a serverless response isn't guaranteed to
 * run. Comparing the stored `inputHash` against freshly computed insights
 * gives the same result — regenerate exactly when the facts changed — while
 * keeping writes fast. The cost is that the first insights view after a change
 * pays the model latency once.
 */
export const GET = withAuth<NarrativeResponse>(async ({ userId, store }) => {
  if (!isAiConfigured()) return { narrative: null, status: "not-configured" };

  const expenses = await store.getExpenses(userId);
  const insights = buildInsights(userId, expenses);
  if (insights.length === 0) return { narrative: null, status: "ok" };

  const hash = insightsHash(insights);
  const cached = await store.getNarrative(userId);
  if (cached && cached.inputHash === hash) {
    return {
      narrative: { text: cached.text, model: cached.model, generatedAt: cached.generatedAt },
      status: "ok",
    };
  }

  const fresh = await generateNarrative(insights);
  if (!fresh) return { narrative: null, status: "unavailable" };

  await store.saveNarrative(userId, fresh);
  return {
    narrative: { text: fresh.text, model: fresh.model, generatedAt: fresh.generatedAt },
    status: "ok",
  };
});
