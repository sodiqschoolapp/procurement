import type { NextRequest } from "next/server";

import { businessDate } from "@/domain/business-date";
import { writeAnalyticsWorkbook } from "@/features/analytics/download/excel";
import { getAnalyticsFilters } from "@/features/analytics/queries/filters";
import {
  approvalSpeedSheets,
  departmentUseSheets,
  moneyWithManagersSheets,
  planVsActualSheets,
  priceHistorySheets,
  purchaseRegisterSheets,
  spendingSheets,
  stockMovementsSheets,
  stockReportSheets,
} from "@/features/reports/download/sheets";
import { getApprovalSpeedReport } from "@/features/reports/queries/approval-speed-report";
import { getDepartmentUseReport } from "@/features/reports/queries/department-use-report";
import { getMoneyWithManagersReport } from "@/features/reports/queries/money-with-managers-report";
import { getPlanVsActualReport } from "@/features/reports/queries/plan-vs-actual-report";
import { getPriceHistoryReport } from "@/features/reports/queries/price-history-report";
import { getPurchaseRegister } from "@/features/reports/queries/purchase-register";
import { getSpendingReport } from "@/features/reports/queries/spending-report";
import { getStockMovementsReport } from "@/features/reports/queries/stock-movements-report";
import { getStockReport } from "@/features/reports/queries/stock-report";
import { parseReportParams } from "@/features/reports/report-params";
import { LOCALE_COOKIE, chooseLocale } from "@/i18n/locale";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize, authorizeList } from "@/server/authorize";
import { now, today } from "@/server/clock";

// The Excel file of a report, GET /reports/download?report=purchases|plan|spending|stock|movements
// |use|prices|cash|speed&from&to&branch&category (and `variant` for prices) (10-notifications-
// analytics-reports.md, Reports: "exports to Excel"; 03 Permission matrix "Export to Excel,
// download PDF, print"; build-plan 6.8, 6.9a and 6.9b). The Order register's file is the
// order list's own route, /orders/download/excel (plan of 6.8, decided item 11), so `orders` is
// not served here. A route that writes nothing, as the other downloads (plan of 2.14, decided item
// 12). The address is the page's, checked by the same parser; a signed-out visitor gets 401; an
// address the parser refuses and another branch's `branch=` get 404 (03 rule 1). The route asks
// `data.export`; the queries ask `data.view` again with the same walls.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const notFound = () => new Response(null, { status: 404 });

export async function GET(request: NextRequest): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return new Response(null, { status: 401 });
  const params = parseReportParams(Object.fromEntries(request.nextUrl.searchParams), today());
  if (!params || params.report === "orders") return notFound();
  const locale = chooseLocale({
    userLocale: user.locale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
  });

  let sheets;
  try {
    await authorizeList(user.id, "data.export");
    if (params.filters.branch) {
      await authorize(user.id, "data.export", { branchId: params.filters.branch });
    }
    const options = await getAnalyticsFilters(user.id);
    const context = { params, options, locale };
    switch (params.report) {
      case "purchases":
        sheets = purchaseRegisterSheets(await getPurchaseRegister(user.id, params, "all"), context);
        break;
      case "plan":
        sheets = planVsActualSheets(await getPlanVsActualReport(user.id, params, "all"), context);
        break;
      case "spending":
        sheets = spendingSheets(await getSpendingReport(user.id, params), context);
        break;
      case "stock":
        sheets = stockReportSheets(await getStockReport(user.id, params, "all"), context);
        break;
      case "movements":
        sheets = stockMovementsSheets(
          await getStockMovementsReport(user.id, params, "all"),
          context,
        );
        break;
      case "use":
        sheets = departmentUseSheets(await getDepartmentUseReport(user.id, params, "all"), context);
        break;
      case "prices":
        sheets = priceHistorySheets(await getPriceHistoryReport(user.id, params, "all"), context);
        break;
      case "cash":
        sheets = moneyWithManagersSheets(
          await getMoneyWithManagersReport(user.id, params, "all"),
          context,
        );
        break;
      case "speed":
        sheets = approvalSpeedSheets(await getApprovalSpeedReport(user.id, params, "all"), context);
        break;
    }
  } catch (error) {
    if (error instanceof AuthorizationError) return notFound();
    throw error;
  }
  const bytes = await writeAnalyticsWorkbook(sheets);
  return new Response(bytes, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="report-${params.report}-${businessDate(now())}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
