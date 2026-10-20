import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";

// One list of a home page (10-notifications-analytics-reports.md, Home page per role: "Each list
// on a home page shows counts and group rows, with a link to the filtered order list"): a panel
// with its title, the count, its content and the way to the list (docs/design-system.md, This
// app, Home: "What the person must do now comes first, each item with its action; sections with
// nothing in them are hidden"). A block that holds nothing is not drawn: the page shows one calm
// empty state when all of them hold nothing. A block that waits on the person carries the orange
// "now" marker beside its title. Every text comes from the caller, from the message files.

export function HomeBlock({
  id,
  title,
  count,
  link,
  hidden = false,
  now = false,
  children,
  className,
}: {
  id: string;
  title: string;
  /** The count beside the title; none for a block of amounts. */
  count?: number;
  /** The filtered list behind the block. */
  link?: { href: string; label: string };
  /** The block holds nothing: it is not drawn. */
  hidden?: boolean;
  /** The block waits on the person: the orange marker beside its title. */
  now?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  if (hidden) return null;
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-home-block={id}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2
          id={`${id}-title`}
          className="flex min-w-0 items-center gap-2 text-subheading font-semibold"
        >
          {now && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand" />}
          {title}
          {count !== undefined && (
            <span
              data-home-count
              className="rounded-full bg-accent px-2 text-xs leading-5 font-medium tabular-nums"
            >
              {count}
            </span>
          )}
        </h2>
        {link && (
          <Link
            href={link.href}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "-mx-2 text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
            <Icon name="chevron_right" size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
