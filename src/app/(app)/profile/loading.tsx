import { Skeleton } from "@/components/skeleton";

// Grey fields in the shape of the profile while it loads (11-screens-and-ux.md rule 5; plan of 9.2).
export default function ProfileLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Skeleton className="h-[34px] w-56 bg-secondary" />
      <div className="flex flex-col gap-5 rounded-xl bg-card p-6">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
