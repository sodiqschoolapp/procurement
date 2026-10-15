import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { cn } from "@/components/utils";

// Moving between the Admin pages (11-screens-and-ux.md, Interface per role: "Admin groups
// catalogs, prices, users, branches and settings"; plan of 1.2, decision 12). It looks like the
// segmented control of docs/design-system.md (two to four choices), but each choice is a link to
// a page, in the spec's order. With Prices (1.9) there are five: the track stays, and at phone
// width it scrolls sideways inside itself rather than squeeze five words, so the page itself never
// scrolls sideways (plan of 1.9, decision 6, Look first; D23).

export type AdminPage = "catalog" | "prices" | "users" | "branches" | "settings";

const PAGES: readonly { id: AdminPage; href: string }[] = [
  { id: "catalog", href: "/catalog" },
  { id: "prices", href: "/prices" },
  { id: "users", href: "/users" },
  { id: "branches", href: "/branches" },
  { id: "settings", href: "/settings" },
];

export async function AdminNav({ current }: { current: AdminPage }) {
  const t = await getTranslations("admin");
  return (
    <nav aria-label={t("label")} className="-mx-1 flex overflow-x-auto px-1 sm:mx-0 sm:px-0">
      <ul className="inline-flex w-max min-w-full rounded-lg bg-accent p-1 sm:w-auto sm:min-w-0">
        {PAGES.map((page) => (
          <li key={page.id} className="flex shrink-0 grow">
            <Link
              href={page.href}
              aria-current={page.id === current ? "page" : undefined}
              className={cn(
                "inline-flex h-11 flex-1 items-center justify-center rounded-sm px-3 text-center text-sm leading-5 font-semibold whitespace-nowrap sm:h-8",
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
