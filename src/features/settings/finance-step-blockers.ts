import { type SQL, and, eq, inArray, isNull } from "drizzle-orm";

import { orders } from "@/server/db/schema";

// The orders that refuse switching the Finance step (06-approval-workflow.md, Finance step switched
// off): switching off, those Waiting for Finance or Waiting for settlement (rule 5); switching on,
// those without a planned price Waiting for Head or Waiting for Principal (rule 8; plan of 2.5d-b,
// decided item 7, Look first). One condition for the switch and for the list on /settings, so
// the Head sees exactly the orders the switch names. Every branch: the setting is school-wide.

export function financeStepBlockers(switchingOn: boolean): SQL {
  return switchingOn
    ? and(
        inArray(orders.status, ["PENDING_HEAD", "PENDING_PRINCIPAL"]),
        isNull(orders.plannedPrice),
      )!
    : inArray(orders.status, ["PENDING_FINANCE", "SETTLEMENT"]);
}

/**
 * The orders that refuse switching the Principal step off: those Waiting for Principal, of every
 * branch (06-approval-workflow.md, Principal step switched off 4; plan of 4.10d, decided item 13).
 * Switching it on is never refused (rule 5). One condition for the switch and the list on
 * /settings.
 */
export function principalStepBlockers(): SQL {
  return eq(orders.status, "PENDING_PRINCIPAL");
}
