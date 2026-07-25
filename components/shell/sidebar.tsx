"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCog } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS, PROFILE_NAV } from "./nav-items";
import { ACCENT_BG } from "@/lib/accent";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] flex-none flex-col border-r-[3px] border-ft-ink bg-white px-4 py-5.5 lg:flex">
      <div className="px-1.5 pb-5">
        <Logo compact />
      </div>

      <nav className="flex flex-col gap-1.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14.5px] font-semibold transition-transform",
                active
                  ? cn(
                      "border-2 border-ft-ink shadow-neo-xs",
                      ACCENT_BG[item.activeColor]
                    )
                  : "border-2 border-transparent hover:bg-ft-line"
              )}
            >
              <item.icon size={19} strokeWidth={2.2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-1.5 my-4 h-[2.5px] rounded-sm bg-ft-ink" />

      <Link
        href={PROFILE_NAV.href}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14.5px] font-semibold",
          isActive(pathname, PROFILE_NAV.href)
            ? "border-2 border-ft-ink bg-ft-lime shadow-neo-xs"
            : "border-2 border-transparent hover:bg-ft-line"
        )}
      >
        <UserCog size={19} strokeWidth={2.2} />
        {PROFILE_NAV.label}
      </Link>

      <div className="mt-auto rounded-lg border-[2.5px] border-ft-ink bg-ft-purple px-3.5 py-3 shadow-neo-sm">
        <p className="text-[13px] font-bold">Go Premium</p>
        <p className="mt-0.5 text-[11.5px] leading-[1.35]">
          Unlimited groups &amp; smart AI budgets.
        </p>
      </div>
    </aside>
  );
}
