import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { RequestStatusLabel } from "@/components/status-label";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getCashOrders } from "@/features/analytics/queries/cash-orders";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/cash, the orders behind a "cash held" number of the Managers block (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; 08 Money with managers; build-plan 6.4c;
// plan of 6.4c, decided items 4 and 7). A number of now: the period of the address is only kept
// for the way back. Its held amount and "held for" are the number clicked; oldest first; 50 a
// page; each row opens its order; the list exports to Excel (point 4). The address is the page's,
// with `owner=other` for "Other owners"; one the parser refuses goes back to /analytics, another
// branch is Not found. A table at 1440 px, cards at 375 px, as /analytics/approvals.

type Raw = Record<string, string | string[] | undefined>;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params || params.key.kind !== "period") return "refused" as const;
  try {
    const list = await getCashOrders(userId, params.filters, params.otherOwners, params.page);
    return { params, list };
  } catch (error) {
    if (error instanceof AuthorizationError && error.kind === "not_found")
      return "not_found" as const;
    throw error;
  }
}

export default async function AnalyticsCashPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const user = await requireUser("/analytics/cash");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const extra = { otherOwners: params.otherOwners };
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/cash?${analyticsSearch(params.period, params.filters, { ...extra, page })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    ...extra,
    block: "cash",
  })}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Link
        href={`/analytics?${analyticsSearch(params.period, params.filters)}`}
        className="inline-flex min-h-11 items-center self-start text-sm font-semibold underline-offset-2 hover:underline sm:min-h-0"
      >
        {t("approvals.back")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
            {t("cash.title")}
          </h1>
          <p className="text-[15px] leading-[22px] text-muted-foreground" data-cash-what>
            {t("cash.what")}
            {params.otherOwners && <span className="block">{t("orders.otherOwners")}</span>}
          </p>
          <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-cash-summary>
            {list.heldSince === null || list.heldDays === null
              ? t("cash.summaryNone")
              : t("cash.summary", {
                  count: list.count,
                  held: format.money(list.held),
                  days: list.heldDays,
                  date: format.date(list.heldSince),
                })}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="cash"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("cash.title")} line={t("cash.empty")} />
      ) : (
        <section className="rounded-xl bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground max-sm:hidden">
              <tr>
                {(["order", "product", "branch", "owner", "status", "since"] as const).map(
                  (column) => (
                    <th key={column} scope="col" className="px-4 py-3">
                      {t(`cash.columns.${column}`)}
                    </th>
                  ),
                )}
                <th scope="col" className="px-4 py-3 text-right">
                  {t("cash.columns.held")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={row.orderId}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-cash-row={row.orderId}
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
                  <td className="px-4 py-3 max-sm:p-0 max-sm:text-muted-foreground">
                    {row.ownerName}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0">
                    <RequestStatusLabel status={row.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {format.date(row.since)}
                  </td>
                  <td
                    className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:font-semibold"
                    data-held
                  >
                    {format.money(row.cashCount)}
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
