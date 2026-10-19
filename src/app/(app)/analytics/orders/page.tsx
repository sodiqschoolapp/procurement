import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { OutcomeLabel } from "@/components/status-label";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getOutcomeOrders } from "@/features/analytics/queries/outcome-orders";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/orders, the orders behind a Plan vs actual number (10-notifications-analytics-
// reports.md, Analytics page per role, point 3: "Clicking any bar, slice or number opens the list
// of orders or records that make it up"; build-plan 6.4a). Its count and sum are the number
// clicked (plan of 6.4, decided item 9); 50 a page; each row opens its order; the list exports to
// Excel (point 4). The address is the page's, with `key` and `owner=other`; one the parser or the
// query refuses goes back to /analytics, another branch is Not found. A table at 1440 px, cards at
// 375 px, as /analytics/records.

type Raw = Record<string, string | string[] | undefined>;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params) return "refused" as const;
  try {
    const list = await getOutcomeOrders(
      userId,
      params.period,
      params.filters,
      params.key,
      params.otherOwners,
      params.page,
    );
    return { params, list };
  } catch (error) {
    if (error instanceof PeriodRefusedError) return "refused" as const;
    if (error instanceof AuthorizationError && error.kind === "not_found")
      return "not_found" as const;
    throw error;
  }
}

export default async function AnalyticsOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Raw>;
}) {
  const user = await requireUser("/analytics/orders");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const dates = { first: format.date(list.range.first), last: format.date(list.range.last) };
  const what =
    list.key.kind === "colour"
      ? t("orders.colour", { outcome: t(`plan.outcome.${list.key.colour}`), ...dates })
      : list.key.kind === "overspent"
        ? t("orders.overspent", dates)
        : list.key.kind === "saved"
          ? t("orders.saved", dates)
          : t("orders.all", dates);
  const signed = (amount: bigint) =>
    `${amount < 0n ? "−" : ""}${format.money(amount < 0n ? -amount : amount)}`;
  const summary =
    list.key.kind === "overspent"
      ? t("orders.summaryOverspent", { count: list.count, sum: format.money(list.sum) })
      : list.key.kind === "saved"
        ? t("orders.summarySaved", { count: list.count, sum: format.money(list.sum) })
        : t("orders.summary", { count: list.count, sum: signed(list.sum) });
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const extra = { key: params.key, otherOwners: params.otherOwners };
  const href = (page: number) =>
    `/analytics/orders?${analyticsSearch(params.period, params.filters, { ...extra, page })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    ...extra,
    block: "orders",
  })}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Link
        href={`/analytics?${analyticsSearch(params.period, params.filters)}`}
        className="inline-flex min-h-11 items-center self-start text-sm font-semibold underline-offset-2 hover:underline sm:min-h-0"
      >
        {t("records.back")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
            {t("orders.title")}
          </h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground" data-orders-what>
            {what}
            {list.otherOwners && <span className="block">{t("orders.otherOwners")}</span>}
          </p>
          <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-orders-summary>
            {summary}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="orders"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("orders.title")} line={t("orders.empty")} />
      ) : (
        <section className="rounded-xl bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground max-sm:hidden">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t("orders.columns.order")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("orders.columns.product")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("orders.columns.branch")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("orders.columns.owner")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("orders.columns.ended")}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t("orders.columns.planned")}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t("orders.columns.actual")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("orders.columns.outcome")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={row.orderId}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-order-row={row.orderId}
                >
                  <td className="px-4 py-3 font-semibold whitespace-nowrap max-sm:p-0">
                    <Link
                      href={`/orders/${row.orderId}`}
                      className="font-semibold text-link underline-offset-2 hover:underline"
                    >
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-sm:p-0">
                    {row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0 max-sm:text-muted-foreground">
                    {row.branchName}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0 max-sm:text-muted-foreground">
                    {row.ownerName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {format.date(row.endedOn)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left">
                    <span className="mr-1 text-muted-foreground sm:hidden">
                      {t("orders.columns.planned")}
                    </span>
                    {format.money(row.planned)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left">
                    <span className="mr-1 text-muted-foreground sm:hidden">
                      {t("orders.columns.actual")}
                    </span>
                    {format.money(row.actual)}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0" data-difference={signed(row.difference)}>
                    <OutcomeLabel
                      colour={row.colour}
                      amount={row.difference < 0n ? -row.difference : row.difference}
                    />
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
