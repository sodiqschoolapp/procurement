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
import { getNeededOrders } from "@/features/analytics/queries/needed-orders";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/cash-needed, the orders behind a Cash needed soon number (10-notifications-analytics-
// reports.md, Analytics page per role, point 3; build-plan 6.6a; plan of 6.6a, decided items 4, 5
// and 10): `key=needed:<all|open|approval>[:<step>]`. A number of now: the period of the address
// is only kept for the way back. `:unpriced` lists the orders of that number without a planned
// price, which it leaves out (plan of 2.5d-c, decided item 4, Look first). Its count and total are the number clicked; nearest needed-by
// first, 50 a page; each row opens its order; the list exports to Excel (point 4). An address the
// parser refuses goes back to /analytics; another branch is Not found. A table at 1440 px, cards
// at 375 px, as /analytics/cash.

type Raw = Record<string, string | string[] | undefined>;

const COLUMNS = ["order", "product", "branch", "owner", "status"] as const;
const AMOUNTS = ["planned", "handed"] as const;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params || params.key.kind !== "needed") return "refused" as const;
  const { stage, step, unpriced } = params.key;
  try {
    const list = await getNeededOrders(
      userId,
      params.filters,
      stage,
      step,
      params.page,
      unpriced === true,
    );
    return { params, list };
  } catch (error) {
    if (error instanceof AuthorizationError && error.kind === "not_found")
      return "not_found" as const;
    throw error;
  }
}

export default async function AnalyticsCashNeededPage({
  searchParams,
}: {
  searchParams: Promise<Raw>;
}) {
  const user = await requireUser("/analytics/cash-needed");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const tStatus = await getTranslations("requestStatus");
  const tUnpriced = await getTranslations("orders.unpriced");
  const format = await getFormatters();
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/cash-needed?${analyticsSearch(params.period, params.filters, {
      key: params.key,
      page,
    })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    key: params.key,
    block: "neededOrders",
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
          <h1 className="text-title">{t("finance.neededList.title")}</h1>
          <p className="text-sm text-muted-foreground" data-needed-what>
            {list.step ? tStatus(list.step) : t(`finance.needed.${list.stage}`)}
            {list.unpriced && <span className="block">{t("finance.needed.unpricedList")}</span>}
          </p>
          <p className="text-sm font-semibold tabular-nums" data-needed-summary>
            {t("finance.neededList.summary", {
              count: list.count,
              amount: format.money(list.total),
            })}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="neededOrders"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("finance.neededList.title")} line={t("finance.neededList.empty")} />
      ) : (
        <section className="rounded-xl border border-border bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="border-b border-border bg-muted text-xs font-medium text-muted-foreground max-sm:hidden">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {t(`cash.columns.${column}`)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3">
                  {t("finance.neededList.columns.neededBy")}
                </th>
                {AMOUNTS.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 text-right">
                    {t(`finance.neededList.columns.${column}`)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right">
                  {t("finance.columns.needed")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={row.orderId}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-needed-row={row.orderId}
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
                  <td className="px-4 py-3 max-sm:p-0">
                    <RequestStatusLabel status={row.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {format.date(row.neededBy)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:text-muted-foreground">
                    {row.plannedCash === null ? tUnpriced("none") : format.money(row.plannedCash)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:text-muted-foreground">
                    {format.money(row.handed)}
                  </td>
                  <td
                    className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:font-semibold"
                    data-needed
                  >
                    {format.money(row.needed)}
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
