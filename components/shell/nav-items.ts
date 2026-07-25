import {
  Activity,
  ArrowLeftRight,
  CreditCard,
  LayoutDashboard,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AccentToken } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  activeColor: AccentToken;
  /** Page heading shown in the topbar. */
  title: string;
  crumb: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    activeColor: "ft-lime",
    title: "Dashboard",
    crumb: "Overview",
  },
  {
    href: "/groups",
    label: "Groups",
    icon: Users,
    activeColor: "ft-sky",
    title: "Groups",
    crumb: "Your shared spaces",
  },
  {
    href: "/expenses",
    label: "Expenses",
    icon: CreditCard,
    activeColor: "ft-yellow",
    title: "Expenses",
    crumb: "Everything you've split",
  },
  {
    href: "/settlements",
    label: "Settlements",
    icon: ArrowLeftRight,
    activeColor: "ft-pink",
    title: "Settlements",
    crumb: "Who owes whom",
  },
  {
    href: "/insights",
    label: "AI Insights",
    icon: Sparkles,
    activeColor: "ft-purple",
    title: "AI Insights",
    crumb: "Spending patterns",
  },
  {
    href: "/activity",
    label: "Activity",
    icon: Activity,
    activeColor: "ft-green",
    title: "Activity",
    crumb: "Recent events",
  },
];

export const PROFILE_NAV: NavItem = {
  href: "/profile",
  label: "Profile & Settings",
  icon: Users,
  activeColor: "ft-lime",
  title: "Profile & Settings",
  crumb: "Your account",
};
