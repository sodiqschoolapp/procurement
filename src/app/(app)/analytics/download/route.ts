import type { NextRequest } from "next/server";

import { businessDate } from "@/domain/business-date";
import { writeAnalyticsExcel } from "@/features/analytics/download/excel";
import {
  approvalOrdersSheet,
  approvalSpeedSheet,
  cancelledSheet,
  cashSheet,
  headSpendingSheet,
  managersSheet,
  outcomeOrdersSheet,
  outcomesSheet,
  priceRisesSheet,
  priceSpreadSheet,
  priceTrendSheet,
  recordsSheet,
  spendingSheet,
  tallySheet,
} from "@/features/analytics/download/sheets";
import { parseAnalyticsParams } from "@/features/analytics/period-params";
import { getApprovalOrders } from "@/features/analytics/queries/approval-orders";
import { getApprovalSpeed } from "@/features/analytics/queries/approval-speed";
import { getCancelledRecords } from "@/features/analytics/queries/cancelled-records";
import { getCashOrders } from "@/features/analytics/queries/cash-orders";
import { getAnalyticsFilters } from "@/features/analytics/queries/filters";
import { getHeadSpending } from "@/features/analytics/queries/head-spending";
import { getManagers } from "@/features/analytics/queries/managers";
import { getOutcomeOrders } from "@/features/analytics/queries/outcome-orders";
import { getPlanVsActual } from "@/features/analytics/queries/plan-vs-actual";
import { getPrices } from "@/features/analytics/queries/prices";
import { getSpending } from "@/features/analytics/queries/spending";
import { getSpendingRecords } from "@/features/analytics/queries/spending-records";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { LOCALE_COOKIE, chooseLocale } from "@/i18n/locale";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize, authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";

// The Excel file of one Analytics table, GET /analytics/download?…&block=… (6.3: months,
// categories, records; 6.4a: branches, departments, suppliers, payments, outcomes,
// outcomeBranches, outcomeManagers, orders; 6.4b: priceTrend, priceRises, priceSpread, stepHours,
// waiting, decisions, reasons, approvals; 6.4c: managers, cancelled, cash)
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
