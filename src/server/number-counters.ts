import { sql } from "drizzle-orm";

import type { Executor } from "./authorize";
import { numberCounters } from "./db/schema";

// The one writer of `number_counters` (14-data-model.md: "scope [ORD|ISS|RET|TRF|WOF|CNT|ENT],
// branch_id, year, last_value"; 05-order-request-form.md, Order number 2 and 5; plan of 5.1,
// decided item 10). One upsert takes `count` values of one scope, branch and year: its row lock,
// or the primary key for the year's first value, puts two writers at the same moment one after
// the other until the first commits, so no value is given twice and none is reused. A caller
// taking numbers in several branches takes them in the order of the branch ids, so two such
// actions cannot deadlock (decisions 2.4 item 10).

export type NumberScope = (typeof numberCounters.$inferInsert)["scope"];

/** Takes `count` values and returns the first; the others follow it by one. */
export async function takeNumbers(
  tx: Executor,
  counter: { scope: NumberScope; branchId: string; year: number },
  count: number,
  at: Date,
): Promise<number> {
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError(`Take ${count} numbers`);
  const [taken] = await tx
    .insert(numberCounters)
    .values({ ...counter, lastValue: count, createdAt: at })
    .onConflictDoUpdate({
      target: [numberCounters.scope, numberCounters.branchId, numberCounters.year],
      set: { lastValue: sql`${numberCounters.lastValue} + ${count}` },
    })
    .returning({ lastValue: numberCounters.lastValue });
  return taken!.lastValue - count + 1;
}
