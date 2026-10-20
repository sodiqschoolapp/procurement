import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getMoneyRows } from "@/features/analytics/queries/money-rows";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/money, the money rows behind an amount of Finance's Cash block (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; build-plan 6.6a; plan of 6.6a, decided
// items 2 and 10): `key=money:<given|returned|paidBack>[:<month>]`. Its count and total are the
// amount clicked; newest first, 50 a page; each row opens its order; the list exports to Excel
// (point 4). An address the parser refuses, a month outside the period or a school year not set
// goes back to /analytics; another branch is Not found. A table at 1440 px, cards at 375 px, as
// /analytics/cash.

type Raw = Record<string, string | string[] | undefined>;

const COLUMNS = ["date", "document", "order", "product", "branch", "manager"] as const;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params || params.key.kind !== "money") return "refused" as const;
  const { money, month } = params.key;
  try {
    const list = await getMoneyRows(
      userId,
      money,
      month,
      params.period,
      params.filters,
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

export default async function AnalyticsMoneyPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const user = await requireUser("/analytics/money");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const tMonths = await getTranslations("months");
  const format = await getFormatters();
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/money?${analyticsSearch(params.period, params.filters, { key: params.key, page })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    key: params.key,
    block: "moneyRows",
  })}`;
  const kind = t(`finance.cash.kinds.${list.money}`);

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
          <h1 className="text-title">{t("finance.money.title")}</h1>
          <p className="text-sm text-muted-foreground" data-money-what>
            {list.month
              ? t("joined", {
                  first: kind,
                  second: t("monthLabel", {
                    month: tMonths(String(Number(list.month.slice(5))) as "1"),
                    year: list.month.slice(0, 4),
                  }),
                })
              : t("joined", {
                  first: kind,
                  second: t("periodLine", {
                    first: format.date(list.period.first),
                    last: format.date(list.period.last),
                  }),
                })}
          </p>
          <p className="text-sm font-semibold tabular-nums" data-money-summary>
            {t("finance.money.summary", { count: list.count, amount: format.money(list.total) })}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="moneyRows"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("finance.money.title")} line={t("finance.money.empty")} />
      ) : (
        <section className="rounded-xl border border-border bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="bg-muted text-small font-semibold text-muted-foreground max-sm:hidden">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {column === "date" || column === "document" || column === "manager"
                      ? t(`finance.money.columns.${column}`)
                      : t(`cash.columns.${column}`)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right">
                  {t("finance.money.columns.amount")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={row.moneyRowId}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-money-row={row.moneyRowId}
                >
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {format.date(row.occurredOn)}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0 max-sm:text-muted-foreground">
                    {row.documentNo ?? "—"}
                  </td>
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
                    {row.managerName}
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
