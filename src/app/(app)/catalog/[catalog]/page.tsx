import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { AdminNav } from "@/components/admin-nav";
import { CatalogValue } from "@/components/catalog/catalog-value";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { CATALOGS } from "@/domain/catalogs";
import { listCatalogEntries } from "@/features/catalog/queries/catalog-entries";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { kindOrNotFound } from "./kind";

// /catalog/<kind> (build-plan 1.5: "list with search"; 11-screens-and-ux.md rules 8 and 12): one
// list for the four catalogs, its columns from CATALOGS. Active and inactive entries (04 rule 2),
// active first, then by name; the search and the page stay in the address. The state is plain
// words, not a status label (docs/design-system.md, What we never do 4). At phone width the
// toolbar wraps and the table scrolls inside its panel.

const pageParam = z.coerce.number().int().min(1).catch(1);
const searchParam = z.string().trim().max(200).catch("");

type Params = { page?: string | string[]; q?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CatalogListPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalog: string }>;
  searchParams: Promise<Params>;
}) {
  const kind = kindOrNotFound((await params).catalog);
  const user = await requireUser(`/catalog/${kind}`);
  const raw = await searchParams;
  const q = searchParam.parse(first(raw.q) ?? "");
  const asked = pageParam.parse(first(raw.page));
  const list = await readOrNotFound(() => listCatalogEntries(user.id, kind, { page: asked, q }));
  const t = await getTranslations("catalog");
  const { page, pages } = list;
  // The note is long; it shows on the entry's page, not in the list.
  const columns = CATALOGS[kind].fields.filter((field) => field.type !== "long");
  const empty = list.active + list.inactive === 0;
  const href = (to: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (to > 1) query.set("page", String(to));
    const text = query.toString();
    return `/catalog/${kind}${text ? `?${text}` : ""}`;
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <AdminNav current="catalog" />
      <Link
        href="/catalog"
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm leading-5 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
      >
        <Icon name="chevron_left" />
        {t("back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t(`kinds.${kind}.title`)}
          {!empty && (
            <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
              {t("summary", { active: list.active, inactive: list.inactive })}
            </span>
          )}
        </h1>
        {!empty && (
          <Link
            href={`/catalog/${kind}/new`}
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            {t(`kinds.${kind}.new`)}
          </Link>
        )}
      </div>

      {empty ? (
        <EmptyState
          title={t(`kinds.${kind}.emptyTitle`)}
          line={t(`kinds.${kind}.emptyText`)}
          action={{ label: t(`kinds.${kind}.new`), href: `/catalog/${kind}/new`, icon: "add" }}
        />
      ) : (
        <>
          <form
            role="search"
            action={`/catalog/${kind}`}
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="catalog-search" className="sr-only">
              {t("search")}
            </label>
            <input
              id="catalog-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t("searchHint")}
              maxLength={200}
              className="h-11 w-full min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10 sm:max-w-80 sm:text-sm sm:leading-5"
            />
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("find")}
            </button>
            {q && (
              <Link href={`/catalog/${kind}`} className={buttonVariants({ variant: "ghost" })}>
                {t("clear")}
              </Link>
            )}
          </form>

          {list.rows.length === 0 ? (
            <EmptyState title={t("noResultsTitle")} line={t("noResultsText")} />
          ) : (
            <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm leading-5">
                <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground">
                  <tr>
                    {columns.map((field) => (
                      <th key={field.key} scope="col" className="px-4 py-3">
                        {t(`fields.${field.key}`)}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3">
                      {t("status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-accent/50">
                      {columns.map((field, index) =>
                        index === 0 ? (
                          <td key={field.key} className="px-4 py-3 font-semibold">
                            <Link
                              href={`/catalog/${kind}/${row.id}`}
                              className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
                            >
                              {row.name}
                            </Link>
                          </td>
                        ) : (
                          <td key={field.key} className="px-4 py-3">
                            <CatalogValue type={field.type} value={row[field.key] ?? null} />
                          </td>
                        ),
                      )}
                      <td className="px-4 py-3">{row.isActive ? t("active") : t("inactive")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {pages > 1 && <PageLinks page={page} pages={pages} href={href} />}
    </div>
  );
}

async function PageLinks({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  href: (page: number) => string;
}) {
  const t = await getTranslations("pager");
  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonVariants({ variant: "secondary" })}>
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{t("pageOf", { page, pages })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={buttonVariants({ variant: "secondary" })}>
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
