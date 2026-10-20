import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getSettlements } from "@/features/analytics/queries/settlements";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/settlements, the settlements behind a Settlement speed number (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; build-plan 6.6b; plan of 6.6b, decided
// item 8): `key=settled`, a branch row with its branch filter. Its count and average days are the
// number clicked; newest close first, 50 a page; each row opens its order; the list exports to
// Excel (point 4). An address the parser refuses or a school year not set goes back to /analytics;
// another branch is Not found. A table at 1440 px, cards at 375 px, as /analytics/money.

type Raw = Record<string, string | string[] | undefined>;

const COLUMNS = ["order", "product", "branch"] as const;
const OWN_COLUMNS = ["owner", "sent", "closed"] as const;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params || params.key.kind !== "settled" || params.otherOwners) return "refused" as const;
  try {
    const list = await getSettlements(userId, params.period, params.filters, params.page);
    return { params, list };
  } catch (error) {
    if (error instanceof PeriodRefusedError) return "refused" as const;
    if (error instanceof AuthorizationError && error.kind === "not_found")
      return "not_found" as const;
    throw error;
  }
}

export default async function AnalyticsSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Raw>;
}) {
  const user = await requireUser("/analytics/settlements");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/settlements?${analyticsSearch(params.period, params.filters, { key: params.key, page })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    key: params.key,
    block: "settlements",
  })}`;
  const moment = (value: Date) => `${format.date(value)} ${format.time(value)}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Link
        href={`/analytics?${analyticsSearch(params.period, params.filters)}`}
        className="inline-flex min-h-11 min-w-11 items-center self-start text-sm font-semibold underline-offset-2 hover:underline sm:min-h-0"
      >
        {t("approvals.back")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title">
            {t("finance.settlementList.title")}
          </h1>
          <p className="text-sm text-muted-foreground" data-settlements-what>
            {t("finance.settlementList.line", {
              first: format.date(list.period.first),
              last: format.date(list.period.last),
            })}
          </p>
          <p
            className="text-sm font-semibold tabular-nums"
            data-settlements-summary
          >
            {t("finance.settlementList.summary", {
              count: list.count,
              days: format.quantity(list.days ?? "0"),
            })}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="settlements"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState
          title={t("finance.settlementList.title")}
          line={t("finance.settlementList.empty")}
        />
      ) : (
        <section className="rounded-xl bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="bg-muted text-small font-semibold text-muted-foreground max-sm:hidden">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {t(`cash.columns.${column}`)}
                  </th>
                ))}
                {OWN_COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {t(`finance.settlementList.columns.${column}`)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right">
                  {t("finance.settlementList.columns.days")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={`${row.orderId}-${row.closedAt.toISOString()}`}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-settlement-row={row.orderId}
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
                    {moment(row.sentAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {moment(row.closedAt)}
                  </td>
                  <td
                    className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:font-semibold"
                    data-days
                  >
                    {t("finance.speed.days", { days: format.quantity(row.days) })}
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
