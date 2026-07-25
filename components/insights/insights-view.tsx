"use client";

import { KeyRound, Sparkles, TrendingDown, TrendingUp, WifiOff } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/common/loading";
import { ACCENT_BG } from "@/lib/accent";
import { CATEGORY_META } from "@/lib/categories";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { buildInsights } from "@/lib/insights";
import { categoryTotals, currentMonthKey } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useExpenses,
  useInsightNarrative,
} from "@/hooks/use-fintrack-data";

/**
 * The model-written summary. Purely additive — the numbers above it are
 * computed locally and stay correct whether or not this renders.
 */
function NarrativeCard() {
  const { data, isPending } = useInsightNarrative();

  if (isPending) {
    return (
      <Card className="border-dashed">
        <div className="flex items-center gap-3">
          <Sparkles size={18} strokeWidth={2.3} className="animate-pulse" />
          <p className="text-[13px] font-semibold text-ft-muted">Writing your summary…</p>
        </div>
      </Card>
    );
  }

  if (data?.status === "not-configured") {
    return (
      <Card className="border-dashed">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-line">
            <KeyRound size={18} strokeWidth={2.3} />
          </span>
          <div>
            <CardTitle>Written summary — not configured</CardTitle>
            <p className="mt-1.5 text-[13px] leading-[1.5] font-medium text-ft-muted">
              The figures above are computed locally and always available. Set{" "}
              <code className="rounded bg-ft-line px-1">AI_BASE_URL</code> and{" "}
              <code className="rounded bg-ft-line px-1">AI_MODEL</code> to have an open-weight
              model turn them into a paragraph. Any OpenAI-compatible server works — Ollama runs
              locally for free.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (data?.status === "unavailable" || !data?.narrative) {
    return (
      <Card className="border-dashed">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-line">
            <WifiOff size={18} strokeWidth={2.3} />
          </span>
          <div>
            <CardTitle>Summary unavailable</CardTitle>
            <p className="mt-1.5 text-[13px] leading-[1.5] font-medium text-ft-muted">
              The model server didn&apos;t respond, or its answer failed verification. Your
              figures above are unaffected.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="rounded-xl border-[2.5px] border-ft-ink bg-white p-5 shadow-neo">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles size={18} strokeWidth={2.4} />
        <span className="text-[13px] font-bold tracking-[0.5px] uppercase">Your month</span>
      </div>
      <p className="text-[14.5px] leading-[1.6] font-medium">{data.narrative.text}</p>
      <p className="mt-3 border-t-2 border-ft-line pt-2.5 text-[11.5px] font-semibold text-ft-muted">
        Written by {data.narrative.model} · {formatRelativeTime(data.narrative.generatedAt)} ·
        figures computed locally
      </p>
    </div>
  );
}

export function InsightsView() {
  const { data: currentUser } = useCurrentUser();
  const { data: expenses = [] } = useExpenses();

  if (!currentUser) return <PageSkeleton />;

  const insights = buildInsights(currentUser.id, expenses);
  const categories = categoryTotals(currentUser.id, expenses, currentMonthKey());
  const max = Math.max(...categories.map((c) => c.amount), 1);

  return (
    <div className="mx-auto max-w-[1120px] animate-ft-slide">
      <div className="grid items-start gap-4.5 lg:grid-cols-2">
        <div className="flex flex-col gap-4.5">
          {insights.map((insight) => {
            const Trend =
              insight.tone === "up" ? TrendingUp : insight.tone === "down" ? TrendingDown : Sparkles;
            return (
              <div
                key={insight.id}
                className={cn(
                  "rounded-xl border-[2.5px] border-ft-ink p-5 shadow-neo",
                  ACCENT_BG[insight.color]
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} strokeWidth={2.4} />
                    <span className="text-base font-bold">{insight.title}</span>
                  </div>
                  <span className="flex items-center gap-1 rounded-full border-2 border-ft-ink bg-ft-bg px-2.5 py-1 text-[11.5px] font-bold">
                    <Trend size={13} strokeWidth={2.6} />
                    {insight.delta}
                  </span>
                </div>
                <p className="text-sm leading-[1.5]">{insight.body}</p>
              </div>
            );
          })}

          <NarrativeCard />
        </div>

        <div className="flex flex-col gap-4.5">
          <Card>
            <CardTitle className="mb-4">Top categories · this month</CardTitle>
            {categories.length === 0 ? (
              <p className="py-6 text-center text-sm font-semibold text-ft-muted">
                No spending recorded this month yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {categories.map((category) => (
                  <div key={category.category}>
                    <div className="mb-1.5 flex justify-between text-[13px] font-bold">
                      <span>{CATEGORY_META[category.category].label}</span>
                      <span>{formatCurrency(category.amount)}</span>
                    </div>
                    <div className="h-4 overflow-hidden rounded-[5px] border-2 border-ft-ink bg-ft-bg">
                      <div
                        className={cn("h-full", ACCENT_BG[CATEGORY_META[category.category].color])}
                        style={{ width: `${(category.amount / max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="rounded-xl border-[2.5px] border-ft-ink bg-ft-purple p-5 shadow-neo">
            <CardTitle className="mb-2">Monthly report</CardTitle>
            <p className="text-[13.5px] leading-[1.5]">
              Spending by group, category trends, and a settlement summary — exportable once the
              reporting job and storage credentials are wired up.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
