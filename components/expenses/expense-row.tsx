"use client";

import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ACCENT_BG } from "@/lib/accent";
import { CATEGORY_META } from "@/lib/categories";
import { formatCurrency, formatDate } from "@/lib/format";
import type { AppUser, Expense, Group } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

export function ExpenseRow({
  expense,
  group,
  payer,
  participants,
  showGroup = true,
  compact = false,
}: {
  expense: Expense;
  group?: Group;
  payer?: AppUser;
  participants: AppUser[];
  showGroup?: boolean;
  compact?: boolean;
}) {
  const openModal = useUiStore((s) => s.openModal);
  const meta = CATEGORY_META[expense.category];
  const Icon = meta.icon;

  const metaLine = [
    showGroup ? group?.name : null,
    payer ? `${payer.name.split(" ")[0]} paid` : null,
    formatDate(expense.date),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => openModal({ type: "expense-detail", expenseId: expense.id })}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3.5 rounded-[10px] border-[2.5px] border-ft-ink bg-white text-left transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-md",
        compact ? "border-2 px-3.5 py-3" : "px-4 py-3.5 shadow-neo-sm"
      )}
    >
      <span
        className={cn(
          "flex flex-none items-center justify-center rounded-lg border-2 border-ft-ink",
          ACCENT_BG[meta.color],
          compact ? "h-10 w-10" : "h-11 w-11"
        )}
      >
        <Icon size={compact ? 18 : 20} strokeWidth={2.2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{expense.description}</span>
        <span className="block truncate text-xs font-medium text-ft-muted">{metaLine}</span>
      </span>

      <Badge className={cn("hidden -rotate-2 sm:inline-flex", ACCENT_BG[meta.color])}>
        {meta.label}
      </Badge>

      {!compact && participants.length > 0 && (
        <span className="hidden md:block">
          <AvatarStack users={participants} max={3} />
        </span>
      )}

      {compact && payer && <Avatar user={payer} size="xs" className="max-sm:hidden" />}

      <span className="w-[88px] flex-none text-right text-[17px] font-bold">
        {formatCurrency(expense.amount)}
      </span>
    </button>
  );
}
