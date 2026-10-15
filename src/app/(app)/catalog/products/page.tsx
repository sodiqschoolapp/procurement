import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { AdminNav } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PRODUCT_TYPES } from "@/domain/products";
import { listCategoryFilter, listProducts } from "@/features/catalog/queries/products";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

import { readOrNotFound } from "../../branches/read-or-not-found";
import { PageLinks } from "../page-links";

// /catalog/products (build-plan 1.7; 11-screens-and-ux.md rules 8 and 12; docs/design-system.md,
// Lists): the Head's products and services, active and inactive (04 rule 2), active first, then
// by name; the toolbar has the search and the category and type filters, kept in the address with
// the page (plan of 1.7, decision 12). Each row shows the 160 px photo (04 rule 6). At phone width
// the table scrolls inside its panel, as the lists of 1.5 and 1.6 (plan review, Should fix 9).
// From 1.8 the price is the hidden default subtype's; a product with subtypes shows how many it has
// (plan of 1.8, "What will exist").

const pageParam = z.coerce.number().int().min(1).catch(1);
const searchParam = z.string().trim().max(200).catch("");
const categoryParam = z.uuid().catch("");
const typeParam = z.enum(PRODUCT_TYPES).catch("" as never);

type Params = {
  page?: string | string[];
  q?: string | string[];
  category?: string | string[];
  type?: string | string[];
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/catalog/products");
  const raw = await searchParams;
  const q = searchParam.parse(first(raw.q) ?? "");
  const category = categoryParam.parse(first(raw.category) ?? "");
  const type = typeParam.parse(first(raw.type) ?? "") as string;
  const asked = pageParam.parse(first(raw.page));
  const list = await readOrNotFound(() =>
    listProducts(user.id, { page: asked, q, categoryId: category || null, type: type || null }),
  );
  const categories = await listCategoryFilter(user.id);
  const t = await getTranslations("catalog");
  const format = await getFormatters();
  const { page, pages } = list;
  const empty = list.active + list.inactive === 0;
  const filtered = q !== "" || category !== "" || type !== "";
  const href = (to: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (category) query.set("category", category);
    if (type) query.set("type", type);
    if (to > 1) query.set("page", String(to));
    const text = query.toString();
    return `/catalog/products${text ? `?${text}` : ""}`;
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
          {t("kinds.products.title")}
          {!empty && (
            <span className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground">
              {t("summary", { active: list.active, inactive: list.inactive })}
            </span>
          )}
        </h1>
        {!empty && (
          <Link
            href="/catalog/products/new"
            className={buttonVariants({ className: "w-full sm:w-auto" })}
          >
            {t("kinds.products.new")}
          </Link>
        )}
      </div>

      {empty ? (
        <EmptyState
          title={t("kinds.products.emptyTitle")}
          line={t("kinds.products.emptyText")}
          action={{ label: t("kinds.products.new"), href: "/catalog/products/new", icon: "add" }}
        />
      ) : (
        <>
          <form role="search" action="/catalog/products" className="flex flex-wrap items-end gap-2">
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
              className="h-11 w-full min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base leading-6 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10 sm:max-w-72 sm:text-sm sm:leading-5"
            />
            <label htmlFor="product-filter-category" className="sr-only">
              {t("filterCategory")}
            </label>
            <Select
              id="product-filter-category"
              name="category"
              defaultValue={category}
              className="w-full sm:w-56"
            >
              <option value="">{t("allCategories")}</option>
              {categories.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.isActive ? choice.name : t("inactiveOption", { name: choice.name })}
                </option>
              ))}
            </Select>
            <label htmlFor="product-filter-type" className="sr-only">
              {t("filterType")}
            </label>
            <Select
              id="product-filter-type"
              name="type"
              defaultValue={type}
              className="w-full sm:w-40"
            >
              <option value="">{t("allTypes")}</option>
              {PRODUCT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`productType.${value}`)}
                </option>
              ))}
            </Select>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("find")}
            </button>
            {filtered && (
              <Link href="/catalog/products" className={buttonVariants({ variant: "ghost" })}>
                {t("clear")}
              </Link>
            )}
          </form>

          {list.rows.length === 0 ? (
            <EmptyState title={t("noResultsTitle")} line={t("noResultsText")} />
          ) : (
            <section className="overflow-x-auto rounded-xl bg-card text-card-foreground">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm leading-5">
                <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-16 px-4 py-3">
                      <span className="sr-only">{t("fields.photoFileId")}</span>
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.name")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.type")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.categoryId")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("fields.unitId")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      {t("fields.referencePrice")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-accent/50">
                      <td className="px-4 py-2">
                        {row.photoFileId ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
                          <img
                            src={`/files/${row.photoFileId}/small`}
                            alt={t("photoAlt", { name: row.name })}
                            width={40}
                            height={40}
                            loading="lazy"
                            className="size-10 rounded-lg bg-muted object-cover"
                          />
                        ) : (
                          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <Icon name="inventory_2" size={18} label={t("noPhoto")} />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        <Link
                          href={`/catalog/products/${row.id}`}
                          className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{t(`productType.${row.type}`)}</td>
                      <td className="px-4 py-3">{row.categoryName}</td>
                      <td className="px-4 py-3" title={row.unitName}>
                        {row.unitShortName}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {row.hasVariants
                          ? t("subtypes.count", { count: row.subtypeCount })
                          : row.referencePrice === null
                            ? ""
                            : format.money(row.referencePrice)}
                      </td>
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
