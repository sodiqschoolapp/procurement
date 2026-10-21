import { Skeleton } from "@/components/skeleton";

// Grey blocks in the shape of the purchase form while it loads (11-screens-and-ux.md rule 5).
export default function PurchaseFormLoading() {
  return (
    <div aria-busy="true" className="flex w-full min-w-0 flex-col gap-6">
      <Skeleton className="h-[34px] w-56" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <Skeleton className="h-48 w-full bg-card" />
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
