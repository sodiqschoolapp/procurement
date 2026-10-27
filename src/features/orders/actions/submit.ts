import { and, eq, inArray } from "drizzle-orm";

import { businessDate } from "@/domain/business-date";
import { SUBMIT_SET_MAX, submitSelection } from "@/domain/submit-checks";
import { orderActionNotices } from "@/domain/notifications";
import { now } from "@/server/clock";
import { branches, orders, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import type { OrderFailure } from "@/server/action-result";
import type { PlannedMove } from "@/domain/order-moves";
import {
  type LockedOrder,
  type OrdersContext,
  type OrdersInput,
  type OrdersLeft,
  type OrdersResult,
  OrdersRefusal,
  type Transaction,
  ordersInput,
} from "@/server/order-action";
import { orderMoveAction } from "@/server/order-moves";
import { approvalSteps } from "@/server/settings";

import { actionLink, nextStepRecipients } from "./notices";
import {
  failuresOf,
  ids,
  numbersOf,
  readSubmitRows,
  readSubmitSettings,
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
// Before the move is planned, `facts` reads the settings `principal_step` and `finance_step` under
// the settings lock taken shared when a Head-created draft is sent, whose first Submit leaves the
// Head step (03 rule 6; 06 Principal step switched off 1 and 3; plan of 4.10d, decided items 1 and
// 2, Look first).
//
// The wrapper then writes the status (when the Head created the order: Waiting for Principal, or
// the next step that is on, logged "Created by Head", with its marks), the events and the action
// row; `afterMove` also writes `approved_at` of an order the Submit opens (both steps off; 07 Date
// bought; plan of 4.10d); `notify` tells the Heads, and whoever acts next on the orders that
// skipped the Head step.

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
  const settings = await readSubmitSettings(tx);

  const failed = failuresOf(context.input.orders, rows, businessDate(at), settings.fields);
  if (failed.length > 0) throw new OrdersRefusal("not_ready", failed);

  const numbers = await numbersOf(
    tx,
    rows.filter((row) => row.number === null),
    at,
  );
  await writePlan(tx, rows, numbers, at, settings);
}

/**
 * The notices of a submit (10 Notifications), of the orders it moved: the Heads, and the Principal
 * of the orders that skipped the Head step.
 */
async function notifySubmitted(context: OrdersContext<Input>, result: OrdersResult): Promise<void> {
  const { tx, userId } = context;
  const at = now();
  const [actor] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, userId));
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
  // its branch, or for whoever acts at the next step that is on: "Head approved → Principal of the
  // branch; while the Principal step is off, as for 'Principal approved'" (10 Notifications; plan
  // of 4.10d, decided item 8). The actor of such a submit is always a Head: the draft is its Head's
  // own, and only its owner or a Head may submit it (decisions 2.3 item 2; review of the plan,
  // Should fix 1). Grouped by the status reached, one notice per branch each.
  const ownerOf = new Map(context.orders.map((order) => [order.id, order.ownerId]));
  for (const to of ["PENDING_PRINCIPAL", "PENDING_FINANCE", "PURCHASING"] as const) {
    const skipped = result.orders.filter((order) => order.status === to);
    for (const { branchId, params } of orderActionNotices(actor!.name, inBranches(skipped))) {
      const owners = skipped
        .filter((order) => branchOf.get(order.id) === branchId)
        .map((order) => ownerOf.get(order.id)!);
      await notify(
        { tx, userId },
        {
          to: await nextStepRecipients(tx, to, branchId, owners),
          type: "REQUEST_HEAD_APPROVED",
          params,
          branchId,
          link: actionLink(branchId, result.actionId),
          at,
        },
      );
    }
  }
}

/**
 * The plan facts after the move: one order_revisions row per order (rule 7); and `approved_at` of
 * the orders a Head-created Submit opened with both steps off, the approval that opened them (07
 * Purchase record, Date bought; 06 Principal step switched off 3; plan of 4.10d).
 */
async function afterSubmit(
  context: OrdersContext<Input>,
  moves: readonly PlannedMove[],
): Promise<void> {
  const at = now();
  await writeSnapshots(
    context.tx,
    context.orders.map((order) => order.id),
    at,
  );
  const opened = moves.filter((move) => move.to === "PURCHASING").map((move) => move.orderId);
  if (opened.length > 0) {
    await context.tx.update(orders).set({ approvedAt: at }).where(inArray(orders.id, opened));
  }
}

/**
 * The approval steps, read under the settings lock taken shared, when a Head-created draft is sent:
 * its first Submit leaves the Head step and goes to the next step that is on (03 rule 6; plan of
 * 4.10d, decided item 1, Look first). A submit of other drafts reads nothing: it goes to the Head.
 */
async function stepsOf(context: OrdersContext<Input>): Promise<readonly LockedOrder[]> {
  if (!context.orders.some((order) => order.createdByHead)) return context.orders;
  const steps = await approvalSteps(context.tx);
  return context.orders.map((order) => ({ ...order, ...steps }));
}

export const submitDrafts = orderMoveAction<Input>({
  name: "submitDrafts",
  action: "SUBMIT",
  input: ordersInput({}),
  facts: stepsOf,
  beforeMove: beforeSubmit,
  afterMove: afterSubmit,
  notify: notifySubmitted,
});

/**
 * What a Submit with nothing ticked leaves (05 Drafts 4; Checks at submit): the drafts that are
 * not ready, each with its cells, and the ready ones past the first 200, counted. Read under the
 * lock, each catalog row FOR SHARE, by submitRefusals() and submitSelection() of src/domain/.
 */
async function leftOf(
  tx: Transaction,
  orderIds: readonly string[],
): Promise<{ send: Set<string> } & OrdersLeft> {
  if (orderIds.length === 0) return { send: new Set(), left: [], heldBack: 0 };
  const rows = await readSubmitRows(tx, orderIds);
  const { fields } = await readSubmitSettings(tx);
  const failed = failuresOf(
    orderIds.map((id) => ({ id })),
    rows,
    businessDate(now()),
    fields,
  );
  const failedIds = new Set(failed.map((order) => order.orderId));
  const { send, heldBack } = submitSelection(
    rows.map((row) => ({ id: row.id, createdAt: row.createdAt, ready: !failedIds.has(row.id) })),
  );
  return {
    send: new Set(send.map((row) => row.id)),
    // In the order the screen sent them, so the list on top follows the sheet.
    left: failed,
    heldBack: heldBack.length,
  };
}

/**
 * Submit with nothing ticked (05 Drafts 4; 06 rule 8, its one exception; plan of 2.5c, decided
 * items 1 to 4 and 11, Look first): the screen sends the submit set it loaded, the user's own
 * Drafts without a number, with their versions. Every check of the wrapper refuses the whole as
 * for ticked drafts: a stale version, another branch, a status off. A numbered Draft (taken back)
 * or another owner's draft is never in the set, so one sent refuses the whole too (decided item
 * 2). Then `leave` keeps the ready ones, the first 200 in the order they were added, and leaves
 * the rest untouched: no version raised, no event. With none ready the whole is refused
 * `not_ready` with each draft's cells. The rest is Submit as for ticked drafts.
 */
export const submitReadyDrafts = orderMoveAction<Input>({
  name: "submitReadyDrafts",
  action: "SUBMIT",
  input: ordersInput({}, { max: SUBMIT_SET_MAX }),
  async inspect(context) {
    const refused: OrderFailure[] = [];
    for (const order of context.orders) {
      if (order.ownerId !== context.userId) refused.push({ orderId: order.id, code: "forbidden" });
      else if (order.numbered) refused.push({ orderId: order.id, code: "wrong_status" });
    }
    return refused;
  },
  async leave(context) {
    // Every sent order passed the walls, so the sent list is the locked one in the screen's order.
    const { send, left, heldBack } = await leftOf(
      context.tx,
      context.input.orders.map((order) => order.id),
    );
    if (send.size === 0) throw new OrdersRefusal("not_ready", left);
    return { keep: context.orders.filter((order) => send.has(order.id)), left, heldBack };
  },
  async leftOnRepeat(tx, userId, notMoved) {
    // Only what the first call could leave: the user's own Drafts without a number (decided item
    // 2; permission review, Should fix 1). The first call sent every ready one up to 200, so one
    // it did not move that passes the checks now was held back by the cap (review of the plan,
    // correction 1).
    const own = notMoved
      .filter((order) => order.ownerId === userId && order.status === "DRAFT" && !order.numbered)
      .map((order) => order.id);
    const { left } = await leftOf(tx, own);
    return { left, heldBack: own.length - left.length };
  },
  facts: stepsOf,
  beforeMove: beforeSubmit,
  afterMove: afterSubmit,
  notify: notifySubmitted,
});
