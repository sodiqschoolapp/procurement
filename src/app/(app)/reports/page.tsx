import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { getAnalyticsFilters } from "@/features/analytics/queries/filters";
import { orderTotalsOnFilter } from "@/features/orders/queries/order-list";
import { ReportFilters } from "@/features/reports/components/report-filters";
import {
  OrderRegisterView,
  PlanVsActualView,
  PurchaseRegisterView,
  SpendingView,
} from "@/features/reports/components/report-views";
import { getPlanVsActualReport } from "@/features/reports/queries/plan-vs-actual-report";
import { getPurchaseRegister } from "@/features/reports/queries/purchase-register";
import { getSpendingReport } from "@/features/reports/queries/spending-report";
import {
  REPORTS,
  type ReportParams,
  orderListFilters,
  orderListSearch,
  parseReportParams,
  reportSearch,
} from "@/features/reports/report-params";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { today } from "@/server/clock";

import { PageLinks } from "../catalog/page-links";

// /reports (11-screens-and-ux.md, Screens: "Reports | `/reports` | All"; 10-notifications-
// analytics-reports.md, Reports, first four rows; build-plan 6.8): Order register, Purchase
// register, Planned vs actual and Spending as tabs, the filters of branch, dates and category,
// and Download Excel. The Order register is the order list's: its count and planned total here,
// its orders on /orders, its file the list's download (plan of 6.8, decided items 7 and 11).
// Planned vs actual and Spending say when the summary they read was rebuilt (decided item 1, Look
// first). An address the parser refuses goes back to /reports; another branch is Not found (03
// rule 1; 15 S7).

type Raw = Record<string, string | string[] | undefined>;

async function readReport(userId: string, params: ReportParams) {
  try {
    switch (params.report) {
      case "orders":
        return {
          report: "orders" as const,
          data: await orderTotalsOnFilter(userId, orderListFilters(params)),
        };
      case "purchases":
        return {
          report: "purchases" as const,
          data: await getPurchaseRegister(userId, params, params.page),
        };
      case "plan":
        return {
          report: "plan" as const,
          data: await getPlanVsActualReport(userId, params, params.page),
        };
      case "spending":
        return { report: "spending" as const, data: await getSpendingReport(userId, params) };
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const user = await requireUser("/reports");
  const params = parseReportParams(await searchParams, today());
  if (!params) redirect("/reports");
  const read = await readReport(user.id, params);
  if (!read) notFound();
  const options = await getAnalyticsFilters(user.id);
  const t = await getTranslations("reports");
  const format = await getFormatters();
  const excel =
    params.report === "orders"
      ? `/orders/download/excel?${orderListSearch(params)}`
      : `/reports/download?${reportSearch(params)}`;
  const pageHref = (page: number) => `/reports?${reportSearch({ ...params, page })}`;
  const pager = (page: number, pages: number) =>
    pages > 1 ? <PageLinks page={page} pages={pages} href={pageHref} /> : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
            {t("title")}
            <span
              className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground"
              data-period-line
            >
              {t("periodLine", {
                first: format.date(params.range.first),
                last: format.date(params.range.last),
              })}
            </span>
          </h1>
          {(params.report === "plan" || params.report === "spending") && (
            <p className="text-sm leading-5 text-muted-foreground" data-refreshed>
              {options.refreshedAt
                ? t("refreshed", { time: format.time(options.refreshedAt) })
                : t("refreshing")}
            </p>
          )}
        </div>
        <a
          href={excel}
          download
          data-excel={params.report}
          className={cn(buttonVariants({ variant: "secondary" }), "max-sm:w-full")}
        >
          <Icon name="download" />
          {t("excel")}
        </a>
      </div>
      <nav aria-label={t("title")} className="flex flex-wrap gap-2">
        {REPORTS.map((report) => (
          <Link
            key={report}
            href={`/reports?${reportSearch({ ...params, report, page: 1 })}`}
            aria-current={report === params.report ? "page" : undefined}
            className={buttonVariants({
              variant: report === params.report ? "default" : "secondary",
            })}
            data-report-tab={report}
          >
            {t(`tabs.${report}`)}
          </Link>
        ))}
      </nav>
      <ReportFilters params={params} options={options} />
      <p className="text-sm leading-5 text-muted-foreground">{t(`notes.${params.report}`)}</p>
      {read.report === "orders" && (
        <OrderRegisterView
          count={read.data.count}
          totals={read.data.totals}
          listHref={`/orders?${orderListSearch(params)}`}
        />
      )}
      {read.report === "purchases" && (
        <PurchaseRegisterView register={read.data} pager={pager(read.data.page, read.data.pages)} />
      )}
      {read.report === "plan" && (
        <PlanVsActualView report={read.data} pager={pager(read.data.page, read.data.pages)} />
      )}
      {read.report === "spending" && <SpendingView report={read.data} />}
    </div>
  );
}
