"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { equalSplit } from "@/lib/balances";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { formatCurrency } from "@/lib/format";
import { usersById } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useCreateExpense, useCurrentUser, useGroups, useUsers } from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

const schema = z.object({
  description: z.string().min(2, "Give the expense a name"),
  amount: z.coerce.number().positive("Enter an amount above 0"),
  groupId: z.string().min(1, "Pick a group"),
  category: z.string().min(1),
  payerId: z.string().min(1),
  date: z.string().min(1, "Pick a date"),
  participantIds: z.array(z.string()).min(1, "Select at least one person"),
  notes: z.string().optional(),
});

type Values = z.input<typeof schema>;

export function AddExpenseModal({
  defaultGroupId,
  onClose,
}: {
  defaultGroupId?: string;
  onClose: () => void;
}) {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const createExpense = useCreateExpense();
  const showToast = useUiStore((s) => s.showToast);

  const myGroups = groups.filter((g) => !currentUser || g.memberIds.includes(currentUser.id));
  const initialGroup = myGroups.find((g) => g.id === defaultGroupId) ?? myGroups[0];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: "",
      amount: "" as unknown as number,
      groupId: initialGroup?.id ?? "",
      category: "food",
      payerId: currentUser?.id ?? "",
      date: new Date().toISOString().slice(0, 10),
      participantIds: initialGroup?.memberIds ?? [],
      notes: "",
    },
  });

  const groupId = watch("groupId");
  const participantIds = watch("participantIds") ?? [];
  const amount = Number(watch("amount")) || 0;
  const group = groups.find((g) => g.id === groupId);
  const byId = usersById(users);

  // Reset the participant + payer selection whenever the group changes.
  useEffect(() => {
    if (!group) return;
    setValue("participantIds", group.memberIds);
    if (currentUser && !group.memberIds.includes(currentUser.id)) {
      setValue("payerId", group.memberIds[0] ?? "");
    }
  }, [group, currentUser, setValue]);

  const splitPreview =
    amount > 0 && participantIds.length > 0 ? equalSplit(amount, participantIds) : [];

  const onSubmit = handleSubmit((values) => {
    createExpense.mutate(
      {
        groupId: values.groupId,
        description: values.description,
        category: values.category as never,
        amount: Number(values.amount),
        payerId: values.payerId,
        participantIds: values.participantIds,
        date: values.date,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          showToast("Expense added");
          onClose();
        },
      }
    );
  });

  if (!currentUser || myGroups.length === 0) {
    return (
      <Modal title="Add expense" onClose={onClose}>
        <p className="text-sm font-semibold text-ft-muted">
          Create a group first — expenses always belong to one.
        </p>
      </Modal>
    );
  }

  const toggleParticipant = (userId: string) => {
    const next = participantIds.includes(userId)
      ? participantIds.filter((id) => id !== userId)
      : [...participantIds, userId];
    setValue("participantIds", next, { shouldValidate: true });
  };

  return (
    <Modal title="Add expense" subtitle="Split it evenly across everyone selected." onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <Label htmlFor="description">What was it for?</Label>
          <Input id="description" placeholder="Thai takeout" {...register("description")} />
          <FieldError>{errors.description?.message}</FieldError>
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
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
            <FieldError>{errors.date?.message}</FieldError>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" {...register("category")}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="payerId">Paid by</Label>
          <Select id="payerId" {...register("payerId")}>
            {(group?.memberIds ?? []).map((id) => (
              <option key={id} value={id}>
                {id === currentUser.id ? "You" : (byId[id]?.name ?? id)}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Split between</Label>
          <div className="flex flex-wrap gap-2">
            {(group?.memberIds ?? []).map((id) => {
              const user = byId[id];
              if (!user) return null;
              const selected = participantIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleParticipant(id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border-2 border-ft-ink py-1.5 pr-3.5 pl-1.5 text-[13px] font-bold",
                    selected ? "bg-ft-lime shadow-neo-xs" : "bg-white opacity-70"
                  )}
                >
                  <Avatar user={user} size="xs" />
                  {id === currentUser.id ? "You" : user.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <FieldError>{errors.participantIds?.message}</FieldError>
        </div>

        {splitPreview.length > 0 && (
          <div className="rounded-[10px] border-2 border-ft-ink bg-ft-paper px-4 py-3">
            <p className="mb-2 text-[13px] font-bold">Split preview</p>
            <div className="flex flex-col gap-1">
              {splitPreview.map((split) => (
                <div key={split.userId} className="flex justify-between text-[13px] font-semibold">
                  <span>
                    {split.userId === currentUser.id
                      ? "You"
                      : (byId[split.userId]?.name ?? split.userId)}
                  </span>
                  <span>{formatCurrency(split.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" rows={2} placeholder="Anything worth remembering" {...register("notes")} />
        </div>

        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createExpense.isPending}>
            {createExpense.isPending ? "Saving…" : "Add expense"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
