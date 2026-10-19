import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BarChartBlock } from "@/components/charts/bar-chart";
import { WAITING_GROUP_KEYS } from "@/domain/analytics";
import { getFormatters } from "@/i18n/get-formatters";

import type { HeadSpending } from "../queries/head-spending";
import type { MyApprovals } from "../queries/my-approvals";
import type { OrderStatuses } from "../queries/order-statuses";
import type { TopProducts } from "../queries/top-products";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { countChangeText, hoursChangeText } from "./change-text";
import { Card, Table } from "./prices-block";
import { ChartCard, type ChartRow, chartPoints } from "./spending-block";

// The Principal's blocks of the Analytics page beyond 6.3's Spending and 6.4d's Warehouse
// (10-notifications-analytics-reports.md, Analytics page per role, "Principal, own branch";
// build-plan 6.5a; plan of 6.5a, decided items 2 to 8): Spending by department and the top 10
// products, each a chart with its table and Excel link; Orders by status with its change, coming
// up and overdue now; My approvals, waiting now by age and my average time to decide. Every
// number opens the list behind it (point 3). The page computes nothing: the numbers are the
// query's.

type Common = { period: PeriodInput; filters: AnalyticsFilters };

const linkClass = "font-semibold whitespace-nowrap text-primary underline-offset-2 hover:underline";

/** By department (6.4a's breakdown) and the top 10 products, under the shared Spending block. */
export async function PrincipalSpendingView({
  spending,
  products,
  period,
  filters,
}: Common & { spending: HeadSpending; products: TopProducts }) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const records = (scope: AnalyticsFilters, key: DrillKey = { kind: "period" }) =>
    `/analytics/records?${analyticsSearch(period, scope, { key })}`;
  const download = (block: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block })}`;
  const named = (name: string, isActive: boolean) => (isActive ? name : t("inactive", { name }));

  const charts: { id: ExportBlock; title: string; column: string; rows: ChartRow[] }[] = [
    {
      id: "departments",
      title: t("spending.byDepartment"),
      column: t("spending.columns.department"),
      rows: spending.departments.map((row) => ({
        href: records({ ...filters, department: row.id }),
        label: named(row.name, row.isActive),
        counted: row,
      })),
    },
    {
      id: "products",
      title: t("principal.topProducts"),
      column: t("principal.columns.product"),
      rows: products.products.map((row) => ({
        href: records(filters, { kind: "product", product: row.id }),
        label: named(row.name, row.isActive),
        counted: row,
      })),
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-analytics-block="principal-spending">
      {charts.map((chart) => (
        <ChartCard
          key={chart.id}
          id={`spending-${chart.id}`}
          title={chart.title}
          excel={download(chart.id)}
          firstColumn={chart.column}
          rows={chart.rows}
        >
          {chart.rows.length === 0 ? (
            <p className="text-[15px] leading-[22px] text-muted-foreground">{t("spending.none")}</p>
          ) : (
            <BarChartBlock points={chartPoints(chart.rows, t, format)} label={chart.title} />
          )}
        </ChartCard>
      ))}
    </div>
  );
}

/** Orders: by status of the orders first submitted in the period; coming up and overdue now. */
export async function OrdersView({ block, period, filters }: Common & { block: OrderStatuses }) {
  const t = await getTranslations("analytics");
  const tStatus = await getTranslations("requestStatus");
  const format = await getFormatters();
  const list = (key: DrillKey) =>
    `/analytics/order-status?${analyticsSearch(period, filters, { key })}`;
  const download = `/analytics/download?${analyticsSearch(period, filters, { block: "orderStatuses" })}`;
  const count = (value: number) => format.quantity(String(value));
  const tile = (id: string, label: string, value: number, href: string, line: string) => (
    <div className="flex flex-col gap-1 rounded-lg bg-muted p-4" data-orders-tile={id}>
      <p className="text-sm leading-5 font-semibold text-muted-foreground">{label}</p>
      <Link
        href={href}
        className="text-[28px] leading-[34px] font-bold tabular-nums underline-offset-4 hover:underline"
      >
        {count(value)}
      </Link>
      <p className="text-sm leading-5 text-muted-foreground">{line}</p>
    </div>
  );
  const today = format.date(block.today);

  return (
    <section
      aria-labelledby="orders-title"
      className="flex flex-col gap-4"
      data-analytics-block="orders"
    >
      <div className="flex flex-col gap-1">
        <h2 id="orders-title" className="text-[20px] leading-7 font-bold">
          {t("principal.orders.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("principal.orders.note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {tile(
          "soon",
          t("principal.orders.comingUp"),
          block.comingUp,
          list({ kind: "due", due: "soon" }),
          t("principal.orders.comingUpLine", { date: today }),
        )}
        {tile(
          "overdue",
          t("principal.orders.overdue"),
          block.overdue,
          list({ kind: "due", due: "overdue" }),
          t("principal.orders.overdueLine", { date: today }),
        )}
      </div>
      <Card id="orders-statuses" title={t("principal.orders.byStatus")} excel={download}>
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
                    <Link href={list({ kind: "status", status: row.status })} className={linkClass}>
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
                    <Link href={list({ kind: "status", status: null })} className={linkClass}>
                      {count(block.total.count)}
                    </Link>
                    <span className="block text-[13px] leading-[18px] text-muted-foreground">
                      {countChangeText(block.total.change, t, format)}
                    </span>
                  </>,
                ],
              },
            ]}
            data="statuses"
          />
        )}
      </Card>
    </section>
  );
}

/** My approvals: the orders waiting for me by age, and my average time to decide. */
export async function MyApprovalsView({ block, period, filters }: Common & { block: MyApprovals }) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const approvals = (key: DrillKey) =>
    `/analytics/approvals?${analyticsSearch(period, filters, { key })}`;
  const download = `/analytics/download?${analyticsSearch(period, filters, { block: "myApprovals" })}`;
  const count = (value: number) => format.quantity(String(value));
  const groups = [...WAITING_GROUP_KEYS, null] as const;

  return (
    <section
      aria-labelledby="my-approvals-title"
      className="flex flex-col gap-4"
      data-analytics-block="my-approvals"
    >
      <h2 id="my-approvals-title" className="text-[20px] leading-7 font-bold">
        {t("principal.approvals.title")}
      </h2>
      <Card id="my-approvals" title={t("principal.approvals.title")} excel={download}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-lg bg-muted p-4" data-my-hours>
            <p className="text-sm leading-5 font-semibold text-muted-foreground">
              {t("principal.approvals.myHours")}
            </p>
            {block.mine.hours === null ? (
              <p className="text-[15px] leading-[22px] text-muted-foreground">
                {t("principal.approvals.noDecision")}
              </p>
            ) : (
              <>
                <Link
                  href={approvals({ kind: "mine" })}
                  className="text-[28px] leading-[34px] font-bold tabular-nums underline-offset-4 hover:underline"
                >
                  {t("speed.hours", { hours: format.quantity(block.mine.hours) })}
                </Link>
                <p className="text-sm leading-5 text-muted-foreground">
                  {t("joined", {
                    first: t("speed.stays", { count: block.mine.count }),
                    second: hoursChangeText(block.mine.change, t, format),
                  })}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-muted p-4" data-my-waiting>
            <p className="text-sm leading-5 font-semibold text-muted-foreground">
              {t("principal.approvals.waiting")}
            </p>
            <Link
              href={approvals({ kind: "waiting", step: "PENDING_PRINCIPAL", group: null })}
              className="text-[28px] leading-[34px] font-bold tabular-nums underline-offset-4 hover:underline"
            >
              {count(block.waiting.all)}
            </Link>
            <p className="text-sm leading-5 text-muted-foreground">{t("speed.waitingNote")}</p>
          </div>
        </div>
        <Table
          headings={[t("principal.approvals.age"), t("principal.columns.orders")]}
          rows={groups.map((group) => ({
            key: group ?? "all",
            cells: [
              group ? (
                t(`speed.group.${group}`)
              ) : (
                <strong key="all">{t("speed.columns.all")}</strong>
              ),
              <Link
                key="count"
                href={approvals({ kind: "waiting", step: "PENDING_PRINCIPAL", group })}
                className={linkClass}
              >
                {count(block.waiting[group ?? "all"])}
              </Link>,
            ],
          }))}
          data="my-waiting"
        />
      </Card>
    </section>
  );
}
