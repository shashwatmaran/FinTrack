/**
 * FinTrack is single-currency: every amount in the system is INR.
 *
 * There is deliberately no per-user currency preference. In a shared-expense
 * app the currency belongs to the money, not to the viewer — a display-only
 * setting would let two members of one group read the same debt as ₹500 and
 * $500. Supporting real multi-currency means a currency per group (or per
 * expense) plus FX rates, which is a data-model change, not a formatting one.
 *
 * Uses the en-IN locale so grouping follows the lakh/crore convention
 * (₹1,23,456.78) rather than ₹123,456.78.
 */
export const CURRENCY = "INR";
export const CURRENCY_LOCALE = "en-IN";

export function formatCurrency(amount: number) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))}`;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(
    new Date(iso)
  );
}

export function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(iso);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
