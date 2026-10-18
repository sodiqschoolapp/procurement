import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BarChartBlock } from "@/components/charts/bar-chart";
import type { ChartPoint } from "@/components/charts/chart-point";
import { getFormatters } from "@/i18n/get-formatters";

import type { DepartmentUseRow, Warehouse, WarehouseTotals } from "../queries/warehouse";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { amountChangeText, changeText } from "./change-text";
import { Card, Table } from "./prices-block";

// The Warehouse block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Stock value per branch; low-stock items; use by department;
// items with no movement for 90 days; value written off"; build-plan 6.4d; plan of 6.4d, decided
// items 1 to 8). Per branch, with "All branches" last: stock value, low-stock items and the
// items with no movement open /analytics/stock, written off /analytics/moves, each with the branch
// filter set (point 3); use by department is a bar chart with its table, each bar and row opening
// the department's movements. Stock is of now and has no change (decided item 2); written off and
// use show theirs (point 1). A Manager or supplier filter, and a department beside the numbers it
// does not filter, are named in one line (decided item 6). The page computes nothing.
// The Principal's Warehouse (10 Analytics, Principal: "Stock value; low stock; what each
// department used"; plan of 6.5a, decided item 9) shows the same block for the one branch, without
// the items with no movement and the value written off, which stay on the Head's page.

export async function WarehouseView({
  block,
  period,
  filters,
  principal = false,
}: {
  block: Warehouse;
  period: PeriodInput;
  filters: AnalyticsFilters;
  principal?: boolean;
}) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const stock = (branch: string | null, key: DrillKey) =>
    `/analytics/stock?${analyticsSearch(period, { ...filters, branch }, { key })}`;
  const moves = (chosen: AnalyticsFilters, key: DrillKey) =>
    `/analytics/moves?${analyticsSearch(period, chosen, { key })}`;
  const download = (exportBlock: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: exportBlock })}`;
  const link = (href: string, text: string) => (
    <Link
      href={href}
      className="font-semibold whitespace-nowrap text-primary underline-offset-2 hover:underline"
    >
      {text}
    </Link>
  );
  const under = (text: string) => (
    <span className="block text-[13px] leading-[18px] text-muted-foreground">{text}</span>
  );
  const nowCells = (branch: string | null, row: WarehouseTotals) => [
    link(stock(branch, { kind: "stock", view: "value" }), format.money(row.value)),
    link(stock(branch, { kind: "stock", view: "low" }), format.quantity(String(row.low))),
  ];
  const cells = (branch: string | null, row: WarehouseTotals) => [
    ...nowCells(branch, row),
    ...(principal ? [] : headCells(branch, row)),
  ];
  const headCells = (branch: string | null, row: WarehouseTotals) => [
    <>
      {link(stock(branch, { kind: "stock", view: "still" }), format.quantity(String(row.still)))}
      {under(format.money(row.stillValue))}
    </>,
    <>
      {link(
        moves({ ...filters, branch }, { kind: "moves", move: "writeoff" }),
        format.money(row.writtenOff),
      )}
      {under(changeText(row.writtenOffChange, t, format))}
    </>,
  ];
  const usedHref = (row: DepartmentUseRow) =>
    moves({ ...filters, department: row.id }, { kind: "moves", move: "use" });
  const usedLabel = (row: DepartmentUseRow) =>
    t("departmentOption", {
      name: row.isActive ? row.name : t("inactive", { name: row.name }),
      branch: row.branchCode,
    });
  const usedChange = (row: DepartmentUseRow) =>
    row.change
      ? changeText(row.change, t, format)
      : amountChangeText(row.used - row.before, t, format);
  const points: ChartPoint[] = block.departments.map((row) => ({
    key: row.id,
    label: usedLabel(row),
    // The drawing's height only (src/components/charts/chart-point.ts).
    value: Number(row.used),
    shown: format.money(row.used),
    change: usedChange(row),
    href: usedHref(row),
  }));
  const notApplied = filters.manager !== null || filters.supplier !== null;

  return (
    <section
      aria-labelledby="warehouse-title"
      className="flex flex-col gap-4"
      data-analytics-block="warehouse"
    >
      <div className="flex flex-col gap-1">
        <h2 id="warehouse-title" className="text-[20px] leading-7 font-bold">
          {t("warehouse.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">
          {principal
            ? t("warehouse.principalNote")
            : t("warehouse.note", { date: format.date(block.stillSince) })}
        </p>
        {notApplied && (
          <p className="text-sm leading-5 text-muted-foreground" data-warehouse-filters>
            {t("warehouse.notApplied")}
          </p>
        )}
        {filters.department !== null && (
          <p className="text-sm leading-5 text-muted-foreground" data-warehouse-department>
            {t("warehouse.departmentOnly")}
          </p>
        )}
      </div>

      <Card id="warehouse-branches" title={t("warehouse.perBranch")} excel={download("warehouse")}>
        {block.branches.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">{t("warehouse.empty")}</p>
        ) : (
          <Table
            headings={[
              t("warehouse.columns.branch"),
              t("warehouse.columns.value"),
              t("warehouse.columns.low"),
              ...(principal
                ? []
                : [t("warehouse.columns.still"), t("warehouse.columns.writtenOff")]),
            ]}
            rows={[
              ...block.branches.map((row) => ({
                key: row.id,
                cells: [
                  row.isActive ? row.name : t("inactive", { name: row.name }),
                  ...cells(row.id, row),
                ],
              })),
              ...(!principal && (block.branches.length > 1 || filters.branch === null)
                ? [{ key: "all", cells: [t("allBranches"), ...cells(null, block.all)] }]
                : []),
            ]}
            data="warehouse"
          />
        )}
      </Card>

      <Card id="warehouse-use" title={t("warehouse.use.title")} excel={download("departmentUse")}>
        <p className="text-sm leading-5 text-muted-foreground">{t("warehouse.use.note")}</p>
        {block.departments.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">{t("warehouse.use.empty")}</p>
        ) : (
          <>
            <BarChartBlock points={points} label={t("warehouse.use.title")} />
            <Table
              headings={[t("warehouse.use.columns.department"), t("warehouse.use.columns.used")]}
              rows={block.departments.map((row) => ({
                key: row.id,
                cells: [
                  link(usedHref(row), usedLabel(row)),
                  <>
                    <span className="font-semibold whitespace-nowrap">
                      {row.used < 0n
                        ? t("warehouse.use.returned", { amount: format.money(-row.used) })
                        : format.money(row.used)}
                    </span>
                    {under(usedChange(row))}
                  </>,
                ],
              }))}
              data="department-use"
            />
          </>
        )}
      </Card>
    </section>
  );
}
