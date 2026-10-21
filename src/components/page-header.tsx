import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icon";
import { cn } from "@/components/utils";

// The page header (docs/design-system.md, Page shell: "a back link on inner pages, then the
// title, and on the same line at the right the page's actions. A short fact may follow the title
// in the muted colour. No sentence under a title.").

export function PageHeader({
  title,
  meta,
  back,
  actions,
  className,
}: {
  title: ReactNode;
  /** A short fact after the title ("12 orders"), never a sentence. */
  meta?: ReactNode;
  /** The page one level up, for an inner page. */
  back?: { href: string; label: string };
  /** The page's own actions, at the right on a desktop and under the title on a phone. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
        >
          <Icon name="arrow_back" size={16} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-title">{title}</h1>
          {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A panel (docs/design-system.md, Parts: "Panel"): white, a hairline edge, corner 8. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
  as: Tag = "section",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  as?: "section" | "div";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Tag
      id={id}
      aria-labelledby={title && headingId ? headingId : undefined}
      className={cn("rounded-xl border border-border bg-card text-card-foreground", className)}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
          {title && (
            <h2 id={headingId} className="text-subheading">
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4 sm:px-5", title && "pt-3", bodyClassName)}>{children}</div>
    </Tag>
  );
}
