import { getTranslations } from "next-intl/server";

import { BarChartBlock } from "@/components/charts/bar-chart";
import { getFormatters } from "@/i18n/get-formatters";

import type { HeadSpending } from "../queries/head-spending";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { ChartCard, type ChartRow, chartPoints } from "./spending-block";

// The Head's four Spending charts under 6.3's months and categories
// (10-notifications-analytics-reports.md, Analytics page per role, Head, Spending: "branches side
// by side; by department; top 10 suppliers; split by payment type"; build-plan 6.4a). Each with
// its table and Excel link (point 4); a branch, department or supplier opens the records of the
// page under that filter, a payment type the records with a part of it (point 3; plan of 6.4,
// decided item 9). The page computes nothing: the amounts and changes are the query's.

export async function HeadSpendingView({
  block,
  period,
  filters,
}: {
  block: HeadSpending;
  period: PeriodInput;
  filters: AnalyticsFilters;
}) {
  const t = await getTranslations("analytics");
  const tPayment = await getTranslations("paymentTypes");
  const format = await getFormatters();
  const records = (scope: AnalyticsFilters, key: DrillKey = { kind: "period" }) =>
    `/analytics/records?${analyticsSearch(period, scope, { key })}`;
  const download = (exportBlock: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: exportBlock })}`;
  const named = (name: string, isActive: boolean) => (isActive ? name : t("inactive", { name }));

  const charts: { id: ExportBlock; title: string; column: string; rows: ChartRow[] }[] = [
    {
      id: "branches",
      title: t("spending.byBranch"),
      column: t("spending.columns.branch"),
      rows: block.branches.map((row) => ({
        href: records({ ...filters, branch: row.id }),
        label: named(row.name, row.isActive),
        counted: row,
      })),
    },
    {
      id: "departments",
      title: t("spending.byDepartment"),
      column: t("spending.columns.department"),
      rows: block.departments.map((row) => ({
        href: records({ ...filters, department: row.id }),
        label: t("departmentOption", {
          name: named(row.name, row.isActive),
          branch: row.branchName,
        }),
        counted: row,
      })),
    },
    {
      id: "suppliers",
      title: t("spending.topSuppliers"),
      column: t("spending.columns.supplier"),
      rows: block.suppliers.map((row) => ({
        href: records({ ...filters, supplier: row.id }),
        label: named(row.name, row.isActive),
        counted: row,
      })),
    },
    {
      id: "payments",
      title: t("spending.byPayment"),
      column: t("spending.columns.payment"),
      rows: block.payments.map((row) => ({
        href: records(filters, { kind: "payment", payment: row.payment }),
        label: tPayment(row.payment),
        counted: row,
      })),
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-analytics-block="head-spending">
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
