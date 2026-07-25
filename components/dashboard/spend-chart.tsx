import { formatCurrency } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/selectors";

const BAR_COLORS = [
  "bg-ft-sky",
  "bg-ft-lime",
  "bg-ft-yellow",
  "bg-ft-pink",
  "bg-ft-purple",
  "bg-ft-green",
];

export function SpendChart({ points }: { points: MonthlyPoint[] }) {
  const max = Math.max(...points.map((p) => p.amount), 1);

  return (
    <div className="flex h-[170px] items-end gap-3.5 pb-1">
      {points.map((point, i) => (
        <div
          key={point.key}
          className="flex h-full flex-1 flex-col items-center justify-end gap-2"
        >
          <span className="text-[11px] font-bold">
            {point.amount > 0 ? formatCurrency(point.amount).replace(/\.00$/, "") : "—"}
          </span>
          <div
            className={`w-full rounded-t-[5px] border-2 border-ft-ink ${BAR_COLORS[i % BAR_COLORS.length]}`}
            style={{ height: `${Math.max((point.amount / max) * 100, 3)}%` }}
            role="img"
            aria-label={`${point.label}: ${formatCurrency(point.amount)}`}
          />
          <span className="text-[11.5px] font-semibold text-ft-muted">{point.label}</span>
        </div>
      ))}
    </div>
  );
}
