import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { Change } from "@/domain/analytics";
import { getFormatters } from "@/i18n/get-formatters";

import type { CashNeeded } from "../queries/cash-needed";
import type { FinanceCash } from "../queries/finance-cash";
import {
  type AnalyticsFilters,
  CASH_KIND_KEYS,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { changeText } from "./change-text";
import { Card, Table } from "./prices-block";

// Finance's blocks of the Analytics page (10-notifications-analytics-reports.md, Analytics page
// per role, "Finance, own branches"; build-plan 6.6a; plan of 6.6a, decided items 2 to 10). Cash:
// given, returned and paid back in the period, each with its change, and by month, each cell with
// its change against the month before; tiles and a table, no chart (decided item 7); money with
// managers by age, held and owed apart (decided item 3). Cash needed soon: approved not yet given,
// still in approval with each step, and the two together (decided items 4 and 5). Every amount
// opens the list behind it (point 3); the numbers of now carry no change (decided item 6). The page
// computes nothing: the numbers are the queries'.

type Common = { period: PeriodInput; filters: AnalyticsFilters };

const linkClass = "font-semibold whitespace-nowrap text-primary underline-offset-2 hover:underline";
const tileNumber =
  "text-[28px] leading-[34px] font-bold tabular-nums underline-offset-4 hover:underline";

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
        <h2 id="finance-cash-title" className="text-[20px] leading-7 font-bold">
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
                  <span className="block text-[13px] leading-[18px] text-muted-foreground">
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
                <span className="block text-[13px] leading-[18px] text-muted-foreground">
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
                <span className="block text-[13px] leading-[18px] text-muted-foreground">
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
        <h2 id="cash-needed-title" className="text-[20px] leading-7 font-bold">
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
                <span className="block text-[13px] leading-[18px] text-muted-foreground">
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
