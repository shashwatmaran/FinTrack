"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsPanel } from "./notifications-panel";
import { NAV_ITEMS, PROFILE_NAV } from "./nav-items";
import { Avatar } from "@/components/ui/avatar";
import { CATEGORY_META } from "@/lib/categories";
import { ACCENT_BG } from "@/lib/accent";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useCurrentUser,
  useExpenses,
  useGroups,
  useNotifications,
} from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

function usePageMeta() {
  const pathname = usePathname();
  const { data: groups } = useGroups();

  return useMemo(() => {
    const groupMatch = /^\/groups\/([^/]+)$/.exec(pathname);
    if (groupMatch) {
      const group = groups?.find((g) => g.id === groupMatch[1]);
      return { title: group?.name ?? "Group", crumb: "Groups" };
    }
    const item = [...NAV_ITEMS, PROFILE_NAV].find(
      (nav) => pathname === nav.href || pathname.startsWith(`${nav.href}/`)
    );
    return { title: item?.title ?? "FinTrack", crumb: item?.crumb ?? "" };
  }, [pathname, groups]);
}

export function Topbar() {
  const pathname = usePathname();
  const { title, crumb } = usePageMeta();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const { data: currentUser } = useCurrentUser();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();
  const { data: notifications = [] } = useNotifications();

  const openModal = useUiStore((s) => s.openModal);
  const notificationsOpen = useUiStore((s) => s.notificationsOpen);
  const toggleNotifications = useUiStore((s) => s.toggleNotifications);

  const unread = notifications.filter((n) => !n.read).length;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const groupHits = groups
      .filter((g) => g.name.toLowerCase().includes(q))
      .map((g) => ({
        key: `g-${g.id}`,
        label: g.name,
        sub: `${g.memberIds.length} members`,
        type: "Group",
        href: `/groups/${g.id}`,
        color: g.color,
        icon: null,
      }));
    const expenseHits = expenses
      .filter((e) => e.description.toLowerCase().includes(q))
      .map((e) => ({
        key: `e-${e.id}`,
        label: e.description,
        sub: `${groups.find((g) => g.id === e.groupId)?.name ?? "Group"} · ${formatCurrency(e.amount)}`,
        type: "Expense",
        href: `/expenses?q=${encodeURIComponent(e.description)}`,
        color: CATEGORY_META[e.category].color,
        icon: CATEGORY_META[e.category].icon,
      }));
    return [...groupHits, ...expenseHits].slice(0, 8);
  }, [query, groups, expenses]);

  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-ft-ink bg-ft-bg">
      <div className="flex items-center gap-3 px-5 py-3.5 md:gap-4.5 md:px-7.5">
        <div className="min-w-0 flex-2 shrink overflow-hidden">
          <p className="truncate text-xs font-semibold text-ft-muted">{crumb}</p>
          <h1 className="truncate text-2xl leading-[1.1] font-bold tracking-[-0.5px]">{title}</h1>
        </div>

        <div className="relative hidden min-w-30 flex-1 sm:block sm:max-w-[230px]">
          <Search
            size={16}
            strokeWidth={2.4}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ft-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
            placeholder="Search expenses, groups…"
            aria-label="Search expenses and groups"
            className="w-full rounded-lg border-2 border-ft-ink bg-white py-2.5 pr-3 pl-8.5 text-[13.5px] font-medium outline-none focus:shadow-neo-xs"
          />
          {searchFocused && query.trim() && (
            <div className="absolute top-[calc(100%+8px)] left-0 z-60 w-[340px] max-w-[80vw] overflow-hidden rounded-[10px] border-[2.5px] border-ft-ink bg-white shadow-neo-md">
              {results.length === 0 ? (
                <p className="px-4 py-5.5 text-center text-[13px] font-semibold text-ft-muted">
                  No matches for &ldquo;{query}&rdquo;
                </p>
              ) : (
                <div className="ft-scroll max-h-[340px] overflow-auto">
                  {results.map((r) => (
                    <Link
                      key={r.key}
                      href={r.href}
                      onMouseDown={() => setQuery("")}
                      className="flex items-center gap-2.5 border-b-[1.5px] border-ft-line px-3.5 py-2.5 hover:bg-ft-paper"
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 flex-none items-center justify-center rounded-[7px] border-2 border-ft-ink",
                          ACCENT_BG[r.color]
                        )}
                      >
                        {r.icon ? <r.icon size={15} strokeWidth={2.3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold">{r.label}</span>
                        <span className="block text-[11.5px] font-medium text-ft-muted">
                          {r.sub}
                        </span>
                      </span>
                      <span className="rounded-full border-[1.5px] border-ft-ink bg-ft-line px-2 py-0.5 text-[10px] font-bold">
                        {r.type}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative flex-none">
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleNotifications}
            aria-label={`Notifications, ${unread} unread`}
            className="border-2"
          >
            <Bell size={19} strokeWidth={2.2} />
            {unread > 0 && (
              <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ft-ink bg-ft-red px-1 text-[11px] font-bold text-white">
                {unread}
              </span>
            )}
          </Button>
          {notificationsOpen && <NotificationsPanel />}
        </div>

        <Button
          onClick={() => openModal({ type: "add-expense" })}
          className="flex-none max-md:px-3"
        >
          <Plus size={17} strokeWidth={3} />
          <span className="max-md:hidden">Add Expense</span>
        </Button>

        {currentUser && (
          <Link href="/profile" aria-label="Profile and settings" className="flex-none">
            <Avatar user={currentUser} size="lg" className="rounded-lg shadow-neo-sm" />
          </Link>
        )}
      </div>

      <nav className="ft-scroll flex gap-2 overflow-x-auto border-t-2 border-ft-ink/15 px-5 py-2 lg:hidden">
        {[...NAV_ITEMS, PROFILE_NAV].map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-none rounded-full border-2 border-ft-ink px-3 py-1.5 text-xs font-bold whitespace-nowrap",
                active ? ACCENT_BG[item.activeColor] : "bg-white"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
