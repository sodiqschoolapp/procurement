import { createTranslator } from "next-intl";

import { type Change, WAITING_GROUP_KEYS } from "@/domain/analytics";
import { STUCK_STATUSES } from "@/domain/order-steps";
import { bindFormatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import type { AnalyticsFilters } from "../period-params";
import type { ApprovalOrders } from "../queries/approval-orders";
import type { ApprovalSpeed } from "../queries/approval-speed";
import type { CancelledRecords } from "../queries/cancelled-records";
import type { CashOrders } from "../queries/cash-orders";
import type { Managers } from "../queries/managers";
import type { MyApprovals } from "../queries/my-approvals";
import type { OrderStatuses } from "../queries/order-statuses";
import type { Prices, SubtypeName } from "../queries/prices";
import type { AnalyticsFilterOptions } from "../queries/filters";
import type { HeadSpending } from "../queries/head-spending";
import type { OutcomeOrders } from "../queries/outcome-orders";
import type { PlanVsActual, Tally } from "../queries/plan-vs-actual";
import type { SpendingBlock } from "../queries/spending";
import { OUTCOME_COLOURS } from "../period-params";
import type { SpendingRecords } from "../queries/spending-records";
import type { StatusOrders } from "../queries/status-orders";
import type { StockLines } from "../queries/stock-lines";
import type { StockMoves } from "../queries/stock-moves";
import type { TopProducts } from "../queries/top-products";
import type { Warehouse } from "../queries/warehouse";
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

/**
 * The lines above every table: its name, the period and the filters chosen. A number of now (cash
 * held, plan of 6.4c, decided item 4; stock, plan of 6.4d, decided item 2) has no period: `null`
 * names it as of now, by `now` (cash held's line unless given).
 */
function heading(
  locale: Locale,
  name: string,
  period: { first: string; last: string } | null,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  now?: string,
): string[] {
  const { t, format } = translators(locale);
  const lines = [
    name,
    period
      ? `${t("period")}: ${t("periodLine", { first: format.date(period.first), last: format.date(period.last) })}`
      : (now ?? t("cash.what")),
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
      // A price key's list carries each record's quantity and unit price (6.4b).
      ...(list.price ? [t("records.columnsQty"), t("records.columnsUnitPrice")] : []),
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
      ...(list.price
        ? ([
            { kind: "text", value: row.qty },
            { kind: "money", value: row.unitPrice },
          ] as const)
        : []),
      { kind: "money", value: row.amount },
    ]),
    total: { label: t("spending.total"), amount: list.total, column: list.price ? 8 : 6 },
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

// The sheets of Prices and Approval speed (build-plan 6.4b): every rise and spread, not only the
// 10 the page shows (plan of 6.4b, decided items 4 and 5). Hours and shares are the query's
// one-decimal texts.

const nameText = (name: SubtypeName) =>
  name.subtypeName ? `${name.productName}, ${name.subtypeName}` : name.productName;

/** The price trend of one subtype by month. */
export function priceTrendSheet(
  block: Prices,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.priceTrend");
  const lines = heading(locale, name, block.period, filters, options);
  if (block.trend) lines.push(`${t("prices.product")}: ${nameText(block.trend)}`);
  return {
    name,
    heading: lines,
    columns: [
      t("prices.columns.month"),
      t("prices.columns.price"),
      t("prices.columns.change"),
      "%",
    ],
    rows: (block.trend?.points ?? []).map((point) => [
      {
        kind: "text",
        value: t("monthLabel", {
          month: tRoot(`months.${Number(point.month.slice(5))}` as "months.1"),
          year: point.month.slice(0, 4),
        }),
      },
      point.price === null ? { kind: "text", value: "" } : { kind: "money", value: point.price },
      ...(point.change
        ? changeCells(point.change)
        : [
            { kind: "text" as const, value: "" },
            { kind: "text" as const, value: "" },
          ]),
    ]),
  };
}

/** Every price rise of the last 90 days. */
export function priceRisesSheet(
  block: Prices,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.priceRises");
  return {
    name,
    heading: heading(locale, name, block.riseWindow, filters, options),
    columns: [
      t("prices.columns.product"),
      t("prices.columns.earlier"),
      t("records.columns.date"),
      t("prices.columns.newest"),
      t("records.columns.date"),
      t("prices.columns.rise"),
      "%",
    ],
    rows: block.rises.map((rise) => [
      { kind: "text", value: nameText(rise) },
      { kind: "money", value: rise.earlier.price },
      { kind: "date", value: rise.earlier.purchasedOn },
      { kind: "money", value: rise.newest.price },
      { kind: "date", value: rise.newest.purchasedOn },
      ...changeCells(rise.rise),
    ]),
  };
}

/** Every subtype bought at different prices in the period. */
export function priceSpreadSheet(
  block: Prices,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.priceSpread");
  const where = (pair: Prices["spreads"][number]["cheapest"]) =>
    t("joined", { first: pair.branchName, second: pair.supplierName ?? t("records.noSupplier") });
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("prices.columns.product"),
      t("prices.columns.cheapest"),
      t("records.columns.branch"),
      t("prices.columns.dearest"),
      t("records.columns.branch"),
      t("prices.columns.difference"),
      "%",
    ],
    rows: block.spreads.map((spread) => [
      { kind: "text", value: nameText(spread) },
      { kind: "money", value: spread.cheapest.price },
      { kind: "text", value: where(spread.cheapest) },
      { kind: "money", value: spread.dearest.price },
      { kind: "text", value: where(spread.dearest) },
      ...changeCells(spread.spread),
    ]),
  };
}

/** The table of Approval speed: one sheet of each (6.4b). */
export function approvalSpeedSheet(
  block: ApprovalSpeed,
  which: "stepHours" | "waiting" | "decisions" | "reasons",
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t(`sheets.${which}`);
  const lines = heading(locale, name, block.period, filters, options);
  const stepName = (step: (typeof STUCK_STATUSES)[number] | null) =>
    step ? t(`speed.step.${step}`) : t("speed.allSteps");
  switch (which) {
    case "stepHours":
      return {
        name,
        heading: lines,
        columns: [
          t("speed.columns.branch"),
          ...STUCK_STATUSES.flatMap((step) => [
            stepName(step),
            t("speed.columns.decisions"),
            t("prices.columns.change"),
          ]),
        ],
        rows: [
          ...block.branches.map((row) => ({ label: row.name, steps: row.steps })),
          { label: t("speed.allBranches"), steps: block.all },
        ].map((row) => [
          { kind: "text", value: row.label },
          ...STUCK_STATUSES.flatMap((step): CellValue[] => [
            { kind: "text", value: row.steps[step].hours ?? "" },
            { kind: "count", value: row.steps[step].count },
            { kind: "text", value: row.steps[step].change ?? "" },
          ]),
        ]),
      };
    case "waiting":
      lines.splice(1, 1);
      return {
        name,
        heading: lines,
        columns: [
          t("speed.columns.step"),
          ...WAITING_GROUP_KEYS.map((group) => t(`speed.group.${group}`)),
          t("speed.columns.all"),
        ],
        rows: [...STUCK_STATUSES, null].map((step) => [
          { kind: "text", value: stepName(step) },
          ...[...WAITING_GROUP_KEYS, "all" as const].map((group): CellValue => ({
            kind: "count",
            value: block.waiting[step ?? "all"][group],
          })),
        ]),
      };
    case "decisions":
      return {
        name,
        heading: lines,
        columns: [
          t("speed.columns.step"),
          t("speed.columns.decisions"),
          t("speed.columns.sentBack"),
          "%",
          t("prices.columns.change"),
          t("speed.columns.rejected"),
          "%",
          t("prices.columns.change"),
        ],
        rows: [...STUCK_STATUSES, null].map((step) => {
          const shares = block.shares[step ?? "all"];
          return [
            { kind: "text", value: stepName(step) },
            { kind: "count", value: shares.decisions },
            { kind: "count", value: shares.sentBack.count },
            { kind: "text", value: signedText(shares.sentBack.share) },
            { kind: "text", value: signedText(shares.sentBack.change) },
            { kind: "count", value: shares.rejected.count },
            { kind: "text", value: signedText(shares.rejected.share) },
            { kind: "text", value: signedText(shares.rejected.change) },
          ];
        }),
      };
    case "reasons":
      return {
        name,
        heading: lines,
        columns: [
          t("approvals.columns.decision"),
          t("approvals.columns.reason"),
          t("speed.columns.decisions"),
          t("prices.columns.change"),
        ],
        rows: (["SEND_BACK", "REJECT"] as const).flatMap((decision) =>
          block.reasons[decision].map((reason): CellValue[] => [
            { kind: "text", value: t(`approvals.decision.${decision}`) },
            { kind: "text", value: reason.text },
            { kind: "count", value: reason.count },
            { kind: "count", value: Number(reason.change.difference) },
          ]),
        ),
      };
  }
}

/** The stays or waiting orders behind an Approval speed number, every row (6.4b). */
export function approvalOrdersSheet(
  list: ApprovalOrders,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, format } = translators(locale);
  const name = t("sheets.approvals");
  const at = (moment: Date) => `${format.date(moment)} ${format.time(moment)}`;
  return {
    name,
    heading: heading(locale, name, list.period, filters, options),
    columns: [
      t("approvals.columns.order"),
      t("approvals.columns.product"),
      t("approvals.columns.branch"),
      t("approvals.columns.step"),
      t("approvals.columns.entered"),
      t("approvals.columns.left"),
      t("approvals.columns.decision"),
      t("approvals.columns.reason"),
      t("approvals.columns.hours"),
    ],
    rows: list.rows.map((row) => [
      { kind: "text", value: row.orderNumber },
      {
        kind: "text",
        value: row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
      },
      { kind: "text", value: row.branchName },
      { kind: "text", value: t(`speed.step.${row.step}`) },
      { kind: "text", value: at(row.enteredAt) },
      { kind: "text", value: row.leftAt ? at(row.leftAt) : "" },
      { kind: "text", value: row.decision ? t(`approvals.decision.${row.decision}`) : "" },
      { kind: "text", value: row.reason ?? "" },
      { kind: "text", value: row.hours },
    ]),
  };
}

// The sheets of the Managers block (build-plan 6.4c; plan of 6.4c, decided items 2 to 7): the
// table, and the two lists behind its cancelled records and cash held. The numbers are the query's.

/** The Managers table, one row per Manager, "Other owners" last. */
export function managersSheet(
  block: Managers,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, format } = translators(locale);
  const name = t("sheets.managers");
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("managers.columns.manager"),
      t("managers.columns.orders"),
      t("managers.columns.average"),
      t("managers.columns.cancelled"),
      t("managers.columns.held"),
      t("managers.columns.heldFor"),
      t("managers.columns.since"),
    ],
    rows: block.rows.map((row) => [
      { kind: "text", value: row.name ?? t("plan.otherOwners") },
      { kind: "count", value: row.orders.count },
      row.average === null
        ? { kind: "text", value: "" }
        : { kind: "signedMoney", value: row.average },
      { kind: "count", value: row.cancelled.count },
      { kind: "money", value: row.held },
      row.heldDays === null ? { kind: "text", value: "" } : { kind: "count", value: row.heldDays },
      { kind: "text", value: row.heldSince === null ? "" : format.date(row.heldSince) },
    ]),
  };
}

/** The cancelled records behind a count, every row. */
export function cancelledSheet(
  list: CancelledRecords,
  otherOwners: boolean,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.cancelled");
  const lines = heading(locale, name, list.period, filters, options);
  if (otherOwners) lines.push(t("orders.otherOwners"));
  return {
    name,
    heading: lines,
    columns: [
      t("cancelled.columns.order"),
      t("cancelled.columns.product"),
      t("cancelled.columns.branch"),
      t("cancelled.columns.bought"),
      t("cancelled.columns.supplier"),
      t("cancelled.columns.cancelledOn"),
      t("cancelled.columns.cancelledBy"),
      t("cancelled.columns.reason"),
      t("cancelled.columns.amount"),
    ],
    rows: list.rows.map((row) => [
      { kind: "text", value: row.orderNumber },
      {
        kind: "text",
        value: row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
      },
      { kind: "text", value: row.branchName },
      { kind: "date", value: row.purchasedOn },
      { kind: "text", value: row.supplierName ?? t("cancelled.noSupplier") },
      { kind: "date", value: row.cancelledOn },
      { kind: "text", value: row.cancelledByName },
      { kind: "text", value: row.reason },
      { kind: "money", value: row.amount },
    ]),
    total: { label: t("cancelled.columns.amount"), amount: list.total },
  };
}

/** The orders behind a cash held number, oldest first, every row. */
export function cashSheet(
  list: CashOrders,
  otherOwners: boolean,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.cash");
  const lines = heading(locale, name, null, filters, options);
  if (otherOwners) lines.push(t("orders.otherOwners"));
  return {
    name,
    heading: lines,
    columns: [
      t("cash.columns.order"),
      t("cash.columns.product"),
      t("cash.columns.branch"),
      t("cash.columns.owner"),
      t("cash.columns.status"),
      t("cash.columns.since"),
      t("cash.columns.held"),
    ],
    rows: list.rows.map((row) => [
      { kind: "text", value: row.orderNumber },
      {
        kind: "text",
        value: row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
      },
      { kind: "text", value: row.branchName },
      { kind: "text", value: row.ownerName },
      { kind: "text", value: tRoot(`requestStatus.${row.status}`) },
      { kind: "date", value: row.since },
      { kind: "money", value: row.cashCount },
    ]),
    total: { label: t("cash.columns.held"), amount: list.held },
  };
}

// The sheets of the Warehouse block (build-plan 6.4d; plan of 6.4d, decided items 1 to 8): the
// table per branch, use by department, and the two lists behind them. The numbers are the query's.

const productText = (row: { productName: string; subtypeName: string | null }) =>
  row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName;

/** The table per branch, "All branches" last: stock of now, written off of the period. */
export function warehouseSheet(
  block: Warehouse,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.warehouse");
  const cells = (row: Warehouse["all"]): CellValue[] => [
    { kind: "money", value: row.value },
    { kind: "count", value: row.low },
    { kind: "count", value: row.still },
    { kind: "money", value: row.stillValue },
    { kind: "money", value: row.writtenOff },
    ...changeCells(row.writtenOffChange),
  ];
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("warehouse.columns.branch"),
      t("warehouse.columns.value"),
      t("warehouse.columns.low"),
      t("warehouse.columns.still"),
      t("warehouse.columns.stillValue"),
      t("warehouse.columns.writtenOff"),
      t("spending.columns.change"),
      "%",
    ],
    rows: [
      ...block.branches.map((row): CellValue[] => [
        { kind: "text", value: row.name },
        ...cells(row),
      ]),
      [{ kind: "text", value: t("allBranches") }, ...cells(block.all)],
    ],
  };
}

/** Use by department in the period: issued − returned, with its change. */
export function departmentUseSheet(
  block: Warehouse,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.departmentUse");
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("warehouse.use.columns.department"),
      t("warehouse.columns.branch"),
      t("warehouse.use.columns.used"),
      t("spending.columns.change"),
      "%",
    ],
    rows: block.departments.map((row) => [
      { kind: "text", value: row.name },
      { kind: "text", value: row.branchCode },
      { kind: "signedMoney", value: row.used },
      { kind: "signedMoney", value: row.used - row.before },
      { kind: "text", value: row.change?.percent == null ? "" : `${row.change.percent} %` },
    ]),
  };
}

/** The stock lines behind a number of now, every row. */
export function stockSheet(
  list: StockLines,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, format } = translators(locale);
  const name = t(`stock.title.${list.view}`);
  const now =
    list.view === "still"
      ? t("stock.whatStill", { date: format.date(list.stillSince) })
      : t("stock.what");
  return {
    name,
    heading: heading(locale, name, null, filters, options, now),
    columns: [
      t("stock.columns.product"),
      t("stock.columns.branch"),
      t("stock.columns.quantity"),
      t("stock.columns.unit"),
      t("stock.columns.minimum"),
      t("stock.columns.avgCost"),
      t("stock.columns.lastMoved"),
      t("stock.columns.value"),
    ],
    rows: list.rows.map((row) => [
      { kind: "text", value: productText(row) },
      { kind: "text", value: row.branchName },
      { kind: "text", value: format.quantity(row.quantity) },
      { kind: "text", value: row.unitShortName },
      { kind: "text", value: row.minimum === null ? "" : format.quantity(row.minimum) },
      { kind: "money", value: row.avgCost },
      row.lastMovedOn === null
        ? { kind: "text", value: "" }
        : { kind: "date", value: row.lastMovedOn },
      { kind: "money", value: row.value },
    ]),
    total: { label: t("stock.columns.value"), amount: list.total },
  };
}

/** The movements behind use or written off, every row; a return below 0 in use. */
export function movesSheet(
  list: StockMoves,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, format } = translators(locale);
  const name = t(`moves.title.${list.move}`);
  return {
    name,
    heading: heading(locale, name, list.period, filters, options),
    columns: [
      t("moves.columns.date"),
      t("moves.columns.document"),
      t("moves.columns.type"),
      t("moves.columns.product"),
      t("moves.columns.branch"),
      t("moves.columns.department"),
      t("moves.columns.quantity"),
      t("stock.columns.unit"),
      t("moves.columns.value"),
    ],
    rows: list.rows.map((row) => [
      { kind: "date", value: row.movedOn },
      { kind: "text", value: row.documentNumber },
      { kind: "text", value: t(`moves.type.${row.type}`) },
      { kind: "text", value: productText(row) },
      { kind: "text", value: row.branchName },
      { kind: "text", value: row.departmentName ?? "" },
      { kind: "text", value: format.quantity(row.quantity) },
      { kind: "text", value: row.unitShortName },
      { kind: "signedMoney", value: row.value },
    ]),
    total: { label: t("moves.columns.value"), amount: list.total, signed: true, column: 9 },
  };
}

// The sheets of the Principal's page (build-plan 6.5a; plan of 6.5a, decided items 2 to 7): top
// products, the Orders block and its list, My approvals. The numbers are the query's.

/** The Principal's top 10 products, each with its change. */
export function productsSheet(
  block: TopProducts,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.products");
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("principal.columns.product"),
      t("spending.columns.amount"),
      t("spending.columns.change"),
      "%",
    ],
    rows: block.products.map((row) => [
      { kind: "text", value: row.name },
      { kind: "money", value: row.amount },
      ...changeCells(row.change),
    ]),
    total: { label: t("spending.total"), amount: block.total.amount },
  };
}

/** The Orders block: the counts by status with their change, then coming up and overdue now. */
export function orderStatusesSheet(
  block: OrderStatuses,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot, format } = translators(locale);
  const name = t("sheets.orderStatuses");
  const count = (label: string, value: number, change: Change | null): CellValue[] => [
    { kind: "text", value: label },
    { kind: "count", value },
    { kind: "text", value: change === null ? "" : String(change.difference) },
    { kind: "text", value: change?.percent == null ? "" : `${change.percent} %` },
  ];
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("principal.columns.status"),
      t("principal.columns.orders"),
      t("spending.columns.change"),
      "%",
    ],
    rows: [
      ...block.statuses.map((row) =>
        count(tRoot(`requestStatus.${row.status}`), row.count, row.change),
      ),
      count(t("principal.orders.total"), block.total.count, block.total.change),
      count(
        t("principal.orders.comingUpOn", { date: format.date(block.today) }),
        block.comingUp,
        null,
      ),
      count(
        t("principal.orders.overdueOn", { date: format.date(block.today) }),
        block.overdue,
        null,
      ),
    ],
  };
}

/** The list behind an Orders number, every row. */
export function statusOrdersSheet(
  list: StatusOrders,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot, format } = translators(locale);
  const name = t("sheets.statusOrders");
  return {
    name,
    // A coming-up or overdue list is of now: its line names today (decided item 2).
    heading:
      list.key.kind === "status"
        ? heading(locale, name, list.period, filters, options)
        : heading(
            locale,
            name,
            null,
            filters,
            options,
            t("principal.orders.nowLine", { date: format.date(list.today) }),
          ),
    columns: [
      t("principal.columns.order"),
      t("principal.columns.product"),
      t("principal.columns.department"),
      t("principal.columns.status"),
      t("principal.columns.submitted"),
      t("principal.columns.neededBy"),
      t("principal.columns.overdue"),
    ],
    rows: list.rows.map((row) => [
      { kind: "text", value: row.orderNumber },
      {
        kind: "text",
        value: row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
      },
      { kind: "text", value: row.departmentName },
      { kind: "text", value: tRoot(`requestStatus.${row.status}`) },
      { kind: "date", value: row.submittedOn },
      { kind: "date", value: row.neededBy },
      { kind: "text", value: row.overdue ? t("principal.overdue") : "" },
    ]),
  };
}

/** My approvals: waiting now by age, then my average time to decide in the period. */
export function myApprovalsSheet(
  block: MyApprovals,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.myApprovals");
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("principal.columns.what"),
      t("principal.columns.value"),
      t("prices.columns.change"),
    ],
    rows: [
      ...[...WAITING_GROUP_KEYS, "all" as const].map((group): CellValue[] => [
        {
          kind: "text",
          value: `${t("principal.approvals.waiting")}: ${
            group === "all" ? t("speed.columns.all") : t(`speed.group.${group}`)
          }`,
        },
        { kind: "count", value: block.waiting[group] },
        { kind: "text", value: "" },
      ]),
      [
        { kind: "text", value: t("principal.approvals.myHours") },
        { kind: "text", value: block.mine.hours ?? "" },
        { kind: "text", value: block.mine.change ?? "" },
      ],
      [
        { kind: "text", value: t("principal.approvals.myDecisions") },
        { kind: "count", value: block.mine.count },
        { kind: "text", value: "" },
      ],
    ],
  };
}
