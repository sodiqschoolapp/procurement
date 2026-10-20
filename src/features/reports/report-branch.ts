import { currentBranchChoice } from "@/features/catalog/queries/my-branches";

import type { ReportParams } from "./report-params";

// "The branch filter starts at the branch picked in the branch switcher on top" (10-notifications-
// analytics-reports.md, Reports; D55 item 11; plan of 8.2b): an address without `branch=` takes
// the top bar's choice from the branch cookie, as the Analytics page does (6.3 decided item 10).
// The cookie's branch counts only while the user has it now; otherwise "All my branches". Shared
// by the page and the download route, so a file holds what the page shows. Nothing here is a
// permission: every query asks for the branch again with its wall in the SQL.

export async function withSwitcherBranch(
  userId: string,
  params: ReportParams,
  branchCookie: string | undefined,
): Promise<ReportParams> {
  if (params.branchGiven) return params;
  return {
    ...params,
    filters: { ...params.filters, branch: await currentBranchChoice(userId, branchCookie) },
    branchGiven: true,
  };
}
