import { Skeleton } from "@/components/skeleton";

// Grey rows in the shape of the drafts grid while it loads (11-screens-and-ux.md rule 5).
export default function OrdersLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <Skeleton className="h-[34px] w-48 bg-secondary" />
      <div className="flex flex-col gap-px overflow-hidden rounded-xl bg-card">
        <Skeleton className="h-9 w-full rounded-none bg-muted" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="size-10" />
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="hidden h-10 w-24 sm:block" />
            <Skeleton className="hidden h-10 w-28 sm:block" />
          </div>
        ))}
      </div>
      <Skeleton className="h-32 w-full bg-card" />
    </div>
  );
}
