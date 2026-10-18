import { createTranslator } from "next-intl";

import type { Change } from "@/domain/analytics";
import { bindFormatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import type { AnalyticsFilters } from "../period-params";
import type { AnalyticsFilterOptions } from "../queries/filters";
import type { SpendingBlock } from "../queries/spending";
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
    total: { label: t("spending.total"), amount: list.total },
  };
}
