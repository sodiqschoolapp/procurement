import { and, inArray, isNotNull } from "drizzle-orm";
import * as z from "zod";

import { authorizeList, branchFilter } from "@/server/authorize";
import { orders } from "@/server/db/schema";

// The numbers of orders just submitted, for the Submit message of the drafts grid (05 Order
// number; plan of 2.7, Server actions: the numbers are read after the action, a repeat's too;
// review of the plan, Should fix 3). Under `data.view` with the branch inside the SQL
// (developer-rules.md rule 4); a draft has no number, so nothing behind the draft wall is read.
// A number never changes (`orders_number_fixed`), so a repeat reads the numbers of the first call.

const idsInput = z.array(z.uuid()).max(200);

/** The number of each given order the user may see that has one, by id. */
export async function submittedNumbers(
  userId: string,
  orderIds: readonly string[],
): Promise<Map<string, string>> {
  const actor = await authorizeList(userId, "data.view");
  const ids = idsInput.parse(orderIds);
  if (ids.length === 0) return new Map();
  const { db } = await import("@/server/db/client");
  const rows = await db
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(
      and(inArray(orders.id, ids), isNotNull(orders.number), branchFilter(actor, orders.branchId)),
    );
  return new Map(rows.flatMap((row) => (row.number ? [[row.id, row.number] as const] : [])));
}
