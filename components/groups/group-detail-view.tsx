"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, Plus, Receipt, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ExpenseRow } from "@/components/expenses/expense-row";
import { DebtFlowRow } from "@/components/settlements/debt-flow-row";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading";
import { ACCENT_BG } from "@/lib/accent";
import { formatCurrency } from "@/lib/format";
import { groupDebtFlows, groupNetForUser, usersById } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useExpenses,
  useGroups,
  useSettlements,
  useUsers,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

const TABS = ["Overview", "Expenses", "Balances", "Members"] as const;
type Tab = (typeof TABS)[number];

export function GroupDetailView({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();
  const { data: settlements = [] } = useSettlements();
  const openModal = useUiStore((s) => s.openModal);

  if (!currentUser || groups.length === 0) return <PageSkeleton />;

  const group = groups.find((g) => g.id === groupId);
  if (!group) {
    return (
      <div className="mx-auto max-w-[1120px]">
        <EmptyState
          icon={Receipt}
          title="Group not found"
          description="This group may have been deleted or you no longer have access."
          action={
            <Link href="/groups" className="text-sm font-bold underline underline-offset-2">
              Back to groups
            </Link>
          }
        />
      </div>
    );
  }

  const byId = usersById(users);
  const members = group.memberIds
    .map((id) => byId[id])
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const groupExpenses = expenses.filter((e) => e.groupId === group.id);
  const net = groupNetForUser(currentUser.id, group, expenses, settlements);
  const flows = groupDebtFlows(group, expenses, settlements);

  return (
    <div className="mx-auto max-w-[1120px] animate-ft-slide">
      <Link
        href="/groups"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-bold"
      >
        <ChevronLeft size={16} strokeWidth={2.6} />
        All groups
      </Link>

      <div className="mb-5.5 flex flex-wrap gap-2 border-b-[3px] border-ft-ink pb-4">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-ft-ink px-3.5 py-2.5 text-[13.5px] font-bold transition-transform hover:-translate-x-px hover:-translate-y-px",
              tab === t ? cn(ACCENT_BG[group.color], "shadow-neo-xs") : "bg-white"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="flex flex-col gap-4.5">
          <div className="grid gap-4.5 md:grid-cols-2">
            <div
              className={cn(
                "rounded-[10px] border-[2.5px] border-ft-ink p-5 shadow-neo",
                net > 0 ? "bg-ft-green" : net < 0 ? "bg-ft-red" : "bg-ft-line"
              )}
            >
              <p className="mb-1.5 text-[13px] font-semibold">Your balance in this group</p>
              <p className="text-2xl font-bold">
                {net === 0
                  ? "All settled up"
                  : net > 0
                    ? `You're owed ${formatCurrency(net)}`
                    : `You owe ${formatCurrency(Math.abs(net))}`}
              </p>
            </div>
            <Card className="flex flex-col items-start justify-between gap-3">
              <p className="text-[13px] font-semibold text-ft-muted">
                {groupExpenses.length} expenses · {members.length} members
              </p>
              <div className="flex flex-wrap gap-2.5">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => openModal({ type: "settle-up", groupId: group.id })}
                >
                  Settle up
                </Button>
                <Button
                  size="sm"
                  onClick={() => openModal({ type: "add-expense", groupId: group.id })}
                >
                  <Plus size={15} strokeWidth={3} />
                  Add expense
                </Button>
              </div>
            </Card>
          </div>

          <Card>
            <CardTitle className="mb-3.5">Recent expenses</CardTitle>
            {groupExpenses.length === 0 ? (
              <p className="py-6 text-center text-sm font-semibold text-ft-muted">
                No expenses in this group yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {groupExpenses.slice(0, 5).map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    group={group}
                    payer={byId[expense.payerId]}
                    participants={expense.splits
                      .map((s) => byId[s.userId])
                      .filter((u): u is NonNullable<typeof u> => Boolean(u))}
                    showGroup={false}
                    compact
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "Expenses" && (
        <div className="flex flex-col gap-3">
          {groupExpenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses yet"
              description="Add the first expense to start splitting in this group."
              action={
                <Button
                  size="lg"
                  onClick={() => openModal({ type: "add-expense", groupId: group.id })}
                >
                  Add Expense
                </Button>
              }
            />
          ) : (
            groupExpenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                group={group}
                payer={byId[expense.payerId]}
                participants={expense.splits
                  .map((s) => byId[s.userId])
                  .filter((u): u is NonNullable<typeof u> => Boolean(u))}
                showGroup={false}
              />
            ))
          )}
        </div>
      )}

      {tab === "Balances" && (
        <div className="flex flex-col gap-3.5">
          {flows.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All settled up!"
              description="Nobody owes anybody in this group."
            />
          ) : (
            flows.map((flow, i) => (
              <DebtFlowRow
                key={`${flow.fromUserId}-${flow.toUserId}-${i}`}
                flow={flow}
                from={byId[flow.fromUserId]}
                to={byId[flow.toUserId]}
              />
            ))
          )}
        </div>
      )}

      {tab === "Members" && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openModal({ type: "invite" })}>
              <UserPlus size={15} strokeWidth={2.4} />
              Invite member
            </Button>
          </div>
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3.5 rounded-[10px] border-[2.5px] border-ft-ink bg-white px-4 py-3.5 shadow-neo-sm"
            >
              <Avatar user={member} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{member.name}</span>
                <span className="block truncate text-xs font-medium text-ft-muted">
                  {member.email}
                </span>
              </span>
              <Pill className={member.id === currentUser.id ? "bg-ft-lime" : "bg-white"}>
                {member.id === currentUser.id ? "You" : "Member"}
              </Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
