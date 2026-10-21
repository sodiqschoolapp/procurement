import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/components/utils";

// The summary strip at the top of a list or a home page (docs/design-system.md, Parts: "Summary
// strip"): three or four figures the person acts on, each a caption over a figure, side by side in
// one panel divided by hairlines, two by two on a phone. A figure with a list behind it is a link
// to that list. A figure that needs the person now carries the small orange marker. Every figure is
// the server's; this component adds nothing up.

export type SummaryFigure = {
  id: string;
  label: string;
  value: ReactNode;
  /** A short second line under the figure: an amount or a count. */
  note?: ReactNode;
  href?: string;
  /** Needs the person now: the orange marker beside the caption. */
  now?: boolean;
};

export function SummaryStrip({
  label,
  figures,
  className,
}: {
  /** The name of the strip, read by screen readers. */
  label: string;
  figures: readonly SummaryFigure[];
  className?: string;
}) {
  if (figures.length === 0) return null;
  return (
    <section
      aria-label={label}
      data-summary-strip
      className={cn(
        "grid overflow-hidden rounded-xl border border-border bg-card",
        figures.length === 3 ? "grid-cols-3" : "grid-cols-2",
        figures.length >= 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {figures.map((figure) => {
        const body = (
          <>
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {figure.now && (
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand" />
              )}
              {figure.label}
            </span>
            <span className="text-figure font-semibold tabular-nums">{figure.value}</span>
            {figure.note && (
              <span className="text-xs text-muted-foreground tabular-nums">{figure.note}</span>
            )}
          </>
        );
        const cell =
          "flex min-h-11 flex-col gap-1 px-4 py-3 sm:px-5 sm:py-4 -mr-px -mb-px border-r border-b border-border";
        return figure.href ? (
          <Link
            key={figure.id}
            href={figure.href}
            data-summary={figure.id}
            className={cn(
              cell,
              "transition-colors duration-120 ease-out hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {body}
          </Link>
        ) : (
          <div key={figure.id} data-summary={figure.id} className={cell}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
