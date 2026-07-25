"use client";

import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function PlaceholderModal({
  title,
  reason,
  detail,
  headerClassName,
  onClose,
}: {
  title: string;
  reason: string;
  detail: string;
  headerClassName?: string;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} headerClassName={headerClassName}>
      <div className="flex items-start gap-3.5 rounded-[10px] border-[2.5px] border-ft-ink bg-white p-4 shadow-neo-sm">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border-2 border-ft-ink bg-ft-line">
          <KeyRound size={18} strokeWidth={2.3} />
        </span>
        <div>
          <p className="text-sm leading-[1.5] font-bold">Needs credentials</p>
          <p className="mt-1 text-[13px] leading-[1.5] font-medium text-ft-muted">{reason}</p>
          <p className="mt-2 text-[13px] leading-[1.5] font-medium text-ft-muted">{detail}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Got it
        </Button>
      </div>
    </Modal>
  );
}
