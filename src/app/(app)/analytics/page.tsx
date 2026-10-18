import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { ApprovalSpeedView } from "@/features/analytics/components/approval-speed-block";
import { AnalyticsFilterBar } from "@/features/analytics/components/filter-bar";
import { HeadSpendingView } from "@/features/analytics/components/head-spending-block";
import {
  MyCashView,
  MyEstimatesView,
  MyOrdersView,
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
import { parseAnalyticsParams } from "@/features/analytics/period-params";
import { getApprovalSpeed } from "@/features/analytics/queries/approval-speed";
import { getAnalyticsFilters } from "@/features/analytics/queries/filters";
import { getHeadSpending } from "@/features/analytics/queries/head-spending";
import { getManagers } from "@/features/analytics/queries/managers";
import { getMyApprovals } from "@/features/analytics/queries/my-approvals";
import { getMyCash } from "@/features/analytics/queries/my-cash";
import { getMyEstimates } from "@/features/analytics/queries/my-estimates";
import { getMyOrders } from "@/features/analytics/queries/my-orders";
import { getOrderStatuses } from "@/features/analytics/queries/order-statuses";
import { getPlanVsActual } from "@/features/analytics/queries/plan-vs-actual";
import { getPriceChoices, getPrices } from "@/features/analytics/queries/prices";
import { getSpending } from "@/features/analytics/queries/spending";
import { getTopProducts } from "@/features/analytics/queries/top-products";
import { getWarehouse } from "@/features/analytics/queries/warehouse";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { getFormatters } from "@/i18n/get-formatters";
import { requireUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// /analytics, "what is happening and why" (10-notifications-analytics-reports.md, Analytics page
// per role; 11-screens-and-ux.md, Screens: "Analytics | All, each role sees its own page"; build-
// plan 6.3). The period picker and the filters above the blocks; until 6.5 and 6.6 the other roles
// see the shared Spending block (plan of 6.3, decided item 12). The Head's page adds the rest of
// Spending and Plan vs actual (build-plan 6.4a; plan of 6.4, decided item 8), Prices and Approval
// speed (build-plan 6.4b), Managers (build-plan 6.4c) and Warehouse (build-plan 6.4d). The
// Principal's page adds the rest of Spending, Orders, My approvals and Warehouse (build-plan
// 6.5a). The Manager's page shows My orders, My estimates and My cash only (build-plan 6.5b; plan
// of 6.5b, decided items 6 and 7): the spec's Manager table has no Spending block, and its blocks
// are the user's own orders, so it has no Manager filter. The branch
// filter starts at the top bar's branch view (decided item 9). An address the parser refuses, or a school year not set,
// falls back to this month (review of the plan, correction 2); another branch is Not found (03
// rule 1). The line under the title says when the summary was last rebuilt (decided item 13).

type Raw = Record<string, string | string[] | undefined>;

async function readPage(userId: string, role: string, raw: Raw) {
  const params = parseAnalyticsParams(raw);
  if (!params) return "refused" as const;
  const filters = params.branchGiven
    ? params.filters
    : {
        ...params.filters,
        branch: await currentBranchChoice(userId, (await cookies()).get(BRANCH_COOKIE)?.value),
      };
  try {
    const [options, block, head, principal, manager] = await Promise.all([
      getAnalyticsFilters(userId),
      role === "MANAGER" ? null : getSpending(userId, params.period, filters),
      role === "HEAD"
        ? Promise.all([
            getHeadSpending(userId, params.period, filters),
            getPlanVsActual(userId, params.period, filters),
            getPrices(userId, params.period, filters, params.variant),
            getPriceChoices(userId),
            getApprovalSpeed(userId, params.period, filters),
            getManagers(userId, params.period, filters),
            getWarehouse(userId, params.period, filters),
          ])
        : null,
      role === "PRINCIPAL"
        ? Promise.all([
            getHeadSpending(userId, params.period, filters),
            getTopProducts(userId, params.period, filters),
            getOrderStatuses(userId, params.period, filters),
            getMyApprovals(userId, params.period, filters),
            getWarehouse(userId, params.period, filters),
          ])
        : null,
      role === "MANAGER"
        ? Promise.all([
            getMyOrders(userId, params.period, filters),
            getMyEstimates(userId, params.period, filters),
            getMyCash(userId, filters),
          ])
        : null,
    ]);
    return {
      period: params.period,
      filters,
      variant: params.variant,
      options,
      block,
      head,
      principal,
      manager,
    };
  } catch (error) {
    if (error instanceof PeriodRefusedError) return "refused" as const;
    if (error instanceof AuthorizationError && error.kind === "not_found")
      return "not_found" as const;
    throw error;
  }
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const user = await requireUser("/analytics");
  const read = await readPage(user.id, user.role, await searchParams);
  if (read === "refused") redirect("/analytics");
  if (read === "not_found") notFound();
  const { period, filters, variant, options, block, head, principal, manager } = read;
  // The period resolved by a query: the Manager's page reads no Spending block.
  const shownPeriod = manager ? manager[0].period : block!.period;
  const t = await getTranslations("analytics");
  const format = await getFormatters();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-baseline gap-x-3 text-[28px] leading-[34px] font-bold tracking-[-0.01em]">
          {t("title")}
          <span
            className="text-[15px] leading-[22px] font-normal tracking-normal text-muted-foreground"
            data-period-line
          >
            {t("periodLine", {
              first: format.date(shownPeriod.first),
              last: format.date(shownPeriod.last),
            })}
          </span>
        </h1>
        <p className="text-sm leading-5 text-muted-foreground" data-refreshed>
          {options.refreshedAt
            ? t("refreshed", { time: format.time(options.refreshedAt) })
            : t("refreshing")}
        </p>
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
        </>
      )}
    </div>
  );
}
