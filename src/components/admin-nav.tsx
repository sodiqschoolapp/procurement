import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { cn } from "@/components/utils";

// Moving between the Admin pages (11-screens-and-ux.md, Interface per role: "Admin groups
// catalogs, prices, users, branches and settings"; plan of 1.2, decision 12). It looks like the
// segmented control of docs/design-system.md (two to four choices), but each choice is a link to
// a page. Later Admin tasks add their page in the spec's order.

export type AdminPage = "branches" | "settings";

const PAGES: readonly { id: AdminPage; href: string }[] = [
  { id: "branches", href: "/branches" },
  { id: "settings", href: "/settings" },
];

export async function AdminNav({ current }: { current: AdminPage }) {
  const t = await getTranslations("admin");
  return (
    <nav aria-label={t("label")} className="flex">
      <ul className="inline-flex w-full rounded-lg bg-accent p-1 sm:w-auto">
        {PAGES.map((page) => (
          <li key={page.id} className="flex min-w-0 flex-1">
            <Link
              href={page.href}
              aria-current={page.id === current ? "page" : undefined}
              className={cn(
                "inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-sm px-2 text-center text-sm leading-4 font-semibold sm:h-8 sm:px-3 sm:leading-5 sm:whitespace-nowrap",
                "text-muted-foreground transition-colors duration-120 ease-out hover:text-foreground",
                "aria-[current=page]:bg-card aria-[current=page]:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              {t(page.id)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
