"use client";

import { KeyRound, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/common/loading";
import { ACCENT_BG } from "@/lib/accent";
import { CATEGORY_META } from "@/lib/categories";
import { formatCurrency } from "@/lib/format";
import { buildInsights } from "@/lib/insights";
import { categoryTotals, currentMonthKey } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useCurrentUser, useExpenses } from "@/hooks/use-fintrack-data";

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

          <Card className="border-dashed">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-line">
                <KeyRound size={18} strokeWidth={2.3} />
              </span>
              <div>
                <CardTitle>LLM-written narratives — not enabled yet</CardTitle>
                <p className="mt-1.5 text-[13px] leading-[1.5] font-medium text-ft-muted">
                  The insights above are computed locally from your expense history. The
                  conversational summaries, budget suggestions, and anomaly explanations described
                  in the roadmap need a model API key, so that layer is deferred until credentials
                  are configured.
                </p>
              </div>
            </div>
          </Card>
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
