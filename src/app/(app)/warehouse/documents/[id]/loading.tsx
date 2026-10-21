import { Skeleton } from "@/components/skeleton";

// Grey blocks in the shape of a write-off's page while it loads (11-screens-and-ux.md rule 5).
export default function WriteOffLoading() {
  return (
    <div aria-busy="true" className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <Skeleton className="h-[34px] w-72 bg-secondary" />
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-40" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Skeleton className="h-6 w-24" />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="ml-auto h-5 w-16" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
