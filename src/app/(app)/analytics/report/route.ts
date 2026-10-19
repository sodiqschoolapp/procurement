import type { NextRequest } from "next/server";

import { businessDate } from "@/domain/business-date";
import { BRANCH_COOKIE } from "@/features/catalog/branch-cookie";
import { analyticsReport } from "@/features/analytics/download/page-report";
import { writeAnalyticsPdf } from "@/features/analytics/download/pdf";
import { readAnalyticsPage } from "@/features/analytics/page-data";
import { parseAnalyticsParams } from "@/features/analytics/period-params";
import { getSchoolName } from "@/features/settings/queries/settings";
import { LOCALE_COOKIE, chooseLocale } from "@/i18n/locale";
import { userOfCookies } from "@/server/auth/session";
import { AuthorizationError, authorize, authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";

// The whole Analytics page as a PDF report, GET /analytics/report?<the page's address>
// (10-notifications-analytics-reports.md, Analytics page per role, point 4: "The whole page
// downloads as a PDF report, without signature lines"; 03 Permission matrix "Export to Excel,
// download PDF, print"; build-plan 6.7). A route that writes nothing, as `/analytics/download`.
// The file is the user's own page: the same queries with the same parsed address (page-data.ts),
// the branch view of the top bar when the address names no branch (plan of 6.7, decided item 6).
// A signed-out visitor gets 401; an address the parser refuses, a school year not set and another
// branch's `branch=` get 404 (03 rule 1). The route asks `data.export`; the queries ask
// `data.view` again with their walls in the SQL.

const notFound = () => new Response(null, { status: 404 });

export async function GET(request: NextRequest): Promise<Response> {
  const user = await userOfCookies(request.cookies);
  if (!user) return new Response(null, { status: 401 });
  const raw = Object.fromEntries(request.nextUrl.searchParams);
  const params = parseAnalyticsParams(raw);
  if (!params) return notFound();
  const locale = chooseLocale({
    userLocale: user.locale,
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
  });

  let page;
  let schoolName;
  try {
    await authorizeList(user.id, "data.export");
    if (params.filters.branch) {
      await authorize(user.id, "data.export", { branchId: params.filters.branch });
    }
    page = await readAnalyticsPage(
      user.id,
      user.role,
      raw,
      request.cookies.get(BRANCH_COOKIE)?.value,
    );
    schoolName = await getSchoolName(user.id);
  } catch (error) {
    if (error instanceof AuthorizationError) return notFound();
    throw error;
  }
  if (page === "refused" || page === "not_found") return notFound();

  const at = now();
  const bytes = await writeAnalyticsPdf(
    analyticsReport(page, locale, { name: user.fullName, schoolName }, at),
  );
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="analytics-${businessDate(at)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
