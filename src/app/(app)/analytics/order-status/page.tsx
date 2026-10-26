import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { RequestStatusLabel } from "@/components/status-label";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getStatusOrders } from "@/features/analytics/queries/status-orders";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/order-status, the orders behind a number of the Principal's Orders block
// (10-notifications-analytics-reports.md, Analytics page per role, point 3: "Clicking any bar,
// slice or number opens the list of orders or records that make it up"; build-plan 6.5a; plan of
// 6.5a, decided item 6): the orders first submitted in the period at one status now or at any (the
// total, build-plan 6.5a-2), or the orders
// coming up or overdue now; of the Manager's My orders (build-plan 6.5b; plan of 6.5b, decided
// items 1 and 8), the orders that first entered Open in the period, each with its hours from the
// first submit, and their average, the number clicked. Its count is the number clicked; 50 a page; each row opens its order;
// the list exports to Excel (point 4). The address is the page's, with `key`; one the parser or
// the query refuses goes back to /analytics, another branch is Not found. A table at 1440 px,
// cards at 375 px, as /analytics/approvals.

type Raw = Record<string, string | string[] | undefined>;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params || params.otherOwners) return "refused" as const;
  try {
    const list = await getStatusOrders(
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

export default async function AnalyticsOrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<Raw>;
}) {
  const user = await requireUser("/analytics/order-status");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const tStatus = await getTranslations("requestStatus");
  const tOrders = await getTranslations("orders");
  const format = await getFormatters();
  const { key } = list;
  const what =
    key.kind === "status"
      ? t("principal.list.status", {
          // `status:all` is the Orders total: its own label (build-plan 6.5a-2).
          status: key.status === null ? t("principal.orders.total") : tStatus(key.status),
          first: format.date(list.period.first),
          last: format.date(list.period.last),
        })
      : key.kind === "approved"
        ? t("my.list.approved", {
            first: format.date(list.period.first),
            last: format.date(list.period.last),
          })
        : key.due === "soon"
          ? t("principal.orders.comingUpLine", { date: format.date(list.today) })
          : t("principal.orders.overdueLine", { date: format.date(list.today) });
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/order-status?${analyticsSearch(params.period, params.filters, {
      key: params.key,
      page,
    })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    key: params.key,
    block: "statusOrders",
  })}`;
  const approved = key.kind === "approved";
  const columns = approved
    ? (["order", "product", "department", "status", "submitted", "opened", "hours"] as const)
    : (["order", "product", "department", "status", "submitted", "neededBy"] as const);
  const columnLabel = (column: (typeof columns)[number]) =>
    column === "opened" || column === "hours"
      ? t(`my.columns.${column}`)
      : t(`principal.columns.${column}`);

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
          <h1 className="text-title">{t("approvals.title")}</h1>
          <p className="text-sm text-muted-foreground" data-status-what>
            {what}
          </p>
          <p className="text-sm font-semibold tabular-nums" data-status-summary>
            {approved
              ? t("my.list.approvedSummary", {
                  count: list.count,
                  hours: list.hours === null ? "—" : format.quantity(list.hours),
                })
              : t("principal.list.summary", { count: list.count })}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="statusOrders"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("approvals.title")} line={t("principal.list.empty")} />
      ) : (
        <section className="rounded-xl border border-border bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="border-b border-border bg-muted text-xs font-medium text-muted-foreground max-sm:hidden">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {columnLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={row.orderId}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-status-row={row.orderId}
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
                    {row.departmentName ?? tOrders("noDepartment")}
                  </td>
                  <td className="px-4 py-3 max-sm:p-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <RequestStatusLabel status={row.status} />
                      {row.overdue && (
                        <span
                          data-overdue
                          className="inline-flex items-center gap-1 text-small font-semibold text-warning"
                        >
                          <Icon name="schedule" size={16} />
                          {tOrders("overdue")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    <span className="sm:hidden">
                      {t("principal.list.dated", {
                        label: t("principal.columns.submitted"),
                        date: format.date(row.submittedOn),
                      })}
                    </span>
                    <span className="max-sm:hidden">{format.date(row.submittedOn)}</span>
                  </td>
                  {approved ? (
                    <>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                        <span className="sm:hidden">
                          {t("principal.list.dated", {
                            label: t("my.columns.opened"),
                            date: row.openedOn ? format.date(row.openedOn) : "—",
                          })}
                        </span>
                        <span className="max-sm:hidden">
                          {row.openedOn ? format.date(row.openedOn) : "—"}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0"
                        data-hours
                      >
                        {t("speed.hours", {
                          hours:
                            row.approvalHours === null ? "—" : format.quantity(row.approvalHours),
                        })}
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0">
                      <span className="sm:hidden">
                        {t("principal.list.dated", {
                          label: t("principal.columns.neededBy"),
                          date: row.neededBy === null ? "—" : format.date(row.neededBy),
                        })}
                      </span>
                      <span className="max-sm:hidden">
                        {row.neededBy === null ? "—" : format.date(row.neededBy)}
                      </span>
                    </td>
                  )}
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
