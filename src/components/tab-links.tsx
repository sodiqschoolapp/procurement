import Link from "next/link";

import { cn } from "@/components/utils";

// Tabs that are links (docs/design-system.md, Parts: "Tabs"): words in a row over a hairline; the
// current tab is navy with a 2 px orange underline, the others muted. A count follows the word as
// a plain number. On a phone the row scrolls sideways inside itself, so the page never does. Each
// tab is a link, so the address keeps the view (11-screens-and-ux.md rule 8).

export type TabLink = {
  id: string;
  href: string;
  label: string;
  /** A plain number after the word, or nothing. */
  count?: number | null;
  current: boolean;
};

export function TabLinks({
  label,
  tabs,
  className,
}: {
  /** The name of the row, read by screen readers; a text from the message files. */
  label: string;
  tabs: readonly TabLink[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "-mx-4 [scrollbar-width:none] overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0",
        className,
      )}
    >
      <ul className="flex w-max min-w-full gap-1 sm:gap-2">
        {tabs.map((tab) => (
          <li key={tab.id} className="flex shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              data-tab={tab.id}
              className={cn(
                "relative -mb-px flex h-11 items-center gap-2 px-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-120 ease-out sm:h-10",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                tab.current
                  ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count !== null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs leading-5 font-medium",
                    tab.current ? "bg-sidebar-primary text-foreground" : "bg-accent",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
