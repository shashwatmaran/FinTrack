import { Suspense } from "react";
import { ExpensesView } from "@/components/expenses/expenses-view";
import { PageSkeleton } from "@/components/common/loading";

export default function ExpensesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExpensesView />
    </Suspense>
  );
}
