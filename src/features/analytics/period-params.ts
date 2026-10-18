import * as z from "zod";

import { isBusinessDate } from "@/domain/business-date";
import { PERIOD_CHOICES, type PeriodChoice, isMonthKey } from "@/domain/analytics";

// The address of the Analytics pages (10-notifications-analytics-reports.md, Analytics page per
// role, points 1 to 4; build-plan 6.3): the period, the filters, the number a drill-down opens,
// the page of the list and the block an export writes. Every value is checked here with Zod on the
// server (developer-rules.md rule 13; review of the plan of 6.3, correction 2), shared by the page,
// /analytics/records and the download route. A value that does not parse is refused: the page
// falls back to this month, the route answers 404. Nothing here is a permission: the queries
// authorize the branch, and refuse the school year while it is not set.

/** The filters of point 2. `branch` null is all of the user's branches. */
export type AnalyticsFilters = {
  branch: string | null;
  category: string | null;
  department: string | null;
  manager: string | null;
  supplier: string | null;
};

export const NO_ANALYTICS_FILTERS: AnalyticsFilters = {
  branch: null,
  category: null,
  department: null,
  manager: null,
  supplier: null,
};

export type PeriodInput = { choice: PeriodChoice; from: string | null; to: string | null };

/** The number behind a drill-down (point 3): the whole period, one month of it, one category. */
export type DrillKey =
  { kind: "period" } | { kind: "month"; month: string } | { kind: "category"; category: string };

/** The rows of a drill-down page (developer-rules.md rule 12: lists use server paging). */
export const RECORDS_PAGE_SIZE = 50;

/** What the download writes (point 4): a chart's table, or the drill-down list. */
export const EXPORT_BLOCKS = ["months", "categories", "records"] as const;
export type ExportBlock = (typeof EXPORT_BLOCKS)[number];

export type AnalyticsParams = {
  period: PeriodInput;
  filters: AnalyticsFilters;
  /** False when the address has no `branch`: the page starts at the branch view (decided item 9). */
  branchGiven: boolean;
  key: DrillKey;
  page: number;
  block: ExportBlock | null;
};

const id = z.uuid().transform((value) => value.toLowerCase());
const date = z.string().refine(isBusinessDate);

const KEY = /^(period|month:\d{4}-\d{2}|category:[0-9a-fA-F-]{36})$/;

const schema = z
  .object({
    period: z.enum(PERIOD_CHOICES).default("this_month"),
    from: date.optional(),
    to: date.optional(),
    branch: z.union([z.literal("all"), id]).optional(),
    category: id.optional(),
    department: id.optional(),
    manager: id.optional(),
    supplier: id.optional(),
    key: z.string().regex(KEY).default("period"),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    block: z.enum(EXPORT_BLOCKS).optional(),
  })
  .refine(
    (value) => value.period !== "custom" || (value.from && value.to && value.from <= value.to),
  )
  .refine((value) => value.period === "custom" || (!value.from && !value.to));

function keyOf(text: string): DrillKey | null {
  if (text === "period") return { kind: "period" };
  const [kind, value] = text.split(/:(.*)/s) as [string, string];
  if (kind === "month") return isMonthKey(value) ? { kind, month: value } : null;
  const category = id.safeParse(value);
  return category.success ? { kind: "category", category: category.data } : null;
}

type Raw = Record<string, string | string[] | undefined>;

/** The address read and checked; `null` when any value is refused. */
export function parseAnalyticsParams(raw: Raw): AnalyticsParams | null {
  const single: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    // A name given twice is refused, not read one way here and another in a link.
    if (Array.isArray(value) || value === undefined) return null;
    single[name] = value;
  }
  const parsed = schema.safeParse(single);
  if (!parsed.success) return null;
  const value = parsed.data;
  const key = keyOf(value.key);
  if (!key) return null;
  return {
    period: { choice: value.period, from: value.from ?? null, to: value.to ?? null },
    filters: {
      branch: value.branch === undefined || value.branch === "all" ? null : value.branch,
      category: value.category ?? null,
      department: value.department ?? null,
      manager: value.manager ?? null,
      supplier: value.supplier ?? null,
    },
    branchGiven: value.branch !== undefined,
    key,
    page: value.page,
    block: value.block ?? null,
  };
}

/** The address of a period and filters, with what else is given; read back by the parser. */
export function analyticsSearch(
  period: PeriodInput,
  filters: AnalyticsFilters,
  extra: { key?: DrillKey; page?: number; block?: ExportBlock } = {},
): string {
  const params = new URLSearchParams();
  params.set("period", period.choice);
  if (period.choice === "custom" && period.from && period.to) {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  params.set("branch", filters.branch ?? "all");
  for (const name of ["category", "department", "manager", "supplier"] as const) {
    const chosen = filters[name];
    if (chosen) params.set(name, chosen);
  }
  if (extra.key && extra.key.kind !== "period") {
    params.set(
      "key",
      extra.key.kind === "month" ? `month:${extra.key.month}` : `category:${extra.key.category}`,
    );
  }
  if (extra.page && extra.page > 1) params.set("page", String(extra.page));
  if (extra.block) params.set("block", extra.block);
  return params.toString();
}
