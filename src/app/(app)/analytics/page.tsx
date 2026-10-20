import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { ApprovalSpeedView } from "@/features/analytics/components/approval-speed-block";
import { AnalyticsFilterBar } from "@/features/analytics/components/filter-bar";
import {
  CashNeededView,
  FinanceCashView,
  FinancePlanView,
  PaymentsView,
  SettlementSpeedView,
} from "@/features/analytics/components/finance-blocks";
import { HeadSpendingView } from "@/features/analytics/components/head-spending-block";
import {
  MyCashView,
  MyEstimatesView,
  MyOrdersView,
  StockPlanningView,
} from "@/features/analytics/components/manager-blocks";
import { ManagersView } from "@/features/analytics/components/managers-block";
import {
  MyApprovalsView,
  OrdersView,
  PrincipalSpendingView,
} from "@/features/analytics/components/principal-blocks";
import { PlanVsActualView } from "@/features/analytics/components/plan-vs-actual-block";
import { PricesView } from "@/features/analytics/components/prices-block";
import { SpendingBlockView } from "@/features/analytics/components/spending-block";
import { WarehouseView } from "@/features/analytics/components/warehouse-block";
import { type AnalyticsRaw, readAnalyticsPage } from "@/features/analytics/page-data";
import { analyticsSearch } from "@/features/analytics/period-params";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";

// /analytics, "what is happening and why" (10-notifications-analytics-reports.md, Analytics page
// per role; 11-screens-and-ux.md, Screens: "Analytics | All, each role sees its own page"; build-
// plan 6.3). The period picker and the filters above the blocks; until 6.5 and 6.6 the other roles
// see the shared Spending block (plan of 6.3, decided item 12). The Head's page adds the rest of
// Spending and Plan vs actual (build-plan 6.4a; plan of 6.4, decided item 8), Prices and Approval
// speed (build-plan 6.4b), Managers (build-plan 6.4c) and Warehouse (build-plan 6.4d). The
// Principal's page adds the rest of Spending, Orders, My approvals and Warehouse (build-plan
// 6.5a). The Manager's page shows My orders, My estimates and My cash (build-plan 6.5b; plan of
// 6.5b, decided items 6 and 7) and Stock planning (build-plan 6.5c), and nothing else: the spec's Manager table has no Spending block, and its blocks
// are the user's own orders, so it has no Manager filter. Finance's page shows Cash and Cash
// needed soon (build-plan 6.6a), Payments, Plan vs actual and Settlement speed (build-plan 6.6b),
// and no Spending block: the spec's Finance table has none, and its spending is Payments' (plan
// of 6.6b, decided item 5, Look first). The branch
// filter starts at the top bar's branch view (decided item 9). An address the parser refuses, or a school year not set,
// falls back to this month (review of the plan, correction 2); another branch is Not found (03
// rule 1). The line under the title says when the summary was last rebuilt (decided item 13).

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<AnalyticsRaw>;
}) {
  const user = await requireUser("/analytics");
  const read = await readAnalyticsPage(
    user.id,
    user.role,
    await searchParams,
    (await cookies()).get(BRANCH_COOKIE)?.value,
  );
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { period, filters, variant, compared, options, block, head, principal, manager, finance } =
    read;
  // The period resolved by a query: the Manager's and Finance's pages read no Spending block.
  const shownPeriod = manager ? manager[0].period : finance ? finance[0].period : block!.period;
  const t = await getTranslations("analytics");
  const format = await getFormatters();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-title">
            {t("title")}
            <span
              className="text-sm font-normal tracking-normal text-muted-foreground"
              data-period-line
            >
              {t("periodLine", {
                first: format.date(shownPeriod.first),
                last: format.date(shownPeriod.last),
              })}
            </span>
          </h1>
          {compared ? (
            <p className="text-sm leading-5 text-muted-foreground" data-same-days>
              {t("sameDays", {
                first: format.date(compared.first),
                last: format.date(compared.last),
              })}
            </p>
          ) : null}
          <p className="text-sm leading-5 text-muted-foreground" data-refreshed>
            {options.refreshedAt
              ? t("refreshed", { time: format.time(options.refreshedAt) })
              : t("refreshing")}
          </p>
        </div>
        {/* The page as a PDF (build-plan 6.7): the address of what the page shows, as parsed. */}
        <a
          href={`/analytics/report?${analyticsSearch(period, filters, { variant })}`}
          download
          data-report-pdf
          className={cn(buttonVariants({ variant: "secondary" }), "max-sm:w-full")}
        >
          <Icon name="download" />
          {t("pdf")}
        </a>
      </div>
      <AnalyticsFilterBar
        action="/analytics"
        period={period}
        filters={filters}
        options={options}
        noManager={manager !== null}
      />
      {block && <SpendingBlockView block={block} period={period} filters={filters} />}
      {head && (
        <>
          <HeadSpendingView block={head[0]} period={period} filters={filters} />
          <PlanVsActualView block={head[1]} period={period} filters={filters} />
          <PricesView
            block={head[2]}
            choices={head[3]}
            variant={variant}
            period={period}
            filters={filters}
          />
          <ApprovalSpeedView block={head[4]} period={period} filters={filters} />
          <ManagersView block={head[5]} period={period} filters={filters} />
          <WarehouseView block={head[6]} period={period} filters={filters} />
        </>
      )}
      {principal && (
        <>
          <PrincipalSpendingView
            spending={principal[0]}
            products={principal[1]}
            period={period}
            filters={filters}
          />
          <OrdersView block={principal[2]} period={period} filters={filters} />
          <MyApprovalsView block={principal[3]} period={period} filters={filters} />
          <WarehouseView block={principal[4]} period={period} filters={filters} principal />
        </>
      )}
      {manager && (
        <>
          <MyOrdersView block={manager[0]} period={period} filters={filters} userId={user.id} />
          <MyEstimatesView block={manager[1]} period={period} filters={filters} userId={user.id} />
          <MyCashView block={manager[2]} filters={filters} userId={user.id} />
          <StockPlanningView block={manager[3]} period={period} filters={filters} />
        </>
      )}
      {finance && (
        <>
          <FinanceCashView block={finance[0]} period={period} filters={filters} />
          <CashNeededView block={finance[1]} filters={filters} />
          <PaymentsView block={finance[2]} period={period} filters={filters} />
          <FinancePlanView
            block={finance[3]}
            noReceipt={finance[2].noReceipt}
            period={period}
            filters={filters}
          />
          <SettlementSpeedView block={finance[4]} period={period} filters={filters} />
        </>
      )}
    </div>
  );
}
