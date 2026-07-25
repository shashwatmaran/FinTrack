import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[10px] border-[2.5px] border-ft-ink/20 bg-ft-line",
        className
      )}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1120px] space-y-4.5">
      <div className="grid gap-4.5 md:grid-cols-3">
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-[140px]" />
      </div>
      <Skeleton className="h-[280px]" />
    </div>
  );
}
