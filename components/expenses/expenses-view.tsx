"use client";

import { useSearchParams } from "next/navigation";
import { Download, Plus, Receipt, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseRow } from "@/components/expenses/expense-row";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading";
import { ACCENT_BG } from "@/lib/accent";
import { CATEGORY_META } from "@/lib/categories";
import { formatCurrency, formatDate } from "@/lib/format";
import { describeNextRun } from "@/lib/recurring";
import { usersById } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useExpenses,
  useGroups,
  useToggleRecurring,
  useUsers,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

export function ExpensesView() {
  const searchParams = useSearchParams();
  const search = searchParams.get("q")?.toLowerCase() ?? "";
  const today = new Date().toISOString().slice(0, 10);

  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();
  const toggleRecurring = useToggleRecurring();

  const filter = useUiStore((s) => s.expenseGroupFilter);
  const setFilter = useUiStore((s) => s.setExpenseGroupFilter);
  const openModal = useUiStore((s) => s.openModal);
  const showToast = useUiStore((s) => s.showToast);

  if (!currentUser) return <PageSkeleton />;

  const byId = usersById(users);
  const mine = groups.filter((g) => g.memberIds.includes(currentUser.id));
  const visible = expenses
    .filter((e) => filter === "all" || e.groupId === filter)
    .filter((e) => !search || e.description.toLowerCase().includes(search));
  const recurring = expenses.filter((e) => e.recurring);

  return (
    <div className="mx-auto max-w-[1120px] animate-ft-slide">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "cursor-pointer rounded-[20px] border-2 border-ft-ink px-4 py-2 text-[13px] font-bold",
              filter === "all" ? "bg-ft-lime shadow-neo-xs" : "bg-white"
            )}
          >
            All groups
          </button>
          {mine.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setFilter(group.id)}
              className={cn(
                "cursor-pointer rounded-[20px] border-2 border-ft-ink px-4 py-2 text-[13px] font-bold",
                filter === group.id ? cn(ACCENT_BG[group.color], "shadow-neo-xs") : "bg-white"
              )}
            >
              {group.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={() => openModal({ type: "export" })}>
            <Download size={16} strokeWidth={2.4} />
            Export
          </Button>
          <Button onClick={() => openModal({ type: "add-expense" })}>
            <Plus size={16} strokeWidth={3} />
            Add Expense
          </Button>
        </div>
      </div>

      {search && (
        <p className="mb-4 text-[13px] font-semibold text-ft-muted">
          Showing matches for &ldquo;{search}&rdquo;
        </p>
      )}

      {recurring.length > 0 && filter === "all" && !search && (
        <div className="mb-5 rounded-xl border-[2.5px] border-ft-ink bg-ft-paper px-4.5 py-4 shadow-neo">
          <div className="mb-3 flex items-center gap-2">
            <RefreshCw size={18} strokeWidth={2.4} />
            <span className="text-[15px] font-bold">Recurring expenses</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {recurring.map((expense) => {
              const meta = CATEGORY_META[expense.category];
              const Icon = meta.icon;
              const active = expense.recurring!.active;
              const nextRun = describeNextRun(expense.recurring!.nextRunAt, today);
              // Overdue means the cron hasn't caught it yet — surface that
              // rather than showing a date that has already passed.
              const dueNow = nextRun === "due now";
              return (
                <div
                  key={expense.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-[9px] border-2 border-ft-ink bg-white px-3.5 py-3",
                    !active && "opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9.5 w-9.5 flex-none items-center justify-center rounded-lg border-2 border-ft-ink",
                      ACCENT_BG[meta.color]
                    )}
                  >
                    <Icon size={17} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{expense.description}</span>
                    <span className="block text-[11.5px] font-medium text-ft-muted">
                      {groups.find((g) => g.id === expense.groupId)?.name} ·{" "}
                      {expense.recurring!.cadence}
                    </span>
                  </span>
                  {active ? (
                    <span
                      className={cn(
                        "rounded-full border-2 border-ft-ink px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap",
                        dueNow ? "bg-ft-yellow" : "bg-ft-sky"
                      )}
                      title={`Next run ${formatDate(expense.recurring!.nextRunAt)}`}
                    >
                      {dueNow
                        ? "Due now"
                        : `${formatDate(expense.recurring!.nextRunAt)} · ${nextRun}`}
                    </span>
                  ) : (
                    <span className="rounded-full border-2 border-ft-ink bg-ft-line px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap">
                      Paused
                    </span>
                  )}
                  <span className="w-20 text-right text-[15px] font-bold">
                    {formatCurrency(expense.amount)}
                  </span>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={toggleRecurring.isPending}
                    onClick={() =>
                      toggleRecurring.mutate(expense.id, {
                        onSuccess: () =>
                          showToast(active ? "Recurring paused" : "Recurring resumed"),
                      })
                    }
                  >
                    {active ? "Pause" : "Resume"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Add your first expense to start splitting."
          action={
            <Button size="lg" onClick={() => openModal({ type: "add-expense" })}>
              Add Expense
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              group={groups.find((g) => g.id === expense.groupId)}
              payer={byId[expense.payerId]}
              participants={expense.splits
                .map((s) => byId[s.userId])
                .filter((u): u is NonNullable<typeof u> => Boolean(u))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
