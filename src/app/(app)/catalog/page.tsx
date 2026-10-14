import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AdminNav } from "@/components/admin-nav";
import { Icon } from "@/components/icon";
import { CATALOG_KINDS } from "@/domain/catalogs";
import { countActiveCatalogEntries } from "@/features/catalog/queries/catalog-entries";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../branches/read-or-not-found";

// /catalog (11-screens-and-ux.md, Screens: "Catalogs, /catalog/..., Head"; plan of 1.5, decision
// 11): the list of catalogs, each with its active entries counted by an authorized query (plan
// review, correction 2). Departments (1.6) follow the four; 1.7 and 1.8 add theirs here.

export default async function CatalogsPage() {
  const user = await requireUser("/catalog");
  const counts = await readOrNotFound(() => countActiveCatalogEntries(user.id));
  const t = await getTranslations("catalog");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <AdminNav current="catalog" />
      <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
      <ul className="flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground">
        {[...CATALOG_KINDS, "departments" as const].map((kind) => (
          <li key={kind} className="border-t first:border-t-0">
            <Link
              href={`/catalog/${kind}`}
              className="flex min-h-11 items-center gap-4 px-4 py-4 hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] leading-[22px] font-semibold">
                  {t(`kinds.${kind}.title`)}
                </span>
                <span className="text-sm leading-5 text-muted-foreground">
                  {t(`kinds.${kind}.description`)}
                </span>
              </span>
              <span className="shrink-0 text-sm leading-5 text-muted-foreground">
                {t("activeCount", { count: counts[kind] })}
              </span>
              <Icon name="chevron_right" className="shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
