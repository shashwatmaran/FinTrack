import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared presentation for the error and not-found boundaries.
 *
 * Deliberately free of hooks and data fetching: this renders when something
 * else has already failed, so anything it depends on is another thing that can
 * break on the way to showing the user why the app broke.
 */
export function ErrorScreen({
  icon: Icon,
  code,
  title,
  description,
  detail,
  actions,
  accent = "bg-ft-yellow",
  contained = false,
}: {
  icon: LucideIcon;
  code?: string;
  title: string;
  description: string;
  detail?: string;
  actions?: React.ReactNode;
  accent?: string;
  /** Set when rendering inside the app shell, so the nav stays usable. */
  contained?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-6",
        contained ? "py-6" : "min-h-screen bg-ft-bg py-12"
      )}
    >
      <div className="w-full max-w-[520px] animate-ft-slide rounded-xl border-[2.5px] border-ft-ink bg-white px-6 py-10 text-center shadow-neo-lg">
        <span
          className={cn(
            "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border-[2.5px] border-ft-ink shadow-neo-sm",
            accent
          )}
        >
          <Icon size={30} strokeWidth={2.2} />
        </span>

        {code && (
          <p className="mb-1 text-[13px] font-bold tracking-[0.18em] text-ft-muted uppercase">
            {code}
          </p>
        )}
        <h1 className="text-[26px] leading-tight font-bold">{title}</h1>
        <p className="mx-auto mt-2 max-w-[400px] text-sm font-medium text-ft-muted">
          {description}
        </p>

        {detail && (
          <p className="mt-4 rounded-lg border-2 border-ft-line bg-ft-paper px-3 py-2 font-mono text-[11.5px] break-all text-ft-muted">
            {detail}
          </p>
        )}

        {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
