import { and, eq, inArray } from "drizzle-orm";

import { type OrderActionParams, orderActionNotices } from "@/domain/notifications";
import { now } from "@/server/clock";
import { branches, userBranches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import type { Transaction } from "@/server/order-action";

// What the notices of an action on ticked orders share (10-notifications-analytics-reports.md,
// Notifications: "One action sends one notification to each person told, never one per order";
// .claude/rules/server-actions.md: one notification per branch). Used by Submit (2.7), Approve
// (2.10), Send back, Reject and Submit again (2.11).

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

/** The users told when orders reach the owner again: their owners and every active Head. */
export async function ownersAndHeads(
  tx: Transaction,
  ownerIds: readonly string[],
): Promise<string[]> {
  const heads = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
  // One row each: an owner who is a Head is told once (review of the plan of 2.11, Should fix 3).
  return [...new Set([...ownerIds, ...heads.map((head) => head.id)])];
}

/** The active Finance users of a branch (10 Notifications: "Finance users of the branch"). */
export async function financeOf(tx: Transaction, branchId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: userBranches.userId })
    .from(userBranches)
    .where(
      and(
        eq(userBranches.branchId, branchId),
        eq(userBranches.userRole, "FINANCE"),
        eq(userBranches.userIsActive, true),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * One notification per branch of the moved orders (10 Notifications: "One action sends one
 * notification to each person told"), to the users `to` names for that branch's orders; never
 * the actor (notify()). Used by Send back, Reject and Submit again (plan of 2.11, decided item 5,
 * Look first), Send to settlement and Close (4.4), Send back for correction (4.5), the two notices
 * of the overspend guard (4.7).
 */
export async function noticePerBranch(
  context: {
    tx: Transaction;
    userId: string;
    orders: readonly { branchId: string; ownerId: string }[];
  },
  actionId: string,
  type:
    | "REQUEST_SUBMITTED"
    | "REQUEST_SENT_BACK"
    | "REQUEST_SENT_BACK_FOR_CORRECTION"
    | "REQUEST_REJECTED"
    | "REQUEST_SENT_TO_SETTLEMENT"
    | "REQUEST_CLOSED"
    | "OVERSPEND_ABOVE_GUARD"
    | "OVERSPEND_ACKNOWLEDGED",
  to: (ownerIds: readonly string[], branchId: string) => Promise<string[]>,
): Promise<void> {
  const { tx, userId } = context;
  const at = now();
  for (const { branchId, params } of await branchNotices(tx, userId, context.orders)) {
    const owners = context.orders
      .filter((order) => order.branchId === branchId)
      .map((order) => order.ownerId);
    await notify(
      { tx, userId },
      {
        to: await to(owners, branchId),
        type,
        params,
        branchId,
        link: actionLink(branchId, actionId),
        at,
      },
    );
  }
}
