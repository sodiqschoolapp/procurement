import * as z from "zod";

import { isBusinessDate } from "@/domain/business-date";
import {
  PERIOD_CHOICES,
  type PeriodChoice,
  WAITING_GROUP_KEYS,
  type WaitingGroup,
  isMonthKey,
} from "@/domain/analytics";
import { type ApprovalStep, STAY_DECISIONS, type StayDecision } from "@/domain/approval-stays";
import { STUCK_STATUSES } from "@/domain/order-steps";
import type { Colour } from "@/domain/colours";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";

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

/**
 * The number behind a drill-down (point 3). Of Spending (/analytics/records): the whole period,
 * one month of it, one category, one payment type (plan of 6.4, decided item 9). Of Plan vs actual
 * (/analytics/orders): every ended order (`period`), one colour, the overspent, the saved. Of
 * Prices (/analytics/records): the priced records of one subtype, in one month of the period or of
 * the records with no supplier (plan of 6.4b, decided item 12). Of Approval speed
 * (/analytics/approvals): the stays decided at a step (`null`: every step), of one decision, and
 * the orders waiting now at a step in an age group (`null`: every one). A breakdown by branch,
 * department, supplier or Manager drills down with that filter set.
 */
export type DrillKey =
  | { kind: "period" }
  | { kind: "month"; month: string }
  | { kind: "category"; category: string }
  | { kind: "payment"; payment: PaymentType }
  | { kind: "colour"; colour: Colour }
  | { kind: "overspent" }
  | { kind: "saved" }
  | { kind: "price"; variant: string; month: string | null; noSupplier: boolean }
  | { kind: "step"; step: ApprovalStep | null; decision: StayDecision | null }
  | { kind: "waiting"; step: ApprovalStep | null; group: WaitingGroup | null };

export const OUTCOME_COLOURS = ["green", "amber", "red"] as const satisfies readonly Colour[];

/** The rows of a drill-down page (developer-rules.md rule 12: lists use server paging). */
export const RECORDS_PAGE_SIZE = 50;

/** The suppliers of the Head's "top 10 suppliers" (10 Analytics, Head, Spending). */
export const TOP_SUPPLIERS = 10;

/** The rows of the price rises and of the spread shown on the page; the export holds all. */
export const TOP_PRICES = 10;

/** The most common reasons of send backs and of rejections shown (plan of 6.4b, decided item 10). */
export const TOP_REASONS = 5;

/** What the download writes (point 4): a chart's table, or the drill-down list. */
export const EXPORT_BLOCKS = [
  "months",
  "categories",
  "records",
  "branches",
  "departments",
  "suppliers",
  "payments",
  "outcomes",
  "outcomeBranches",
  "outcomeManagers",
  "orders",
  "priceTrend",
  "priceRises",
  "priceSpread",
  "stepHours",
  "waiting",
  "decisions",
  "reasons",
  "approvals",
] as const;
export type ExportBlock = (typeof EXPORT_BLOCKS)[number];

export type AnalyticsParams = {
  period: PeriodInput;
  filters: AnalyticsFilters;
  /** False when the address has no `branch`: the page starts at the branch view (decided item 9). */
  branchGiven: boolean;
  key: DrillKey;
  /**
   * The orders of owners who are not Managers (an order the Head created, 03 rule 6): the by-Manager
   * row "Other owners" of Plan vs actual and its drill-down (review of the plan of 6.4, correction
   * 1). Never with a Manager filter.
   */
  otherOwners: boolean;
  /** The subtype of the price trend (plan of 6.4b, decided item 3); `null`: the most bought. */
  variant: string | null;
  /** The reason key of a reason's drill-down (decided item 10); only with a send back or reject. */
  reason: string | null;
  page: number;
  block: ExportBlock | null;
};

const id = z.uuid().transform((value) => value.toLowerCase());
const date = z.string().refine(isBusinessDate);

const KEY =
  /^(period|overspent|saved|month:\d{4}-\d{2}|category:[0-9a-fA-F-]{36}|payment:[A-Z]+|colour:[a-z]+|price:[0-9a-fA-F-]{36}(:\d{4}-\d{2}|:nosupplier)?|step:[A-Z_a-z]+(:[A-Z_]+)?|waiting:[A-Z_a-z]+:[A-Za-z]+)$/;

/** A reason key as reasonKey() writes it: at most the 500 characters of a reason (06 rule 3). */
const reason = z.string().min(1).max(500);

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
    owner: z.literal("other").optional(),
    variant: id.optional(),
    reason: reason.optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    block: z.enum(EXPORT_BLOCKS).optional(),
  })
  .refine(
    (value) => value.period !== "custom" || (value.from && value.to && value.from <= value.to),
  )
  .refine((value) => !(value.owner && value.manager))
  // A reason belongs to the list of a send back or a reject, and only there.
  .refine((value) => !value.reason || /^step:[A-Z_a-z]+:(SEND_BACK|REJECT)$/.test(value.key));

const stepOf = (text: string): ApprovalStep | null | undefined =>
  text === "all" ? null : STUCK_STATUSES.find((step) => step === text);

function keyOf(text: string): DrillKey | null {
  if (text === "period" || text === "overspent" || text === "saved") return { kind: text };
  const [kind, value] = text.split(/:(.*)/s) as [string, string];
  if (kind === "price") {
    const [variantText, rest] = value.split(/:(.*)/s) as [string, string | undefined];
    const variant = id.safeParse(variantText);
    if (!variant.success) return null;
    if (rest !== undefined && rest !== "nosupplier" && !isMonthKey(rest)) return null;
    return {
      kind,
      variant: variant.data,
      month: rest !== undefined && rest !== "nosupplier" ? rest : null,
      noSupplier: rest === "nosupplier",
    };
  }
  if (kind === "step") {
    const [stepText, decisionText] = value.split(":") as [string, string | undefined];
    const step = stepOf(stepText);
    if (step === undefined) return null;
    if (decisionText === undefined) return { kind, step, decision: null };
    const decision = STAY_DECISIONS.find((each) => each === decisionText);
    return decision ? { kind, step, decision } : null;
  }
  if (kind === "waiting") {
    const [stepText, groupText] = value.split(":") as [string, string];
    const step = stepOf(stepText);
    const group =
      groupText === "all" ? null : WAITING_GROUP_KEYS.find((each) => each === groupText);
    if (step === undefined || group === undefined) return null;
    return { kind, step, group };
  }
  if (kind === "month") return isMonthKey(value) ? { kind, month: value } : null;
  if (kind === "payment") {
    const payment = PAYMENT_TYPES.find((type) => type === value);
    return payment ? { kind, payment } : null;
  }
  if (kind === "colour") {
    const colour = OUTCOME_COLOURS.find((each) => each === value);
    return colour ? { kind, colour } : null;
  }
  const category = id.safeParse(value);
  return category.success ? { kind: "category", category: category.data } : null;
}

type Raw = Record<string, string | string[] | undefined>;

/** The address read and checked; `null` when any value is refused. */
export function parseAnalyticsParams(raw: Raw): AnalyticsParams | null {
  const single: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    // A name given twice is refused, not read one way here and another in a link.
    if (Array.isArray(value)) return null;
    // An empty field of the filter form is no filter.
    if (value === undefined || value.trim() === "") continue;
    single[name] = value.trim();
  }
  const parsed = schema.safeParse(single);
  if (!parsed.success) return null;
  const value = parsed.data;
  const key = keyOf(value.key);
  if (!key) return null;
  return {
    // Dates left in the form beside another choice are not part of that period.
    period:
      value.period === "custom"
        ? { choice: value.period, from: value.from ?? null, to: value.to ?? null }
        : { choice: value.period, from: null, to: null },
    filters: {
      branch: value.branch === undefined || value.branch === "all" ? null : value.branch,
      category: value.category ?? null,
      department: value.department ?? null,
      manager: value.manager ?? null,
      supplier: value.supplier ?? null,
    },
    branchGiven: value.branch !== undefined,
    key,
    otherOwners: value.owner === "other",
    variant: value.variant ?? null,
    reason: value.reason ?? null,
    page: value.page,
    block: value.block ?? null,
  };
}

/** The address of a period and filters, with what else is given; read back by the parser. */
export function analyticsSearch(
  period: PeriodInput,
  filters: AnalyticsFilters,
  extra: {
    key?: DrillKey;
    otherOwners?: boolean;
    variant?: string | null;
    reason?: string | null;
    page?: number;
    block?: ExportBlock;
  } = {},
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
  if (extra.key && extra.key.kind !== "period") params.set("key", keyText(extra.key));
  if (extra.otherOwners) params.set("owner", "other");
  if (extra.variant) params.set("variant", extra.variant);
  if (extra.reason) params.set("reason", extra.reason);
  if (extra.page && extra.page > 1) params.set("page", String(extra.page));
  if (extra.block) params.set("block", extra.block);
  return params.toString();
}

function keyText(key: DrillKey): string {
  switch (key.kind) {
    case "period":
    case "overspent":
    case "saved":
      return key.kind;
    case "month":
      return `month:${key.month}`;
    case "category":
      return `category:${key.category}`;
    case "payment":
      return `payment:${key.payment}`;
    case "colour":
      return `colour:${key.colour}`;
    case "price":
      return `price:${key.variant}${key.month ? `:${key.month}` : key.noSupplier ? ":nosupplier" : ""}`;
    case "step":
      return `step:${key.step ?? "all"}${key.decision ? `:${key.decision}` : ""}`;
    case "waiting":
      return `waiting:${key.step ?? "all"}:${key.group ?? "all"}`;
  }
}
