"use client";

import { useEffect, useRef } from "react";
import { useMarkNotificationsRead, useNotifications } from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const closeNotifications = useUiStore((s) => s.closeNotifications);
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationsRead();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeNotifications();
    };
    // Defer so the toggle click that opened the panel doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onClick);
    };
  }, [closeNotifications]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div
      ref={ref}
      className="absolute top-[calc(100%+10px)] right-0 z-60 w-[340px] max-w-[85vw] animate-ft-pop overflow-hidden rounded-xl border-[3px] border-ft-ink bg-white shadow-neo-md"
    >
      <div className="flex items-center justify-between gap-3 border-b-[2.5px] border-ft-ink bg-ft-yellow px-4 py-3">
        <span className="text-[15px] font-bold">Notifications</span>
        <button
          type="button"
          onClick={() => markRead.mutate()}
          disabled={unread === 0 || markRead.isPending}
          className="cursor-pointer text-xs font-bold underline underline-offset-2 disabled:cursor-default disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>
      <div className="ft-scroll max-h-[360px] overflow-auto">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={cn(
              "border-b-[1.5px] border-ft-line px-4 py-3",
              !n.read && "bg-ft-bg"
            )}
          >
            <div className="flex items-start gap-2">
              {!n.read && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-ft-red" />}
              <div className={cn("min-w-0", n.read && "pl-4")}>
                <p className="text-[13.5px] font-bold">{n.title}</p>
                <p className="text-[12px] leading-[1.4] font-medium text-ft-muted">{n.body}</p>
                <p className="mt-1 text-[11px] font-semibold text-ft-muted">
                  {formatRelativeTime(n.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
