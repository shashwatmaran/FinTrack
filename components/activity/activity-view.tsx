"use client";

import { Fragment } from "react";
import { Activity as ActivityIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { PageSkeleton } from "@/components/common/loading";
import { ACCENT_BG } from "@/lib/accent";
import { formatRelativeTime } from "@/lib/format";
import { groupActivityByDay, usersById } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { useActivity, useCurrentUser, useGroups, useUsers } from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

/** Renders `**bold**` segments without dangerouslySetInnerHTML. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

export function ActivityView() {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: groups = [] } = useGroups();
  const { data: items = [] } = useActivity();

  const filter = useUiStore((s) => s.activityGroupFilter);
  const setFilter = useUiStore((s) => s.setActivityGroupFilter);

  if (!currentUser) return <PageSkeleton />;

  const byId = usersById(users);
  const mine = groups.filter((g) => g.memberIds.includes(currentUser.id));
  const filtered = groupActivityByDay(
    items.filter((item) => filter === "all" || item.groupId === filter)
  );

  return (
    <div className="mx-auto max-w-[820px] animate-ft-slide">
      <div className="mb-5.5 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "cursor-pointer rounded-[20px] border-2 border-ft-ink px-4 py-2.5 text-[13.5px] font-bold",
            filter === "all" ? "bg-ft-lime shadow-neo-xs" : "bg-white"
          )}
        >
          All activity
        </button>
        {mine.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => setFilter(group.id)}
            className={cn(
              "cursor-pointer rounded-[20px] border-2 border-ft-ink px-4 py-2.5 text-[13.5px] font-bold",
              filter === group.id ? cn(ACCENT_BG[group.color], "shadow-neo-xs") : "bg-white"
            )}
          >
            {group.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="Nothing here yet"
          description="Activity from your groups will show up here as it happens."
        />
      ) : (
        <div className="flex flex-col gap-6.5">
          {filtered.map((day) => (
            <div key={day.day}>
              <p className="mb-3 text-[13px] font-bold tracking-[0.5px] text-ft-muted uppercase">
                {day.day}
              </p>
              <div className="flex flex-col gap-3">
                {day.items.map((item) => {
                  const actor = byId[item.actorId];
                  const group = groups.find((g) => g.id === item.groupId);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3.5 rounded-[10px] border-[2.5px] border-ft-ink bg-white px-4 py-3.5 shadow-neo-sm"
                    >
                      {actor && <Avatar user={actor} size="sm" />}
                      <span className="min-w-0 flex-1 text-[14.5px] font-medium">
                        <RichText text={item.message} />
                      </span>
                      {group && (
                        <span className="hidden rounded-full border-2 border-ft-ink bg-ft-bg px-2.5 py-1 text-[11px] font-bold whitespace-nowrap sm:inline">
                          {group.name}
                        </span>
                      )}
                      <span className="text-xs font-semibold whitespace-nowrap text-ft-muted">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
