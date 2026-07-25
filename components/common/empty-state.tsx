import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-[2.5px] border-ft-ink bg-white px-5 py-14 text-center shadow-neo">
      <Icon size={52} strokeWidth={1.9} className="mx-auto mb-3" />
      <p className="text-[22px] font-bold">{title}</p>
      <p className="mt-1 text-sm font-medium text-ft-muted">{description}</p>
      {action && <div className="mt-4.5 flex justify-center">{action}</div>}
    </div>
  );
}
