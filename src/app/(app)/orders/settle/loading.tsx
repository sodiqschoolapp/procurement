import { Skeleton } from "@/components/skeleton";

// Grey blocks in the shape of the settlement screen while it loads (11-screens-and-ux.md rule 5).
export default function SettlementLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Skeleton className="h-[34px] w-56" />
      {Array.from({ length: 2 }, (_, block) => (
        <div key={block} className="flex flex-col gap-4 rounded-xl bg-card p-4 sm:p-6">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
