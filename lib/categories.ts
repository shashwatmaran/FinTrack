import {
  Utensils,
  Car,
  Home,
  Clapperboard,
  ShoppingBag,
  Plane,
  Zap,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react";
import type { AccentToken, ExpenseCategory } from "./types";

export const CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; icon: LucideIcon; color: AccentToken }
> = {
  food: { label: "Food", icon: Utensils, color: "ft-yellow" },
  transport: { label: "Transport", icon: Car, color: "ft-sky" },
  housing: { label: "Housing", icon: Home, color: "ft-pink" },
  entertainment: { label: "Entertainment", icon: Clapperboard, color: "ft-purple" },
  shopping: { label: "Shopping", icon: ShoppingBag, color: "ft-green" },
  travel: { label: "Travel", icon: Plane, color: "ft-sky" },
  utilities: { label: "Utilities", icon: Zap, color: "ft-red" },
  other: { label: "Other", icon: CircleDollarSign, color: "ft-lime" },
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as ExpenseCategory,
  label: meta.label,
}));
