import { MARK_PATH, MARK_VIEWBOX, BRAND_INK } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex flex-none items-center justify-center rounded-[9px] border-[2.5px] border-ft-ink shadow-neo-sm",
          compact ? "h-[38px] w-[38px] bg-ft-lime" : "h-11 w-11 bg-white"
        )}
      >
        {/* Same path the favicon draws — see lib/brand.ts. */}
        <svg
          width={compact ? 20 : 23}
          height={compact ? 20 : 23}
          viewBox={MARK_VIEWBOX}
          fill="none"
          stroke={BRAND_INK}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={MARK_PATH} />
        </svg>
      </span>
      <span
        className={cn(
          "font-bold tracking-[-0.5px]",
          compact ? "text-[22px]" : "text-[26px]"
        )}
      >
        FinTrack
      </span>
    </div>
  );
}
