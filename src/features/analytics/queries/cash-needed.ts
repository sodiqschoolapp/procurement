import { sql } from "drizzle-orm";

import { APPROVAL_STATUSES } from "@/domain/money-ledger";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../authorize-filters";
import { neededWhere } from "../needed-where";
import type { AnalyticsFilters, ApprovalStatus, NeededStage } from "../period-params";

// Finance's Cash needed soon (10-notifications-analytics-reports.md, Analytics page per role,
// Finance: "Planned cash of approved orders not yet paid, plus orders still in approval"; build-
// plan 6.6a; plan of 6.6a, decided items 4 and 5, Look first): the Open orders still buying whose
// planned cash is not yet all handed to their Manager, the orders waiting at Head, Principal or
// Finance with each step's part, and the two together ("plus"), each the Σ of `cash_needed` of
// `analytics_orders` under neededWhere(), the very rows its list shows. Numbers of now: no period,
// no change (decided item 6, Look first). Under `data.view`, the branch wall in the SQL, in one
// snapshot. Sums are read as text into bigint (CLAUDE.md rule 6). Each number says how many orders
// of it have no planned price, under neededWhere()'s unpriced side (plan of 2.5d-c).

/**
 * `unpriced`: the orders of the same stage or step without a planned price, which the amount
 * leaves out (08 Numbers; plan of 2.5d-c, decided items 3 and 4, Look first).
 */
export type NeededAmount = { amount: bigint; count: number; unpriced: number };

export type CashNeeded = Record<NeededStage, NeededAmount> & {
  steps: ({ step: ApprovalStatus } & NeededAmount)[];
};

/** Throws AuthorizationError for another branch's filter. */
export async function getCashNeeded(
  userId: string,
  filters: AnalyticsFilters,
): Promise<CashNeeded> {
  return readSnapshot((db) => neededIn(db, userId, filters));
}

async function neededIn(
  db: Executor,
  userId: string,
  filters: AnalyticsFilters,
): Promise<CashNeeded> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const sumOf = (stage: NeededStage, step: ApprovalStatus | null, name: string) => sql`
    coalesce(sum(cash_needed) filter (where ${neededWhere(actor, filters, stage, step)}), 0)::text
      as ${sql.identifier(`${name}_amount`)},
    count(*) filter (where ${neededWhere(actor, filters, stage, step)})::int
      as ${sql.identifier(`${name}_count`)},
    count(*) filter (where ${neededWhere(actor, filters, stage, step, true)})::int
      as ${sql.identifier(`${name}_unpriced`)}`;
  const found = await db.execute<Record<string, string | number>>(sql`
    select ${sumOf("all", null, "all")}, ${sumOf("open", null, "open")},
           ${sumOf("approval", null, "approval")},
           ${sql.join(
             APPROVAL_STATUSES.map((step) => sumOf("approval", step, step)),
             sql`, `,
           )}
    from analytics_orders
    where (${neededWhere(actor, filters, "all")}) or (${neededWhere(actor, filters, "all", null, true)})`);
  const row = found.rows[0]!;
  const of = (name: string): NeededAmount => ({
    amount: BigInt(row[`${name}_amount`]!),
    count: Number(row[`${name}_count`]),
    unpriced: Number(row[`${name}_unpriced`]),
  });
  return {
    all: of("all"),
    open: of("open"),
    approval: of("approval"),
    steps: APPROVAL_STATUSES.map((step) => ({ step, ...of(step) })),
  };
}
