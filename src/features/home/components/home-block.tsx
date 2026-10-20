import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/utils";

// One list of a home page (10-notifications-analytics-reports.md, Home page per role: "Each list
// on a home page shows counts and group rows, with a link to the filtered order list"): a white
// panel with its section title, the count as a plain number (docs/design-system.md, "What we never
// do" 4), its content, and the link. An empty list says in one line what belongs there (11 rule
// 12). Every text comes from the caller, from the message files.

export function HomeBlock({
  id,
  title,
  count,
  link,
  empty,
  children,
  className,
}: {
  id: string;
  title: string;
  /** The count beside the title; none for a block of amounts. */
  count?: number;
  /** The filtered list behind the block. */
  link?: { href: string; label: string };
  /** The line shown instead of the content when the block holds nothing. */
  empty?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-home-block={id}
      className={cn("flex flex-col gap-4 rounded-xl bg-card p-6 max-sm:p-4", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-title`} className="text-subheading font-semibold">
          {title}
        </h2>
        {count !== undefined && (
          <span data-home-count className="text-subheading font-semibold tabular-nums">
            {count}
          </span>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        children
      )}
      {link && !empty && (
        <Link
          href={link.href}
          className="inline-flex min-h-11 min-w-11 items-center self-start text-sm font-semibold text-foreground underline-offset-2 hover:underline sm:min-h-0"
        >
          {link.label}
        </Link>
      )}
    </section>
  );
}
