import type { NotificationParamsOf } from "./notifications";
import { waitingFor } from "./order-steps";
import type { RequestStatus } from "./request-status";

// The reminders of the daily job (build-plan 8.1; 06-approval-workflow.md rule 9; 10-notifications-
// analytics-reports.md, Notifications: "Orders waiting more than 24 hours | Approvers of their
// step, once a day, grouped"; "Orders waiting more than 48 hours | Head, grouped the same way";
// "Needed-by date is 2 days away and the order's buying is not finished | Owner"). Pure: the job
// of src/server/jobs/reminders.ts reads the rows, measured in SQL, and sends what this gives.
// Every run counts what waits at that moment, so a notice comes again each day while the orders
// wait (plan of 8.1, decided item 1, Look first).

/** An order at a Waiting step, and whether it has waited more than each setting (SQL). */
export type WaitingOrder = {
  status: RequestStatus;
  branchId: string;
  pastReminder: boolean;
  pastEscalation: boolean;
};

/** An active Head, Principal or Finance user, with the branches of their `user_branches` rows. */
export type Approver = {
  id: string;
  role: "HEAD" | "PRINCIPAL" | "FINANCE";
  branchIds: readonly string[];
};

export type WaitingNotice = {
  type: "REQUEST_WAITING_24H" | "REQUEST_WAITING_48H";
  to: string[];
  params: NotificationParamsOf["REQUEST_WAITING_24H"];
  link: string;
};

/** The list at the approver's own step (plan of 8.1, decided item 8). */
const STEP_LINKS = {
  HEAD: "/orders?status=PENDING_HEAD",
  PRINCIPAL: "/orders?status=PENDING_PRINCIPAL",
  FINANCE: "/orders?status=PENDING_FINANCE",
} as const;

/** The Head home's "orders stuck over 48 hours" list, the exact set counted (plan of 6.2). */
const STUCK_LINK = "/orders?stuck=1";

/**
 * One notice per approver and type, grouped by equal params and link so each group is one
 * notify() (decided item 9). REQUEST_WAITING_24H: the orders whose `waitingFor()` is the approver's
 * role (decided item 2, Look first), past `reminder_hours`, in the approver's branches (every
 * branch for the Head; 03 rule 1; decided item 6). REQUEST_WAITING_48H: to each Head, every order
 * past `escalation_hours` (decided item 3, Look first). A count of 0 sends nothing.
 */
export function waitingNotices(
  orders: readonly WaitingOrder[],
  approvers: readonly Approver[],
  hours: { reminder: number; escalation: number },
): WaitingNotice[] {
  const groups = new Map<string, WaitingNotice>();
  const add = (
    type: WaitingNotice["type"],
    userId: string,
    count: number,
    hoursInForce: number,
    link: string,
  ) => {
    if (count === 0) return;
    const key = `${type} ${count} ${link}`;
    const group = groups.get(key);
    if (group) group.to.push(userId);
    else groups.set(key, { type, to: [userId], params: { count, hours: hoursInForce }, link });
  };
  const escalated = orders.filter((order) => order.pastEscalation).length;
  for (const approver of approvers) {
    const sees = (branchId: string) =>
      approver.role === "HEAD" || approver.branchIds.includes(branchId);
    const reminded = orders.filter(
      (order) =>
        order.pastReminder && waitingFor(order.status) === approver.role && sees(order.branchId),
    ).length;
    add("REQUEST_WAITING_24H", approver.id, reminded, hours.reminder, STEP_LINKS[approver.role]);
    if (approver.role === "HEAD") {
      add("REQUEST_WAITING_48H", approver.id, escalated, hours.escalation, STUCK_LINK);
    }
  }
  return [...groups.values()];
}

/** An order whose needed-by date is near and whose buying is not finished (SQL). */
export type NearOrder = { ownerId: string; branchId: string; branchCode: string };

export type NearNotice = {
  to: string[];
  params: NotificationParamsOf["NEEDED_BY_NEAR"];
  branchId: string;
  link: string;
};

/** How many days ahead of its needed-by date an order tells its owner (10 Notifications). */
export const NEEDED_BY_NEAR_DAYS = 2;

/**
 * One notice per owner and branch, with that branch's code and its count (decided items 6 and 7,
 * Look first). It carries `branchId`, so notify() drops an owner no longer of that branch.
 */
export function nearNotices(orders: readonly NearOrder[]): NearNotice[] {
  const groups = new Map<string, NearNotice>();
  for (const order of orders) {
    const key = `${order.ownerId} ${order.branchId}`;
    const group = groups.get(key);
    if (group) group.params.count += 1;
    else {
      const query = new URLSearchParams({
        branch: order.branchId,
        owner: order.ownerId,
        due: "soon",
      });
      groups.set(key, {
        to: [order.ownerId],
        params: { count: 1, branch: order.branchCode },
        branchId: order.branchId,
        link: `/orders?${query.toString()}`,
      });
    }
  }
  return [...groups.values()];
}
