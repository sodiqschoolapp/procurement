import { Skeleton } from "@/components/skeleton";

// Grey shapes of the Analytics page while it loads (11-screens-and-ux.md rule 5).
export default function AnalyticsLoading() {
  return (
    <div aria-busy="true" className="flex w-full min-w-0 flex-col gap-6">
      <Skeleton className="h-[34px] w-56 bg-secondary" />
      <Skeleton className="h-20 w-full bg-card" />
      <Skeleton className="h-28 w-full bg-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 w-full bg-card" />
        <Skeleton className="h-96 w-full bg-card" />
      </div>
    </div>
  );
}
