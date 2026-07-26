import { DashboardView } from "@/components/dashboard/dashboard-view";

// Data is prefetched and dehydrated in `app/(app)/layout.tsx` — the shell reads
// the same bootstrap query, so prefetching per-page would leave it outside the
// hydration boundary and it would fetch again anyway.
export default function DashboardPage() {
  return <DashboardView />;
}
