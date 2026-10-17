import { type SQL, sql } from "drizzle-orm";

import { orderEvents, orders } from "@/server/db/schema";

// Two facts of the state machine's OrderState, read as the action wrapper reads them
// (src/server/order-action.ts), for the queries that ask allowedActions() before any write: the
// ticked orders of the list (2.8) and the order page (2.9). Kept once, so the two never differ;
// order-facts.db.test.ts reads both sides on the same orders and holds them together (2.11b).
// With them, one fact of an order event that the stepper and the download read.

/**
 * The order's creator is a Head now (decisions 2.4 item 8) and the order has no number yet: only
 * its first Submit skips the Head step (decisions 2.11 item 8). As `created_by_head` of lockOrders().
 */
export const createdByHeadSql: SQL<boolean> = sql<boolean>`(select c.role = 'HEAD' and ${orders.number} is null from users c where c.id = ${orders.createdBy})`;

/** The owner is the Head, or a Manager whose CLOSE_ALONE is not switched off (decisions 2.3 item 6). */
export const ownerClosesAloneSql: SQL<boolean> = sql<boolean>`(select w.role = 'HEAD' or (w.role = 'MANAGER' and not exists (
        select 1 from manager_rights mr
        where mr.user_id = w.id and mr."right" = 'CLOSE_ALONE' and not mr.enabled
      )) from users w where w.id = ${orders.ownerId})`;

/**
 * The Submit of a Head-created order also finished the Head step (03 rule 6), as orderSteps() of
 * src/domain/order-steps.ts reads an event: the order page (2.9) and the download (2.14) read it
 * through this one fragment (spec review of the plan of 2.14, Should fix 3).
 */
export const headStepAutoSql: SQL<boolean> = sql<boolean>`coalesce((${orderEvents.payload} ->> 'headStepAuto')::boolean, false)`;
