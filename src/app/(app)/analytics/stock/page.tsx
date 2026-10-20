import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getStockLines } from "@/features/analytics/queries/stock-lines";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/stock, the stock lines behind a Warehouse number of now (10-notifications-analytics-
// reports.md, Analytics page per role, point 3; build-plan 6.4d; plan of 6.4d, decided items 1, 3,
// 7 and 9): `key=stock:value|low|still`. A number of now: the period of the address is only kept
// for the way back. Its count and total are the number clicked; 50 a page; the list exports to
// Excel (point 4). An address the parser refuses goes back to /analytics, another branch is Not
// found. A table at 1440 px, cards at 375 px, as /analytics/cash.

type Raw = Record<string, string | string[] | undefined>;

const COLUMNS = ["product", "branch", "quantity", "minimum", "avgCost", "lastMoved"] as const;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params || params.key.kind !== "stock" || params.otherOwners) return "refused" as const;
  try {
    const list = await getStockLines(userId, params.key.view, params.filters, params.page);
    return { params, key: params.key, list };
  } catch (error) {
    if (error instanceof AuthorizationError && error.kind === "not_found")
      return "not_found" as const;
    throw error;
  }
}

export default async function AnalyticsStockPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const user = await requireUser("/analytics/stock");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, key, list } = read;
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/stock?${analyticsSearch(params.period, params.filters, { key, page })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    key,
    block: "stock",
  })}`;

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Link
        href={`/analytics?${analyticsSearch(params.period, params.filters)}`}
        className="inline-flex min-h-11 min-w-11 items-center self-start text-sm font-semibold underline-offset-2 hover:underline sm:min-h-0"
      >
        {t("approvals.back")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title">{t(`stock.title.${key.view}`)}</h1>
          <p className="text-sm text-muted-foreground" data-stock-what>
            {key.view === "still"
              ? t("stock.whatStill", { date: format.date(list.stillSince) })
              : t("stock.what")}
          </p>
          <p className="text-sm font-semibold tabular-nums" data-stock-summary>
            {t("stock.summary", { count: list.count, total: format.money(list.total) })}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="stock"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t(`stock.title.${key.view}`)} line={t("stock.empty")} />
      ) : (
        <section className="rounded-xl border border-border bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="bg-muted text-small font-semibold text-muted-foreground max-sm:hidden">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {t(`stock.columns.${column}`)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right">
                  {t("stock.columns.value")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={`${row.branchId}:${row.variantId}`}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-stock-row={row.variantId}
                >
                  <td className="px-4 py-3 font-semibold max-sm:p-0">
                    <Link
                      href={`/warehouse/items/${row.variantId}?branch=${row.branchId}`}
                      className="font-semibold text-link underline-offset-2 hover:underline"
                    >
                      {row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-sm:p-0 max-sm:text-muted-foreground">
                    {row.branchName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0">
                    {t("stock.quantity", {
                      qty: format.quantity(row.quantity),
                      unit: row.unitShortName,
                    })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {row.minimum === null
                      ? t("stock.noMinimum")
                      : t("stock.minimum", { qty: format.quantity(row.minimum) })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {format.money(row.avgCost)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {row.lastMovedOn === null ? "" : format.date(row.lastMovedOn)}
                  </td>
                  <td
                    className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:font-semibold"
                    data-value
                  >
                    {format.money(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {pages > 1 && <PageLinks page={list.page} pages={pages} href={href} />}
    </div>
  );
}
