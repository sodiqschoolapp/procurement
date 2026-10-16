import { and, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import * as z from "zod";

import { authorizeList, branchFilter } from "@/server/authorize";
import { orders } from "@/server/db/schema";

// The numbers of orders just submitted, for the Submit message of the drafts grid (05 Order
// number; plan of 2.7, Server actions: the numbers are read after the action, a repeat's too;
// review of the plan, Should fix 3). Under `data.view` with the branch inside the SQL
// (developer-rules.md rule 4), and the draft wall inside the SQL too: a taken-back DRAFT keeps its
// number (06 Allowed moves, Take back), and a DRAFT is visible to its owner and the Head only
// (06 Statuses; permission review of 2.7, Must fix 1). A number never changes
// (`orders_number_fixed`), so a repeat reads the numbers of the first call.

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
      and(
        inArray(orders.id, ids),
        isNotNull(orders.number),
        branchFilter(actor, orders.branchId),
        actor.role === "HEAD"
          ? undefined
          : or(ne(orders.status, "DRAFT"), eq(orders.ownerId, actor.userId)),
      ),
    );
  return new Map(rows.flatMap((row) => (row.number ? [[row.id, row.number] as const] : [])));
}
