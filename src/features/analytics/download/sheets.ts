import { createTranslator } from "next-intl";

import { type Change, WAITING_GROUP_KEYS } from "@/domain/analytics";
import { STUCK_STATUSES } from "@/domain/order-steps";
import { bindFormatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import { countChangeText } from "../components/change-text";
import type { AnalyticsFilters } from "../period-params";
import type { ApprovalOrders } from "../queries/approval-orders";
import type { ApprovalSpeed } from "../queries/approval-speed";
import type { CancelledRecords } from "../queries/cancelled-records";
import type { CashNeeded, NeededAmount } from "../queries/cash-needed";
import type { CashAge, CashOrders } from "../queries/cash-orders";
import type { FinanceCash } from "../queries/finance-cash";
import type { FinanceSpending } from "../queries/finance-spending";
import type { MoneyRowList } from "../queries/money-rows";
import type { NeededOrders } from "../queries/needed-orders";
import type { Managers } from "../queries/managers";
import type { MyApprovals } from "../queries/my-approvals";
import type { MyCash } from "../queries/my-cash";
import type { MyEstimates } from "../queries/my-estimates";
import type { MyOrders } from "../queries/my-orders";
import type { OrderStatuses } from "../queries/order-statuses";
import type { Prices, SubtypeName } from "../queries/prices";
import type { AnalyticsFilterOptions } from "../queries/filters";
import type { HeadSpending } from "../queries/head-spending";
import type { OutcomeOrders } from "../queries/outcome-orders";
import type { Count, PlanVsActual, Tally } from "../queries/plan-vs-actual";
import type { SpendingBlock } from "../queries/spending";
import { CASH_KIND_KEYS, NO_DEPARTMENT, OUTCOME_COLOURS } from "../period-params";
import type { SettlementSpeed } from "../queries/settlement-speed";
import type { SettlementList } from "../queries/settlements";
import type { SpendingRecords } from "../queries/spending-records";
import type { StatusOrders } from "../queries/status-orders";
import type { StockLines } from "../queries/stock-lines";
import type { StockMoves } from "../queries/stock-moves";
import type { StockPlanning } from "../queries/stock-planning";
import type { TopProducts } from "../queries/top-products";
import type { Warehouse } from "../queries/warehouse";
import type { AnalyticsSheet, CellValue } from "./excel";

// The sheets of the Analytics downloads (10-notifications-analytics-reports.md, Analytics page per
// role, point 4; build-plan 6.3): the table under a chart, or the drill-down list, with the
// period and the filters above it, in the screen's language. The numbers are the query's.

const MESSAGES = { uz, ru, en } satisfies Record<Locale, unknown>;

export function translators(locale: Locale) {
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
export function heading(
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
    [
      t("department"),
      filters.department === NO_DEPARTMENT
        ? t("noDepartment")
        : named(options.departments, filters.department),
    ],
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
  const { t, format } = translators(locale);
  const name = t("sheets.records");
  const lines = heading(locale, name, list.range, filters, options);
  // A priced key's list names the quantity and the goods My estimates reads (6.5b).
  if (list.priced) {
    lines.push(
      t("my.list.pricedSummary", {
        count: list.count,
        qty: format.quantity(list.priced.qty),
        goods: format.money(list.priced.goods),
      }),
    );
    if (list.key.kind === "priced" && list.key.unpriced) lines.push(t("my.list.unpricedLine"));
  }
  const priced = list.price !== null || list.priced !== null;
  return {
    name,
    heading: lines,
    columns: [
      t("records.columns.order"),
      t("records.columns.product"),
      t("records.columns.branch"),
      t("records.columns.date"),
      t("records.columns.supplier"),
      // A price key's list carries each record's quantity and unit price (6.4b), as a priced one.
      ...(priced ? [t("records.columnsQty"), t("records.columnsUnitPrice")] : []),
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
      ...(priced
        ? ([
            { kind: "text", value: row.qty },
            { kind: "money", value: row.unitPrice },
          ] as const)
        : []),
      { kind: "money", value: row.amount },
    ]),
    total: { label: t("spending.total"), amount: list.total, column: priced ? 8 : 6 },
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
            label:
              row.name === null
                ? t("noDepartment")
                : t("departmentOption", { name: row.name, branch: row.branchName ?? "" }),
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

/**
 * The line under a sheet's heading that says how many orders without a planned price its sums
 * leave out, in a sentence with its change against the period before (08 Numbers; 10 point 1;
 * plan of 2.5d-c, decided items 3 and 4, Look first). A count of now (Cash needed soon) has no
 * change; none when nothing is left out in either period.
 */
export function unpricedLine(
  locale: Locale,
  count: Count | number,
  what: "orders" | "records" = "orders",
): string[] {
  const { t, format } = translators(locale);
  const now = typeof count === "number" ? count : count.count;
  const change = typeof count === "number" ? null : count.change;
  if (now === 0 && (change === null || change.difference === 0n)) return [];
  const line = t(what === "orders" ? "unpriced.line" : "unpriced.recordsLine", { count: now });
  return [change === null ? `${line}.` : `${line}; ${countChangeText(change, t, format)}.`];
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
    heading: [
      ...heading(locale, name, block.period, filters, options),
      ...unpricedLine(locale, total.unpriced),
    ],
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
      t("plan.columns.unpriced"),
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
      { kind: "count", value: tally.unpriced.count },
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
  const { t, tRoot } = translators(locale);
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
      // Without a planned price: no planned total, difference or colour (plan of 2.5d-c).
      row.planned === null
        ? { kind: "text", value: tRoot("orders.unpriced.none") }
        : { kind: "money", value: row.planned },
      { kind: "money", value: row.actual },
      row.difference === null
        ? { kind: "text", value: "" }
        : { kind: "signedMoney", value: row.difference },
      {
        kind: "text",
        value:
          row.colour === null ? tRoot("orders.unpriced.none") : t(`plan.outcome.${row.colour}`),
      },
    ]),
    // Overspent sums −difference, so its total is shown as the overspent; unpriced the actual
    // totals; others the net.
    total:
      list.key.kind === "unpriced"
        ? { label: t("orders.columns.actual"), amount: list.sum, column: 7 }
        : {
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
      t("plan.columns.unpriced"),
      t("plan.columns.change"),
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
      // The ended orders without a planned price the average leaves out, with their change in a
      // sentence (plan of 2.5d-c, decided items 3 to 5, Look first).
      { kind: "count", value: row.unpriced.count },
      { kind: "text", value: countChangeText(row.unpriced.change, t, format) },
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
  age: CashAge | null = null,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.cash");
  const lines = heading(locale, name, null, filters, options);
  if (otherOwners) lines.push(t("orders.otherOwners"));
  // One amount of Finance's money with managers by age (plan of 6.6a, decided item 3).
  if (age) {
    lines.push(
      t("finance.ageLine", {
        band: t(`finance.cash.bands.${age.band}`),
        side: t(`finance.columns.${age.side}`),
      }),
    );
  }
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
      t(age?.side === "owed" ? "cash.columns.owed" : "cash.columns.held"),
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
      age?.side === "owed"
        ? { kind: "money", value: -row.cashCount }
        : { kind: "money", value: row.cashCount },
    ]),
    total:
      age?.side === "owed"
        ? { label: t("cash.columns.owed"), amount: list.owed }
        : { label: t("cash.columns.held"), amount: list.held },
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
      list.key.kind !== "due"
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
      // The Manager's `approved` list carries each order's day into Open and its hours (6.5b).
      ...(list.key.kind === "approved" ? [t("my.columns.opened"), t("my.columns.hours")] : []),
    ],
    rows: list.rows.map((row): CellValue[] => [
      { kind: "text", value: row.orderNumber },
      {
        kind: "text",
        value: row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName,
      },
      // An order without a department or a needed-by date leaves its cell empty (05 Fields the
      // Head sets 3).
      { kind: "text", value: row.departmentName ?? "" },
      { kind: "text", value: tRoot(`requestStatus.${row.status}`) },
      { kind: "date", value: row.submittedOn },
      row.neededBy === null ? { kind: "text", value: "" } : { kind: "date", value: row.neededBy },
      { kind: "text", value: row.overdue ? t("principal.overdue") : "" },
      ...(list.key.kind === "approved"
        ? [
            row.openedOn
              ? ({ kind: "date", value: row.openedOn } as const)
              : ({ kind: "text", value: "" } as const),
            { kind: "text", value: row.approvalHours ?? "" } as const,
          ]
        : []),
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

// The sheets of the Manager's blocks (build-plan 6.5b; plan of 6.5b, decided items 1 to 5). The
// numbers are the query's.

/** My orders: by status with the change, the total, the hours to full approval, the share sent back. */
export function myOrdersSheet(
  block: MyOrders,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.myOrders");
  const count = (label: string, value: number, change: Change): CellValue[] => [
    { kind: "text", value: label },
    { kind: "count", value },
    { kind: "text", value: String(change.difference) },
    { kind: "text", value: change.percent === null ? "" : `${change.percent} %` },
  ];
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("principal.columns.what"),
      t("principal.columns.value"),
      t("spending.columns.change"),
      "%",
    ],
    rows: [
      ...block.statuses.map((row) =>
        count(tRoot(`requestStatus.${row.status}`), row.count, row.change),
      ),
      count(t("principal.orders.total"), block.total.count, block.total.change),
      [
        { kind: "text", value: t("my.orders.approvalHours") },
        { kind: "text", value: block.approval.hours ?? "" },
        { kind: "text", value: block.approval.change ?? "" },
        { kind: "text", value: "" },
      ],
      [
        { kind: "text", value: t("my.orders.approved") },
        { kind: "count", value: block.approval.count },
        { kind: "text", value: "" },
        { kind: "text", value: "" },
      ],
      [
        { kind: "text", value: t("my.orders.decisions") },
        { kind: "count", value: block.decisions },
        { kind: "text", value: "" },
        { kind: "text", value: "" },
      ],
      [
        { kind: "text", value: t("my.orders.sentBack") },
        { kind: "count", value: block.sentBack.count },
        { kind: "text", value: signedText(block.sentBack.change) },
        { kind: "text", value: signedText(block.sentBack.share) },
      ],
    ],
  };
}

/** The most common reasons my orders were sent back for. */
export function myReasonsSheet(
  block: MyOrders,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.myReasons");
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("approvals.columns.reason"),
      t("speed.columns.decisions"),
      t("prices.columns.change"),
    ],
    rows: block.reasons.map((reason): CellValue[] => [
      { kind: "text", value: reason.text },
      { kind: "count", value: reason.count },
      { kind: "count", value: Number(reason.change.difference) },
    ]),
  };
}

/** My estimates: every product, then all products together. */
export function myEstimatesSheet(
  block: MyEstimates,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, format } = translators(locale);
  const name = t("sheets.myEstimates");
  const price = (value: bigint | null): CellValue =>
    value === null ? { kind: "text", value: "" } : { kind: "money", value };
  const row = (label: string, each: MyEstimates["all"]): CellValue[] => [
    { kind: "text", value: label },
    { kind: "count", value: each.records },
    { kind: "text", value: each.qty },
    price(each.plannedPrice),
    price(each.actualPrice),
    each.difference === null
      ? { kind: "text", value: "" }
      : { kind: "signedMoney", value: each.difference },
    { kind: "text", value: signedText(each.percent) },
    { kind: "text", value: signedText(each.change) },
    // The records of orders without a planned price the estimate leaves out (plan of 2.5d-c).
    { kind: "count", value: each.unpriced.count },
    { kind: "text", value: countChangeText(each.unpriced.change, t, format) },
  ];
  return {
    name,
    heading: [
      ...heading(locale, name, block.period, filters, options),
      ...unpricedLine(locale, block.all.unpriced, "records"),
    ],
    columns: [
      t("principal.columns.product"),
      t("my.columns.records"),
      t("records.columnsQty"),
      t("my.columns.planned"),
      t("my.columns.actual"),
      t("my.columns.difference"),
      "%",
      t("prices.columns.change"),
      t("plan.columns.unpriced"),
      t("plan.columns.change"),
    ],
    rows: [
      ...block.products.map((each) =>
        row(each.isActive ? each.name : t("inactive", { name: each.name }), each),
      ),
      row(t("my.estimates.all"), block.all),
    ],
  };
}

/** My cash: each order with its count, held and owed apart, never netted (08). */
export function myCashSheet(
  block: MyCash,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.myCash");
  const blank: CellValue = { kind: "text", value: "" };
  return {
    name,
    heading: heading(locale, name, null, filters, options),
    columns: [
      t("cash.columns.order"),
      t("cash.columns.product"),
      t("cash.columns.branch"),
      t("cash.columns.status"),
      t("cash.columns.since"),
      t("my.columns.count"),
    ],
    rows: [
      ...block.rows.map((row): CellValue[] => [
        { kind: "text", value: row.orderNumber },
        { kind: "text", value: productText(row) },
        { kind: "text", value: row.branchName },
        { kind: "text", value: tRoot(`requestStatus.${row.status}`) },
        { kind: "date", value: row.since },
        { kind: "signedMoney", value: row.cashCount },
      ]),
      [
        { kind: "text", value: t("my.cash.held") },
        blank,
        blank,
        blank,
        blank,
        { kind: "money", value: block.held },
      ],
      [
        { kind: "text", value: t("my.cash.owed") },
        blank,
        blank,
        blank,
        blank,
        { kind: "money", value: block.owed },
      ],
    ],
  };
}

/**
 * Stock planning, every line (build-plan 6.5c; plan of 6.5c, decided item 6): the use of each month
 * and of the period with its change, on hand, Low, the use of the 90 days, "runs out in" and the
 * suggested quantity, each quantity in the line's measure.
 */
export function stockPlanningSheet(
  block: StockPlanning,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot, format } = translators(locale);
  const name = t("sheets.stockPlanning");
  const qty = (value: string): CellValue => ({ kind: "text", value: format.quantity(value) });
  const percent = (value: string | null): CellValue => ({
    kind: "text",
    value: value === null ? "" : `${value} %`,
  });
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("stock.columns.product"),
      t("stock.columns.branch"),
      t("stock.columns.unit"),
      t("my.planning.columns.onHand"),
      t("stock.columns.minimum"),
      t("my.planning.low"),
      ...block.months.map((month) =>
        t("monthLabel", {
          month: tRoot(`months.${Number(month.slice(5))}` as "months.1"),
          year: month.slice(0, 4),
        }),
      ),
      t("my.planning.columns.used"),
      t("my.planning.columns.usedBefore"),
      t("my.planning.columns.change"),
      t("my.planning.columns.rateUsed", {
        first: format.date(block.rate.first),
        last: format.date(block.rate.last),
      }),
      t("my.planning.columns.runsOutDays"),
      t("my.planning.columns.suggested"),
    ],
    rows: block.lines.map((line): CellValue[] => [
      { kind: "text", value: productText(line) },
      { kind: "text", value: line.branchName },
      { kind: "text", value: line.unitShortName },
      qty(line.onHand),
      { kind: "text", value: line.minimum === null ? "" : format.quantity(line.minimum) },
      { kind: "text", value: line.low ? tRoot("warehouse.low.label") : "" },
      ...line.months.map((month) => qty(month.used)),
      qty(line.used),
      qty(line.before),
      percent(line.change.percent),
      qty(line.rateUsed),
      line.runsOutIn === null
        ? { kind: "text", value: "" }
        : { kind: "count", value: line.runsOutIn },
      qty(line.suggested),
    ]),
  };
}

// The sheets of Finance's blocks (build-plan 6.6a; plan of 6.6a, decided items 2 to 10): Cash by
// month, money with managers by age, Cash needed soon, and the lists behind them. The numbers are
// the queries'.

const monthText = (
  t: ReturnType<typeof translators>["t"],
  tRoot: ReturnType<typeof translators>["tRoot"],
  month: string,
) =>
  t("monthLabel", {
    month: tRoot(`months.${Number(month.slice(5))}` as "months.1"),
    year: month.slice(0, 4),
  });

/** Given, returned and paid back by month, each with its change, and the period's three. */
export function financeCashSheet(
  block: FinanceCash,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.financeCash");
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("finance.columns.month"),
      ...CASH_KIND_KEYS.flatMap((kind) => [
        t(`finance.cash.kinds.${kind}`),
        t("spending.columns.change"),
        "%",
      ]),
    ],
    rows: [
      ...block.months.map((row): CellValue[] => [
        { kind: "text", value: monthText(t, tRoot, row.month) },
        ...CASH_KIND_KEYS.flatMap((kind): CellValue[] => [
          { kind: "money", value: row[kind].amount },
          ...changeCells(row[kind].change),
        ]),
      ]),
      [
        { kind: "text", value: t("finance.cash.period") },
        ...CASH_KIND_KEYS.flatMap((kind): CellValue[] => [
          { kind: "money", value: block.totals[kind].amount },
          ...changeCells(block.totals[kind].change),
        ]),
      ],
    ],
  };
}

/** Money with managers by age: each band's held and owed, apart, with their order counts. */
export function cashAgesSheet(
  block: FinanceCash,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.cashAges");
  return {
    name,
    heading: heading(locale, name, null, filters, options, t("finance.cash.ageNote")),
    columns: [
      t("finance.columns.age"),
      t("finance.columns.held"),
      t("finance.columns.orders"),
      t("finance.columns.owed"),
      t("finance.columns.orders"),
    ],
    rows: block.ages.map((row): CellValue[] => [
      { kind: "text", value: t(`finance.cash.bands.${row.band}`) },
      { kind: "money", value: row.held },
      { kind: "count", value: row.heldCount },
      { kind: "money", value: row.owed },
      { kind: "count", value: row.owedCount },
    ]),
  };
}

/** Cash needed soon: approved not yet given, each step in approval, in approval, and all. */
export function cashNeededSheet(
  block: CashNeeded,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.cashNeeded");
  // Each number with the orders without a planned price it leaves out (plan of 2.5d-c).
  const line = (label: string, amount: NeededAmount): CellValue[] => [
    { kind: "text", value: label },
    { kind: "money", value: amount.amount },
    { kind: "count", value: amount.count },
    { kind: "count", value: amount.unpriced },
  ];
  return {
    name,
    heading: [
      ...heading(locale, name, null, filters, options, t("finance.needed.note")),
      ...unpricedLine(locale, block.all.unpriced),
    ],
    columns: [
      t("finance.columns.stage"),
      t("finance.columns.needed"),
      t("finance.columns.orders"),
      t("plan.columns.unpriced"),
    ],
    rows: [
      line(t("finance.needed.open"), block.open),
      ...block.steps.map((step) => line(`  ${tRoot(`requestStatus.${step.step}`)}`, step)),
      line(t("finance.needed.approval"), block.approval),
    ],
    total: { label: t("finance.needed.all"), amount: block.all.amount },
  };
}

/** The money rows behind a Cash amount, every row. */
export function moneyRowsSheet(
  list: MoneyRowList,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.moneyRows");
  const lines = heading(locale, name, list.period, filters, options);
  lines.push(
    list.month
      ? `${t(`finance.cash.kinds.${list.money}`)}, ${monthText(t, tRoot, list.month)}`
      : t(`finance.cash.kinds.${list.money}`),
  );
  return {
    name,
    heading: lines,
    columns: [
      t("finance.money.columns.date"),
      t("finance.money.columns.document"),
      t("cash.columns.order"),
      t("cash.columns.product"),
      t("cash.columns.branch"),
      t("finance.money.columns.manager"),
      t("finance.money.columns.amount"),
    ],
    rows: list.rows.map((row): CellValue[] => [
      { kind: "date", value: row.occurredOn },
      { kind: "text", value: row.documentNo ?? "" },
      { kind: "text", value: row.orderNumber },
      { kind: "text", value: productText(row) },
      { kind: "text", value: row.branchName },
      { kind: "text", value: row.managerName },
      { kind: "money", value: row.amount },
    ]),
    total: { label: t(`finance.cash.kinds.${list.money}`), amount: list.total },
  };
}

/** The orders behind a Cash needed soon number, every row. */
export function neededOrdersSheet(
  list: NeededOrders,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, tRoot } = translators(locale);
  const name = t("sheets.neededOrders");
  const lines = heading(locale, name, null, filters, options, t("finance.needed.note"));
  lines.push(list.step ? tRoot(`requestStatus.${list.step}`) : t(`finance.needed.${list.stage}`));
  if (list.unpriced) lines.push(t("finance.needed.unpricedList"));
  return {
    name,
    heading: lines,
    columns: [
      t("cash.columns.order"),
      t("cash.columns.product"),
      t("cash.columns.branch"),
      t("cash.columns.owner"),
      t("cash.columns.status"),
      t("finance.neededList.columns.neededBy"),
      t("finance.neededList.columns.planned"),
      t("finance.neededList.columns.handed"),
      t("finance.columns.needed"),
    ],
    rows: list.rows.map((row): CellValue[] => [
      { kind: "text", value: row.orderNumber },
      { kind: "text", value: productText(row) },
      { kind: "text", value: row.branchName },
      { kind: "text", value: row.ownerName },
      { kind: "text", value: tRoot(`requestStatus.${row.status}`) },
      { kind: "date", value: row.neededBy },
      row.plannedCash === null
        ? { kind: "text", value: tRoot("orders.unpriced.none") }
        : { kind: "money", value: row.plannedCash },
      { kind: "signedMoney", value: row.handed },
      { kind: "money", value: row.needed },
    ]),
    total: { label: t("finance.columns.needed"), amount: list.total },
  };
}

/**
 * Bank transfers by supplier, the "No supplier" row last, their total the Bank transfer slice
 * (build-plan 6.6b; plan of 6.6b, decided item 1, Look first).
 */
export function transfersSheet(
  block: FinanceSpending,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.transfers");
  const { suppliers, noSupplier, total } = block.transfers;
  const rows = [
    ...suppliers.map((row) => ({ label: row.name, amount: row.amount, change: row.change })),
    ...(noSupplier ? [{ label: t("finance.payments.noSupplier"), ...noSupplier }] : []),
  ];
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("finance.columns.supplier"),
      t("spending.columns.amount"),
      t("spending.columns.change"),
      "%",
    ],
    rows: rows.map((row): CellValue[] => [
      { kind: "text", value: row.label },
      { kind: "money", value: row.amount },
      ...changeCells(row.change),
    ]),
    total: { label: t("finance.payments.transferTotal"), amount: total.amount },
  };
}

/**
 * Finance's overspent and saved by branch or by Manager, the columns its table shows (build-plan
 * 6.6b; review of the plan, correction 2): each with its count of orders and its change.
 */
export function overspendSheet(
  block: PlanVsActual,
  which: "overspendBranches" | "overspendManagers",
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t(`sheets.${which}`);
  const rows: { label: string; tally: Tally }[] =
    which === "overspendBranches"
      ? block.branches.map((row) => ({ label: row.name, tally: row }))
      : block.managers.map((row) => ({ label: row.name ?? t("plan.otherOwners"), tally: row }));
  const side = (orders: number, amount: bigint, change: Change): CellValue[] => [
    { kind: "count", value: orders },
    { kind: "money", value: amount },
    ...changeCells(change),
  ];
  return {
    name,
    heading: [
      ...heading(locale, name, block.period, filters, options),
      ...unpricedLine(locale, block.total.unpriced),
    ],
    columns: [
      t(which === "overspendBranches" ? "plan.columns.branch" : "plan.columns.manager"),
      t("finance.columns.overspentOrders"),
      t("plan.columns.overspent"),
      t("spending.columns.change"),
      "%",
      t("finance.columns.savedOrders"),
      t("plan.columns.saved"),
      t("spending.columns.change"),
      "%",
      t("plan.columns.unpriced"),
    ],
    rows: rows.map(({ label, tally }) => [
      { kind: "text", value: label },
      ...side(tally.colours.red.count, tally.overspent.amount, tally.overspent.change),
      ...side(tally.colours.amber.count, tally.saved.amount, tally.saved.change),
      { kind: "count", value: tally.unpriced.count },
    ]),
  };
}

/** Settlement speed by branch, "All branches" last (build-plan 6.6b; plan of 6.6b, decided item 6). */
export function settlementBranchesSheet(
  block: SettlementSpeed,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t } = translators(locale);
  const name = t("sheets.settlementBranches");
  const rows = [
    ...block.branches.map((row) => ({ label: row.name, days: row })),
    { label: t("finance.speed.allBranches"), days: block.total },
  ];
  return {
    name,
    heading: heading(locale, name, block.period, filters, options),
    columns: [
      t("finance.columns.branch"),
      t("finance.columns.days"),
      t("finance.columns.settlements"),
      t("finance.columns.daysChange"),
    ],
    rows: rows.map(({ label, days }): CellValue[] => [
      { kind: "text", value: label },
      { kind: "text", value: days.days ?? "" },
      { kind: "count", value: days.count },
      { kind: "text", value: days.change ?? "" },
    ]),
  };
}

/** The settlements behind a Settlement speed number, every row (build-plan 6.6b). */
export function settlementsSheet(
  list: SettlementList,
  filters: AnalyticsFilters,
  options: AnalyticsFilterOptions,
  locale: Locale,
): AnalyticsSheet {
  const { t, format } = translators(locale);
  const name = t("sheets.settlements");
  const lines = heading(locale, name, list.period, filters, options);
  lines.push(t("finance.settlementList.summary", { count: list.count, days: list.days ?? "0.0" }));
  return {
    name,
    heading: lines,
    columns: [
      t("cash.columns.order"),
      t("cash.columns.product"),
      t("cash.columns.branch"),
      t("finance.settlementList.columns.owner"),
      t("finance.settlementList.columns.sent"),
      t("finance.settlementList.columns.closed"),
      t("finance.settlementList.columns.days"),
    ],
    rows: list.rows.map((row): CellValue[] => [
      { kind: "text", value: row.orderNumber },
      { kind: "text", value: productText(row) },
      { kind: "text", value: row.branchName },
      { kind: "text", value: row.ownerName },
      { kind: "text", value: `${format.date(row.sentAt)} ${format.time(row.sentAt)}` },
      { kind: "text", value: `${format.date(row.closedAt)} ${format.time(row.closedAt)}` },
      { kind: "text", value: row.days },
    ]),
  };
}
