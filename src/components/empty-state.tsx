import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";

// The empty state (docs/design-system.md, Parts: "Empty state"; 11-screens-and-ux.md rule 12:
// "An empty list explains what belongs there and offers the button to create it"). Inside the
// panel, centred: an outlined icon in the muted colour, a title that says what belongs there, at
// most one short line, the button that creates it and at most one quiet second action. `inline`
// draws it without a panel of its own, for a panel that already holds it. Every text comes from
// the message files.

export type EmptyStateAction =
  | { label: string; href: string; icon?: IconName }
  | { label: string; onClick: () => void; icon?: IconName };

function ActionButton({ action, quiet }: { action: EmptyStateAction; quiet: boolean }) {
  const variant = quiet ? "ghost" : "default";
  if ("href" in action) {
    return (
      <Link href={action.href} className={buttonVariants({ variant })}>
        {action.icon && <Icon name={action.icon} />}
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
  icon = "inbox",
  action,
  quietAction,
  inline = false,
  className,
}: {
  title: string;
  /** One short line, only when it says what belongs here or what to do next. */
  line?: string;
  icon?: IconName;
  action?: EmptyStateAction;
  quietAction?: EmptyStateAction;
  /** Inside a panel that already holds it: no panel of its own. */
  inline?: boolean;
  className?: string;
}) {
  return (
    <section
      data-empty-state
      className={cn(
        "flex flex-col items-center gap-2 px-4 py-10 text-center text-card-foreground sm:py-12",
        !inline && "rounded-xl border border-border bg-card",
        className,
      )}
    >
      <Icon name={icon} size={24} className="mb-1 text-muted-foreground" />
      <h2 className="text-subheading text-balance">{title}</h2>
      {line && <p className="max-w-md text-sm text-balance text-muted-foreground">{line}</p>}
      {(action || quietAction) && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {action && <ActionButton action={action} quiet={false} />}
          {quietAction && <ActionButton action={quietAction} quiet />}
        </div>
      )}
    </section>
  );
}
