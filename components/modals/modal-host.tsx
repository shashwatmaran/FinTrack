"use client";

import { useUiStore } from "@/stores/ui-store";
import { AddExpenseModal } from "./add-expense-modal";
import { CreateGroupModal } from "./create-group-modal";
import { ExpenseDetailModal } from "./expense-detail-modal";
import { SettleUpModal } from "./settle-up-modal";
import { PlaceholderModal } from "./placeholder-modal";

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
      return (
        <PlaceholderModal
          title="Invite people"
          headerClassName="bg-ft-pink"
          onClose={closeModal}
          reason="Invitations are sent by email, so this flow unlocks once a transactional email provider key is configured."
          detail="Until then, seeded members are already available when you create a group."
        />
      );
    case "export":
      return (
        <PlaceholderModal
          title="Export expenses"
          headerClassName="bg-ft-sky"
          onClose={closeModal}
          reason="CSV and PDF exports are generated server-side and written to blob storage, which needs storage credentials."
          detail="The expense list itself is fully queryable in the app today."
        />
      );
    case "change-password":
      return (
        <PlaceholderModal
          title="Change password"
          headerClassName="bg-ft-purple"
          onClose={closeModal}
          reason="Password changes write to the user record through Auth.js, which is pending the auth secret and database connection."
          detail="Sign-in currently runs against a local placeholder session."
        />
      );
    default:
      return null;
  }
}
