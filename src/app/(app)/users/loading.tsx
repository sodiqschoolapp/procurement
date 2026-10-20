import { Skeleton } from "@/components/skeleton";

// Grey rows in the shape of the user list while it loads (11-screens-and-ux.md rule 5; plan of 9.2).
export default function UsersLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Skeleton className="h-[34px] w-56 bg-secondary" />
      <Skeleton className="h-11 w-full bg-card sm:w-[36rem]" />
      <div className="flex flex-col gap-px overflow-hidden rounded-xl bg-card">
        <Skeleton className="h-9 w-full rounded-none bg-muted" />
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="hidden h-5 w-24 sm:block" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
