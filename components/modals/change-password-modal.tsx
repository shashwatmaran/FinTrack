"use client";

import { useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-fintrack-data";

/**
 * Changing a password goes through the same emailed link as resetting one.
 *
 * The alternative — a form asking for the current password — sounds stronger
 * but is not: it changes the credential from inside a session that may itself
 * be the thing that was stolen. Sending the link proves control of the mailbox,
 * which is the account's real root of trust.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { data: currentUser } = useCurrentUser();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async () => {
    if (!currentUser) return;
    setPending(true);
    setFailed(false);
    try {
      await api.requestPasswordReset(currentUser.email);
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <Modal title="Check your email" headerClassName="bg-ft-lime" onClose={onClose}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-lime">
            <CheckCircle2 size={18} strokeWidth={2.3} />
          </span>
          <div>
            <p className="text-sm leading-[1.5] font-medium">
              A link is on its way to{" "}
              <span className="font-bold">{currentUser?.email}</span>. It expires in 30 minutes
              and can only be used once.
            </p>
            <p className="mt-2 text-[13px] leading-[1.5] font-medium text-ft-muted">
              Using it signs out every device, including this one.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Change password"
      subtitle="We'll email you a link to set a new one."
      headerClassName="bg-ft-purple"
      onClose={onClose}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-line">
          <Mail size={18} strokeWidth={2.3} />
        </span>
        <p className="text-sm leading-[1.5] font-medium">
          Sending a link to <span className="font-bold">{currentUser?.email}</span> proves you
          control the mailbox, which is what actually secures the account.
        </p>
      </div>

      {failed && (
        <p className="mt-4 rounded-[10px] border-2 border-ft-ink bg-ft-red px-3.5 py-3 text-[13px] font-bold">
          Couldn&apos;t send that just now. Try again in a moment.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="purple" onClick={send} disabled={pending || !currentUser}>
          {pending ? "Sending…" : "Send link"}
        </Button>
      </div>
    </Modal>
  );
}
