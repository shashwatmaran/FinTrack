"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCreateGroup, useCurrentUser, useUsers } from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";
import type { GroupType } from "@/lib/types";

const GROUP_TYPES: { value: GroupType; label: string }[] = [
  { value: "trip", label: "Trip" },
  { value: "home", label: "Home" },
  { value: "friends", label: "Friends" },
  { value: "couple", label: "Couple" },
  { value: "other", label: "Other" },
];

const schema = z.object({
  name: z.string().min(2, "Give the group a name"),
  type: z.string().min(1),
  memberIds: z.array(z.string()),
});

type Values = z.infer<typeof schema>;

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const createGroup = useCreateGroup();
  const showToast = useUiStore((s) => s.showToast);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", type: "friends", memberIds: [] },
  });

  const memberIds = watch("memberIds");
  const candidates = users.filter((u) => u.id !== currentUser?.id);

  const onSubmit = handleSubmit((values) => {
    createGroup.mutate(
      { name: values.name, type: values.type as GroupType, memberIds: values.memberIds },
      {
        onSuccess: () => {
          showToast("Group created");
          onClose();
        },
      }
    );
  });

  return (
    <Modal
      title="Create a group"
      subtitle="Groups keep expenses and balances scoped to the right people."
      headerClassName="bg-ft-pink"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Group name</Label>
          <Input id="name" placeholder="Portugal Trip" {...register("name")} />
          <FieldError>{errors.name?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" {...register("type")}>
            {GROUP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Members</Label>
          <p className="mb-2 text-xs font-medium text-ft-muted">
            You&apos;re added automatically. Inviting people by email needs an email provider key,
            so pick from existing members for now.
          </p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((user) => {
              const selected = memberIds.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setValue(
                      "memberIds",
                      selected ? memberIds.filter((id) => id !== user.id) : [...memberIds, user.id]
                    )
                  }
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border-2 border-ft-ink py-1.5 pr-3.5 pl-1.5 text-[13px] font-bold",
                    selected ? "bg-ft-lime shadow-neo-xs" : "bg-white opacity-70"
                  )}
                >
                  <Avatar user={user} size="xs" />
                  {user.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createGroup.isPending}>
            {createGroup.isPending ? "Creating…" : "Create group"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
