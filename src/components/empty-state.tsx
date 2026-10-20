import Link from "next/link";

import { HexagonCluster } from "@/components/hexagons";
import type { IconName } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";

// The empty page, a brand moment (docs/design-system.md, "Empty page"; 11-screens-and-ux.md
// rule 12: "An empty list explains what belongs there and offers the button to create it"). In
// the page's white panel: a Bitter title that says what is missing, one short line, the first
// action as a primary button and at most one quiet second action; at the right the hexagon
// drawing, hidden at phone width. Every text comes from the message files.

export type EmptyStateAction =
  | { label: string; href: string; icon?: IconName }
  | { label: string; onClick: () => void; icon?: IconName };

function ActionButton({ action, quiet }: { action: EmptyStateAction; quiet: boolean }) {
  const variant = quiet ? "ghost" : "default";
  if ("href" in action) {
    return (
      <Link href={action.href} className={buttonVariants({ variant })}>
        {action.label}
      </Link>
    );
  }
  return (
    <Button variant={variant} icon={action.icon} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  title,
  line,
  action,
  quietAction,
  className,
}: {
  title: string;
  line: string;
  action?: EmptyStateAction;
  quietAction?: EmptyStateAction;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex items-center justify-between gap-6 rounded-xl bg-card p-6 text-card-foreground",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <h2 className="font-slab text-title text-balance sm:text-[40px] sm:leading-[44px]">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{line}</p>
        {(action || quietAction) && (
          <div className="mt-3 flex flex-wrap gap-3">
            {action && <ActionButton action={action} quiet={false} />}
            {quietAction && <ActionButton action={quietAction} quiet />}
          </div>
        )}
      </div>
      <HexagonCluster className="hidden sm:block" />
    </section>
  );
}
