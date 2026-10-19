import * as z from "zod";

import type { DateRange } from "@/domain/analytics";
import { type BusinessDate, businessMonth, isBusinessDate } from "@/domain/business-date";
import { type ListFilters, NO_FILTERS } from "@/features/orders/list-filters";

import { type AnalyticsFilters, NO_ANALYTICS_FILTERS } from "../analytics/period-params";

// The address of /reports (10-notifications-analytics-reports.md, Reports: "Every report filters
// by branch, date range and category"; build-plan 6.8): the report, the dates, the two filters and
// the page. Checked here with Zod on the server (developer-rules.md rule 13), shared by the page
// and the download route. A broken value is dropped, never an error, so a link always opens a
// report (plan of 6.8, decided item 5); an unknown report, a name given twice and `from` after
// `to` are refused: the page falls back to the defaults, the route answers 404. Nothing here is a
// permission: the queries authorize the branch.

export const REPORTS = [
  "orders",
  "purchases",
  "plan",
  "spending",
  "stock",
  "movements",
  "use",
  "prices",
  "cash",
  "speed",
] as const;
export type Report = (typeof REPORTS)[number];

/** The rows of a report page (11-screens-and-ux.md rule 8: "25 rows per page"; decided item 12). */
export const REPORT_PAGE_SIZE = 25;

export type ReportParams = {
  report: Report;
  /** The dates, inclusive, in Tashkent; this month to today unless given (decided item 5). */
  range: DateRange;
  /** Only the branch and the category of 10 Reports (decided item 6); the rest stay null. */
  filters: AnalyticsFilters;
  /** Price history's subtype (`variant=`, plan of 6.9b, decided item 6); null: the most bought. */
  variant: string | null;
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;

const id = z.uuid().transform((value) => value.toLowerCase());
const date = z.string().refine((value) => isBusinessDate(value));
const page = z.coerce.number().int().min(1).max(100_000);

/** The address read and checked; `null` when it is refused. `today` is the clock's Tashkent date. */
export function parseReportParams(raw: Raw, today: BusinessDate): ReportParams | null {
  const single: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    // A name given twice is refused, not read one way here and another in a link.
    if (Array.isArray(value)) return null;
    // An empty field of the filter form is no filter.
    if (value === undefined || value.trim() === "") continue;
    single[name] = value.trim();
  }
  const report = single.report === undefined ? "orders" : REPORTS.find((r) => r === single.report);
  if (!report) return null;
  const valid = <T>(schema: z.ZodType<T>, value: string | undefined): T | null => {
    if (value === undefined) return null;
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };
  const first = valid(date, single.from) ?? businessMonth(today).first;
  const last = valid(date, single.to) ?? today;
  if (first > last) return null;
  return {
    report,
    range: { first, last },
    filters: {
      ...NO_ANALYTICS_FILTERS,
      branch: single.branch === "all" ? null : valid(id, single.branch),
      category: valid(id, single.category),
    },
    variant: valid(id, single.variant),
    page: valid(page, single.page) ?? 1,
  };
}

/** The address of a report, read back by the parser; `page` 1 is left out. */
export function reportSearch(
  params: Omit<ReportParams, "page" | "variant"> & { page?: number; variant?: string | null },
): string {
  const search = new URLSearchParams();
  search.set("report", params.report);
  search.set("from", params.range.first);
  search.set("to", params.range.last);
  if (params.filters.branch) search.set("branch", params.filters.branch);
  if (params.filters.category) search.set("category", params.filters.category);
  // The subtype is Price history's alone: another tab's address does not carry it.
  if (params.report === "prices" && params.variant) search.set("variant", params.variant);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  return search.toString();
}

/**
 * The Order register as the order list's filters: the orders submitted in the dates, of the
 * branch and the category (10 Reports, row 1: "the order list download, section 5"; decided items
 * 4 and 7). Every other filter stays at the list's default.
 */
export function orderListFilters(params: Pick<ReportParams, "range" | "filters">): ListFilters {
  return {
    ...NO_FILTERS,
    dates: "submitted",
    from: params.range.first,
    to: params.range.last,
    branch: params.filters.branch,
    category: params.filters.category,
  };
}

/** The order list's address of those filters, read back by `parseListFilters()`. */
export function orderListSearch(params: Pick<ReportParams, "range" | "filters">): string {
  const search = new URLSearchParams();
  search.set("dates", "submitted");
  search.set("from", params.range.first);
  search.set("to", params.range.last);
  if (params.filters.branch) search.set("branch", params.filters.branch);
  if (params.filters.category) search.set("category", params.filters.category);
  return search.toString();
}
