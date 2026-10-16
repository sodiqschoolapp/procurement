import { and, eq, inArray } from "drizzle-orm";

import { businessDate } from "@/domain/business-date";
import { orderActionNotices } from "@/domain/notifications";
import { now } from "@/server/clock";
import { branches, userBranches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import {
  type OrdersContext,
  type OrdersInput,
  OrdersRefusal,
  ordersInput,
} from "@/server/order-action";
import { orderMoveAction } from "@/server/order-moves";

import { actionLink } from "./notices";
import {
  failuresOf,
  ids,
  numbersOf,
  readSubmitRows,
  writePlan,
  writeSnapshots,
} from "./submit-steps";

// Submit of ticked drafts, new or taken back (05-order-request-form.md, Drafts 4 and 5; Order
// number; Checks at submit; 06-approval-workflow.md, Allowed moves: the Draft row; rule 8;
// 03-roles-and-permissions.md rule 6; plan of 2.7; plan of 2.11, decided item 1). The state machine's Submit move on the wrapper of src/server/order-action.ts:
// its lock, repeat, authorize, version and status check run first. Then, in `beforeMove`, while
// every order is still DRAFT (the CHECKs and `orders_guard` of migration 0019; review of the
// plan, correction 5):
//
//   checks    every fact read under its lock (catalog rows FOR SHARE, as the draft actions do),
//             submitRefusals() of src/domain/submit-checks.ts per order; any failure refuses the
//             whole submit with `not_ready` and each order's cells, before anything is written
//   numbers   per branch in branch-id order, one upsert of its `number_counters` row (the lock of
//             05 Order number 5), the orders numbered in the order they were created; a
//             taken-back draft keeps its number
//   plan      number, submitted_at, planned_total = orderTotal(), stock_at_submit, one statement
//
// In `afterMove`, one order_revisions row per order (append-only, rule 7). The steps are those of
// ./submit-steps.ts, shared with Submit again.
//
// The wrapper then writes the status (Waiting for Principal when the Head created the order,
// logged "Created by Head"), the events and the action row; `notify` tells the Heads, and the
// Principal of the orders that skipped the Head step.

type Input = OrdersInput;

/**
 * The checks, the numbers and the plan facts, while every order is DRAFT (the CHECKs and
 * `orders_guard` of migration 0019). A taken-back draft keeps its number and its revision (plan of
 * 2.11, decided item 1, Look first).
 */
async function beforeSubmit(context: OrdersContext<Input>): Promise<void> {
  const { tx } = context;
  const at = now();
  const rows = await readSubmitRows(
    tx,
    context.orders.map((order) => order.id),
  );

  const failed = failuresOf(context.input.orders, rows, businessDate(at));
  if (failed.length > 0) throw new OrdersRefusal("not_ready", failed);

  const numbers = await numbersOf(
    tx,
    rows.filter((row) => row.number === null),
    at,
  );
  await writePlan(tx, rows, numbers, at);
}

export const submitDrafts = orderMoveAction<Input>({
  name: "submitDrafts",
  action: "SUBMIT",
  input: ordersInput({}),
  beforeMove: beforeSubmit,
  async afterMove(context) {
    await writeSnapshots(
      context.tx,
      context.orders.map((order) => order.id),
      now(),
    );
  },
  async notify(context, result) {
    const { tx, userId } = context;
    const at = now();
    const [actor] = await tx
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    const branchIds = ids(context.orders.map((order) => order.branchId));
    const codes = await tx
      .select({ id: branches.id, code: branches.code })
      .from(branches)
      .where(inArray(branches.id, branchIds));
    const codeOf = new Map(codes.map((row) => [row.id, row.code]));
    const branchOf = new Map(context.orders.map((order) => [order.id, order.branchId]));
    const inBranches = (statuses: readonly { id: string }[]) =>
      statuses.map(({ id }) => {
        const branchId = branchOf.get(id)!;
        return { branchId, branchCode: codeOf.get(branchId)! };
      });

    // "Orders submitted or submitted again → Head" (10 Notifications): every active Head but the
    // actor, one notification per branch (decided item 6, Look first).
    const heads = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
    for (const { branchId, params } of orderActionNotices(actor!.name, inBranches(result.orders))) {
      await notify(
        { tx, userId },
        {
          to: heads.map((head) => head.id),
          type: "REQUEST_SUBMITTED",
          params,
          branchId,
          link: actionLink(branchId, result.actionId),
          at,
        },
      );
    }

    // An order the Head created skipped the Head step (03 rule 6) and waits for the Principal of
    // its branch: "Head approved → Principal of the branch" (10 Notifications). The actor of such
    // a submit is always a Head: the draft is its Head's own, and only its owner or a Head may
    // submit it (decisions 2.3 item 2; review of the plan, Should fix 1).
    const skipped = result.orders.filter((order) => order.status === "PENDING_PRINCIPAL");
    for (const { branchId, params } of orderActionNotices(actor!.name, inBranches(skipped))) {
      const principals = await tx
        .select({ id: userBranches.userId })
        .from(userBranches)
        .where(
          and(
            eq(userBranches.branchId, branchId),
            eq(userBranches.userRole, "PRINCIPAL"),
            eq(userBranches.userIsActive, true),
          ),
        );
      await notify(
        { tx, userId },
        {
          to: principals.map((principal) => principal.id),
          type: "REQUEST_HEAD_APPROVED",
          params,
          branchId,
          link: actionLink(branchId, result.actionId),
          at,
        },
      );
    }
  },
});
