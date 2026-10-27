import { CASH_KIND_KEYS, OUTCOME_COLOURS } from "../period-params";
import type { AnalyticsPage } from "../page-data";
import type { Count } from "../queries/plan-vs-actual";
import type { Formatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import {
  changeText,
  countChangeText,
  daysChangeText,
  hoursChangeText,
  shareChangeText,
} from "../components/change-text";
import type { AnalyticsSheet } from "./excel";
import {
  approvalSpeedSheet,
  cashAgesSheet,
  cashNeededSheet,
  departmentUseSheet,
  financeCashSheet,
  heading,
  headSpendingSheet,
  managersSheet,
  myApprovalsSheet,
  myCashSheet,
  myEstimatesSheet,
  myOrdersSheet,
  myReasonsSheet,
  orderStatusesSheet,
  outcomesSheet,
  overspendSheet,
  priceRisesSheet,
  priceSpreadSheet,
  priceTrendSheet,
  productsSheet,
  settlementBranchesSheet,
  spendingSheet,
  stockPlanningSheet,
  tallySheet,
  transfersSheet,
  translators,
  warehouseSheet,
} from "./sheets";

// The whole Analytics page as the sections of its PDF (10-notifications-analytics-reports.md,
// Analytics page per role, point 4; build-plan 6.7; plan of 6.7). Each block of the role's page,
// in the page's order: its title, its notes, its headline numbers (the tiles, with the page's
// texts and change lines) and every table of the block, each one the sheet its Excel link
// downloads (decided item 4); a chart is its table (decided item 2); the drill-down lists are left
// out (decided item 3). Every number is the query's: nothing is computed here (05 Download 3).

/** A headline number of a block: its label, its value and the lines under it, as on the tile. */
export type ReportFigure = { label: string; value: string; lines: string[] };

export type ReportSection = {
  title: string;
  notes: string[];
  figures: ReportFigure[];
  /** Each table: its caption lines (the sheet's own heading lines the file's heading has not). */
  tables: { captions: string[]; sheet: AnalyticsSheet }[];
};

export type AnalyticsReport = {
  locale: Locale;
  title: string;
  /** On every page under the title: the period, the summary's time, the filters, who and when. */
  captions: string[];
  sections: ReportSection[];
  /** The line of a table with no row. */
  emptyLine: string;
  pageLine: (page: number, pages: number) => string;
  /** The formatters of the downloader's language, for the tables' cells. */
  format: Formatters;
};

export function analyticsReport(
  page: AnalyticsPage,
  locale: Locale,
  who: { name: string; schoolName: string | null },
  at: Date,
): AnalyticsReport {
  const { t, format } = translators(locale);
  const { options, block, head, principal, manager, finance } = page;
  // A Manager's tables are the user's own orders and name no Manager (plan of 6.5b, decided item
  // 6; plan of 6.7, decided item 6).
  const filters = manager ? { ...page.filters, manager: null } : page.filters;
  const period = manager ? manager[0].period : finance ? finance[0].period : block!.period;
  const title = t("report.title");
  // The period and filter lines, once for the file; a table repeats only the lines it differs in.
  const fileLines = heading(locale, title, period, filters, options).slice(1);
  const table = (sheet: AnalyticsSheet) => ({
    captions: sheet.heading.filter((line) => !fileLines.includes(line)),
    sheet,
  });
  const count = (value: number) => format.quantity(String(value));
  // The ended orders without a planned price that Plan vs actual's sums leave out, with their
  // change (08 Numbers; 10 point 1; plan of 2.5d-c, decided item 4, Look first).
  const unpricedFigure = (unpriced: Count) =>
    unpriced.count === 0 && unpriced.change.difference === 0n
      ? []
      : [
          {
            label: t("plan.unpriced"),
            value: count(unpriced.count),
            lines: [countChangeText(unpriced.change, t, format)],
          },
        ];
  const sections: ReportSection[] = [];

  if (block) {
    const empty = block.total.amount === 0n && block.categories.length === 0;
    const tables = empty
      ? []
      : [
          spendingSheet(block, "months", filters, options, locale),
          spendingSheet(block, "categories", filters, options, locale),
        ];
    if (head) {
      for (const which of ["branches", "departments", "suppliers", "payments"] as const) {
        tables.push(headSpendingSheet(head[0], which, filters, options, locale));
      }
    }
    if (principal) {
      tables.push(headSpendingSheet(principal[0], "departments", filters, options, locale));
      tables.push(productsSheet(principal[1], filters, options, locale));
    }
    sections.push({
      title: t("spending.title"),
      notes: empty ? [t("spending.empty")] : [],
      figures: [
        {
          label: t("spending.total"),
          value: format.money(block.total.amount),
          lines: [changeText(block.total.change, t, format)],
        },
      ],
      tables: tables.map(table),
    });
  }

  if (head) {
    const [, plan, prices, , speed, managers, warehouse] = head;
    const { total } = plan;
    const planEmpty =
      total.orders.count === 0 &&
      total.orders.change.difference === 0n &&
      total.unpriced.count === 0 &&
      total.unpriced.change.difference === 0n;
    const amounts = { green: 0n, amber: total.saved.amount, red: total.overspent.amount };
    sections.push({
      title: t("plan.title"),
      notes: [t("plan.note"), ...(planEmpty ? [t("plan.empty")] : [])],
      figures: planEmpty
        ? []
        : [
            {
              label: t("plan.ended"),
              value: count(total.orders.count),
              lines: [countChangeText(total.orders.change, t, format)],
            },
            ...unpricedFigure(total.unpriced),
            ...OUTCOME_COLOURS.map((colour) => {
              const each = total.colours[colour];
              return {
                label: `${t(`plan.outcome.${colour}`)} ${format.money(amounts[colour])}`,
                value: count(each.count),
                lines: [
                  each.share === null
                    ? t("plan.noShare")
                    : t("plan.share", { share: format.quantity(each.share) }),
                  countChangeText(each.change, t, format),
                  shareChangeText(each.shareChange, t, format),
                ],
              };
            }),
            {
              label: t("plan.overspent"),
              value: format.money(total.overspent.amount),
              lines: [changeText(total.overspent.change, t, format)],
            },
            {
              label: t("plan.saved"),
              value: format.money(total.saved.amount),
              lines: [changeText(total.saved.change, t, format)],
            },
          ],
      tables: planEmpty
        ? []
        : [
            outcomesSheet(plan, filters, options, locale),
            tallySheet(plan, "outcomeBranches", filters, options, locale),
            tallySheet(plan, "outcomeManagers", filters, options, locale),
          ].map(table),
    });
    sections.push({
      title: t("prices.title"),
      notes: [t("prices.note")],
      figures: [],
      tables: [
        priceTrendSheet(prices, filters, options, locale),
        priceRisesSheet(prices, filters, options, locale),
        priceSpreadSheet(prices, filters, options, locale),
      ].map(table),
    });
    sections.push({
      title: t("speed.title"),
      notes: [t("speed.note")],
      figures: [],
      tables: (["stepHours", "waiting", "decisions", "reasons"] as const)
        .map((which) => approvalSpeedSheet(speed, which, filters, options, locale))
        .map(table),
    });
    sections.push({
      title: t("managers.title"),
      notes: [t("managers.note")],
      figures: [],
      tables: [table(managersSheet(managers, filters, options, locale))],
    });
    sections.push(warehouseSection(warehouse, false));
  }

  if (principal) {
    const [, , statuses, approvals, warehouse] = principal;
    const today = format.date(statuses.today);
    sections.push({
      title: t("principal.orders.title"),
      notes: [t("principal.orders.note")],
      figures: [
        {
          label: t("principal.orders.comingUp"),
          value: count(statuses.comingUp),
          lines: [t("principal.orders.comingUpLine", { date: today })],
        },
        {
          label: t("principal.orders.overdue"),
          value: count(statuses.overdue),
          lines: [t("principal.orders.overdueLine", { date: today })],
        },
      ],
      tables: [table(orderStatusesSheet(statuses, filters, options, locale))],
    });
    sections.push({
      title: t("principal.approvals.title"),
      notes: [],
      figures: [
        approvals.mine.hours === null
          ? {
              label: t("principal.approvals.myHours"),
              value: "—",
              lines: [t("principal.approvals.noDecision")],
            }
          : {
              label: t("principal.approvals.myHours"),
              value: t("speed.hours", { hours: format.quantity(approvals.mine.hours) }),
              lines: [
                t("joined", {
                  first: t("speed.stays", { count: approvals.mine.count }),
                  second: hoursChangeText(approvals.mine.change, t, format),
                }),
              ],
            },
        {
          label: t("principal.approvals.waiting"),
          value: count(approvals.waiting.all),
          lines: [t("speed.waitingNote")],
        },
      ],
      tables: [table(myApprovalsSheet(approvals, filters, options, locale))],
    });
    sections.push(warehouseSection(warehouse, true));
  }

  if (manager) {
    const [orders, estimates, cash, planning] = manager;
    sections.push({
      title: t("my.orders.title"),
      notes: [t("my.orders.note")],
      figures: [
        orders.approval.hours === null
          ? { label: t("my.orders.approvalHours"), value: "—", lines: [t("my.orders.noApproval")] }
          : {
              label: t("my.orders.approvalHours"),
              value: t("speed.hours", { hours: format.quantity(orders.approval.hours) }),
              lines: [
                t("joined", {
                  first: t("speed.stays", { count: orders.approval.count }),
                  second: hoursChangeText(orders.approval.change, t, format),
                }),
              ],
            },
        orders.sentBack.share === null
          ? { label: t("my.orders.sentBack"), value: "—", lines: [t("my.orders.noDecision")] }
          : {
              label: t("my.orders.sentBack"),
              value: t("my.orders.share", {
                share: format.quantity(orders.sentBack.share),
                count: orders.sentBack.count,
                decisions: orders.decisions,
              }),
              lines: [
                orders.sentBack.change === null
                  ? t("my.orders.noDecisionBefore")
                  : shareChangeText(orders.sentBack.change, t, format),
              ],
            },
      ],
      tables: [
        myOrdersSheet(orders, filters, options, locale),
        myReasonsSheet(orders, filters, options, locale),
      ].map(table),
    });
    sections.push({
      title: t("my.estimates.title"),
      notes: [t("my.estimates.note")],
      figures: [],
      tables: [table(myEstimatesSheet(estimates, filters, options, locale))],
    });
    sections.push({
      title: t("my.cash.title"),
      notes: [t("my.cash.note")],
      figures: [
        { label: t("my.cash.held"), value: format.money(cash.held), lines: [] },
        { label: t("my.cash.owed"), value: format.money(cash.owed), lines: [] },
      ],
      tables: [table(myCashSheet(cash, filters, options, locale))],
    });
    sections.push({
      title: t("my.planning.title"),
      notes: [
        t("my.planning.note", {
          first: format.date(planning.rate.first),
          last: format.date(planning.rate.last),
        }),
        t("warehouse.notApplied"),
        ...(filters.department ? [t("my.planning.everyDepartment")] : []),
      ],
      figures: [{ label: t("my.planning.low"), value: count(planning.low), lines: [] }],
      tables: [table(stockPlanningSheet(planning, filters, options, locale))],
    });
  }

  if (finance) {
    const [cash, needed, spending, plan, speed] = finance;
    sections.push({
      title: t("finance.cash.title"),
      notes: [t("finance.cash.note")],
      figures: CASH_KIND_KEYS.map((kind) => ({
        label: t(`finance.cash.kinds.${kind}`),
        value: format.money(cash.totals[kind].amount),
        lines: [changeText(cash.totals[kind].change, t, format)],
      })),
      tables: [
        financeCashSheet(cash, filters, options, locale),
        cashAgesSheet(cash, filters, options, locale),
      ].map(table),
    });
    sections.push({
      title: t("finance.needed.title"),
      notes: [t("finance.needed.note")],
      figures: (["open", "approval", "all"] as const).map((stage) => ({
        label: t(`finance.needed.${stage}`),
        value: format.money(needed[stage].amount),
        lines: [t("finance.orders", { count: needed[stage].count })],
      })),
      tables: [table(cashNeededSheet(needed, filters, options, locale))],
    });
    // Spending by payment type is the Head's sheet of the same totals (`paymentTotals()`), as
    // the Excel link of Finance's Payments downloads it (plan of 6.6b).
    const payments = { ...spending, branches: [], departments: [], suppliers: [] };
    sections.push({
      title: t("finance.payments.title"),
      notes: [t("finance.payments.note")],
      figures: [],
      tables: [
        headSpendingSheet(payments, "payments", filters, options, locale),
        transfersSheet(spending, filters, options, locale),
      ].map(table),
    });
    const { noReceipt } = spending;
    sections.push({
      title: t("finance.plan.title"),
      notes: [t("finance.plan.note"), t("finance.plan.noReceiptNote")],
      figures: [
        ...(["overspent", "saved"] as const).map((which) => ({
          label: t(`finance.plan.${which}`),
          value: format.money(plan.total[which].amount),
          lines: [
            t("finance.orders", {
              count: plan.total.colours[which === "overspent" ? "red" : "amber"].count,
            }),
            changeText(plan.total[which].change, t, format),
          ],
        })),
        ...unpricedFigure(plan.total.unpriced),
        {
          label: t("finance.plan.noReceipt"),
          value: format.money(noReceipt.amount),
          lines: [
            t("finance.records", { count: noReceipt.count }),
            countChangeText(noReceipt.countChange, t, format),
            changeText(noReceipt.change, t, format),
          ],
        },
      ],
      tables: [
        overspendSheet(plan, "overspendBranches", filters, options, locale),
        overspendSheet(plan, "overspendManagers", filters, options, locale),
      ].map(table),
    });
    sections.push({
      title: t("finance.speed.title"),
      notes: [t("finance.speed.note")],
      figures: [
        {
          label: t("finance.speed.average"),
          value:
            speed.total.days === null
              ? t("finance.speed.none")
              : t("finance.speed.days", { days: format.quantity(speed.total.days) }),
          lines: [
            t("finance.speed.settlements", { count: speed.total.count }),
            daysChangeText(speed.total.change, t, format),
          ],
        },
      ],
      tables: [table(settlementBranchesSheet(speed, filters, options, locale))],
    });
  }

  function warehouseSection(
    warehouse: NonNullable<typeof head>[6],
    forPrincipal: boolean,
  ): ReportSection {
    return {
      title: t("warehouse.title"),
      notes: [
        forPrincipal
          ? t("warehouse.principalNote")
          : t("warehouse.note", { date: format.date(warehouse.stillSince) }),
        ...(filters.manager !== null || filters.supplier !== null
          ? [t("warehouse.notApplied")]
          : []),
        ...(filters.department !== null ? [t("warehouse.departmentOnly")] : []),
      ],
      figures: [],
      tables: [
        warehouseSheet(warehouse, filters, options, locale),
        departmentUseSheet(warehouse, filters, options, locale),
      ].map(table),
    };
  }

  const titled = who.schoolName ? `${who.schoolName} · ${title}` : title;
  return {
    locale,
    title: titled,
    captions: [
      ...fileLines.slice(0, 1),
      ...(page.compared
        ? [
            t("sameDays", {
              first: format.date(page.compared.first),
              last: format.date(page.compared.last),
            }),
          ]
        : []),
      options.refreshedAt
        ? t("refreshed", { time: format.time(options.refreshedAt) })
        : t("refreshing"),
      ...fileLines.slice(1),
      t("report.downloadedBy", { name: who.name, at: `${format.date(at)} ${format.time(at)}` }),
    ],
    sections,
    emptyLine: t("report.empty"),
    pageLine: (pageNumber, pages) => t("report.page", { page: pageNumber, pages }),
    format,
  };
}
