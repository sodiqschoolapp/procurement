import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BarChartBlock } from "@/components/charts/bar-chart";
import type { ChartPoint } from "@/components/charts/chart-point";
import { LineChartBlock } from "@/components/charts/line-chart";
import { getFormatters } from "@/i18n/get-formatters";

import type { Counted, SpendingBlock } from "../queries/spending";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { changeText } from "./change-text";

// The shared Spending block of the Analytics page (10-notifications-analytics-reports.md, Analytics
// page per role; plan of 6.3, decided item 12): the period's total with its change, a line chart by
// month and a bar chart by category, each with its table under it and its Excel link (point 4).
// Every number, point, bar and row opens the records behind it (point 3); every number shows its
// change (point 1). The page computes nothing: the amounts and changes are the query's.

/** One row of a chart's table and one bar or point: what it shows and the list behind it. */
export type ChartRow = { href: string; label: string; counted: Counted };

export async function SpendingBlockView({
  block,
  period,
  filters,
}: {
  block: SpendingBlock;
  period: PeriodInput;
  filters: AnalyticsFilters;
}) {
  const t = await getTranslations("analytics");
  const tMonths = await getTranslations("months");
  const format = await getFormatters();
  const records = (key: DrillKey) =>
    `/analytics/records?${analyticsSearch(period, filters, { key })}`;
  const download = (exportBlock: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: exportBlock })}`;
  const monthLabel = (month: string) =>
    t("monthLabel", {
      month: tMonths(String(Number(month.slice(5))) as "1"),
      year: month.slice(0, 4),
    });

  const monthRows: ChartRow[] = block.months.map((point) => ({
    href: records({ kind: "month", month: point.month }),
    label: monthLabel(point.month),
    counted: point,
  }));
  const categoryRows: ChartRow[] = block.categories.map((category) => ({
    href: records({ kind: "category", category: category.id }),
    label: category.isActive ? category.name : t("inactive", { name: category.name }),
    counted: category,
  }));
  const pointsOf = (rows: ChartRow[]) => chartPoints(rows, t, format);
  const empty = block.total.amount === 0n && block.categories.length === 0;

  return (
    <section
      aria-labelledby="spending-title"
      className="flex flex-col gap-4"
      data-analytics-block="spending"
    >
      <h2 id="spending-title" className="text-heading font-semibold">
        {t("spending.title")}
      </h2>
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <p className="text-sm leading-5 font-semibold text-muted-foreground">
          {t("spending.total")}
        </p>
        <Link
          href={records({ kind: "period" })}
          className="inline-flex min-h-11 min-w-11 items-center text-title tabular-nums underline-offset-4 hover:underline"
          data-spending-total
        >
          {format.money(block.total.amount)}
        </Link>
        <p className="text-sm leading-5 text-muted-foreground tabular-nums" data-spending-change>
          {changeText(block.total.change, t, format)}
        </p>
      </div>
      {empty ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground max-sm:p-4 sm:p-5">
          {t("spending.empty")}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            id="spending-months"
            title={t("spending.byMonth")}
            excel={download("months")}
            firstColumn={t("spending.columns.month")}
            rows={monthRows}
          >
            <LineChartBlock points={pointsOf(monthRows)} label={t("spending.byMonth")} />
          </ChartCard>
          <ChartCard
            id="spending-categories"
            title={t("spending.byCategory")}
            excel={download("categories")}
            firstColumn={t("spending.columns.category")}
            rows={categoryRows}
          >
            <BarChartBlock points={pointsOf(categoryRows)} label={t("spending.byCategory")} />
          </ChartCard>
        </div>
      )}
    </section>
  );
}

/** The points of a chart from the rows of its table: every text the server's. */
export function chartPoints(
  rows: readonly ChartRow[],
  t: Parameters<typeof changeText>[1],
  format: Awaited<ReturnType<typeof getFormatters>>,
): ChartPoint[] {
  return rows.map((row) => ({
    key: row.href,
    label: row.label,
    // The drawing's height only (src/components/charts/chart-point.ts).
    value: Number(row.counted.amount),
    shown: format.money(row.counted.amount),
    change: changeText(row.counted.change, t, format),
    href: row.href,
  }));
}

/** A chart with its title, its Excel link and its table under it (10 points 3 and 4). */
export async function ChartCard({
  id,
  title,
  excel,
  firstColumn,
  rows,
  children,
}: {
  id: string;
  title: string;
  excel: string;
  firstColumn: string;
  rows: ChartRow[];
  children: React.ReactNode;
}) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
      data-chart-card={id}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`${id}-title`} className="text-subheading font-semibold">
          {title}
        </h3>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline sm:min-h-0"
          data-excel={id}
        >
          {t("excel")}
        </a>
      </div>
      {children}
      {/* A table wider than a phone scrolls; the keyboard reaches it too (WCAG 2.1.1; plan of 9.1d). */}
      <div
        tabIndex={0}
        className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[28rem] border-collapse text-left text-sm leading-5">
          <thead className="border-b border-border bg-muted text-xs font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">
                {firstColumn}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("spending.columns.amount")}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("spending.columns.change")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.href} className="border-t" data-chart-row={row.label}>
                <th scope="row" className="px-3 py-2 font-normal">
                  <Link
                    href={row.href}
                    className="font-semibold text-link underline-offset-2 hover:underline"
                  >
                    {row.label}
                  </Link>
                </th>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums" data-amount>
                  {format.money(row.counted.amount)}
                </td>
                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                  {changeText(row.counted.change, t, format)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
