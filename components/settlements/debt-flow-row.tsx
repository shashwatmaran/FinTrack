import { MoveRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatCurrency } from "@/lib/format";
import type { AppUser, DebtFlow } from "@/lib/types";

export function DebtFlowRow({
  flow,
  from,
  to,
  action,
}: {
  flow: DebtFlow;
  from?: AppUser;
  to?: AppUser;
  action?: React.ReactNode;
}) {
  if (!from || !to) return null;

  return (
    <div className="flex items-center gap-4 rounded-xl border-[2.5px] border-ft-ink bg-white px-4 py-4 shadow-neo">
      <div className="flex flex-col items-center gap-1.5">
        <Avatar user={from} size="lg" />
        <span className="text-xs font-bold">{from.name.split(" ")[0]}</span>
      </div>
      <div className="flex flex-1 flex-col items-center gap-1">
        <span className="text-[17px] font-bold">{formatCurrency(flow.amount)}</span>
        <MoveRight size={28} strokeWidth={2.4} className="w-full max-w-30" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <Avatar user={to} size="lg" />
        <span className="text-xs font-bold">{to.name.split(" ")[0]}</span>
      </div>
      {action}
    </div>
  );
}
