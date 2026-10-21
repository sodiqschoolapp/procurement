import { Skeleton } from "@/components/skeleton";

// Grey blocks in the shape of the order page while it loads (11-screens-and-ux.md rule 5): the
// top block, the stepper, the tabs and the details.
export default function OrderPageLoading() {
  return (
    <div aria-busy="true" className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Skeleton className="h-[34px] w-56" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:p-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="h-11 w-56 bg-muted" />
      <Skeleton className="h-48 w-full bg-card" />
    </div>
  );
}
