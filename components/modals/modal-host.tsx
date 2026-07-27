"use client";

import { useUiStore } from "@/stores/ui-store";
import { AddExpenseModal } from "./add-expense-modal";
import { ChangePasswordModal } from "./change-password-modal";
import { CreateGroupModal } from "./create-group-modal";
import { ExpenseDetailModal } from "./expense-detail-modal";
import { InviteModal } from "./invite-modal";
import { SettleUpModal } from "./settle-up-modal";

export function ModalHost() {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);

  if (!modal) return null;

  switch (modal.type) {
    case "add-expense":
      return <AddExpenseModal defaultGroupId={modal.groupId} onClose={closeModal} />;
    case "create-group":
      return <CreateGroupModal onClose={closeModal} />;
    case "expense-detail":
      return <ExpenseDetailModal expenseId={modal.expenseId} onClose={closeModal} />;
    case "settle-up":
      return (
        <SettleUpModal
          defaultToUserId={modal.toUserId}
          defaultGroupId={modal.groupId}
          onClose={closeModal}
        />
      );
    case "invite":
      return <InviteModal defaultGroupId={modal.groupId} onClose={closeModal} />;
    case "change-password":
      return <ChangePasswordModal onClose={closeModal} />;
    default:
      return null;
  }
}
