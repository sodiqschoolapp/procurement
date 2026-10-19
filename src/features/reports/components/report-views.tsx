import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { OutcomeLabel } from "@/components/status-label";
import { cn } from "@/components/utils";
import type { OrdersTotals } from "@/domain/order-totals";
import { getFormatters } from "@/i18n/get-formatters";

import type { PlanVsActualReport, Sums } from "../queries/plan-vs-actual-report";
import type { PurchaseRegister } from "../queries/purchase-register";
import type { SpendingLine, SpendingReport } from "../queries/spending-report";

// The four reports of /reports on screen (10-notifications-analytics-reports.md, Reports, first
// four rows; build-plan 6.8). Every number is the query's; the screen adds nothing up (.claude/
// rules/ui.md). Each table scrolls sideways inside its own box at phone width, so the page never
// does (plan of 6.8, Screens); the lists are 25 a page (11 rule 8).

const HEAD = "bg-muted text-[13px] leading-[18px] font-semibold text-muted-foreground";
const CELL = "px-4 py-3";
const NUMBER = "px-4 py-3 text-right whitespace-nowrap tabular-nums";

function Table({
  title,
  columns,
  numeric,
  children,
  foot,
  name,
}: {
  title: string;
  columns: string[];
  /** The 0-based columns drawn right-aligned. */
  numeric: number[];
  children: ReactNode;
  foot?: ReactNode;
  name: string;
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground"
      data-table={name}
    >
      <h2 className="text-lg leading-6 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm leading-5">
          <thead className={HEAD}>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(CELL, "whitespace-nowrap", numeric.includes(index) && "text-right")}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
          {foot && <tfoot className="border-t font-semibold">{foot}</tfoot>}
        </table>
      </div>
    </section>
  );
}

export async function OrderRegisterView({
  count,
  totals,
  listHref,
}: {
  count: number;
  totals: OrdersTotals;
  listHref: string;
}) {
  const t = await getTranslations("reports");
  const format = await getFormatters();
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground">
      <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-report-summary>
        {t("orders.summary", { count, total: format.money(totals.grand) })}
      </p>
      <Link
        href={listHref}
        className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-primary underline-offset-2 hover:underline sm:min-h-0"
        data-order-list-link
      >
        {t("orders.openList")}
      </Link>
    </section>
  );
}

export async function PurchaseRegisterView({
  register,
  pager,
}: {
  register: PurchaseRegister;
  /** The page links, drawn under the list. */
  pager: ReactNode;
}) {
  const t = await getTranslations("reports");
  const format = await getFormatters();
  return (
    <>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-report-summary>
          {t("purchases.summary", { count: register.count, total: format.money(register.total) })}
        </p>
        {register.cancelledCount > 0 && (
          <p className="text-sm leading-5 text-muted-foreground" data-cancelled-line>
            {t("purchases.cancelledLine", { count: register.cancelledCount })}
          </p>
        )}
      </div>
      {register.rows.length === 0 ? (
        <EmptyState title={t("tabs.purchases")} line={t("purchases.empty")} />
      ) : (
        <Table
          name="purchases"
          title={t("purchases.sheet")}
          columns={[
            t("purchases.columns.date"),
            t("purchases.columns.order"),
            t("purchases.columns.branch"),
            t("purchases.columns.product"),
            t("purchases.columns.supplier"),
            t("purchases.columns.qty"),
            t("purchases.columns.unitPrice"),
            t("purchases.columns.extras"),
            t("purchases.columns.total"),
            t("purchases.columns.receipt"),
          ]}
          numeric={[5, 6, 7, 8]}
        >
          {register.rows.map((row) => (
            <tr
              key={row.purchaseId}
              className={cn("border-t", row.cancelReason !== null && "text-muted-foreground")}
              data-record-row={row.purchaseId}
              data-cancelled={row.cancelReason !== null ? "" : undefined}
            >
              <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>
                {format.date(row.purchasedOn)}
              </td>
              <td className={cn(CELL, "font-semibold whitespace-nowrap")}>
                <Link
                  href={`/orders/${row.orderId}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {row.orderNumber}
                </Link>
              </td>
              <td className={CELL}>{row.branchName}</td>
              <td className={CELL}>
                {row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName}
                {row.cancelReason !== null && (
                  <span className="block text-[13px] leading-[18px]">
                    {t("purchases.cancelled", { reason: row.cancelReason })}
                  </span>
                )}
              </td>
              <td className={CELL}>{row.supplierName ?? t("purchases.noSupplier")}</td>
              <td className={NUMBER}>{format.quantity(row.qty)}</td>
              <td className={NUMBER}>{format.money(row.unitPrice)}</td>
              <td className={NUMBER}>{format.money(row.extras)}</td>
              <td className={cn(NUMBER, row.cancelReason !== null && "line-through")} data-amount>
                {format.money(row.total)}
              </td>
              <td className={CELL}>{row.hasReceipt ? t("purchases.yes") : t("purchases.no")}</td>
            </tr>
          ))}
        </Table>
      )}
      {pager}
    </>
  );
}

async function SumsTable({
  name,
  title,
  rows,
  total,
}: {
  name: string;
  title: string;
  rows: { key: string; name: string; sums: Sums }[];
  total: Sums;
}) {
  const t = await getTranslations("reports");
  const format = await getFormatters();
  const cells = (sums: Sums) => (
    <>
      <td className={NUMBER}>{sums.orders}</td>
      <td className={NUMBER}>{format.money(sums.planned)}</td>
      <td className={NUMBER}>{format.money(sums.actual)}</td>
      <td className={NUMBER} data-difference={sums.difference.toString()}>
        {format.money(sums.difference)}
      </td>
    </>
  );
  return (
    <Table
      name={name}
      title={title}
      columns={[
        t("plan.columns.name"),
        t("plan.columns.orders"),
        t("plan.columns.planned"),
        t("plan.columns.actual"),
        t("plan.columns.difference"),
      ]}
      numeric={[1, 2, 3, 4]}
      foot={
        <tr>
          <td className={CELL}>{t("total")}</td>
          {cells(total)}
        </tr>
      }
    >
      {rows.map((row) => (
        <tr key={row.key} className="border-t">
          <td className={CELL}>{row.name}</td>
          {cells(row.sums)}
        </tr>
      ))}
    </Table>
  );
}

export async function PlanVsActualView({
  report,
  pager,
}: {
  report: PlanVsActualReport;
  /** The page links of the orders, drawn under them. */
  pager: ReactNode;
}) {
  const t = await getTranslations("reports");
  const format = await getFormatters();
  if (report.total.orders === 0) {
    return <EmptyState title={t("tabs.plan")} line={t("plan.empty")} />;
  }
  return (
    <>
      <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-report-summary>
        {t("plan.summary", {
          count: report.total.orders,
          planned: format.money(report.total.planned),
          actual: format.money(report.total.actual),
          difference: format.money(report.total.difference),
        })}
      </p>
      <Table
        name="plan-orders"
        title={t("plan.byOrder")}
        columns={[
          t("plan.columns.order"),
          t("plan.columns.branch"),
          t("plan.columns.owner"),
          t("plan.columns.product"),
          t("plan.columns.ended"),
          t("plan.columns.planned"),
          t("plan.columns.actual"),
          t("plan.columns.difference"),
        ]}
        numeric={[5, 6]}
      >
        {report.orders.map((row) => (
          <tr key={row.orderId} className="border-t" data-outcome-row={row.orderId}>
            <td className={cn(CELL, "font-semibold whitespace-nowrap")}>
              <Link
                href={`/orders/${row.orderId}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {row.number}
              </Link>
            </td>
            <td className={CELL}>{row.branchName}</td>
            <td className={CELL}>{row.ownerName}</td>
            <td className={CELL}>
              {row.subtypeName ? `${row.productName}, ${row.subtypeName}` : row.productName}
            </td>
            <td className={cn(CELL, "whitespace-nowrap tabular-nums")}>
              {format.date(row.endedOn)}
            </td>
            <td className={NUMBER}>{format.money(row.planned)}</td>
            <td className={NUMBER}>{format.money(row.actual)}</td>
            <td className={CELL} data-difference={row.difference.toString()}>
              <OutcomeLabel
                colour={row.colour}
                amount={row.difference < 0n ? -row.difference : row.difference}
              />
            </td>
          </tr>
        ))}
      </Table>
      {pager}
      <SumsTable
        name="plan-products"
        title={t("plan.byProduct")}
        rows={report.products.map((row) => ({ key: row.id, name: row.name, sums: row }))}
        total={report.total}
      />
      <SumsTable
        name="plan-managers"
        title={t("plan.byManager")}
        rows={report.managers.map((row) => ({
          key: row.id ?? "other",
          name: row.name ?? t("plan.otherOwners"),
          sums: row,
        }))}
        total={report.total}
      />
    </>
  );
}

export async function SpendingView({ report }: { report: SpendingReport }) {
  const t = await getTranslations("reports");
  const tRoot = await getTranslations();
  const format = await getFormatters();
  if (report.records === 0) {
    return <EmptyState title={t("tabs.spending")} line={t("spending.empty")} />;
  }
  const month = (key: string) =>
    tRoot("analytics.monthLabel", {
      month: tRoot(`months.${String(Number(key.slice(5))) as "1"}`),
      year: key.slice(0, 4),
    });
  const table = (
    name: string,
    title: string,
    first: string,
    lines: SpendingLine[],
    label: (line: SpendingLine) => string,
  ) => (
    <Table
      name={name}
      title={title}
      columns={[first, t("spending.columns.records"), t("spending.columns.amount")]}
      numeric={[1, 2]}
      foot={
        <tr>
          <td className={CELL}>{t("total")}</td>
          <td className={NUMBER}>{report.records}</td>
          <td className={NUMBER}>{format.money(report.total)}</td>
        </tr>
      }
    >
      {lines.map((line) => (
        <tr key={line.id ?? "none"} className="border-t">
          <td className={CELL}>{label(line)}</td>
          <td className={NUMBER}>{line.records}</td>
          <td className={NUMBER} data-amount>
            {format.money(line.amount)}
          </td>
        </tr>
      ))}
    </Table>
  );
  return (
    <>
      <p className="text-[15px] leading-[22px] font-semibold tabular-nums" data-report-summary>
        {t("spending.summary", { count: report.records, total: format.money(report.total) })}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {table(
          "spending-branches",
          t("spending.byBranch"),
          t("spending.columns.branch"),
          report.branches,
          (line) => line.name!,
        )}
        {table(
          "spending-categories",
          t("spending.byCategory"),
          t("spending.columns.category"),
          report.categories,
          (line) => line.name!,
        )}
        {table(
          "spending-departments",
          t("spending.byDepartment"),
          t("spending.columns.department"),
          report.departments,
          (line) => {
            const department = report.departments.find((each) => each.id === line.id);
            return department ? `${department.name}, ${department.branchName}` : line.name!;
          },
        )}
        {table(
          "spending-suppliers",
          t("spending.bySupplier"),
          t("spending.columns.supplier"),
          report.suppliers,
          (line) => line.name ?? t("spending.noSupplier"),
        )}
        {table(
          "spending-months",
          t("spending.byMonth"),
          t("spending.columns.month"),
          report.months,
          (line) => month(line.name!),
        )}
      </div>
    </>
  );
}
