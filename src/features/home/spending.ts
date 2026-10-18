import { and, eq, sql } from "drizzle-orm";

import type { BusinessDate } from "@/domain/business-date";
import type { Actor } from "@/domain/permissions";
import { actualTotal } from "@/domain/purchases";
import { type Executor, branchFilter } from "@/server/authorize";
import { purchases } from "@/server/db/schema";

import { recordsWhere } from "@/features/purchasing/order-records";

// "Spending this month" of the home pages (10-notifications-analytics-reports.md, Home page per
// role: the Principal's "my branch's spending this month", the Head's "per branch" in 6.2; plan of
// 6.1, decided item 6, Look first). Spending is 08's Actual total over the purchase records that
// are not cancelled, `actualTotal()` of src/domain/purchases.ts, of the records whose trip date
// (`purchased_on`, a Tashkent business date) lies in the month. The records are those of the
// branches the actor sees (the branch wall inside the SQL), and of `branch` when one is given; the
// caller has authorized `data.view` and the branch, and reads inside its own snapshot.

export async function branchSpending(
  executor: Executor,
  actor: Actor,
  branch: string | null,
  month: { first: BusinessDate; last: BusinessDate },
): Promise<bigint> {
  const visible = and(
    branchFilter(actor, purchases.branchId),
    branch ? eq(purchases.branchId, branch) : undefined,
  );
  const records = await recordsWhere(
    executor,
    sql`t.purchased_on between ${month.first}::date and ${month.last}::date
        and p.id in (select ${purchases.id} from ${purchases} where ${visible ?? sql`true`})`,
  );
  return actualTotal(records);
}
