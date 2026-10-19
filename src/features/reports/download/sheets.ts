import { createTranslator } from "next-intl";

import { CASH_AGE_BAND_KEYS, type DateRange } from "@/domain/analytics";
import { STUCK_STATUSES } from "@/domain/order-steps";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import { bindFormatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import type { AnalyticsSheet, CellValue } from "../../analytics/download/excel";
import type { AnalyticsFilterOptions } from "../../analytics/queries/filters";
import type { Report, ReportParams } from "../report-params";
import type { ApprovalSpeedReport, StepHours } from "../queries/approval-speed-report";
import type { DepartmentUseReport } from "../queries/department-use-report";
import type { MoneyWithManagersReport } from "../queries/money-with-managers-report";
import type { PlanVsActualReport, Sums } from "../queries/plan-vs-actual-report";
import type { PriceHistoryReport } from "../queries/price-history-report";
import type { PurchaseRegister, RegisterRecord } from "../queries/purchase-register";
import type { SpendingLine, SpendingReport } from "../queries/spending-report";
import type { StockMovementsReport } from "../queries/stock-movements-report";
import type { StockReport } from "../queries/stock-report";

// The sheets of the report files (10-notifications-analytics-reports.md, Reports: "exports to
// Excel"; build-plan 6.8: "Excel export with real numbers and dates"; plan of 6.8, decided item 8):
// each table of a report as one sheet, with the report's name, the dates, the filters chosen and,
// for a report read from the summary, its time above it, in the downloader's language. Money,
// quantities and counts are number cells and dates date cells (writeAnalyticsWorkbook()); every
// number is the query's, the file only lays it out.

const MESSAGES = { uz, ru, en } satisfies Record<Locale, unknown>;

function translators(locale: Locale) {
  const messages = MESSAGES[locale];
  const t = createTranslator({ locale, messages, namespace: "reports" });
  const tRoot = createTranslator({ locale, messages });
  return { t, tRoot, format: bindFormatters(locale, tRoot("format.currency")) };
}

type Context = {
  params: Pick<ReportParams, "range" | "filters">;
  options: AnalyticsFilterOptions;
  locale: Locale;
};

/** The lines above every table of a report. */
function heading(
  { params, options, locale }: Context,
  report: Report,
  table: string | null,
  /** `null`: a report of now, which the dates do not change (plan of 6.9b, decided item 3). */
  range: DateRange | null,
  fromSummary: boolean,
): string[] {
  const { t, format } = translators(locale);
  const lines = [table ? `${t(`tabs.${report}`)}: ${table}` : t(`tabs.${report}`)];
  if (range) {
    lines.push(
      `${t("period")}: ${t("periodLine", { first: format.date(range.first), last: format.date(range.last) })}`,
    );
  }
  const named = (list: readonly { id: string; name: string }[], id: string | null) =>
    list.find((option) => option.id === id)?.name ?? null;
  const branch = named(options.branches, params.filters.branch);
  const category = named(options.categories, params.filters.category);
  if (branch) lines.push(`${t("branch")}: ${branch}`);
  if (category) lines.push(`${t("category")}: ${category}`);
  if (fromSummary) {
    lines.push(
      options.refreshedAt
        ? t("refreshed", { time: format.time(options.refreshedAt) })
        : t("refreshing"),
    );
  }
  return lines;
}

const text = (value: string): CellValue => ({ kind: "text", value });
const money = (value: bigint): CellValue => ({ kind: "money", value });

/** The Purchase register: the records that count, then the cancelled ones (decided item 2). */
export function purchaseRegisterSheets(
  register: PurchaseRegister,
  context: Context,
): AnalyticsSheet[] {
  const { t, tRoot } = translators(context.locale);
  const columns = [
    t("purchases.columns.date"),
    t("purchases.columns.order"),
    t("purchases.columns.branch"),
    t("purchases.columns.department"),
    t("purchases.columns.owner"),
    t("purchases.columns.product"),
    t("purchases.columns.subtype"),
    t("purchases.columns.supplier"),
    t("purchases.columns.qty"),
    t("purchases.columns.unitPrice"),
    t("purchases.columns.goods"),
    t("purchases.columns.extras"),
    t("purchases.columns.total"),
    ...PAYMENT_TYPES.map((type) => tRoot(`paymentTypes.${type}`)),
    t("purchases.columns.receipt"),
  ];
  // The column of the record total, 1-based: the total line goes under it.
  const totalColumn = 13;
  const cells = (row: RegisterRecord): CellValue[] => [
    { kind: "date", value: row.purchasedOn },
    text(row.orderNumber),
    text(row.branchName),
    text(row.departmentName),
    text(row.ownerName),
    text(row.productName),
    text(row.subtypeName ?? ""),
    text(row.supplierName ?? t("purchases.noSupplier")),
    { kind: "quantity", value: row.qty },
    money(row.unitPrice),
    money(row.goods),
    money(row.extras),
    money(row.total),
    ...PAYMENT_TYPES.map((type) =>
      money(row.parts.find((part) => part.paymentType === type)?.amount ?? 0n),
    ),
    text(row.hasReceipt ? t("purchases.yes") : t("purchases.no")),
  ];
  const counted = register.rows.filter((row) => row.cancelReason === null);
  const cancelled = register.rows.filter((row) => row.cancelReason !== null);
  return [
    {
      name: t("purchases.sheet"),
      heading: heading(context, "purchases", null, register.range, false),
      columns,
      rows: counted.map(cells),
      total: { label: t("total"), amount: register.total, column: totalColumn },
    },
    {
      name: t("purchases.cancelledSheet"),
      heading: heading(context, "purchases", t("purchases.cancelledSheet"), register.range, false),
      columns: [...columns, t("purchases.columns.cancelReason")],
      rows: cancelled.map((row) => [...cells(row), text(row.cancelReason ?? "")]),
    },
  ];
}

/** Planned vs actual: by order, by product, by Manager, each with its total line. */
export function planVsActualSheets(report: PlanVsActualReport, context: Context): AnalyticsSheet[] {
  const { t, tRoot } = translators(context.locale);
  const sumColumns = [
    t("plan.columns.orders"),
    t("plan.columns.planned"),
    t("plan.columns.actual"),
    t("plan.columns.difference"),
  ];
  const sumCells = (sums: Sums): CellValue[] => [
    { kind: "count", value: sums.orders },
    money(sums.planned),
    money(sums.actual),
    { kind: "signedMoney", value: sums.difference },
  ];
  const total = { label: t("total"), amount: report.total.difference, signed: true, column: 5 };
  const table = (name: string, rows: { name: string; sums: Sums }[]): AnalyticsSheet => ({
    name,
    heading: heading(context, "plan", name, report.range, true),
    columns: [t("plan.columns.name"), ...sumColumns],
    rows: rows.map((row) => [text(row.name), ...sumCells(row.sums)]),
    total,
  });
  return [
    {
      name: t("plan.byOrder"),
      heading: heading(context, "plan", t("plan.byOrder"), report.range, true),
      columns: [
        t("plan.columns.order"),
        t("plan.columns.branch"),
        t("plan.columns.owner"),
        t("plan.columns.product"),
        t("plan.columns.ended"),
        t("plan.columns.outcome"),
        t("plan.columns.planned"),
        t("plan.columns.actual"),
        t("plan.columns.difference"),
      ],
      rows: report.orders.map((row) => [
        text(row.number),
        text(row.branchName),
        text(row.ownerName),
        text(row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName),
        { kind: "date", value: row.endedOn },
        text(
          tRoot(
            `colourLabel.total.${row.colour === "green" ? "even" : row.colour === "amber" ? "left" : "over"}`,
          ),
        ),
        money(row.planned),
        money(row.actual),
        { kind: "signedMoney", value: row.difference },
      ]),
      total: { ...total, column: 9 },
    },
    table(
      t("plan.byProduct"),
      report.products.map((row) => ({ name: row.name, sums: row })),
    ),
    table(
      t("plan.byManager"),
      report.managers.map((row) => ({ name: row.name ?? t("plan.otherOwners"), sums: row })),
    ),
  ];
}

/** Spending: by branch, category, department, supplier and month, each adding up to the total. */
export function spendingSheets(report: SpendingReport, context: Context): AnalyticsSheet[] {
  const { t, tRoot } = translators(context.locale);
  const table = (
    name: string,
    first: string,
    lines: SpendingLine[],
    label: (line: SpendingLine) => string,
  ): AnalyticsSheet => ({
    name,
    heading: heading(context, "spending", name, report.range, true),
    columns: [first, t("spending.columns.records"), t("spending.columns.amount")],
    rows: lines.map((line) => [
      text(label(line)),
      { kind: "count", value: line.records },
      money(line.amount),
    ]),
    total: { label: t("total"), amount: report.total, column: 3 },
  });
  const month = (key: string) =>
    tRoot("analytics.monthLabel", {
      month: tRoot(`months.${String(Number(key.slice(5))) as "1"}`),
      year: key.slice(0, 4),
    });
  return [
    table(t("spending.byBranch"), t("spending.columns.branch"), report.branches, (l) => l.name!),
    table(
      t("spending.byCategory"),
      t("spending.columns.category"),
      report.categories,
      (l) => l.name!,
    ),
    table(t("spending.byDepartment"), t("spending.columns.department"), report.departments, (l) => {
      const department = report.departments.find((each) => each.id === l.id);
      return department ? `${department.name}, ${department.branchName}` : l.name!;
    }),
    table(
      t("spending.bySupplier"),
      t("spending.columns.supplier"),
      report.suppliers,
      (l) => l.name ?? t("spending.noSupplier"),
    ),
    table(t("spending.byMonth"), t("spending.columns.month"), report.months, (l) => month(l.name!)),
  ];
}

/** Stock on hand: the branches with their two in-lines, then every stock line. */
export function stockReportSheets(report: StockReport, context: Context): AnalyticsSheet[] {
  const { t } = translators(context.locale);
  return [
    {
      name: t("stock.byBranch"),
      heading: heading(context, "stock", t("stock.byBranch"), report.range, false),
      columns: [
        t("stock.columns.branch"),
        t("stock.columns.value"),
        t("stock.columns.purchases"),
        t("stock.columns.directEntries"),
      ],
      rows: [
        ...report.branches.map((row) => [
          text(row.name),
          money(row.value),
          money(row.purchases),
          money(row.directEntries),
        ]),
        [
          text(t("allBranchesTotal")),
          money(report.all.value),
          money(report.all.purchases),
          money(report.all.directEntries),
        ],
      ],
    },
    {
      name: t("stock.lines"),
      heading: heading(context, "stock", t("stock.lines"), report.range, false),
      columns: [
        t("stock.columns.branch"),
        t("stock.columns.product"),
        t("stock.columns.subtype"),
        t("stock.columns.qty"),
        t("stock.columns.measure"),
        t("stock.columns.average"),
        t("stock.columns.value"),
      ],
      rows: report.lines.map((row) => [
        text(row.branchCode),
        text(row.productName),
        text(row.subtypeName ?? ""),
        { kind: "quantity", value: row.qty },
        text(row.unitShortName),
        money(row.avgCost),
        money(row.value),
      ]),
      total: { label: t("total"), amount: report.all.value, column: 7 },
    },
  ];
}

/** Stock movements: every movement of the dates, signed. */
export function stockMovementsSheets(
  report: StockMovementsReport,
  context: Context,
): AnalyticsSheet[] {
  const { t, tRoot } = translators(context.locale);
  return [
    {
      name: t("movements.sheet"),
      heading: heading(context, "movements", null, report.range, false),
      columns: [
        t("movements.columns.date"),
        t("movements.columns.branch"),
        t("movements.columns.type"),
        t("movements.columns.source"),
        t("movements.columns.product"),
        t("movements.columns.subtype"),
        t("movements.columns.qty"),
        t("movements.columns.measure"),
        t("movements.columns.unitCost"),
        t("movements.columns.value"),
        t("movements.columns.undone"),
      ],
      rows: report.rows.map((row) => [
        { kind: "date", value: row.movedOn },
        text(row.branchCode),
        text(tRoot(`warehouse.item.types.${row.type}`)),
        text(row.documentNumber ?? row.orderNumber ?? ""),
        text(row.productName),
        text(row.subtypeName ?? ""),
        { kind: "quantity", value: row.qtyDelta },
        text(row.unitShortName),
        money(row.unitCost),
        { kind: "signedMoney", value: row.value },
        text(row.undone ? t("movements.undoneYes") : ""),
      ]),
    },
  ];
}

/** Use by department: the departments' values, then the lines per subtype. */
export function departmentUseSheets(
  report: DepartmentUseReport,
  context: Context,
): AnalyticsSheet[] {
  const { t } = translators(context.locale);
  const total = { label: t("total"), amount: report.total, signed: true };
  return [
    {
      name: t("use.byDepartment"),
      heading: heading(context, "use", t("use.byDepartment"), report.range, true),
      columns: [t("use.columns.department"), t("use.columns.branch"), t("use.columns.value")],
      rows: report.departments.map((row) => [
        text(row.name),
        text(row.branchCode),
        { kind: "signedMoney", value: row.value },
      ]),
      total: { ...total, column: 3 },
    },
    {
      name: t("use.lines"),
      heading: heading(context, "use", t("use.lines"), report.range, true),
      columns: [
        t("use.columns.department"),
        t("use.columns.branch"),
        t("use.columns.product"),
        t("use.columns.subtype"),
        t("use.columns.issued"),
        t("use.columns.returned"),
        t("use.columns.net"),
        t("use.columns.measure"),
        t("use.columns.value"),
      ],
      rows: report.lines.map((row) => [
        text(row.departmentName),
        text(row.branchCode),
        text(row.productName),
        text(row.subtypeName ?? ""),
        { kind: "quantity", value: row.issued },
        { kind: "quantity", value: row.returned },
        { kind: "quantity", value: row.net },
        text(row.unitShortName),
        { kind: "signedMoney", value: row.value },
      ]),
      total: { ...total, column: 9 },
    },
  ];
}

/** Price history: the subtype's records of the dates, then its reference prices (decided item 12). */
export function priceHistorySheets(report: PriceHistoryReport, context: Context): AnalyticsSheet[] {
  const { t, format } = translators(context.locale);
  const subtype = report.subtype
    ? report.subtype.subtypeName
      ? `${report.subtype.productName}, ${report.subtype.subtypeName}`
      : report.subtype.productName
    : null;
  const withName = (lines: string[]) =>
    subtype ? [lines[0]!, `${t("prices.product")}: ${subtype}`, ...lines.slice(1)] : lines;
  return [
    {
      name: t("prices.records"),
      heading: withName(heading(context, "prices", t("prices.records"), report.range, true)),
      columns: [
        t("prices.columns.date"),
        t("prices.columns.branch"),
        t("prices.columns.order"),
        t("prices.columns.supplier"),
        t("prices.columns.qty"),
        t("prices.columns.measure"),
        t("prices.columns.unitPrice"),
      ],
      rows: report.records.map((row) => [
        { kind: "date", value: row.purchasedOn },
        text(row.branchCode),
        text(row.orderNumber),
        text(row.supplierName ?? t("prices.noSupplier")),
        { kind: "quantity", value: row.qty },
        text(row.unitShortName),
        money(row.unitPrice),
      ]),
    },
    {
      name: t("prices.references"),
      heading: withName(heading(context, "prices", t("prices.references"), report.range, false)),
      columns: [
        t("prices.columns.setOn"),
        t("prices.columns.price"),
        t("prices.columns.note"),
        t("prices.columns.setBy"),
        t("prices.inForce"),
      ],
      rows: report.references.map((row) => [
        { kind: "date", value: row.setOn },
        money(row.price),
        text(row.note ?? ""),
        text(row.setByName),
        text(row.inForce ? format.date(report.range.first) : ""),
      ]),
    },
  ];
}

/** Money with managers: the owners, the age bands and the orders behind them (decided item 12). */
export function moneyWithManagersSheets(
  report: MoneyWithManagersReport,
  context: Context,
): AnalyticsSheet[] {
  const { t, tRoot } = translators(context.locale);
  // A number of now: the dates do not apply (decided item 3), so no period line.
  const lines = (table: string) => heading(context, "cash", table, null, true);
  return [
    {
      name: t("cash.owners"),
      heading: lines(t("cash.owners")),
      columns: [
        t("cash.columns.owner"),
        t("cash.columns.held"),
        t("cash.columns.owed"),
        t("cash.columns.since"),
        t("cash.columns.days"),
        t("cash.columns.orders"),
      ],
      rows: [
        ...report.owners.map((row): CellValue[] => [
          text(row.ownerIsActive ? row.ownerName : `${row.ownerName} (${t("inactive")})`),
          money(row.held),
          money(row.owed),
          { kind: "date", value: row.since },
          { kind: "count", value: row.days },
          { kind: "count", value: row.orderCount },
        ]),
        [text(t("total")), money(report.held), money(report.owed)],
      ],
    },
    {
      name: t("cash.ages"),
      heading: lines(t("cash.ages")),
      columns: [
        t("cash.columns.band"),
        t("cash.columns.held"),
        t("cash.columns.heldCount"),
        t("cash.columns.owed"),
        t("cash.columns.owedCount"),
      ],
      rows: CASH_AGE_BAND_KEYS.map((band) => {
        const row = report.ages.find((each) => each.band === band)!;
        return [
          text(t(`cash.bands.${band}`)),
          money(row.held),
          { kind: "count", value: row.heldCount },
          money(row.owed),
          { kind: "count", value: row.owedCount },
        ];
      }),
    },
    {
      name: t("cash.orders"),
      heading: lines(t("cash.orders")),
      columns: [
        t("cash.columns.owner"),
        t("cash.columns.order"),
        t("cash.columns.branch"),
        t("cash.columns.product"),
        t("cash.columns.status"),
        t("cash.columns.held"),
        t("cash.columns.owed"),
        t("cash.columns.since"),
        t("cash.columns.days"),
        t("cash.columns.band"),
      ],
      rows: report.orders.map((row) => [
        text(row.ownerName),
        text(row.number),
        text(row.branchCode),
        text(row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName),
        text(tRoot(`requestStatus.${row.status}`)),
        money(row.cashCount > 0n ? row.cashCount : 0n),
        money(row.cashCount < 0n ? -row.cashCount : 0n),
        { kind: "date", value: row.since },
        { kind: "count", value: row.days },
        text(t(`cash.bands.${row.band}`)),
      ]),
    },
  ];
}

/** Approval speed: the hours per branch and step, then the stays behind them (decided item 12). */
export function approvalSpeedSheets(
  report: ApprovalSpeedReport,
  context: Context,
): AnalyticsSheet[] {
  const { t, format } = translators(context.locale);
  const stepCells = (steps: Record<(typeof STUCK_STATUSES)[number], StepHours>) =>
    STUCK_STATUSES.flatMap((step): CellValue[] => [
      text(steps[step].hours ?? ""),
      { kind: "count", value: steps[step].count },
    ]);
  const moment = (value: Date) => `${format.date(value)} ${format.time(value)}`;
  return [
    {
      name: t("speed.byBranch"),
      heading: heading(context, "speed", t("speed.byBranch"), report.range, true),
      columns: [
        t("speed.columns.branch"),
        ...STUCK_STATUSES.flatMap((step) => [t(`speed.steps.${step}`), t("speed.columns.count")]),
      ],
      rows: [
        ...report.branches.map((row) => [text(row.name), ...stepCells(row.steps)]),
        [text(t("allBranchesTotal")), ...stepCells(report.all)],
      ],
    },
    {
      name: t("speed.stays"),
      heading: heading(context, "speed", t("speed.stays"), report.range, true),
      columns: [
        t("speed.columns.left"),
        t("speed.columns.order"),
        t("speed.columns.branch"),
        t("speed.columns.step"),
        t("speed.columns.entered"),
        t("speed.columns.hours"),
        t("speed.columns.decision"),
      ],
      rows: report.stays.map((row) => [
        text(moment(row.leftAt)),
        text(row.orderNumber),
        text(row.branchCode),
        text(t(`speed.steps.${row.step}`)),
        text(moment(row.enteredAt)),
        text(row.hours),
        text(t(`speed.decisions.${row.decision}`)),
      ]),
    },
  ];
}
