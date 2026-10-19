import { currentBranchChoice } from "@/features/catalog/queries/my-branches";
import { AuthorizationError, authorizeList } from "@/server/authorize";

import { parseAnalyticsParams } from "./period-params";
import { getApprovalSpeed } from "./queries/approval-speed";
import { getCashNeeded } from "./queries/cash-needed";
import { getFinanceCash } from "./queries/finance-cash";
import { getFinanceSpending } from "./queries/finance-spending";
import { getAnalyticsFilters } from "./queries/filters";
import { getHeadSpending } from "./queries/head-spending";
import { getManagers } from "./queries/managers";
import { getMyApprovals } from "./queries/my-approvals";
import { getMyCash } from "./queries/my-cash";
import { getMyEstimates } from "./queries/my-estimates";
import { getMyOrders } from "./queries/my-orders";
import { getOrderStatuses } from "./queries/order-statuses";
import { getPlanVsActual } from "./queries/plan-vs-actual";
import { getPriceChoices, getPrices } from "./queries/prices";
import { getSettlementSpeed } from "./queries/settlement-speed";
import { getSpending } from "./queries/spending";
import { getStockPlanning } from "./queries/stock-planning";
import { getTopProducts } from "./queries/top-products";
import { getWarehouse } from "./queries/warehouse";
import { PeriodRefusedError } from "./resolve-period";

// What the Analytics page reads, per role (10-notifications-analytics-reports.md, Analytics page
// per role): the page (src/app/(app)/analytics/page.tsx) and its PDF (GET /analytics/report, build-
// plan 6.7) read the same queries with the same parsed address, so file and screen can never
// disagree (05-order-request-form.md, Download 3; plan of 6.7, decided item 6). Every query asks
// data.view with its own branch wall.

export type AnalyticsRaw = Record<string, string | string[] | undefined>;

/**
 * Everything the user's own Analytics page shows, by role, for the address given: "refused" for an
 * address the parser refuses or a school year not set, "not_found" for another branch. Without
 * `branch=` the filters take the top bar's branch view, from the branch cookie's value.
 */
export async function readAnalyticsPage(
  userId: string,
  role: string,
  raw: AnalyticsRaw,
  branchCookie: string | undefined,
) {
  const params = parseAnalyticsParams(raw);
  if (!params) return "refused" as const;
  // The entry point's own check (developer-rules rule 4; permission review of 6.7, Should fix 1);
  // each query asks again with its branch wall in the SQL.
  await authorizeList(userId, "data.view");
  const filters = params.branchGiven
    ? params.filters
    : {
        ...params.filters,
        branch: await currentBranchChoice(userId, branchCookie),
      };
  try {
    const [options, block, head, principal, manager, finance] = await Promise.all([
      getAnalyticsFilters(userId),
      role === "MANAGER" || role === "FINANCE" ? null : getSpending(userId, params.period, filters),
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
            getStockPlanning(userId, params.period, filters),
          ])
        : null,
      role === "FINANCE"
        ? Promise.all([
            getFinanceCash(userId, params.period, filters),
            getCashNeeded(userId, filters),
            getFinanceSpending(userId, params.period, filters),
            getPlanVsActual(userId, params.period, filters),
            getSettlementSpeed(userId, params.period, filters),
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
      finance,
    };
  } catch (error) {
    if (error instanceof PeriodRefusedError) return "refused" as const;
    if (error instanceof AuthorizationError && error.kind === "not_found")
      return "not_found" as const;
    throw error;
  }
}

export type AnalyticsPage = Exclude<
  Awaited<ReturnType<typeof readAnalyticsPage>>,
  "refused" | "not_found"
>;
