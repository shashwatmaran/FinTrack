"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/ui/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading";
import { ACCENT_BG } from "@/lib/accent";
import { formatCurrency } from "@/lib/format";
import { groupNetForUser, usersById } from "@/lib/selectors";
import type { GroupType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useExpenses,
  useGroups,
  useSettlements,
  useUsers,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

const TABS: { value: GroupType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "trip", label: "Trips" },
  { value: "home", label: "Home" },
  { value: "friends", label: "Friends" },
  { value: "couple", label: "Couple" },
];

const TYPE_LABEL: Record<GroupType, string> = {
  trip: "Trip",
  home: "Home",
  couple: "Couple",
  friends: "Friends",
  other: "Other",
};

export function GroupsView() {
  const [tab, setTab] = useState<GroupType | "all">("all");
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();
  const { data: settlements = [] } = useSettlements();
  const openModal = useUiStore((s) => s.openModal);

  if (!currentUser) return <PageSkeleton />;

  const byId = usersById(users);
  const mine = groups.filter((g) => g.memberIds.includes(currentUser.id));
  const visible = tab === "all" ? mine : mine.filter((g) => g.type === tab);

  return (
    <div className="mx-auto max-w-[1120px] animate-ft-slide">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex flex-wrap gap-2.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "cursor-pointer rounded-[20px] border-2 border-ft-ink px-4 py-2.5 text-[13.5px] font-bold transition-transform hover:-translate-x-px hover:-translate-y-px",
                tab === t.value ? "bg-ft-lime shadow-neo-xs" : "bg-white"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={() => openModal({ type: "invite" })}>
            <UserPlus size={16} strokeWidth={2.4} />
            Invite
          </Button>
          <Button onClick={() => openModal({ type: "create-group" })}>
            <Plus size={16} strokeWidth={3} />
            Create Group
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups here yet"
          description="Create a group to start splitting expenses with people."
          action={
            <Button onClick={() => openModal({ type: "create-group" })} size="lg">
              Create Group
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((group) => {
            const net = groupNetForUser(currentUser.id, group, expenses, settlements);
            const count = expenses.filter((e) => e.groupId === group.id).length;
            return (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="overflow-hidden rounded-[10px] border-[2.5px] border-ft-ink bg-white shadow-neo transition-transform hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-neo-lg"
              >
                <div className={cn("h-3", ACCENT_BG[group.color])} />
                <div className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="text-[17px] leading-tight font-bold">{group.name}</span>
                    <span className="flex-none text-[10.5px] font-bold text-ft-muted">
                      {TYPE_LABEL[group.type]}
                    </span>
                  </div>
                  <div className="mb-3.5 flex items-center gap-2">
                    <AvatarStack
                      users={group.memberIds
                        .map((id) => byId[id])
                        .filter((u): u is NonNullable<typeof u> => Boolean(u))}
                    />
                    <span className="text-xs font-semibold text-ft-muted">
                      {group.memberIds.length} members · {count} expenses
                    </span>
                  </div>
                  <span
                    className={cn(
                      "inline-block rounded-[7px] border-2 border-ft-ink px-3 py-1.5 text-[12.5px] font-bold",
                      net > 0 ? "bg-ft-green" : net < 0 ? "bg-ft-red" : "bg-ft-line"
                    )}
                  >
                    {net === 0
                      ? "All settled"
                      : net > 0
                        ? `You're owed ${formatCurrency(net)}`
                        : `You owe ${formatCurrency(Math.abs(net))}`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
