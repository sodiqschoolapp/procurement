import { cn } from "@/components/utils";

/**
 * A grey placeholder in the shape of the content while it loads (11-screens-and-ux.md rule 5:
 * "never a full-page spinner"). It stays still: nothing moves on its own (docs/design-system.md,
 * Motion). The caller gives the size and marks the loading area `aria-busy`.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-lg bg-accent", className)} />;
}
