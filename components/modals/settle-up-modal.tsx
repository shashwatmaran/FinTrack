"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { balancesWithOthers, suggestedTransfers, usersById } from "@/lib/selectors";
import {
  useCreateSettlement,
  useCurrentUser,
  useExpenses,
  useGroups,
  useSettlements,
  useUsers,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

const METHODS = ["UPI", "Cash", "Bank transfer", "Card", "Other"];

const schema = z.object({
  toUserId: z.string().min(1, "Pick who you paid"),
  groupId: z.string().min(1, "Pick a group"),
  amount: z.coerce.number().positive("Enter an amount above 0"),
  method: z.string().min(1),
});

type Values = z.input<typeof schema>;

export function SettleUpModal({
  defaultToUserId,
  defaultGroupId,
  onClose,
}: {
  defaultToUserId?: string;
  defaultGroupId?: string;
  onClose: () => void;
}) {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();
  const { data: settlements = [] } = useSettlements();
  const createSettlement = useCreateSettlement();
  const showToast = useUiStore((s) => s.showToast);

  const byId = usersById(users);
  const myGroups = groups.filter((g) => !currentUser || g.memberIds.includes(currentUser.id));
  const iOwe = currentUser
    ? balancesWithOthers(currentUser.id, expenses, settlements).filter((b) => b.amount < 0)
    : [];

  const initialToUserId = defaultToUserId ?? iOwe[0]?.userId ?? "";
  const suggestions = currentUser
    ? suggestedTransfers(myGroups, expenses, settlements)
        .flatMap((s) => s.flows.map((f) => ({ ...f, groupId: s.groupId })))
        .filter((f) => f.fromUserId === currentUser.id)
    : [];
  const match = suggestions.find((s) => s.toUserId === initialToUserId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      toUserId: initialToUserId,
      groupId: defaultGroupId ?? match?.groupId ?? myGroups[0]?.id ?? "",
      amount: (match?.amount ?? "") as unknown as number,
      method: "Venmo",
    },
  });

  const toUserId = watch("toUserId");
  const payee = byId[toUserId];

  const onSubmit = handleSubmit((values) => {
    createSettlement.mutate(
      {
        groupId: values.groupId,
        toUserId: values.toUserId,
        amount: Number(values.amount),
        method: values.method,
      },
      {
        onSuccess: () => {
          showToast("Payment logged — waiting for confirmation");
          onClose();
        },
      }
    );
  });

  if (!currentUser) return null;

  const counterparties = users.filter((u) => u.id !== currentUser.id);

  return (
    <Modal
      title="Settle up"
      subtitle="Log a payment you've already made outside FinTrack."
      headerClassName="bg-ft-yellow"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <Label htmlFor="toUserId">Who did you pay?</Label>
          <Select id="toUserId" {...register("toUserId")}>
            <option value="">Select a person</option>
            {counterparties.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
          <FieldError>{errors.toUserId?.message}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("amount")}
            />
            <FieldError>{errors.amount?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="method">Method</Label>
            <Select id="method" {...register("method")}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="groupId">Group</Label>
          <Select id="groupId" {...register("groupId")}>
            {myGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <FieldError>{errors.groupId?.message}</FieldError>
        </div>

        {match && (
          <p className="rounded-[10px] border-2 border-ft-ink bg-ft-lime px-3.5 py-2.5 text-[13px] font-bold">
            Suggested: {formatCurrency(match.amount)} clears your balance with{" "}
            {payee?.name.split(" ")[0] ?? "them"}.
          </p>
        )}

        <div className="flex items-start gap-3 rounded-[10px] border-2 border-ft-ink bg-ft-amber-bg px-3.5 py-3">
          <Clock size={18} strokeWidth={2.4} className="mt-0.5 flex-none" />
          <p className="text-[12.5px] leading-[1.45] font-medium">
            This stays in escrow until {payee?.name.split(" ")[0] ?? "the other person"} confirms
            they received it — balances only update on confirmation.
          </p>
        </div>

        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" disabled={createSettlement.isPending}>
            {createSettlement.isPending ? "Logging…" : "Log payment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
