import { Skeleton } from "@/components/skeleton";

// Grey blocks in the shape of Money with managers while it loads (11-screens-and-ux.md rule 5).
export default function MoneyLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Skeleton className="h-[34px] w-64" />
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
