import { type SQL, sql } from "drizzle-orm";

import { type Change, changeAgainst } from "@/domain/analytics";
import type { Executor } from "@/server/authorize";

import { TOP_REASONS } from "./period-params";

// The most common reasons of send backs and of rejections in two sets of `analytics_steps`
// (10-notifications-analytics-reports.md, Analytics page per role: the Head's Approval speed,
// "with the most common reasons", build-plan 6.4b; the Manager's My orders, "share sent back,
// with reasons", build-plan 6.5b). Per decision and `reasonKey()`, the count in the set now, the
// count before for its change and the newest spelling; the TOP_REASONS largest of each decision
// (plan of 6.4b, decided item 10, Look first). One reading for both blocks (plan of 6.5b, decided
// item 9): the caller has authorized the user and passes two stepsWhere() conditions, the walls
// in them. Not a query of its own: no export of a query file.

export type Reason = {
  key: string;
  /** The newest spelling of the reason (plan of 6.4b, decided item 10). */
  text: string;
  count: number;
  change: Change;
};

export type ReasonDecision = "SEND_BACK" | "REJECT";

export async function topReasonsIn(
  db: Executor,
  nowWhere: SQL,
  beforeWhere: SQL,
): Promise<Record<ReasonDecision, Reason[]>> {
  const reasonRows = await db.execute<{
    decision: ReasonDecision;
    key: string;
    text: string;
    count: string;
    before: string;
  }>(sql`
    with chosen as (
      select analytics_steps.decision, analytics_steps.reason_key, analytics_steps.reason,
             analytics_steps.left_at, (${nowWhere}) as within
      from analytics_steps
      where analytics_steps.decision in ('SEND_BACK', 'REJECT')
        and ((${nowWhere}) or (${beforeWhere})))
    select decision, reason_key as key,
           (array_agg(reason order by left_at desc) filter (where within))[1] as text,
           count(*) filter (where within)::text as count,
           count(*) filter (where not within)::text as before,
           max(left_at) filter (where within) as newest
    from chosen
    group by decision, reason_key
    having count(*) filter (where within) > 0
    order by count(*) filter (where within) desc, newest desc, reason_key`);
  const reasons: Record<ReasonDecision, Reason[]> = { SEND_BACK: [], REJECT: [] };
  for (const row of reasonRows.rows) {
    const list = reasons[row.decision];
    if (list.length >= TOP_REASONS) continue;
    list.push({
      key: row.key,
      text: row.text,
      count: Number(row.count),
      change: changeAgainst(BigInt(row.count), BigInt(row.before)),
    });
  }
  return reasons;
}
