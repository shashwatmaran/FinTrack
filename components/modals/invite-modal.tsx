"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { useCurrentUser, useGroups } from "@/hooks/use-fintrack-data";

const schema = z.object({
  groupId: z.string().min(1, "Pick a group"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
});

type Values = z.infer<typeof schema>;

export function InviteModal({
  defaultGroupId,
  onClose,
}: {
  defaultGroupId?: string;
  onClose: () => void;
}) {
  const { data: currentUser } = useCurrentUser();
  const { data: groups = [] } = useGroups();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const mine = groups.filter((g) => !currentUser || g.memberIds.includes(currentUser.id));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      groupId: mine.find((g) => g.id === defaultGroupId)?.id ?? mine[0]?.id ?? "",
      email: "",
    },
  });

  const onSubmit = handleSubmit(async ({ groupId, email }) => {
    setFormError(null);
    try {
      await api.inviteToGroup(groupId, email);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Couldn't send that invite.");
      return;
    }
    setSentTo(email);
  });

  if (mine.length === 0) {
    return (
      <Modal title="Invite people" headerClassName="bg-ft-pink" onClose={onClose}>
        <p className="text-sm font-semibold text-ft-muted">
          Create a group first — invitations are always to a specific one.
        </p>
      </Modal>
    );
  }

  if (sentTo) {
    return (
      <Modal title="Invite sent" headerClassName="bg-ft-lime" onClose={onClose}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-lime">
            <CheckCircle2 size={18} strokeWidth={2.3} />
          </span>
          <p className="text-sm leading-[1.5] font-medium">
            <span className="font-bold">{sentTo}</span> has a link to join. It works for seven
            days, and they&apos;ll need a FinTrack account to use it.
          </p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Invite people"
      subtitle="They'll get a link to join this group."
      headerClassName="bg-ft-pink"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p className="rounded-[10px] border-2 border-ft-ink bg-ft-red px-3.5 py-3 text-[13px] font-bold">
            {formError}
          </p>
        )}

        <div>
          <Label htmlFor="groupId">Group</Label>
          <Select id="groupId" {...register("groupId")}>
            {mine.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <FieldError>{errors.groupId?.message}</FieldError>
        </div>

        <div>
          <Label htmlFor="email">Their email</Label>
          <Input id="email" type="email" placeholder="jordan@example.com" {...register("email")} />
          <FieldError>{errors.email?.message}</FieldError>
        </div>

        <p className="text-[12.5px] leading-[1.5] font-medium text-ft-muted">
          Joining lets them see every expense and balance in this group, including yours.
        </p>

        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="pink" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
