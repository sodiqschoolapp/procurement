import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getSpendingRecords } from "@/features/analytics/queries/spending-records";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/records, the list behind a number (10-notifications-analytics-reports.md, Analytics
// page per role, point 3: "Clicking any bar, slice or number opens the list of orders or records
// that make it up"; build-plan 6.3). Its total is the number clicked (plan of 6.3, decided item
// 10); 50 a page; each row opens its order; the list exports to Excel (point 4). The address is
// the page's, with `key`; one the parser refuses goes back to /analytics, another branch is Not
// found. A table at 1440 px, cards at 375 px.

type Raw = Record<string, string | string[] | undefined>;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params) return "refused" as const;
  try {
    const list = await getSpendingRecords(
      userId,
      params.period,
      params.filters,
      params.key,
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

export default async function AnalyticsRecordsPage({
  searchParams,
}: {
  searchParams: Promise<Raw>;
}) {
  const user = await requireUser("/analytics/records");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const tMonths = await getTranslations("months");
  const format = await getFormatters();
  const dates = { first: format.date(list.range.first), last: format.date(list.range.last) };
  const what =
    list.key.kind === "month"
      ? t("records.month", {
          month: t("monthLabel", {
            month: tMonths(String(Number(list.key.month.slice(5))) as "1"),
            year: list.key.month.slice(0, 4),
          }),
          ...dates,
        })
      : list.key.kind === "category"
        ? t("records.category", { name: list.categoryName ?? "", ...dates })
        : t("records.period", dates);
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/records?${analyticsSearch(params.period, params.filters, { key: params.key, page })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    key: params.key,
    block: "records",
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
            {t("records.title")}
          </h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground" data-records-what>
            {what}
          </p>
          <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-records-summary>
            {t("records.summary", { count: list.count, total: format.money(list.total) })}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="records"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("records.title")} line={t("records.empty")} />
      ) : (
        <section className="rounded-xl bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground max-sm:hidden">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t("records.columns.order")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("records.columns.product")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("records.columns.branch")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("records.columns.date")}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t("records.columns.supplier")}
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  {t("records.columns.amount")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={row.purchaseId}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-record-row={row.purchaseId}
                >
                  <td className="px-4 py-3 font-semibold whitespace-nowrap max-sm:p-0">
                    <Link
                      href={`/orders/${row.orderId}`}
                      className="text-primary underline-offset-2 hover:underline"
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
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {format.date(row.purchasedOn)}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0 max-sm:text-muted-foreground">
                    {row.supplierName ?? t("records.noSupplier")}
                  </td>
                  <td
                    className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:font-semibold"
                    data-amount
                  >
                    {format.money(row.amount)}
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
