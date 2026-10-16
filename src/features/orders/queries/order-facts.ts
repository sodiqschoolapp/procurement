import { type SQL, sql } from "drizzle-orm";

import { orders } from "@/server/db/schema";

// Two facts of the state machine's OrderState, read as the action wrapper reads them
// (src/server/order-action.ts), for the queries that ask allowedActions() before any write: the
// ticked orders of the list (2.8) and the order page (2.9). Kept once, so the two never differ.

/** The order's creator is a Head now (decisions 2.4 item 8). */
export const createdByHeadSql: SQL<boolean> = sql<boolean>`(select c.role = 'HEAD' from users c where c.id = ${orders.createdBy})`;

/** The owner is the Head, or a Manager whose CLOSE_ALONE is not switched off (decisions 2.3 item 6). */
export const ownerClosesAloneSql: SQL<boolean> = sql<boolean>`(select w.role = 'HEAD' or (w.role = 'MANAGER' and not exists (
        select 1 from manager_rights mr
        where mr.user_id = w.id and mr."right" = 'CLOSE_ALONE' and not mr.enabled
      )) from users w where w.id = ${orders.ownerId})`;
