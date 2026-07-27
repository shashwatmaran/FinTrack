"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Copy } from "lucide-react";
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
  const [created, setCreated] = useState<{ email: string; url: string; days: number } | null>(
    null
  );
  const [copied, setCopied] = useState(false);
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
      const { url, expiresInDays } = await api.inviteToGroup(groupId, email);
      setCreated({ email, url, days: expiresInDays });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Couldn't create that invite.");
    }
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the link is on screen to select by hand.
      setCopied(false);
    }
  };

  if (mine.length === 0) {
    return (
      <Modal title="Invite people" headerClassName="bg-ft-pink" onClose={onClose}>
        <p className="text-sm font-semibold text-ft-muted">
          Create a group first — invitations are always to a specific one.
        </p>
      </Modal>
    );
  }

  if (created) {
    return (
      <Modal
        title="Invite link ready"
        subtitle="Send this to them however you like."
        headerClassName="bg-ft-lime"
        onClose={onClose}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-lime">
            <CheckCircle2 size={18} strokeWidth={2.3} />
          </span>
          <p className="text-sm leading-[1.5] font-medium">
            An invite for <span className="font-bold">{created.email}</span> is ready. It works
            for {created.days} days, and they&apos;ll need a FinTrack account to use it.
          </p>
        </div>

        <p
          data-testid="invite-url"
          className="mt-4 rounded-[10px] border-2 border-ft-ink bg-ft-paper px-3.5 py-3 font-mono text-[12px] break-all select-all"
        >
          {created.url}
        </p>

        {/*
          Shown once and never again: only the token's hash is stored, so there
          is no way to look this up later. Losing it means issuing a new invite.
        */}
        <p className="mt-2 text-[12.5px] leading-[1.45] font-medium text-ft-muted">
          Copy it now — this link isn&apos;t recoverable later. Anyone who has it can join the
          group, so send it the way you&apos;d send a password.
        </p>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" onClick={copy}>
            <Copy size={15} strokeWidth={2.4} />
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Invite people"
      subtitle="Creates a link you send them yourself."
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
          {/*
            Recorded on the invite, not used to send anything — it is how you
            tell two outstanding invites apart, and what the group will show as
            pending.
          */}
          <p className="mt-1.5 text-[12px] font-medium text-ft-muted">
            Only used to label the invite. Nothing is emailed.
          </p>
        </div>

        <p className="text-[12.5px] leading-[1.5] font-medium text-ft-muted">
          Joining lets them see every expense and balance in this group, including yours.
        </p>

        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="pink" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create invite link"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
