import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { Change } from "@/domain/analytics";
import { getFormatters } from "@/i18n/get-formatters";

import type { CashNeeded } from "../queries/cash-needed";
import type { FinanceCash } from "../queries/finance-cash";
import type { FinanceSpending } from "../queries/finance-spending";
import type { PlanVsActual, Tally } from "../queries/plan-vs-actual";
import type { SettlementSpeed } from "../queries/settlement-speed";
import {
  type AnalyticsFilters,
  CASH_KIND_KEYS,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { changeText, countChangeText, daysChangeText } from "./change-text";
import { Card, Table } from "./prices-block";

// Finance's blocks of the Analytics page (10-notifications-analytics-reports.md, Analytics page
// per role, "Finance, own branches"; build-plan 6.6a; plan of 6.6a, decided items 2 to 10). Cash:
// given, returned and paid back in the period, each with its change, and by month, each cell with
// its change against the month before; tiles and a table, no chart (decided item 7); money with
// managers by age, held and owed apart (decided item 3). Cash needed soon: approved not yet given,
// still in approval with each step, and the two together (decided items 4 and 5). Every amount
// opens the list behind it (point 3); the numbers of now carry no change (decided item 6). The page
// computes nothing: the numbers are the queries'. Task 6.6b adds Payments, Plan vs actual and
// Settlement speed (build-plan 6.6b; plan of 6.6b, decided items 1 to 8): every number of the
// period with its change (review of the plan, correction 1), every table with its Excel button
// whose sheet holds the columns shown (correction 2).

type Common = { period: PeriodInput; filters: AnalyticsFilters };

const linkClass = "font-semibold whitespace-nowrap text-link underline-offset-2 hover:underline";
const tileNumber =
  "inline-flex min-h-11 min-w-11 items-center text-title tabular-nums underline-offset-4 hover:underline";

/** The period of the page for the lists of now, kept only for the way back. */
const NOW: PeriodInput = { choice: "this_month", from: null, to: null };

/** Cash: the three kinds of the period and by month, and money with managers by age. */
export async function FinanceCashView({ block, period, filters }: Common & { block: FinanceCash }) {
  const t = await getTranslations("analytics");
  const tMonths = await getTranslations("months");
  const format = await getFormatters();
  const rows = (key: DrillKey) => `/analytics/money?${analyticsSearch(period, filters, { key })}`;
  const download = (which: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: which })}`;
  const change = (each: Change) => changeText(each, t, format);
  const monthLabel = (month: string) =>
    t("monthLabel", {
      month: tMonths(String(Number(month.slice(5))) as "1"),
      year: month.slice(0, 4),
    });
  const cashOrders = (key: DrillKey) => `/analytics/cash?${analyticsSearch(NOW, filters, { key })}`;

  return (
    <section
      aria-labelledby="finance-cash-title"
      className="flex flex-col gap-4"
      data-analytics-block="finance-cash"
    >
      <div className="flex flex-col gap-1">
        <h2 id="finance-cash-title" className="text-heading font-semibold">
          {t("finance.cash.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("finance.cash.note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {CASH_KIND_KEYS.map((kind) => (
          <div
            key={kind}
            className="flex flex-col gap-1 rounded-lg bg-muted p-4"
            data-finance-cash-tile={kind}
          >
            <p className="text-sm leading-5 font-semibold text-muted-foreground">
              {t(`finance.cash.kinds.${kind}`)}
            </p>
            <Link href={rows({ kind: "money", money: kind, month: null })} className={tileNumber}>
              {format.money(block.totals[kind].amount)}
            </Link>
            <p className="text-sm leading-5 text-muted-foreground">
              {change(block.totals[kind].change)}
            </p>
          </div>
        ))}
      </div>
      <Card id="finance-months" title={t("finance.cash.byMonth")} excel={download("financeCash")}>
        <Table
          headings={[
            t("finance.columns.month"),
            ...CASH_KIND_KEYS.map((kind) => t(`finance.cash.kinds.${kind}`)),
          ]}
          rows={block.months.map((row) => ({
            key: row.month,
            cells: [
              monthLabel(row.month),
              ...CASH_KIND_KEYS.map((kind) => (
                <>
                  <Link
                    href={rows({ kind: "money", money: kind, month: row.month })}
                    className={linkClass}
                  >
                    {format.money(row[kind].amount)}
                  </Link>
                  <span className="block text-small text-muted-foreground">
                    {change(row[kind].change)}
                  </span>
                </>
              )),
            ],
          }))}
          data="finance-months"
        />
      </Card>
      <Card id="finance-ages" title={t("finance.cash.byAge")} excel={download("cashAges")}>
        <p className="text-sm leading-5 text-muted-foreground">{t("finance.cash.ageNote")}</p>
        <Table
          headings={[
            t("finance.columns.age"),
            t("finance.columns.held"),
            t("finance.columns.owed"),
          ]}
          rows={block.ages.map((row) => ({
            key: row.band,
            cells: [
              t(`finance.cash.bands.${row.band}`),
              <>
                <Link
                  href={cashOrders({ kind: "age", band: row.band, side: "held" })}
                  className={linkClass}
                >
                  {format.money(row.held)}
                </Link>
                <span className="block text-small text-muted-foreground">
                  {t("finance.orders", { count: row.heldCount })}
                </span>
              </>,
              <>
                <Link
                  href={cashOrders({ kind: "age", band: row.band, side: "owed" })}
                  className={linkClass}
                >
                  {format.money(row.owed)}
                </Link>
                <span className="block text-small text-muted-foreground">
                  {t("finance.orders", { count: row.owedCount })}
                </span>
              </>,
            ],
          }))}
          data="finance-ages"
        />
      </Card>
    </section>
  );
}

/** Cash needed soon: approved not yet given, still in approval by step, and both together. */
export async function CashNeededView({
  block,
  filters,
}: Omit<Common, "period"> & { block: CashNeeded }) {
  const t = await getTranslations("analytics");
  const tStatus = await getTranslations("requestStatus");
  const format = await getFormatters();
  const orders = (key: DrillKey) =>
    `/analytics/cash-needed?${analyticsSearch(NOW, filters, { key })}`;
  const download = `/analytics/download?${analyticsSearch(NOW, filters, { block: "cashNeeded" })}`;
  const tiles = [
    { stage: "open", label: t("finance.needed.open") },
    { stage: "approval", label: t("finance.needed.approval") },
    { stage: "all", label: t("finance.needed.all") },
  ] as const;

  return (
    <section
      aria-labelledby="cash-needed-title"
      className="flex flex-col gap-4"
      data-analytics-block="cash-needed"
    >
      <div className="flex flex-col gap-1">
        <h2 id="cash-needed-title" className="text-heading font-semibold">
          {t("finance.needed.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("finance.needed.note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map(({ stage, label }) => (
          <div
            key={stage}
            className="flex flex-col gap-1 rounded-lg bg-muted p-4"
            data-cash-needed-tile={stage}
          >
            <p className="text-sm leading-5 font-semibold text-muted-foreground">{label}</p>
            <Link href={orders({ kind: "needed", stage, step: null })} className={tileNumber}>
              {format.money(block[stage].amount)}
            </Link>
            <p className="text-sm leading-5 text-muted-foreground">
              {t("finance.orders", { count: block[stage].count })}
            </p>
          </div>
        ))}
      </div>
      <Card id="cash-needed-steps" title={t("finance.needed.bySteps")} excel={download}>
        <Table
          headings={[t("finance.columns.step"), t("finance.columns.needed")]}
          rows={block.steps.map((row) => ({
            key: row.step,
            cells: [
              tStatus(row.step),
              <>
                <Link
                  href={orders({ kind: "needed", stage: "approval", step: row.step })}
                  className={linkClass}
                >
                  {format.money(row.amount)}
                </Link>
                <span className="block text-small text-muted-foreground">
                  {t("finance.orders", { count: row.count })}
                </span>
              </>,
            ],
          }))}
          data="cash-needed-steps"
        />
      </Card>
    </section>
  );
}

/** Payments: spending by payment type and the bank transfers by supplier (decided item 1). */
export async function PaymentsView({
  block,
  period,
  filters,
}: Common & { block: FinanceSpending }) {
  const t = await getTranslations("analytics");
  const tRoot = await getTranslations();
  const format = await getFormatters();
  const records = (key: DrillKey, scope: AnalyticsFilters = filters) =>
    `/analytics/records?${analyticsSearch(period, scope, { key })}`;
  const download = (which: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: which })}`;
  const amount = (href: string, value: bigint, each: Change) => (
    <>
      <Link href={href} className={linkClass}>
        {format.money(value)}
      </Link>
      <span className="block text-small text-muted-foreground">{changeText(each, t, format)}</span>
    </>
  );
  const { transfers } = block;

  return (
    <section
      aria-labelledby="payments-title"
      className="flex flex-col gap-4"
      data-analytics-block="payments"
    >
      <div className="flex flex-col gap-1">
        <h2 id="payments-title" className="text-heading font-semibold">
          {t("finance.payments.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("finance.payments.note")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="payment-types" title={t("finance.payments.byType")} excel={download("payments")}>
          <Table
            headings={[t("finance.columns.payment"), t("finance.columns.amount")]}
            rows={[
              ...block.payments.map((row) => ({
                key: row.payment,
                cells: [
                  tRoot(`paymentTypes.${row.payment}`),
                  amount(
                    records({ kind: "payment", payment: row.payment }),
                    row.amount,
                    row.change,
                  ),
                ],
              })),
              {
                key: "total",
                cells: [
                  <span key="total" className="font-semibold">
                    {t("finance.payments.total")}
                  </span>,
                  amount(records({ kind: "period" }), block.total.amount, block.total.change),
                ],
              },
            ]}
            data="payment-types"
          />
        </Card>
        <Card id="transfers" title={t("finance.payments.transfers")} excel={download("transfers")}>
          <p className="text-sm leading-5 text-muted-foreground">
            {t("finance.payments.transfersNote")}
          </p>
          <Table
            headings={[t("finance.columns.supplier"), t("finance.columns.amount")]}
            rows={[
              ...transfers.suppliers.map((row) => ({
                key: row.id,
                cells: [
                  row.isActive ? row.name : t("inactive", { name: row.name }),
                  amount(
                    records(
                      { kind: "payment", payment: "TRANSFER" },
                      { ...filters, supplier: row.id },
                    ),
                    row.amount,
                    row.change,
                  ),
                ],
              })),
              ...(transfers.noSupplier
                ? [
                    {
                      key: "none",
                      cells: [
                        t("finance.payments.noSupplier"),
                        amount(
                          records({ kind: "payment", payment: "TRANSFER", noSupplier: true }),
                          transfers.noSupplier.amount,
                          transfers.noSupplier.change,
                        ),
                      ],
                    },
                  ]
                : []),
              {
                key: "total",
                cells: [
                  <span key="total" className="font-semibold">
                    {t("finance.payments.transferTotal")}
                  </span>,
                  amount(
                    records({ kind: "payment", payment: "TRANSFER" }),
                    transfers.total.amount,
                    transfers.total.change,
                  ),
                ],
              },
            ]}
            data="transfers"
          />
        </Card>
      </div>
    </section>
  );
}

/**
 * Plan vs actual: overspent and saved in all, by branch and by Manager, from the Head's query
 * (decided item 2), and the purchases without a receipt (decided item 4).
 */
export async function FinancePlanView({
  block,
  noReceipt,
  period,
  filters,
}: Common & { block: PlanVsActual; noReceipt: FinanceSpending["noReceipt"] }) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const orders = (key: DrillKey, scope: AnalyticsFilters = filters, otherOwners = false) =>
    `/analytics/orders?${analyticsSearch(period, scope, { key, otherOwners })}`;
  const download = (which: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: which })}`;
  const side = (
    tally: Tally,
    which: "overspent" | "saved",
    scope: AnalyticsFilters,
    otherOwners = false,
  ) => {
    const colour = which === "overspent" ? "red" : "amber";
    return (
      <>
        <Link href={orders({ kind: which }, scope, otherOwners)} className={linkClass}>
          {format.money(tally[which].amount)}
        </Link>
        <span className="block text-small text-muted-foreground">
          {t("finance.orders", { count: tally.colours[colour].count })}
        </span>
        <span className="block text-small text-muted-foreground">
          {changeText(tally[which].change, t, format)}
        </span>
      </>
    );
  };
  const headings = (first: string) => [first, t("finance.plan.overspent"), t("finance.plan.saved")];
  const tiles = [
    { which: "overspent", label: t("finance.plan.overspent") },
    { which: "saved", label: t("finance.plan.saved") },
  ] as const;

  return (
    <section
      aria-labelledby="finance-plan-title"
      className="flex flex-col gap-4"
      data-analytics-block="finance-plan"
    >
      <div className="flex flex-col gap-1">
        <h2 id="finance-plan-title" className="text-heading font-semibold">
          {t("finance.plan.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("finance.plan.note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map(({ which, label }) => (
          <div
            key={which}
            className="flex flex-col gap-1 rounded-lg bg-muted p-4"
            data-finance-plan-tile={which}
          >
            <p className="text-sm leading-5 font-semibold text-muted-foreground">{label}</p>
            <Link href={orders({ kind: which })} className={tileNumber}>
              {format.money(block.total[which].amount)}
            </Link>
            <p className="text-sm leading-5 text-muted-foreground">
              {t("finance.orders", {
                count: block.total.colours[which === "overspent" ? "red" : "amber"].count,
              })}
            </p>
            <p className="text-sm leading-5 text-muted-foreground">
              {changeText(block.total[which].change, t, format)}
            </p>
          </div>
        ))}
        <div
          className="flex flex-col gap-1 rounded-lg bg-muted p-4"
          data-finance-plan-tile="receipt"
        >
          <p className="text-sm leading-5 font-semibold text-muted-foreground">
            {t("finance.plan.noReceipt")}
          </p>
          <Link
            href={`/analytics/records?${analyticsSearch(period, filters, { key: { kind: "noreceipt" } })}`}
            className={tileNumber}
          >
            {format.money(noReceipt.amount)}
          </Link>
          <p className="text-sm leading-5 text-muted-foreground">
            {t("finance.records", { count: noReceipt.count })}
          </p>
          <p className="text-sm leading-5 text-muted-foreground" data-receipt-count-change>
            {countChangeText(noReceipt.countChange, t, format)}
          </p>
          <p className="text-sm leading-5 text-muted-foreground">
            {changeText(noReceipt.change, t, format)}
          </p>
        </div>
      </div>
      <p className="text-sm leading-5 text-muted-foreground">{t("finance.plan.noReceiptNote")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          id="finance-plan-branches"
          title={t("finance.plan.byBranch")}
          excel={download("overspendBranches")}
        >
          <Table
            headings={headings(t("plan.columns.branch"))}
            rows={block.branches.map((row) => {
              const scope = { ...filters, branch: row.id };
              return {
                key: row.id,
                cells: [
                  row.isActive ? row.name : t("inactive", { name: row.name }),
                  side(row, "overspent", scope),
                  side(row, "saved", scope),
                ],
              };
            })}
            data="finance-plan-branches"
          />
        </Card>
        <Card
          id="finance-plan-managers"
          title={t("finance.plan.byManager")}
          excel={download("overspendManagers")}
        >
          <Table
            headings={headings(t("plan.columns.manager"))}
            rows={block.managers.map((row) => {
              // "Other owners" drills down with owner=other, as the Head's block (6.4a).
              const scope = row.id ? { ...filters, manager: row.id } : filters;
              const other = row.id === null;
              const name =
                row.name === null
                  ? t("plan.otherOwners")
                  : row.isActive
                    ? row.name
                    : t("inactive", { name: row.name });
              return {
                key: row.id ?? "other",
                cells: [
                  name,
                  side(row, "overspent", scope, other),
                  side(row, "saved", scope, other),
                ],
              };
            })}
            data="finance-plan-managers"
          />
        </Card>
      </div>
    </section>
  );
}

/** Settlement speed: the average days in all and per branch, each with its change (decided items 3 and 6). */
export async function SettlementSpeedView({
  block,
  period,
  filters,
}: Common & { block: SettlementSpeed }) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const list = (scope: AnalyticsFilters = filters) =>
    `/analytics/settlements?${analyticsSearch(period, scope, { key: { kind: "settled" } })}`;
  const download = `/analytics/download?${analyticsSearch(period, filters, { block: "settlementBranches" })}`;
  const days = (value: string | null) =>
    value === null
      ? t("finance.speed.none")
      : t("finance.speed.days", { days: format.quantity(value) });
  const { total } = block;

  return (
    <section
      aria-labelledby="settlement-speed-title"
      className="flex flex-col gap-4"
      data-analytics-block="settlement-speed"
    >
      <div className="flex flex-col gap-1">
        <h2 id="settlement-speed-title" className="text-heading font-semibold">
          {t("finance.speed.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("finance.speed.note")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-4" data-settlement-tile>
          <p className="text-sm leading-5 font-semibold text-muted-foreground">
            {t("finance.speed.average")}
          </p>
          <Link href={list()} className={tileNumber}>
            {days(total.days)}
          </Link>
          <p className="text-sm leading-5 text-muted-foreground">
            {t("finance.speed.settlements", { count: total.count })}
          </p>
          <p className="text-sm leading-5 text-muted-foreground">
            {daysChangeText(total.change, t, format)}
          </p>
        </div>
      </div>
      <Card id="settlement-branches" title={t("finance.speed.byBranch")} excel={download}>
        <Table
          headings={[t("finance.columns.branch"), t("finance.columns.days")]}
          rows={block.branches.map((row) => ({
            key: row.id,
            cells: [
              row.isActive ? row.name : t("inactive", { name: row.name }),
              <>
                <Link href={list({ ...filters, branch: row.id })} className={linkClass}>
                  {days(row.days)}
                </Link>
                <span className="block text-small text-muted-foreground">
                  {t("finance.speed.settlements", { count: row.count })}
                </span>
                <span className="block text-small text-muted-foreground">
                  {daysChangeText(row.change, t, format)}
                </span>
              </>,
            ],
          }))}
          data="settlement-branches"
        />
      </Card>
    </section>
  );
}
