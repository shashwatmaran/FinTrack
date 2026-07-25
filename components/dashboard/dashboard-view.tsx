"use client";

import Link from "next/link";
import { ArrowUpRight, Plus, Sparkles, UserPlus, Users, ArrowLeftRight } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarStack } from "@/components/ui/avatar";
import { ExpenseRow } from "@/components/expenses/expense-row";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading";
import { SpendChart } from "./spend-chart";
import { ACCENT_BG } from "@/lib/accent";
import { formatCurrency } from "@/lib/format";
import {
  currentMonthKey,
  categoryTotals,
  groupNetForUser,
  headlineTotals,
  monthlySpend,
  usersById,
} from "@/lib/selectors";
import { CATEGORY_META } from "@/lib/categories";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useExpenses,
  useGroups,
  useSettlements,
  useUsers,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

export function DashboardView() {
  const { data: currentUser, isPending: userPending } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [], isPending: groupsPending } = useGroups();
  const { data: expenses = [], isPending: expensesPending } = useExpenses();
  const { data: settlements = [] } = useSettlements();
  const openModal = useUiStore((s) => s.openModal);

  // Only a pending query is "loading". An empty result is a real answer —
  // conflating the two left new accounts staring at a skeleton forever.
  if (userPending || groupsPending || expensesPending || !currentUser) {
    return <PageSkeleton />;
  }

  if (groups.length === 0) {
    return (
      <div className="mx-auto max-w-[640px] animate-ft-slide">
        <EmptyState
          icon={Users}
          title="Welcome to FinTrack"
          description="Create a group to start splitting expenses with the people you share costs with."
          action={
            <Button size="lg" onClick={() => openModal({ type: "create-group" })}>
              <Plus size={17} strokeWidth={3} />
              Create your first group
            </Button>
          }
        />
      </div>
    );
  }

  const byId = usersById(users);
  const totals = headlineTotals(currentUser.id, expenses, settlements);
  const chart = monthlySpend(currentUser.id, expenses);
  const recent = expenses.slice(0, 4);
  const myGroups = groups.filter((g) => g.memberIds.includes(currentUser.id));

  const topCategory = categoryTotals(currentUser.id, expenses, currentMonthKey())[0];
  const categoryLabel = topCategory ? CATEGORY_META[topCategory.category].label : null;

  const stats = [
    {
      label: "Total spent · this month",
      value: formatCurrency(totals.spentThisMonth),
      sub: "your share of every split",
      color: "ft-sky" as const,
    },
    {
      label: "You owe",
      value: formatCurrency(totals.owes),
      sub: `across ${totals.owesPeople} ${totals.owesPeople === 1 ? "person" : "people"}`,
      color: "ft-red" as const,
    },
    {
      label: "You're owed",
      value: formatCurrency(totals.owed),
      sub: `across ${totals.owedPeople} ${totals.owedPeople === 1 ? "person" : "people"}`,
      color: "ft-green" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-[1120px] animate-ft-slide">
      <div className="mb-5.5 grid gap-4.5 md:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "rounded-[10px] border-[2.5px] border-ft-ink p-5 shadow-neo-md transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-lg",
              ACCENT_BG[stat.color]
            )}
          >
            <p className="mb-2 text-[13px] font-semibold">{stat.label}</p>
            <p className="text-[38px] leading-none font-bold tracking-[-1.5px]">{stat.value}</p>
            <p className="mt-2 text-[12.5px] font-semibold">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Button size="lg" onClick={() => openModal({ type: "add-expense" })}>
          <Plus size={17} strokeWidth={3} />
          Add Expense
        </Button>
        <ButtonLink href="/settlements" variant="accent" size="lg">
          <ArrowLeftRight size={17} strokeWidth={2.4} />
          Settle Up
        </ButtonLink>
        <Button variant="pink" size="lg" onClick={() => openModal({ type: "create-group" })}>
          <UserPlus size={17} strokeWidth={2.4} />
          Create Group
        </Button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Monthly spending</CardTitle>
              <span className="text-xs font-semibold text-ft-muted">Last 6 months</span>
            </CardHeader>
            <SpendChart points={chart} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent expenses</CardTitle>
              <Link
                href="/expenses"
                className="border-b-2 border-ft-lime text-[12.5px] font-bold"
              >
                View all
              </Link>
            </CardHeader>
            <div className="flex flex-col gap-2.5">
              {recent.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  group={groups.find((g) => g.id === expense.groupId)}
                  payer={byId[expense.payerId]}
                  participants={expense.splits
                    .map((s) => byId[s.userId])
                    .filter((u): u is NonNullable<typeof u> => Boolean(u))}
                  compact
                />
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-[10px] border-[2.5px] border-ft-ink bg-ft-purple p-5 shadow-neo">
            <div className="mb-2.5 flex items-center gap-2">
              <Sparkles size={20} strokeWidth={2.2} />
              <span className="text-[13px] font-bold tracking-[0.5px] uppercase">AI Insight</span>
            </div>
            <p className="mb-3 text-[19px] leading-[1.25] font-bold">
              {categoryLabel ? (
                <>
                  <span className="rounded-[5px] border-2 border-ft-ink bg-ft-bg px-1.5">
                    {categoryLabel}
                  </span>{" "}
                  is your biggest category this month.
                </>
              ) : (
                "Add a few expenses to unlock insights."
              )}
            </p>
            <p className="mb-3.5 text-[13px] leading-[1.4]">
              {topCategory
                ? `${formatCurrency(topCategory.amount)} of your ${formatCurrency(totals.spentThisMonth)} share so far.`
                : "Once you have a month of history, FinTrack starts spotting patterns."}
            </p>
            <ButtonLink href="/insights" variant="secondary" size="sm" className="border-2 bg-ft-bg">
              See all insights
              <ArrowUpRight size={14} strokeWidth={2.6} />
            </ButtonLink>
          </div>

          <Card>
            <CardTitle className="mb-3.5">Active groups</CardTitle>
            <div className="flex flex-col gap-3">
              {myGroups.map((group) => {
                const net = groupNetForUser(currentUser.id, group, expenses, settlements);
                return (
                  <Link
                    key={group.id}
                    href={`/groups/${group.id}`}
                    className="overflow-hidden rounded-lg border-2 border-ft-ink bg-white transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo"
                  >
                    <div className={cn("h-2", ACCENT_BG[group.color])} />
                    <div className="px-3.5 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate text-[14.5px] font-bold">{group.name}</span>
                        <span
                          className={cn(
                            "flex-none text-xs font-bold",
                            net > 0 ? "text-[#2e7d32]" : net < 0 ? "text-[#c62828]" : "text-ft-muted"
                          )}
                        >
                          {net === 0
                            ? "settled"
                            : net > 0
                              ? `+${formatCurrency(net)}`
                              : formatCurrency(net)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AvatarStack
                          users={group.memberIds
                            .map((id) => byId[id])
                            .filter((u): u is NonNullable<typeof u> => Boolean(u))}
                        />
                        <span className="text-[11.5px] font-semibold text-ft-muted">
                          {group.memberIds.length} members
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
