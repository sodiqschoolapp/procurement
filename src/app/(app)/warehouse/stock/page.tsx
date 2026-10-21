import Form from "next/form";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import * as z from "zod";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LowLabel } from "@/components/status-label";
import { cn } from "@/components/utils";
import { plainQuantity } from "@/domain/drafts";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { AddToDraftButton } from "@/features/warehouse/components/add-to-draft-button";
import { MinimumButton } from "@/features/warehouse/components/minimum-button";
import {
  NewDocumentButtons,
  mayEnterDirectly,
} from "@/features/warehouse/components/new-document-buttons";
import { WarehouseTabs } from "@/features/warehouse/components/warehouse-tabs";
import {
  type StockPage,
  listStockOnHand,
  stockCategoryChoices,
} from "@/features/warehouse/queries/stock-on-hand";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";
import { setStockMinimumAction } from "./actions";

// /warehouse/stock, Stock on hand (09-warehouse.md, Stock screens; 11-screens-and-ux.md, Screens:
// every role; rules 5, 8 and 12; plan of 5.2): one row per branch and subtype with its photo,
// quantity, measure and value, searched and filtered by category; search, category, branch and
// page stay in the address. The list's branch is the address's `branch=`, else the top bar's
// choice (decided item 5, as /orders). At phone width the table scrolls inside its panel, as the
// catalog lists (decided item 9). Each product name links to its item card in the row's branch
// (5.3). The tabs to Documents (plan of 5.12). "New issue" in the header for whoever may issue in some branch (plan of 5.4, decided
// item 10), "New return" for whoever may take returns in some branch (plan of 5.6). The minimum
// column, "Low" and the "Low stock only" switch (`low=1` in the address), with the minimum's
// pencil and "Add to draft" on the rows the query offers them (plan of 5.10).

const pageParam = z.coerce.number().int().min(1).catch(1);
const searchParam = z.string().trim().max(200).catch("");
const idParam = z.uuid().catch("");

type Params = {
  page?: string | string[];
  q?: string | string[];
  category?: string | string[];
  branch?: string | string[];
  low?: string | string[];
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The page of stock, or an empty one when the `branch=` of the address is not the user's. */
async function readStock(
  userId: string,
  filters: Parameters<typeof listStockOnHand>[1],
  page: number,
) {
  try {
    return await listStockOnHand(userId, filters, page);
  } catch (error) {
    // Another branch is "Not found" (03 rule 1; 15 S7): the same empty list as no stock.
    if (error instanceof AuthorizationError && error.kind === "not_found") {
      return { rows: [], page: 1, pages: 1, found: 0 } satisfies StockPage;
    }
    throw error;
  }
}

export default async function StockOnHandPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser("/warehouse/stock");
  const raw = await searchParams;
  const q = searchParam.parse(first(raw.q) ?? "");
  const category = idParam.parse(first(raw.category) ?? "");
  const addressBranch = idParam.parse(first(raw.branch) ?? "");
  const cookieBranch = await currentBranchChoice(
    user.id,
    (await cookies()).get(BRANCH_COOKIE)?.value,
  );
  const branch = addressBranch || cookieBranch;
  const low = first(raw.low) === "1";
  const list = await readStock(
    user.id,
    { q, category: category || null, branch: branch || null, low },
    pageParam.parse(first(raw.page)),
  );
  const categories = await stockCategoryChoices(user.id);
  const canEnterDirectly = await mayEnterDirectly(user.id);
  const t = await getTranslations("warehouse.stock");
  const format = await getFormatters();
  const filtered = q !== "" || category !== "" || low;
  const href = (to: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (category) query.set("category", category);
    if (addressBranch) query.set("branch", addressBranch);
    if (low) query.set("low", "1");
    if (to > 1) query.set("page", String(to));
    const text = query.toString();
    return `/warehouse/stock${text ? `?${text}` : ""}`;
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
          {t("title")}
          {list.found > 0 && (
            <span className="text-sm font-normal tracking-normal text-muted-foreground">
              {t("summary", { count: list.found })}
            </span>
          )}
        </h1>
        <div className="flex flex-wrap gap-3 max-sm:w-full max-sm:[&>*]:flex-1">
          <NewDocumentButtons userId={user.id} />
          {/* Existing stock from an Excel file (build-plan 5.9), for the Head as Direct entry. */}
          {canEnterDirectly && (
            <Link
              href="/catalog/import/stock"
              className={cn(buttonVariants({ variant: "secondary" }), "max-sm:h-12")}
            >
              <Icon name="description" />
              {t("importStock")}
            </Link>
          )}
        </div>
      </div>
      <WarehouseTabs current="stock" role={user.role} />

      {list.found === 0 && !filtered ? (
        <EmptyState title={t("emptyTitle")} line={t("emptyText")} />
      ) : (
        <>
          <Form
            scroll={false}
            role="search"
            action="/warehouse/stock"
            className="flex flex-wrap items-end gap-2"
          >
            {addressBranch && <input type="hidden" name="branch" value={addressBranch} />}
            <label htmlFor="stock-search" className="sr-only">
              {t("search")}
            </label>
            <Input
              id="stock-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t("searchHint")}
              maxLength={200}
              className="min-w-0 flex-1 sm:max-w-72"
            />
            <label htmlFor="stock-filter-category" className="sr-only">
              {t("filterCategory")}
            </label>
            <Select
              id="stock-filter-category"
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
            <label className="flex h-11 items-center gap-2 px-1 text-sm sm:h-10">
              <input
                type="checkbox"
                name="low"
                value="1"
                defaultChecked={low}
                className="size-5 accent-primary"
                data-low-only
              />
              {t("lowOnly")}
            </label>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              {t("find")}
            </button>
            {filtered && (
              <Link
                href={
                  addressBranch ? `/warehouse/stock?branch=${addressBranch}` : "/warehouse/stock"
                }
                className={buttonVariants({ variant: "ghost" })}
              >
                {t("clear")}
              </Link>
            )}
          </Form>

          {list.rows.length === 0 ? (
            <EmptyState title={t("noResultsTitle")} line={t("noResultsText")} />
          ) : (
            <section className="table-cards-panel overflow-x-auto rounded-xl border border-border bg-card text-card-foreground">
              <table className="table-cards w-full min-w-[56rem] border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted text-xs font-medium text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-16 px-4 py-3">
                      <span className="sr-only">{t("columns.photo")}</span>
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.product")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.subtype")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.branch")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      {t("columns.quantity")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("columns.measure")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      {t("columns.minimum")}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      {t("columns.value")}
                    </th>
                    {/* `relative`: the hidden label stays inside the scrolling panel (as the item card). */}
                    <th scope="col" className="relative px-4 py-3">
                      <span className="sr-only">{t("columns.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((row) => {
                    const itemName = row.subtypeName
                      ? `${row.productName}, ${row.subtypeName}`
                      : row.productName;
                    return (
                      <tr
                        key={`${row.branchId}-${row.variantId}`}
                        className="border-t"
                        data-stock-row={`${row.branchId}:${row.variantId}`}
                      >
                        <td className="px-4 py-2 max-sm:hidden">
                          {row.photoFileId ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a private file route, not an asset
                            <img
                              src={`/files/${row.photoFileId}/small`}
                              alt={t("photoAlt", { name: row.productName })}
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
                        <td className="px-4 py-3 font-semibold" data-card="head">
                          <Link
                            href={`/warehouse/items/${row.variantId}?branch=${row.branchId}`}
                            className="font-semibold text-link underline-offset-2 hover:underline"
                          >
                            {row.productName}
                          </Link>
                        </td>
                        <td className="px-4 py-3" data-label={t("columns.subtype")}>
                          {row.subtypeName ?? ""}
                        </td>
                        <td className="px-4 py-3" data-label={t("columns.branch")}>
                          {row.branchCode}
                        </td>
                        <td
                          className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                          data-label={t("columns.quantity")}
                        >
                          <span className="inline-flex items-center gap-2">
                            {row.low && <LowLabel />}
                            {format.quantity(row.quantity)}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3"
                          title={row.unitName}
                          data-label={t("columns.measure")}
                        >
                          {row.unitShortName}
                        </td>
                        <td
                          className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                          data-label={t("columns.minimum")}
                        >
                          <span className="inline-flex items-center gap-1" data-minimum>
                            {row.minimum === null ? "—" : format.quantity(row.minimum)}
                            {row.canSetMinimum && (
                              <MinimumButton
                                branchId={row.branchId}
                                variantId={row.variantId}
                                itemName={itemName}
                                minimum={row.minimum === null ? "" : plainQuantity(row.minimum)}
                                unitShortName={row.unitShortName}
                                save={setStockMinimumAction}
                              />
                            )}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right whitespace-nowrap tabular-nums"
                          data-label={t("columns.value")}
                        >
                          {format.money(row.value)}
                        </td>
                        <td className="px-4 py-2 text-right" data-card="wide">
                          {row.low && row.canAddDraft && (
                            <AddToDraftButton
                              branchId={row.branchId}
                              variantId={row.variantId}
                              itemName={itemName}
                              unitShortName={row.unitShortName}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {list.pages > 1 && <PageLinks page={list.page} pages={list.pages} href={href} />}
    </div>
  );
}
