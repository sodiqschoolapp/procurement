import { Skeleton } from "@/components/skeleton";

// Grey shapes of the Reports page while it loads (11-screens-and-ux.md rule 5).
export default function ReportsLoading() {
  return (
    <div aria-busy="true" className="flex w-full min-w-0 flex-col gap-6">
      <Skeleton className="h-[34px] w-56 bg-secondary" />
      <Skeleton className="h-11 w-full max-w-xl bg-secondary" />
      <Skeleton className="h-20 w-full bg-card" />
      <Skeleton className="h-96 w-full bg-card" />
    </div>
  );
}
