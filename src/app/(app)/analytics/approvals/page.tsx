import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import {
  RECORDS_PAGE_SIZE,
  analyticsSearch,
  parseAnalyticsParams,
} from "@/features/analytics/period-params";
import { getApprovalOrders } from "@/features/analytics/queries/approval-orders";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { PageLinks } from "../../catalog/page-links";

// /analytics/approvals, the orders behind an Approval speed number (10-notifications-analytics-
// reports.md, Analytics page per role, point 3: "Clicking any bar, slice or number opens the list
// of orders or records that make it up"; build-plan 6.4b; plan of 6.4b, decided item 12): the
// stays decided at a step, of a decision or a reason, or the orders waiting now in an age group.
// Its count and average are the number clicked; 50 a page; each row opens its order; the list
// exports to Excel (point 4). The address is the page's, with `key` and `reason`; one the parser
// or the query refuses goes back to /analytics, another branch is Not found. A table at 1440 px,
// cards at 375 px, as /analytics/orders.

type Raw = Record<string, string | string[] | undefined>;

async function readList(userId: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params || params.otherOwners) return "refused" as const;
  try {
    const list = await getApprovalOrders(
      userId,
      params.period,
      params.filters,
      params.key,
      params.reason,
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

export default async function AnalyticsApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Raw>;
}) {
  const user = await requireUser("/analytics/approvals");
  const read = await readList(user.id, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { params, list } = read;
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const dates = { first: format.date(list.period.first), last: format.date(list.period.last) };
  const { key } = list;
  const step =
    key.kind !== "mine" && key.step ? t(`speed.step.${key.step}`) : t("approvals.allSteps");
  const what =
    key.kind === "mine"
      ? t("approvals.mine", dates)
      : key.kind === "waiting"
        ? t("approvals.waiting", {
            step,
            group: key.group ? t(`speed.group.${key.group}`) : t("approvals.allAges"),
          })
        : key.decision === null
          ? t("approvals.stays", { step, ...dates })
          : list.reason !== null
            ? t("approvals.reason", {
                decision: t(`approvals.decision.${key.decision}`),
                reason: list.rows[0]?.reason ?? list.reason,
                ...dates,
              })
            : t("approvals.decided", {
                step,
                decision: t(`approvals.decision.${key.decision}`),
                ...dates,
              });
  const summary =
    key.kind === "waiting"
      ? t("approvals.summaryWaiting", { count: list.count })
      : list.hours === null
        ? t("approvals.summaryNone")
        : t("approvals.summary", { count: list.count, hours: format.quantity(list.hours) });
  const pages = Math.max(1, Math.ceil(list.count / RECORDS_PAGE_SIZE));
  const href = (page: number) =>
    `/analytics/approvals?${analyticsSearch(params.period, params.filters, {
      key: params.key,
      reason: params.reason,
      page,
    })}`;
  const excel = `/analytics/download?${analyticsSearch(params.period, params.filters, {
    key: params.key,
    reason: params.reason,
    block: "approvals",
  })}`;
  const at = (moment: Date) => `${format.date(moment)} ${format.time(moment)}`;

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
          <p className="text-sm text-muted-foreground" data-approvals-what>
            {what}
          </p>
          <p className="text-sm font-semibold tabular-nums" data-approvals-summary>
            {summary}
          </p>
        </div>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline"
          data-excel="approvals"
        >
          {t("excel")}
        </a>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState title={t("approvals.title")} line={t("approvals.empty")} />
      ) : (
        <section className="rounded-xl border border-border bg-card text-card-foreground">
          <table className="w-full border-collapse text-left text-sm leading-5 max-sm:block">
            <thead className="bg-muted text-small font-semibold text-muted-foreground max-sm:hidden">
              <tr>
                {(
                  [
                    "order",
                    "product",
                    "branch",
                    "step",
                    "entered",
                    ...(key.kind !== "waiting" ? (["left", "decision", "reason"] as const) : []),
                  ] as const
                ).map((column) => (
                  <th key={column} scope="col" className="px-4 py-3">
                    {t(`approvals.columns.${column}`)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right">
                  {t("approvals.columns.hours")}
                </th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {list.rows.map((row) => (
                <tr
                  key={`${row.orderId}-${row.step}-${row.enteredAt.toISOString()}`}
                  className="border-t max-sm:flex max-sm:flex-col max-sm:gap-1 max-sm:px-4 max-sm:py-3"
                  data-approval-row={row.orderId}
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
                    {t(`speed.step.${row.step}`)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                    {at(row.enteredAt)}
                  </td>
                  {key.kind !== "waiting" && (
                    <>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-muted-foreground">
                        {row.leftAt ? at(row.leftAt) : ""}
                      </td>
                      <td className="px-4 py-3 max-sm:p-0">
                        {row.decision ? t(`approvals.decision.${row.decision}`) : ""}
                      </td>
                      <td className="px-4 py-3 break-words max-sm:p-0 max-sm:text-muted-foreground">
                        {row.reason ?? ""}
                      </td>
                    </>
                  )}
                  <td
                    className="px-4 py-3 text-right whitespace-nowrap tabular-nums max-sm:p-0 max-sm:text-left max-sm:font-semibold"
                    data-hours
                  >
                    {t("speed.hours", { hours: format.quantity(row.hours) })}
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
