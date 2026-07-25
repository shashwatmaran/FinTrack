"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ACCENT_BG } from "@/lib/accent";
import { CATEGORY_META } from "@/lib/categories";
import { formatCurrency, formatDateLong } from "@/lib/format";
import { usersById } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useDeleteExpense,
  useExpenses,
  useGroups,
  useUsers,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

export function ExpenseDetailModal({
  expenseId,
  onClose,
}: {
  expenseId: string;
  onClose: () => void;
}) {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();
  const deleteExpense = useDeleteExpense();
  const showToast = useUiStore((s) => s.showToast);

  const expense = expenses.find((e) => e.id === expenseId);
  if (!expense) {
    return (
      <Modal title="Expense" onClose={onClose}>
        <p className="text-sm font-semibold text-ft-muted">This expense no longer exists.</p>
      </Modal>
    );
  }

  const byId = usersById(users);
  const meta = CATEGORY_META[expense.category];
  const Icon = meta.icon;
  const group = groups.find((g) => g.id === expense.groupId);
  const payer = byId[expense.payerId];
  const myShare =
    expense.splits.find((s) => s.userId === currentUser?.id)?.amount ?? 0;
  const iPaid = expense.payerId === currentUser?.id;

  return (
    <Modal
      title={expense.description}
      subtitle={`${group?.name ?? "Group"} · ${formatDateLong(expense.date)}`}
      headerClassName={ACCENT_BG[meta.color]}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-[10px] border-[2.5px] border-ft-ink bg-white p-4 shadow-neo-sm">
          <span
            className={cn(
              "flex h-13 w-13 flex-none items-center justify-center rounded-xl border-2 border-ft-ink",
              ACCENT_BG[meta.color]
            )}
          >
            <Icon size={24} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[26px] leading-none font-bold tracking-[-1px]">
              {formatCurrency(expense.amount)}
            </p>
            <p className="mt-1.5 text-[13px] font-semibold text-ft-muted">
              {payer ? (iPaid ? "You paid" : `${payer.name} paid`) : "Paid"} · split{" "}
              {expense.splitMethod}
            </p>
          </div>
          <Pill className={ACCENT_BG[meta.color]}>{meta.label}</Pill>
        </div>

        <div
          className={cn(
            "rounded-[10px] border-[2.5px] border-ft-ink px-4 py-3.5 shadow-neo-sm",
            iPaid ? "bg-ft-green" : "bg-ft-red"
          )}
        >
          <p className="text-[13px] font-semibold">Your position on this expense</p>
          <p className="text-lg font-bold">
            {iPaid
              ? `You're owed ${formatCurrency(expense.amount - myShare)}`
              : `You owe ${formatCurrency(myShare)}`}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-bold">Split breakdown</p>
          <div className="flex flex-col gap-2">
            {expense.splits.map((split) => {
              const user = byId[split.userId];
              if (!user) return null;
              return (
                <div
                  key={split.userId}
                  className="flex items-center gap-3 rounded-[9px] border-2 border-ft-ink bg-white px-3.5 py-2.5"
                >
                  <Avatar user={user} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                    {split.userId === currentUser?.id ? "You" : user.name}
                    {split.userId === expense.payerId && (
                      <span className="ml-2 text-[11px] font-bold text-ft-muted">paid</span>
                    )}
                  </span>
                  <span className="text-[13.5px] font-bold">{formatCurrency(split.amount)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {expense.notes && (
          <div className="rounded-[10px] border-2 border-ft-ink bg-ft-paper px-4 py-3">
            <p className="text-[13px] font-bold">Notes</p>
            <p className="mt-1 text-[13px] font-medium text-ft-muted">{expense.notes}</p>
          </div>
        )}

        <div className="flex justify-between gap-2.5">
          <Button
            variant="secondary"
            disabled={deleteExpense.isPending}
            onClick={() =>
              deleteExpense.mutate(expense.id, {
                onSuccess: () => {
                  showToast("Expense deleted");
                  onClose();
                },
              })
            }
          >
            <Trash2 size={15} strokeWidth={2.4} className="text-[#c62828]" />
            Delete
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
