import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getFormatters } from "@/i18n/get-formatters";

import type { MyCash } from "../queries/my-cash";
import type { MyEstimates } from "../queries/my-estimates";
import type { MyOrders } from "../queries/my-orders";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  TOP_ESTIMATES,
  analyticsSearch,
} from "../period-params";
import { countChangeText, hoursChangeText, shareChangeText } from "./change-text";
import { Card, Table } from "./prices-block";

// The Manager's blocks of the Analytics page (10-notifications-analytics-reports.md, Analytics
// page per role, "Manager, own branches"; build-plan 6.5b; plan of 6.5b, decided items 1 to 8):
// My orders (by status with its change, the average time to full approval, the share sent back
// with the most common reasons), My estimates (planned against paid price per product, the 10
// largest misses, and all products together) and My cash (the count of each open order, held and
// owed apart). Every number opens the list behind it with the user as the Manager filter, the
// orders the blocks read (point 3; decided item 8); My cash's table is the list behind its totals.
// The page computes nothing: the numbers are the query's. Stock planning: 6.5c.

type Common = { period: PeriodInput; filters: AnalyticsFilters; userId: string };

const linkClass = "font-semibold whitespace-nowrap text-primary underline-offset-2 hover:underline";
const tileNumber =
  "text-[28px] leading-[34px] font-bold tabular-nums underline-offset-4 hover:underline";

/** The filters with the user as the Manager: the lists behind the blocks' numbers. */
const mineOf = (filters: AnalyticsFilters, userId: string): AnalyticsFilters => ({
  ...filters,
  manager: userId,
});

/** My orders: by status, the hours to full approval, the share sent back and its reasons. */
export async function MyOrdersView({
  block,
  period,
  filters,
  userId,
}: Common & { block: MyOrders }) {
  const t = await getTranslations("analytics");
  const tStatus = await getTranslations("requestStatus");
  const format = await getFormatters();
  const mine = mineOf(filters, userId);
  const orders = (key: DrillKey) =>
    `/analytics/order-status?${analyticsSearch(period, mine, { key })}`;
  const sentBack = (reason?: string) =>
    `/analytics/approvals?${analyticsSearch(period, mine, {
      key: { kind: "step", step: null, decision: "SEND_BACK" },
      reason,
    })}`;
  const download = (which: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: which })}`;
  const count = (value: number) => format.quantity(String(value));

  return (
    <section
      aria-labelledby="my-orders-title"
      className="flex flex-col gap-4"
      data-analytics-block="my-orders"
    >
      <div className="flex flex-col gap-1">
        <h2 id="my-orders-title" className="text-[20px] leading-7 font-bold">
          {t("my.orders.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("my.orders.note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-4" data-my-orders-tile="hours">
          <p className="text-sm leading-5 font-semibold text-muted-foreground">
            {t("my.orders.approvalHours")}
          </p>
          {block.approval.hours === null ? (
            <p className="text-[15px] leading-[22px] text-muted-foreground">
              {t("my.orders.noApproval")}
            </p>
          ) : (
            <>
              <Link href={orders({ kind: "approved" })} className={tileNumber}>
                {t("speed.hours", { hours: format.quantity(block.approval.hours) })}
              </Link>
              <p className="text-sm leading-5 text-muted-foreground">
                {t("joined", {
                  first: t("speed.stays", { count: block.approval.count }),
                  second: hoursChangeText(block.approval.change, t, format),
                })}
              </p>
            </>
          )}
        </div>
        <div
          className="flex flex-col gap-1 rounded-lg bg-muted p-4"
          data-my-orders-tile="sent-back"
        >
          <p className="text-sm leading-5 font-semibold text-muted-foreground">
            {t("my.orders.sentBack")}
          </p>
          {block.sentBack.share === null ? (
            <p className="text-[15px] leading-[22px] text-muted-foreground">
              {t("my.orders.noDecision")}
            </p>
          ) : (
            <>
              <Link href={sentBack()} className={tileNumber}>
                {t("my.orders.share", {
                  share: format.quantity(block.sentBack.share),
                  count: block.sentBack.count,
                  decisions: block.decisions,
                })}
              </Link>
              <p className="text-sm leading-5 text-muted-foreground">
                {block.sentBack.change === null
                  ? t("my.orders.noDecisionBefore")
                  : shareChangeText(block.sentBack.change, t, format)}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="my-statuses" title={t("principal.orders.byStatus")} excel={download("myOrders")}>
          {block.statuses.length === 0 ? (
            <p className="text-sm leading-5 text-muted-foreground">{t("principal.orders.empty")}</p>
          ) : (
            <Table
              headings={[t("principal.columns.status"), t("principal.columns.orders")]}
              rows={[
                ...block.statuses.map((row) => ({
                  key: row.status,
                  cells: [
                    tStatus(row.status),
                    <>
                      <Link
                        href={orders({ kind: "status", status: row.status })}
                        className={linkClass}
                      >
                        {count(row.count)}
                      </Link>
                      <span className="block text-[13px] leading-[18px] text-muted-foreground">
                        {countChangeText(row.change, t, format)}
                      </span>
                    </>,
                  ],
                })),
                {
                  key: "total",
                  cells: [
                    <strong key="total">{t("principal.orders.total")}</strong>,
                    <>
                      <strong>{count(block.total.count)}</strong>
                      <span className="block text-[13px] leading-[18px] text-muted-foreground">
                        {countChangeText(block.total.change, t, format)}
                      </span>
                    </>,
                  ],
                },
              ]}
              data="my-statuses"
            />
          )}
        </Card>
        <Card id="my-reasons" title={t("my.orders.reasons")} excel={download("myReasons")}>
          {block.reasons.length === 0 ? (
            <p className="text-sm leading-5 text-muted-foreground">{t("speed.noReasons")}</p>
          ) : (
            <ol className="flex flex-col gap-2" data-my-reasons>
              {block.reasons.map((reason) => (
                <li key={reason.key} className="flex flex-col border-t pt-2" data-reason>
                  <span className="text-sm leading-5 break-words">{reason.text}</span>
                  <span className="text-sm leading-5 tabular-nums">
                    <Link href={sentBack(reason.key)} className={linkClass}>
                      {t("speed.times", { count: reason.count })}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      {countChangeText(reason.change, t, format)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </section>
  );
}

/** My estimates: the 10 largest misses between my planned price and the price I paid. */
export async function MyEstimatesView({
  block,
  period,
  filters,
  userId,
}: Common & { block: MyEstimates }) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const mine = mineOf(filters, userId);
  const records = (product: string | null) =>
    `/analytics/records?${analyticsSearch(period, mine, { key: { kind: "priced", product } })}`;
  const download = `/analytics/download?${analyticsSearch(period, filters, { block: "myEstimates" })}`;
  const price = (value: bigint | null) => (value === null ? "—" : format.money(value));
  const gap = (row: MyEstimates["all"]) => {
    if (row.difference === null || row.percent === null) return "—";
    const amount = format.money(row.difference < 0n ? -row.difference : row.difference);
    const percent = format.quantity(row.percent.replace(/^-/, ""));
    if (row.difference === 0n && /^-?0(\.0)?$/.test(row.percent)) return t("my.estimates.even");
    return row.difference < 0n || row.percent.startsWith("-")
      ? t("my.estimates.more", { amount, percent })
      : t("my.estimates.less", { amount, percent });
  };
  const changeLine = (points: string | null) =>
    points === null
      ? t("my.estimates.noBefore")
      : /^-?0(\.0)?$/.test(points)
        ? t("my.estimates.same")
        : t(points.startsWith("-") ? "my.estimates.pointsDown" : "my.estimates.pointsUp", {
            points: format.quantity(points.replace(/^-/, "")),
          });
  const row = (key: string, label: React.ReactNode, each: MyEstimates["all"], href: string) => ({
    key,
    cells: [
      label,
      <Link key="records" href={href} className={linkClass}>
        {t("my.estimates.records", { count: each.records })}
      </Link>,
      price(each.plannedPrice),
      price(each.actualPrice),
      <>
        <span className="font-semibold whitespace-nowrap">{gap(each)}</span>
        <span className="block text-[13px] leading-[18px] text-muted-foreground">
          {changeLine(each.change)}
        </span>
      </>,
    ],
  });

  return (
    <section
      aria-labelledby="my-estimates-title"
      className="flex flex-col gap-4"
      data-analytics-block="my-estimates"
    >
      <div className="flex flex-col gap-1">
        <h2 id="my-estimates-title" className="text-[20px] leading-7 font-bold">
          {t("my.estimates.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("my.estimates.note")}</p>
      </div>
      <Card id="my-estimates" title={t("my.estimates.byProduct")} excel={download}>
        {block.products.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">{t("my.estimates.empty")}</p>
        ) : (
          <Table
            headings={[
              t("principal.columns.product"),
              t("my.columns.records"),
              t("my.columns.planned"),
              t("my.columns.actual"),
              t("my.columns.difference"),
            ]}
            rows={[
              ...block.products
                .slice(0, TOP_ESTIMATES)
                .map((each) =>
                  row(
                    each.productId,
                    each.isActive ? each.name : t("inactive", { name: each.name }),
                    each,
                    records(each.productId),
                  ),
                ),
              row(
                "all",
                <strong key="all">{t("my.estimates.all")}</strong>,
                block.all,
                records(null),
              ),
            ]}
            data="my-estimates"
          />
        )}
      </Card>
    </section>
  );
}

/** My cash: the count of each of my open orders, held and owed apart (08). */
export async function MyCashView({
  block,
  filters,
  userId,
}: Omit<Common, "period"> & { block: MyCash }) {
  const t = await getTranslations("analytics");
  const tStatus = await getTranslations("requestStatus");
  const format = await getFormatters();
  const download = `/analytics/download?${analyticsSearch(
    { choice: "this_month", from: null, to: null },
    filters,
    { block: "myCash" },
  )}`;
  const held = `/analytics/cash?${analyticsSearch(
    { choice: "this_month", from: null, to: null },
    mineOf(filters, userId),
  )}`;

  return (
    <section
      aria-labelledby="my-cash-title"
      className="flex flex-col gap-4"
      data-analytics-block="my-cash"
    >
      <div className="flex flex-col gap-1">
        <h2 id="my-cash-title" className="text-[20px] leading-7 font-bold">
          {t("my.cash.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("my.cash.note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-4" data-my-cash-tile="held">
          <p className="text-sm leading-5 font-semibold text-muted-foreground">
            {t("my.cash.held")}
          </p>
          <Link href={held} className={tileNumber}>
            {format.money(block.held)}
          </Link>
        </div>
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-4" data-my-cash-tile="owed">
          <p className="text-sm leading-5 font-semibold text-muted-foreground">
            {t("my.cash.owed")}
          </p>
          <p className="text-[28px] leading-[34px] font-bold tabular-nums">
            {format.money(block.owed)}
          </p>
        </div>
      </div>
      <Card id="my-cash" title={t("my.cash.perOrder")} excel={download}>
        {block.rows.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">{t("my.cash.empty")}</p>
        ) : (
          <Table
            headings={[
              t("cash.columns.order"),
              t("cash.columns.product"),
              t("cash.columns.status"),
              t("cash.columns.since"),
              t("my.columns.count"),
            ]}
            rows={block.rows.map((row) => ({
              key: row.orderId,
              cells: [
                <Link key="order" href={`/orders/${row.orderId}`} className={linkClass}>
                  {row.orderNumber}
                </Link>,
                row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
                tStatus(row.status),
                format.date(row.since),
                row.cashCount > 0n
                  ? t("my.cash.holds", { amount: format.money(row.cashCount) })
                  : t("my.cash.isOwed", { amount: format.money(-row.cashCount) }),
              ],
            }))}
            data="my-cash"
          />
        )}
      </Card>
    </section>
  );
}
