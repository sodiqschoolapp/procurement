import type { NextRequest } from "next/server";

import { businessDate } from "@/domain/business-date";
import { writeAnalyticsExcel } from "@/features/analytics/download/excel";
import {
  approvalOrdersSheet,
  approvalSpeedSheet,
  cancelledSheet,
  cashSheet,
  departmentUseSheet,
  headSpendingSheet,
  managersSheet,
  movesSheet,
  myApprovalsSheet,
  myCashSheet,
  myEstimatesSheet,
  myOrdersSheet,
  myReasonsSheet,
  orderStatusesSheet,
  outcomeOrdersSheet,
  outcomesSheet,
  priceRisesSheet,
  priceSpreadSheet,
  priceTrendSheet,
  productsSheet,
  recordsSheet,
  spendingSheet,
  statusOrdersSheet,
  stockSheet,
  tallySheet,
  warehouseSheet,
} from "@/features/analytics/download/sheets";
import { parseAnalyticsParams } from "@/features/analytics/period-params";
import { getApprovalOrders } from "@/features/analytics/queries/approval-orders";
import { getApprovalSpeed } from "@/features/analytics/queries/approval-speed";
import { getCancelledRecords } from "@/features/analytics/queries/cancelled-records";
import { getCashOrders } from "@/features/analytics/queries/cash-orders";
import { getAnalyticsFilters } from "@/features/analytics/queries/filters";
import { getHeadSpending } from "@/features/analytics/queries/head-spending";
import { getManagers } from "@/features/analytics/queries/managers";
import { getMyApprovals } from "@/features/analytics/queries/my-approvals";
import { getMyCash } from "@/features/analytics/queries/my-cash";
import { getMyEstimates } from "@/features/analytics/queries/my-estimates";
import { getMyOrders } from "@/features/analytics/queries/my-orders";
import { getOrderStatuses } from "@/features/analytics/queries/order-statuses";
import { getOutcomeOrders } from "@/features/analytics/queries/outcome-orders";
import { getPlanVsActual } from "@/features/analytics/queries/plan-vs-actual";
import { getPrices } from "@/features/analytics/queries/prices";
import { getSpending } from "@/features/analytics/queries/spending";
import { getSpendingRecords } from "@/features/analytics/queries/spending-records";
import { getStatusOrders } from "@/features/analytics/queries/status-orders";
import { getStockLines } from "@/features/analytics/queries/stock-lines";
import { getStockMoves } from "@/features/analytics/queries/stock-moves";
import { getTopProducts } from "@/features/analytics/queries/top-products";
import { getWarehouse } from "@/features/analytics/queries/warehouse";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { LOCALE_COOKIE, chooseLocale } from "@/i18n/locale";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize, authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";

// The Excel file of one Analytics table, GET /analytics/download?…&block=… (6.3: months,
// categories, records; 6.4a: branches, departments, suppliers, payments, outcomes,
// outcomeBranches, outcomeManagers, orders; 6.4b: priceTrend, priceRises, priceSpread, stepHours,
// waiting, decisions, reasons, approvals; 6.4c: managers, cancelled, cash; 6.4d: warehouse,
// departmentUse, stock, moves; 6.5a: products, orderStatuses, statusOrders, myApprovals; 6.5b:
// myOrders, myReasons, myEstimates, myCash)
// (10-notifications-analytics-reports.md, Analytics page per role, point 4; 03 Permission matrix
// "Export to Excel, download PDF, print"; build-plan 6.3). A route that writes nothing, as the
// order list's download (plan of 2.14, decided item 12). The address is the page's, checked by
// the same parser; a signed-out visitor gets 401; an address the parser refuses, a school year not
// set, a key the period cannot name, no `block`, and another branch's `branch=` get 404 (03 rule
// 1). The route asks `data.export`; the queries ask `data.view` again with the same walls.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const notFound = () => new Response(null, { status: 404 });

export async function GET(request: NextRequest): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return new Response(null, { status: 401 });
  const params = parseAnalyticsParams(Object.fromEntries(request.nextUrl.searchParams));
  if (!params?.block) return notFound();
  const { period, filters, key, block, otherOwners, variant, reason } = params;
  // "Other owners" names only the lists of orders and records (plan of 6.4; plan of 6.4c).
  if (otherOwners && block !== "orders" && block !== "cancelled" && block !== "cash") {
    return notFound();
  }
  const locale = chooseLocale({
    userLocale: user.locale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
  });

  let sheet;
  try {
    await authorizeList(user.id, "data.export");
    if (filters.branch) await authorize(user.id, "data.export", { branchId: filters.branch });
    const options = await getAnalyticsFilters(user.id);
    switch (block) {
      case "records":
        sheet = recordsSheet(
          await getSpendingRecords(user.id, period, filters, key, "all"),
          filters,
          options,
          locale,
        );
        break;
      case "months":
      case "categories":
        sheet = spendingSheet(
          await getSpending(user.id, period, filters),
          block,
          filters,
          options,
          locale,
        );
        break;
      case "branches":
      case "departments":
      case "suppliers":
      case "payments":
        sheet = headSpendingSheet(
          await getHeadSpending(user.id, period, filters),
          block,
          filters,
          options,
          locale,
        );
        break;
      case "outcomes":
        sheet = outcomesSheet(
          await getPlanVsActual(user.id, period, filters),
          filters,
          options,
          locale,
        );
        break;
      case "outcomeBranches":
      case "outcomeManagers":
        sheet = tallySheet(
          await getPlanVsActual(user.id, period, filters),
          block,
          filters,
          options,
          locale,
        );
        break;
      case "orders":
        sheet = outcomeOrdersSheet(
          await getOutcomeOrders(user.id, period, filters, key, otherOwners, "all"),
          filters,
          options,
          locale,
        );
        break;
      case "priceTrend":
      case "priceRises":
      case "priceSpread": {
        const prices = await getPrices(user.id, period, filters, variant);
        sheet =
          block === "priceTrend"
            ? priceTrendSheet(prices, filters, options, locale)
            : block === "priceRises"
              ? priceRisesSheet(prices, filters, options, locale)
              : priceSpreadSheet(prices, filters, options, locale);
        break;
      }
      case "stepHours":
      case "waiting":
      case "decisions":
      case "reasons":
        sheet = approvalSpeedSheet(
          await getApprovalSpeed(user.id, period, filters),
          block,
          filters,
          options,
          locale,
        );
        break;
      case "approvals":
        sheet = approvalOrdersSheet(
          await getApprovalOrders(user.id, period, filters, key, reason, "all"),
          filters,
          options,
          locale,
        );
        break;
      case "managers":
        sheet = managersSheet(
          await getManagers(user.id, period, filters),
          filters,
          options,
          locale,
        );
        break;
      case "cancelled":
        sheet = cancelledSheet(
          await getCancelledRecords(user.id, period, filters, otherOwners, "all"),
          otherOwners,
          filters,
          options,
          locale,
        );
        break;
      case "cash":
        sheet = cashSheet(
          await getCashOrders(user.id, filters, otherOwners, "all"),
          otherOwners,
          filters,
          options,
          locale,
        );
        break;
      case "warehouse":
      case "departmentUse": {
        const warehouse = await getWarehouse(user.id, period, filters);
        sheet =
          block === "warehouse"
            ? warehouseSheet(warehouse, filters, options, locale)
            : departmentUseSheet(warehouse, filters, options, locale);
        break;
      }
      case "stock":
        // The lines of one number of now (plan of 6.4d, decided item 9).
        if (key.kind !== "stock") return notFound();
        sheet = stockSheet(
          await getStockLines(user.id, key.view, filters, "all"),
          filters,
          options,
          locale,
        );
        break;
      case "moves":
        if (key.kind !== "moves") return notFound();
        sheet = movesSheet(
          await getStockMoves(user.id, key.move, period, filters, "all"),
          filters,
          options,
          locale,
        );
        break;
      case "products":
        sheet = productsSheet(
          await getTopProducts(user.id, period, filters),
          filters,
          options,
          locale,
        );
        break;
      case "orderStatuses":
        sheet = orderStatusesSheet(
          await getOrderStatuses(user.id, period, filters),
          filters,
          options,
          locale,
        );
        break;
      case "statusOrders":
        // The orders of one Orders number (plan of 6.5a, decided item 6); the query refuses
        // another key.
        sheet = statusOrdersSheet(
          await getStatusOrders(user.id, period, filters, key, "all"),
          filters,
          options,
          locale,
        );
        break;
      case "myApprovals":
        sheet = myApprovalsSheet(
          await getMyApprovals(user.id, period, filters),
          filters,
          options,
          locale,
        );
        break;
      // The Manager's blocks read the user's own orders, whatever Manager the address names
      // (plan of 6.5b, decided item 7): the heading names none.
      case "myOrders":
      case "myReasons": {
        const mine = await getMyOrders(user.id, period, filters);
        const shown = { ...filters, manager: null };
        sheet =
          block === "myOrders"
            ? myOrdersSheet(mine, shown, options, locale)
            : myReasonsSheet(mine, shown, options, locale);
        break;
      }
      case "myEstimates":
        sheet = myEstimatesSheet(
          await getMyEstimates(user.id, period, filters),
          { ...filters, manager: null },
          options,
          locale,
        );
        break;
      case "myCash":
        sheet = myCashSheet(
          await getMyCash(user.id, filters),
          { ...filters, manager: null },
          options,
          locale,
        );
        break;
    }
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof PeriodRefusedError) {
      return notFound();
    }
    throw error;
  }
  const bytes = await writeAnalyticsExcel(sheet);
  return new Response(bytes, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="analytics-${block}-${businessDate(now())}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
