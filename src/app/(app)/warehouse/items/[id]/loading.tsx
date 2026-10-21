import { Skeleton } from "@/components/skeleton";

// Grey rows in the shape of the item card while it loads (11-screens-and-ux.md rule 5).
export default function ItemCardLoading() {
  return (
    <div aria-busy="true" className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32 bg-secondary" />
        <Skeleton className="h-[34px] w-64 bg-secondary" />
        <Skeleton className="h-5 w-72 bg-secondary" />
      </div>
      <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-card">
        <Skeleton className="h-9 w-full rounded-none bg-muted" />
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="hidden h-5 w-28 sm:block" />
            <Skeleton className="ml-auto h-5 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
