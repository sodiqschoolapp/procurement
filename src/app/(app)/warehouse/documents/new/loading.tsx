import { Skeleton } from "@/components/skeleton";

// Grey blocks in the shape of the issue form while it loads (11-screens-and-ux.md rule 5).
export default function NewDocumentLoading() {
  return (
    <div aria-busy="true" className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <Skeleton className="h-[34px] w-56 bg-secondary" />
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[66px] w-full" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
