import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { AdminNav } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { listPrices } from "@/features/catalog/queries/prices";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../branches/read-or-not-found";
import { PageLinks } from "../catalog/page-links";

// /prices (build-plan 1.9: "under Admin, a Prices list of every subtype with its current price";
// 04-catalogs.md rule 4; 11-screens-and-ux.md, Interface per role: "Admin groups catalogs, prices,
// users, branches and settings"; rule 8: 25 rows per page from the server). Every subtype, active
// and inactive (plan of 1.9, decision 12), active first, then by product and subtype; the hidden
// default shows as its product alone. "Set on" and "set by" are the newest HEAD row's, in Tashkent
// time (decision 13). A row opens its price page. At phone width the table scrolls inside its
// panel, as every catalog list. Any role but the Head: "not found" (03 rule 1).

const pageParam = z.coerce.number().int().min(1).catch(1);
const searchParam = z.string().trim().max(200).catch("");

type Params = { page?: string | string[]; q?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function PricesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/prices");
  const raw = await searchParams;
  const q = searchParam.parse(first(raw.q) ?? "");
  const asked = pageParam.parse(first(raw.page));
  const list = await readOrNotFound(() => listPrices(user.id, { page: asked, q }));
  const t = await getTranslations("prices");
  const tCatalog = await getTranslations("catalog");
  const format = await getFormatters();
  const { page, pages } = list;
  const empty = list.found === 0 && q === "";
  const when = (moment: Date) => `${format.date(moment)} ${format.time(moment)}`;
  const href = (to: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (to > 1) query.set("page", String(to));
    const text = query.toString();
    return `/prices${text ? `?${text}` : ""}`;
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <AdminNav current="prices" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t("title")}
          {!empty && (
            <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
              {t("summary", { count: list.found })}
            </span>
          )}
        </h1>
        {/* The Excel import of prices (build-plan 1.11), once there is a subtype to price. */}
        {!empty && (
          <Link
            href="/catalog/import/prices"
            className={buttonVariants({ variant: "secondary", className: "w-full sm:w-auto" })}
          >
            {t("importButton")}
          </Link>
        )}
      </div>

      {empty ? (
        <EmptyState title={t("emptyTitle")} line={t("emptyText")} />
      ) : (
        <>
          <form role="search" action="/prices" className="flex flex-wrap items-end gap-2">
            <label htmlFor="price-search" className="sr-only">
              {t("search")}
            </label>
            <input
              id="price-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t("searchHint")}
              maxLength={200}
              className="h-11 w-full min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10 sm:max-w-72 sm:text-sm sm:leading-5"
            />
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {tCatalog("find")}
            </button>
            {q !== "" && (
              <Link href="/prices" className={buttonVariants({ variant: "ghost" })}>
                {tCatalog("clear")}
              </Link>
            )}
          </form>

          {list.rows.length === 0 ? (
            <EmptyState title={tCatalog("noResultsTitle")} line={tCatalog("noResultsText")} />
          ) : (
            <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm leading-5">
                <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      {t("product")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("subtype")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      {t("current")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("setOn")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("setBy")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {tCatalog("status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.variantId} className="border-t hover:bg-accent/50">
                      <td className="px-4 py-3 font-semibold">
                        <Link
                          href={`/prices/${row.variantId}`}
                          className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
                        >
                          {row.productName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{row.subtypeName}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {row.referencePrice === null ? (
                          <span className="text-muted-foreground">{t("noPrice")}</span>
                        ) : (
                          format.money(row.referencePrice)
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                        {row.setAt ? when(row.setAt) : ""}
                      </td>
                      <td className="px-4 py-3">{row.setByName}</td>
                      <td className="px-4 py-3">
                        {row.isActive ? tCatalog("active") : tCatalog("inactive")}
                      </td>
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
