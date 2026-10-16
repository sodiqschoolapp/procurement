import { eq, inArray } from "drizzle-orm";

import { type OrderActionParams, orderActionNotices } from "@/domain/notifications";
import { branches, users } from "@/server/db/schema";
import type { Transaction } from "@/server/order-action";

// What the notices of an action on ticked orders share (10-notifications-analytics-reports.md,
// Notifications: "One action sends one notification to each person told, never one per order";
// .claude/rules/server-actions.md: one notification per branch). Used by Submit (2.7) and
// Approve (2.10).

/** The link of an action's notification: the order list filtered to this action (2.7 item 7). */
export function actionLink(branchId: string, actionId: string): string {
  return `/orders?${new URLSearchParams({ branch: branchId, action: actionId }).toString()}`;
}

/**
 * The params of each branch's notice of an action: the actor's name, and per branch its code and
 * the count of the given orders in it (orderActionNotices() of src/domain/notifications.ts).
 */
export async function branchNotices(
  tx: Transaction,
  actorId: string,
  orders: readonly { branchId: string }[],
): Promise<{ branchId: string; params: OrderActionParams }[]> {
  if (orders.length === 0) return [];
  const [actor] = await tx
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, actorId));
  const codes = await tx
    .select({ id: branches.id, code: branches.code })
    .from(branches)
    .where(inArray(branches.id, [...new Set(orders.map((order) => order.branchId))]));
  const codeOf = new Map(codes.map((row) => [row.id, row.code]));
  return orderActionNotices(
    actor!.name,
    orders.map(({ branchId }) => ({ branchId, branchCode: codeOf.get(branchId)! })),
  );
}
