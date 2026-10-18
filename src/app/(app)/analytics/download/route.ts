import type { NextRequest } from "next/server";

import { businessDate } from "@/domain/business-date";
import { writeAnalyticsExcel } from "@/features/analytics/download/excel";
import { recordsSheet, spendingSheet } from "@/features/analytics/download/sheets";
import { parseAnalyticsParams } from "@/features/analytics/period-params";
import { getAnalyticsFilters } from "@/features/analytics/queries/filters";
import { getSpending } from "@/features/analytics/queries/spending";
import { getSpendingRecords } from "@/features/analytics/queries/spending-records";
import { PeriodRefusedError } from "@/features/analytics/resolve-period";
import { LOCALE_COOKIE, chooseLocale } from "@/i18n/locale";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize, authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";

// The Excel file of one Analytics table, GET /analytics/download?…&block=months|categories|records
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
  const { period, filters, key, block } = params;
  const locale = chooseLocale({
    userLocale: user.locale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
  });

  let sheet;
  try {
    await authorizeList(user.id, "data.export");
    if (filters.branch) await authorize(user.id, "data.export", { branchId: filters.branch });
    const options = await getAnalyticsFilters(user.id);
    sheet =
      block === "records"
        ? recordsSheet(
            await getSpendingRecords(user.id, period, filters, key, "all"),
            filters,
            options,
            locale,
          )
        : spendingSheet(
            await getSpending(user.id, period, filters),
            block,
            filters,
            options,
            locale,
          );
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
