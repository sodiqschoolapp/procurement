import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getFormatters } from "@/i18n/get-formatters";

import type { ManagerRow, Managers } from "../queries/managers";
import {
  type AnalyticsFilters,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { amountChangeText, countChangeText } from "./change-text";
import { Card, Table } from "./prices-block";

// The Managers block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Per Manager: number of orders, average difference from plan,
// cancelled purchase records, cash held and for how long"; build-plan 6.4c; plan of 6.4c, decided
// items 2 to 7). One row per Manager, "Other owners" last (6.4a review correction 1). Orders and
// the average open the ended orders on /analytics/orders, cancelled records /analytics/cancelled,
// cash held /analytics/cash, each with the Manager filter set or `owner=other` (point 3); the
// table exports to Excel (point 4). Every number of the period shows its change (point 1), the
// average in so'm only (decided item 3); cash held is of now and has none (decided item 4). The
// page computes nothing: the numbers are the query's.

export async function ManagersView({
  block,
  period,
  filters,
}: {
  block: Managers;
  period: PeriodInput;
  filters: AnalyticsFilters;
}) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const scope = (row: ManagerRow) => ({
    filters: { ...filters, manager: row.id },
    otherOwners: row.id === null,
  });
  const orders = (row: ManagerRow) => {
    const { filters: chosen, otherOwners } = scope(row);
    return `/analytics/orders?${analyticsSearch(period, chosen, { otherOwners })}`;
  };
  const cancelled = (row: ManagerRow) => {
    const { filters: chosen, otherOwners } = scope(row);
    return `/analytics/cancelled?${analyticsSearch(period, chosen, { otherOwners })}`;
  };
  const cash = (row: ManagerRow) => {
    const { filters: chosen, otherOwners } = scope(row);
    return `/analytics/cash?${analyticsSearch(period, chosen, { otherOwners })}`;
  };
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
  const average = (amount: bigint) =>
    amount === 0n
      ? t("managers.even")
      : amount > 0n
        ? t("managers.left", { amount: format.money(amount) })
        : t("managers.over", { amount: format.money(-amount) });

  return (
    <section
      aria-labelledby="managers-title"
      className="flex flex-col gap-4"
      data-analytics-block="managers"
    >
      <div className="flex flex-col gap-1">
        <h2 id="managers-title" className="text-[20px] leading-7 font-bold">
          {t("managers.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("managers.note")}</p>
      </div>

      <Card id="managers-table" title={t("managers.perManager")} excel={download("managers")}>
        {block.rows.length === 0 ? (
          <p className="text-sm leading-5 text-muted-foreground">{t("managers.empty")}</p>
        ) : (
          <Table
            headings={[
              t("managers.columns.manager"),
              t("managers.columns.orders"),
              t("managers.columns.average"),
              t("managers.columns.cancelled"),
              t("managers.columns.held"),
              t("managers.columns.heldFor"),
            ]}
            rows={block.rows.map((row) => ({
              key: row.id ?? "other",
              cells: [
                row.id === null
                  ? t("plan.otherOwners")
                  : row.isActive
                    ? row.name
                    : t("inactive", { name: row.name! }),
                <>
                  {link(orders(row), format.quantity(String(row.orders.count)))}
                  {under(countChangeText(row.orders.change, t, format))}
                </>,
                row.average === null ? (
                  <span className="text-muted-foreground">{t("managers.noOrder")}</span>
                ) : (
                  <>
                    {link(orders(row), average(row.average))}
                    {under(amountChangeText(row.averageChange, t, format))}
                  </>
                ),
                <>
                  {link(cancelled(row), format.quantity(String(row.cancelled.count)))}
                  {under(countChangeText(row.cancelled.change, t, format))}
                </>,
                row.held === 0n ? (
                  <span className="text-muted-foreground">{t("managers.noCash")}</span>
                ) : (
                  link(cash(row), format.money(row.held))
                ),
                row.heldDays === null || row.heldSince === null ? (
                  ""
                ) : (
                  <>
                    {t("managers.days", { count: row.heldDays })}
                    {under(t("managers.since", { date: format.date(row.heldSince) }))}
                  </>
                ),
              ],
            }))}
            data="managers"
          />
        )}
      </Card>
    </section>
  );
}
