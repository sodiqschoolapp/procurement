import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import type { ChartPoint } from "@/components/charts/chart-point";
import { LineChartBlock } from "@/components/charts/line-chart";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/components/utils";
import { CASH_AGE_BAND_KEYS } from "@/domain/analytics";
import { STUCK_STATUSES } from "@/domain/order-steps";
import { getFormatters } from "@/i18n/get-formatters";

import type { SubtypeName } from "../../analytics/queries/prices";
import type { ApprovalSpeedReport, StepHours } from "../queries/approval-speed-report";
import type { MoneyWithManagersReport } from "../queries/money-with-managers-report";
import type { PriceHistoryReport } from "../queries/price-history-report";
import type { ReportParams } from "../report-params";

import { CELL, NUMBER, Table, itemName } from "./report-views";

// The reports of 6.9b on screen (10-notifications-analytics-reports.md, Reports: Price history,
// Money with managers, Approval speed; build-plan 6.9b), drawn as the other reports: every number
// is the query's, the screen adds nothing up (.claude/rules/ui.md); each table scrolls sideways
// inside its own box at phone width; the lists are 25 a page (11 rule 8). Price history's chart
// is the Analytics line chart, one point per record that opens its order (plan of 6.9b, decided
// item 7); its `value` is for the drawing only.

const LINK = "font-semibold text-link underline-offset-2 hover:underline";

export async function PriceHistoryView({
  report,
  choices,
  params,
  pager,
}: {
  report: PriceHistoryReport;
  /** The subtypes the picker offers: those with a priced record in the user's branches. */
  choices: SubtypeName[];
  params: ReportParams;
  /** The page links of the records, drawn under them. */
  pager: ReactNode;
}) {
  const t = await getTranslations("reports");
  const format = await getFormatters();
  const kept: [string, string][] = [
    ["report", "prices"],
    ["from", params.range.first],
    ["to", params.range.last],
  ];
  if (params.filters.branch) kept.push(["branch", params.filters.branch]);
  if (params.filters.category) kept.push(["category", params.filters.category]);
  const chosen = report.subtype?.variantId ?? "";
  const listed = choices.some((choice) => choice.variantId === chosen);
  const points: ChartPoint[] = report.points.map((row) => ({
    key: row.purchaseId,
    label: format.date(row.purchasedOn),
    value: Number(row.unitPrice),
    shown: format.money(row.unitPrice),
    change: "",
    href: `/orders/${row.orderId}`,
  }));

  return (
    <>
      <form
        action="/reports"
        className="flex flex-wrap items-end gap-3 max-sm:flex-col max-sm:items-stretch"
        data-price-picker
      >
        {kept.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm leading-5 font-semibold">
          {t("prices.product")}
          <Select name="variant" defaultValue={chosen} className="w-full">
            {!report.subtype && <option value="">{t("prices.choose")}</option>}
            {report.subtype && !listed && (
              <option value={report.subtype.variantId}>{itemName(report.subtype)}</option>
            )}
            {choices.map((choice) => (
              <option key={choice.variantId} value={choice.variantId}>
                {itemName(choice)}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          {t("prices.show")}
        </button>
      </form>
      {!report.subtype ? (
        <EmptyState title={t("tabs.prices")} line={t("prices.empty")} />
      ) : (
        <>
          <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-report-summary>
            {t("prices.summary", {
              count: report.recordCount,
              name: itemName(report.subtype),
            })}
          </p>
          {report.points.length > 0 ? (
            <section
              className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground"
              data-table="price-chart"
            >
              <h2 className="text-lg leading-6 font-semibold">{t("prices.chart")}</h2>
              <LineChartBlock points={points} label={t("prices.chart")} />
            </section>
          ) : (
            <p className="text-sm leading-5 text-muted-foreground">{t("prices.noRecords")}</p>
          )}
          {report.records.length > 0 && (
            <>
              <Table
                name="price-records"
                title={t("prices.records")}
                columns={[
                  t("prices.columns.date"),
                  t("prices.columns.branch"),
                  t("prices.columns.order"),
                  t("prices.columns.supplier"),
                  t("prices.columns.qty"),
                  t("prices.columns.unitPrice"),
                ]}
                numeric={[4, 5]}
              >
                {report.records.map((row) => (
                  <tr key={row.purchaseId} className="border-t" data-price-row={row.purchaseId}>
                    <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>
                      {format.date(row.purchasedOn)}
                    </td>
                    <td className={cn(CELL, "whitespace-nowrap")}>{row.branchCode}</td>
                    <td className={cn(CELL, "font-semibold whitespace-nowrap")}>
                      <Link href={`/orders/${row.orderId}`} className={LINK}>
                        {row.orderNumber}
                      </Link>
                    </td>
                    <td className={CELL}>{row.supplierName ?? t("prices.noSupplier")}</td>
                    <td className={NUMBER}>
                      {format.quantity(row.qty)} {row.unitShortName}
                    </td>
                    <td className={NUMBER} data-value={row.unitPrice.toString()}>
                      {format.money(row.unitPrice)}
                    </td>
                  </tr>
                ))}
              </Table>
              {pager}
            </>
          )}
          {report.references.length > 0 ? (
            <Table
              name="price-references"
              title={t("prices.references")}
              columns={[
                t("prices.columns.setOn"),
                t("prices.columns.price"),
                // The Head and Finance only (plan of 2.3b, decided item 4).
                ...(report.showsNotes ? [t("prices.columns.note"), t("prices.columns.setBy")] : []),
              ]}
              numeric={[1]}
            >
              {report.references.map((row) => (
                <tr key={row.id} className="border-t" data-reference-row={row.id}>
                  <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>
                    {format.date(row.setOn)}
                    {row.inForce && (
                      <span className="block text-[13px] leading-[18px] text-muted-foreground">
                        {t("prices.inForce")}
                      </span>
                    )}
                  </td>
                  <td className={NUMBER}>{format.money(row.price)}</td>
                  {report.showsNotes && (
                    <>
                      <td className={CELL}>{row.note ?? ""}</td>
                      <td className={CELL}>{row.setByName ?? ""}</td>
                    </>
                  )}
                </tr>
              ))}
            </Table>
          ) : (
            <p className="text-sm leading-5 text-muted-foreground">{t("prices.noReferences")}</p>
          )}
        </>
      )}
    </>
  );
}

export async function MoneyWithManagersView({
  report,
  pager,
}: {
  report: MoneyWithManagersReport;
  /** The page links of the orders, drawn under them. */
  pager: ReactNode;
}) {
  const t = await getTranslations("reports");
  const tRoot = await getTranslations();
  const format = await getFormatters();
  if (report.owners.length === 0) {
    return <EmptyState title={t("tabs.cash")} line={t("cash.empty")} />;
  }
  return (
    <>
      <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-report-summary>
        {t("cash.summary", { held: format.money(report.held), owed: format.money(report.owed) })}
      </p>
      <Table
        name="cash-owners"
        title={t("cash.owners")}
        columns={[
          t("cash.columns.owner"),
          t("cash.columns.held"),
          t("cash.columns.owed"),
          t("cash.columns.since"),
          t("cash.columns.days"),
          t("cash.columns.orders"),
        ]}
        numeric={[1, 2, 4, 5]}
        foot={
          <tr>
            <td className={CELL}>{t("total")}</td>
            <td className={NUMBER} data-held={report.held.toString()}>
              {format.money(report.held)}
            </td>
            <td className={NUMBER} data-owed={report.owed.toString()}>
              {format.money(report.owed)}
            </td>
            <td colSpan={3} />
          </tr>
        }
      >
        {report.owners.map((row) => (
          <tr key={row.ownerId} className="border-t" data-owner-row={row.ownerId}>
            <td className={CELL}>
              {row.ownerName}
              {!row.ownerIsActive && (
                <span className="ml-2 text-muted-foreground">{t("inactive")}</span>
              )}
            </td>
            <td className={NUMBER}>{format.money(row.held)}</td>
            <td className={NUMBER}>{format.money(row.owed)}</td>
            <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>{format.date(row.since)}</td>
            <td className={NUMBER}>{t("cash.days", { days: row.days })}</td>
            <td className={NUMBER}>{row.orderCount}</td>
          </tr>
        ))}
      </Table>
      <Table
        name="cash-ages"
        title={t("cash.ages")}
        columns={[
          t("cash.columns.band"),
          t("cash.columns.held"),
          t("cash.columns.heldCount"),
          t("cash.columns.owed"),
          t("cash.columns.owedCount"),
        ]}
        numeric={[1, 2, 3, 4]}
      >
        {CASH_AGE_BAND_KEYS.map((band) => {
          const row = report.ages.find((each) => each.band === band)!;
          return (
            <tr key={band} className="border-t" data-band-row={band}>
              <td className={CELL}>{t(`cash.bands.${band}`)}</td>
              <td className={NUMBER}>{format.money(row.held)}</td>
              <td className={NUMBER}>{row.heldCount}</td>
              <td className={NUMBER}>{format.money(row.owed)}</td>
              <td className={NUMBER}>{row.owedCount}</td>
            </tr>
          );
        })}
      </Table>
      <Table
        name="cash-orders"
        title={t("cash.orders")}
        columns={[
          t("cash.columns.owner"),
          t("cash.columns.order"),
          t("cash.columns.product"),
          t("cash.columns.status"),
          t("cash.columns.held"),
          t("cash.columns.owed"),
          t("cash.columns.since"),
        ]}
        numeric={[4, 5]}
      >
        {report.orders.map((row) => (
          <tr key={row.id} className="border-t" data-cash-order={row.id}>
            <td className={CELL}>{row.ownerName}</td>
            <td className={cn(CELL, "font-semibold whitespace-nowrap")}>
              <Link href={`/orders/${row.id}`} className={LINK}>
                {row.number}
              </Link>
              <span className="block text-[13px] leading-[18px] font-normal text-muted-foreground">
                {row.branchCode}
              </span>
            </td>
            <td className={CELL}>{itemName(row)}</td>
            <td className={CELL}>{tRoot(`requestStatus.${row.status}`)}</td>
            <td className={NUMBER}>{row.cashCount > 0n ? format.money(row.cashCount) : ""}</td>
            <td className={NUMBER}>{row.cashCount < 0n ? format.money(-row.cashCount) : ""}</td>
            <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>
              {format.date(row.since)}
              <span className="block text-[13px] leading-[18px] text-muted-foreground">
                {t("cash.days", { days: row.days })}
              </span>
            </td>
          </tr>
        ))}
      </Table>
      {pager}
    </>
  );
}

export async function ApprovalSpeedView({
  report,
  pager,
}: {
  report: ApprovalSpeedReport;
  /** The page links of the stays, drawn under them. */
  pager: ReactNode;
}) {
  const t = await getTranslations("reports");
  const format = await getFormatters();
  if (report.stayCount === 0) {
    return <EmptyState title={t("tabs.speed")} line={t("speed.empty")} />;
  }
  const hours = (cell: StepHours) => (
    <>
      {cell.hours === null ? t("speed.none") : t("speed.hours", { hours: cell.hours })}
      <span className="block text-[13px] leading-[18px] text-muted-foreground">
        {t("speed.stayCount", { count: cell.count })}
      </span>
    </>
  );
  const moment = (value: Date) => `${format.date(value)} ${format.time(value)}`;
  return (
    <>
      <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-report-summary>
        {t("speed.summary", { count: report.stayCount })}
      </p>
      <Table
        name="speed-branches"
        title={t("speed.byBranch")}
        columns={[
          t("speed.columns.branch"),
          ...STUCK_STATUSES.map((step) => t(`speed.steps.${step}`)),
        ]}
        numeric={[1, 2, 3]}
        foot={
          <tr data-speed-all>
            <td className={CELL}>{t("allBranchesTotal")}</td>
            {STUCK_STATUSES.map((step) => (
              <td key={step} className={NUMBER} data-step={step}>
                {hours(report.all[step])}
              </td>
            ))}
          </tr>
        }
      >
        {report.branches.map((row) => (
          <tr key={row.branchId} className="border-t" data-speed-branch={row.branchId}>
            <td className={CELL}>
              {row.name}
              {!row.isActive && <span className="ml-2 text-muted-foreground">{t("inactive")}</span>}
            </td>
            {STUCK_STATUSES.map((step) => (
              <td key={step} className={NUMBER} data-step={step}>
                {hours(row.steps[step])}
              </td>
            ))}
          </tr>
        ))}
      </Table>
      <Table
        name="speed-stays"
        title={t("speed.stays")}
        columns={[
          t("speed.columns.left"),
          t("speed.columns.order"),
          t("speed.columns.step"),
          t("speed.columns.entered"),
          t("speed.columns.hours"),
          t("speed.columns.decision"),
        ]}
        numeric={[4]}
      >
        {report.stays.map((row) => (
          <tr
            key={`${row.orderId}:${row.step}:${row.enteredAt.toISOString()}`}
            className="border-t"
          >
            <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>{moment(row.leftAt)}</td>
            <td className={cn(CELL, "font-semibold whitespace-nowrap")}>
              <Link href={`/orders/${row.orderId}`} className={LINK}>
                {row.orderNumber}
              </Link>
              <span className="block text-[13px] leading-[18px] font-normal text-muted-foreground">
                {row.branchCode}
              </span>
            </td>
            <td className={CELL}>{t(`speed.steps.${row.step}`)}</td>
            <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>{moment(row.enteredAt)}</td>
            <td className={NUMBER}>{t("speed.hours", { hours: row.hours })}</td>
            <td className={CELL}>{t(`speed.decisions.${row.decision}`)}</td>
          </tr>
        ))}
      </Table>
      {pager}
    </>
  );
}
