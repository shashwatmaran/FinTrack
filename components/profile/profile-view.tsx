"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/common/loading";
import { ACCENT_BG } from "@/lib/accent";
import { cn } from "@/lib/utils";
import { useCurrentUser, useExpenses, useGroups } from "@/hooks/use-fintrack-data";
import { useUiStore } from "@/stores/ui-store";

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs font-medium text-ft-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative h-7 w-13 flex-none cursor-pointer rounded-full border-2 border-ft-ink",
        on ? "bg-ft-lime" : "bg-ft-line"
      )}
    >
      <span
        className={cn(
          "absolute top-[1px] h-[21px] w-[21px] rounded-full border-2 border-ft-ink bg-white transition-all",
          on ? "left-[26px]" : "left-[2px]"
        )}
      />
    </button>
  );
}

export function ProfileView() {
  const showToast = useUiStore((s) => s.showToast);
  const openModal = useUiStore((s) => s.openModal);

  const { data: currentUser } = useCurrentUser();
  const { data: groups = [] } = useGroups();
  const { data: expenses = [] } = useExpenses();

  const [notifications, setNotifications] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);

  if (!currentUser) return <PageSkeleton />;

  const myGroups = groups.filter((g) => g.memberIds.includes(currentUser.id));
  const myExpenses = expenses.filter((e) => e.splits.some((s) => s.userId === currentUser.id));

  return (
    <div className="mx-auto flex max-w-[760px] animate-ft-slide flex-col gap-4.5">
      <Card className="flex flex-wrap items-center gap-5 shadow-neo-md">
        <span
          className={cn(
            "flex h-21 w-21 flex-none items-center justify-center rounded-xl border-[3px] border-ft-ink text-[32px] font-bold shadow-neo",
            ACCENT_BG[currentUser.color]
          )}
        >
          {currentUser.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[26px] font-bold tracking-[-0.5px]">{currentUser.name}</p>
          <p className="truncate text-sm font-medium text-ft-muted">{currentUser.email}</p>
          <p className="mt-1.5 text-[12.5px] font-semibold text-ft-muted">
            {myGroups.length} active groups · {myExpenses.length} expenses
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="accent"
            onClick={() => showToast("Profile editing arrives with the user API")}
          >
            Edit profile
          </Button>
          <Button variant="secondary" onClick={() => signOut({ callbackUrl: "/signin" })}>
            <LogOut size={16} strokeWidth={2.4} />
            Sign out
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-4">Preferences</CardTitle>
        <div className="flex flex-col gap-4">
          <Row title="Notifications" description="Expense adds, reminders, requests">
            <Toggle
              on={notifications}
              label="Toggle notifications"
              onClick={() => setNotifications((v) => !v)}
            />
          </Row>
          <div className="h-[1.5px] bg-ft-line" />
          <Row
            title="Currency"
            description="FinTrack is single-currency — every amount is in rupees"
          >
            <Pill className="bg-ft-line">₹ INR</Pill>
          </Row>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-4">Security</CardTitle>
        <div className="flex flex-col gap-4">
          <Row title="Password" description="Last changed 3 months ago">
            <Button variant="purple" size="sm" onClick={() => openModal({ type: "change-password" })}>
              Change
            </Button>
          </Row>
          <div className="h-[1.5px] bg-ft-line" />
          <Row
            title="Two-factor authentication"
            description={`Extra security at sign-in · ${twoFactor ? "on" : "off"}`}
          >
            <Toggle
              on={twoFactor}
              label="Toggle two-factor authentication"
              onClick={() => setTwoFactor((v) => !v)}
            />
          </Row>
        </div>
      </Card>

      <Card className="border-dashed">
        <CardTitle>Connected services</CardTitle>
        <p className="mt-1.5 text-[13px] leading-[1.5] font-medium text-ft-muted">
          Email delivery, OAuth sign-in, file storage, error reporting, and model-generated insights
          are all wired behind environment variables and stay disabled until their keys are
          configured. Everything else on this screen works against local state today.
        </p>
      </Card>
    </div>
  );
}
