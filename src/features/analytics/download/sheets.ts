import { createTranslator } from "next-intl";

import type { Change } from "@/domain/analytics";
import { bindFormatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import type { AnalyticsFilters } from "../period-params";
import type { AnalyticsFilterOptions } from "../queries/filters";
import type { HeadSpending } from "../queries/head-spending";
import type { OutcomeOrders } from "../queries/outcome-orders";
import type { PlanVsActual, Tally } from "../queries/plan-vs-actual";
import type { SpendingBlock } from "../queries/spending";
import { OUTCOME_COLOURS } from "../period-params";
import type { SpendingRecords } from "../queries/spending-records";
import type { AnalyticsSheet, CellValue } from "./excel";

// The sheets of the Analytics downloads (10-notifications-analytics-reports.md, Analytics page per
// role, point 4; build-plan 6.3): the table under a chart, or the drill-down list, with the
// period and the filters above it, in the screen's language. The numbers are the query's.

const MESSAGES = { uz, ru, en } satisfies Record<Locale, unknown>;

function translators(locale: Locale) {
  const messages = MESSAGES[locale];
  const t = createTranslator({ locale, messages, namespace: "analytics" });
  const tRoot = createTranslator({ locale, messages });
  return { t, tRoot, format: bindFormatters(locale, tRoot("format.currency")) };
}

/** The lines above every table: its name, the period and the filters chosen. */
function heading(
  locale: Locale,
  name: string,
  period: { first: string; last: string },
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
): string[] {
  const { t, format } = translators(locale);
  const lines = [
    name,
    `${t("period")}: ${t("periodLine", { first: format.date(period.first), last: format.date(period.last) })}`,
  ];
  const named = (list: readonly { id: string; name: string }[], id: string | null) =>
    list.find((option) => option.id === id)?.name ?? null;
  const chosen = [
    [t("branch"), named(options.branches, filters.branch)],
    [t("category"), named(options.categories, filters.category)],
    [t("department"), named(options.departments, filters.department)],
    [t("manager"), named(options.managers, filters.manager)],
    [t("supplier"), named(options.suppliers, filters.supplier)],
  ] as const;
  for (const [label, value] of chosen) if (value) lines.push(`${label}: ${value}`);
  return lines;
}

const changeCells = (change: Change): CellValue[] => [
  { kind: "signedMoney", value: change.difference },
  { kind: "text", value: change.percent === null ? "" : `${change.percent} %` },
];

/** The table of the chart by month or by category. */
export function spendingSheet(
  block: SpendingBlock,
  which: "months" | "categories",
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t(`sheets.${which}`);
  const rows =
    which === "months"
      ? block.months.map((point) => [
          {
            kind: "text" as const,
            value: t("monthLabel", {
              month: tRoot(`months.${Number(point.month.slice(5))}` as "months.1"),
              year: point.month.slice(0, 4),
            }),
          },
          { kind: "money" as const, value: point.amount },
          ...changeCells(point.change),
        ])
      : block.categories.map((category) => [
          { kind: "text" as const, value: category.name },
          { kind: "money" as const, value: category.amount },
          ...changeCells(category.change),
        ]);
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t(which === "months" ? "spending.columns.month" : "spending.columns.category"),
      t("spending.columns.amount"),
      t("spending.columns.change"),
      "%",
    ],
    rows,
    total: { label: t("spending.total"), amount: block.total.amount },
  };
}

/** The drill-down list behind a number, every row. */
export function recordsSheet(
  list: SpendingRecords,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.records");
  return {
    name,
    heading: heading(locale, name, list.range, filters, options),
    columns: [
      t("records.columns.order"),
      t("records.columns.product"),
      t("records.columns.branch"),
      t("records.columns.date"),
      t("records.columns.supplier"),
      t("records.columns.amount"),
    ],
    rows: list.rows.map((row) => [
      { kind: "text", value: row.orderNumber },
      {
        kind: "text",
        value: row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
      },
      { kind: "text", value: row.branchName },
      { kind: "date", value: row.purchasedOn },
      { kind: "text", value: row.supplierName ?? t("records.noSupplier") },
      { kind: "money", value: row.amount },
    ]),
    total: { label: t("spending.total"), amount: list.total, column: 6 },
  };
}

const signedText = (points: string | null) => (points === null ? "" : `${points} %`);

/** One of the Head's four Spending tables (build-plan 6.4a). */
export function headSpendingSheet(
  block: HeadSpending,
  which: "branches" | "departments" | "suppliers" | "payments",
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t(`sheets.${which}`);
  const column = {
    branches: "spending.columns.branch",
    departments: "spending.columns.department",
    suppliers: "spending.columns.supplier",
    payments: "spending.columns.payment",
  } as const;
  const labelled: { label: string; amount: bigint; change: Change }[] =
    which === "payments"
      ? block.payments.map((row) => ({
          label: tRoot(`paymentTypes.${row.payment}`),
          ...row,
        }))
      : which === "departments"
        ? block.departments.map((row) => ({
            label: t("departmentOption", { name: row.name, branch: row.branchName }),
            ...row,
          }))
        : block[which].map((row) => ({ label: row.name, ...row }));
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [t(column[which]), t("spending.columns.amount"), t("spending.columns.change"), "%"],
    rows: labelled.map((row) => [
      { kind: "text", value: row.label },
      { kind: "money", value: row.amount },
      ...changeCells(row.change),
    ]),
    // The top 10 are not the whole of the period's spending.
    total:
      which === "suppliers"
        ? undefined
        : { label: t("spending.total"), amount: block.total.amount },
  };
}

/** Plan vs actual: one row per colour (build-plan 6.4a). */
export function outcomesSheet(
  block: PlanVsActual,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.outcomes");
  const { total } = block;
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("plan.columns.outcome"),
      t("plan.columns.count"),
      "%",
      t("plan.columns.change"),
      "%",
      t("plan.columns.change"),
      t("spending.columns.amount"),
    ],
    rows: [
      ...OUTCOME_COLOURS.map((colour): CellValue[] => {
        const each = total.colours[colour];
        return [
          { kind: "text", value: t(`plan.outcome.${colour}`) },
          { kind: "count", value: each.count },
          { kind: "text", value: signedText(each.share) },
          { kind: "count", value: Number(each.change.difference) },
          { kind: "text", value: signedText(each.change.percent) },
          { kind: "text", value: signedText(each.shareChange) },
          {
            kind: "money",
            value:
              colour === "red"
                ? total.overspent.amount
                : colour === "amber"
                  ? total.saved.amount
                  : 0n,
          },
        ];
      }),
    ],
  };
}

/** Plan vs actual by branch or by Manager (build-plan 6.4a). */
export function tallySheet(
  block: PlanVsActual,
  which: "outcomeBranches" | "outcomeManagers",
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t(`sheets.${which}`);
  const rows: { label: string; tally: Tally }[] =
    which === "outcomeBranches"
      ? block.branches.map((row) => ({ label: row.name, tally: row }))
      : block.managers.map((row) => ({ label: row.name ?? t("plan.otherOwners"), tally: row }));
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t(which === "outcomeBranches" ? "plan.columns.branch" : "plan.columns.manager"),
      t("plan.columns.orders"),
      t("plan.columns.green"),
      t("plan.columns.amber"),
      t("plan.columns.red"),
      t("plan.columns.overspent"),
      t("plan.columns.saved"),
    ],
    rows: rows.map(({ label, tally }) => [
      { kind: "text", value: label },
      { kind: "count", value: tally.orders.count },
      ...OUTCOME_COLOURS.map((colour): CellValue => ({
        kind: "count",
        value: tally.colours[colour].count,
      })),
      { kind: "money", value: tally.overspent.amount },
      { kind: "money", value: tally.saved.amount },
    ]),
  };
}

/** The orders behind a Plan vs actual number, every row (build-plan 6.4a). */
export function outcomeOrdersSheet(
  list: OutcomeOrders,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.orders");
  const lines = heading(locale, name, list.range, filters, options);
  if (list.otherOwners) lines.push(t("orders.otherOwners"));
  return {
    name,
    heading: lines,
    columns: [
      t("orders.columns.order"),
      t("orders.columns.product"),
      t("orders.columns.branch"),
      t("orders.columns.owner"),
      t("orders.columns.ended"),
      t("orders.columns.planned"),
      t("orders.columns.actual"),
      t("orders.columns.difference"),
      t("orders.columns.outcome"),
    ],
    rows: list.rows.map((row) => [
      { kind: "text", value: row.orderNumber },
      {
        kind: "text",
        value: row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
      },
      { kind: "text", value: row.branchName },
      { kind: "text", value: row.ownerName },
      { kind: "date", value: row.endedOn },
      { kind: "money", value: row.planned },
      { kind: "money", value: row.actual },
      { kind: "signedMoney", value: row.difference },
      { kind: "text", value: t(`plan.outcome.${row.colour}`) },
    ]),
    // Overspent sums −difference, so its total is shown as the overspent; others the net.
    total: {
      label: t(
        list.key.kind === "overspent"
          ? "plan.overspent"
          : list.key.kind === "saved"
            ? "plan.saved"
            : "orders.columns.difference",
      ),
      amount: list.sum,
      signed: true,
      column: 8,
    },
  };
}
