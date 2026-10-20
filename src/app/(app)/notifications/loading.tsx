import { Skeleton } from "@/components/skeleton";

// Grey rows in the shape of the list while it loads (11-screens-and-ux.md rule 5).
export default function NotificationsLoading() {
  return (
    <div aria-busy="true" className="flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <Skeleton className="h-[34px] w-56 bg-secondary" />
      <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 px-4 py-3 sm:px-6">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
