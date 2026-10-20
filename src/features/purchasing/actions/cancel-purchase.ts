import { asc, eq, inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { isMoveReason, moveReason } from "@/domain/order-moves";
import {
  actualQuantity,
  actualTotal,
  finishReasonAfter,
  progressAfterBuying,
  purchaseCancelAllows,
} from "@/domain/purchases";
import { ActionError } from "@/server/action";
import type { OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import { orders, productVariants, products, purchases } from "@/server/db/schema";
import { notify } from "@/server/notify";
import {
  type OrderEventExtra,
  type OrdersActionDefinition,
  type OrdersContext,
  type OrdersInput,
  OrdersRefusal,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";
import { reasonFields } from "@/server/order-moves";
import { StockShortError, postMovement } from "@/server/stock-ledger";

import { actionLink, branchNotices, ownersAndHeads } from "../../orders/actions/notices";
import { movedSince } from "../../orders/moved-since";
import { orderRecords } from "../order-records";
import { noticePriceDiffers } from "../price-prompts";

// Cancel a purchase record, or every record of one trip, while the orders are Open
// (07-purchasing.md, Fixing a mistake; 09-warehouse.md, Stock value, third bullet; Decided ahead,
// question 3; plan of 3.7). Both run in the wrapper of src/server/order-action.ts: lock, repeat,
// authorize `purchase.cancel` (the Head in any branch, the owner with CANCEL_PURCHASES on; 03
// Manager rights; decided item 5, Look first), version, then:
//
//   check    the reason (5 to 500), and every order Open (`wrong_status`; decided item 4)
//   inspect  the records, locked FOR UPDATE under the orders' locks: a record not on the sent
//            order, or a trip none of whose records is on a sent order, is `not_found`; a record
//            cancelled before, or a trip with none left, is `wrong_status`; a trip whose orders
//            are not the sent ones is `invalid_input` (decided item 7; review of the plan, Should
//            fix 1); a record on an order whose owner now is not the one it had when the record
//            was written is `wrong_status`, naming that owner (`movedSince()`; plan of 4.10b,
//            decided items 3 and 4, Look first)
//            a record given straight to the department whose issue is still posted is
//            `not_ready`, naming that issue (`givenIssues()`; plan of 5.4b, Look first)
//   write    the products FOR SHARE and the subtypes bought FOR UPDATE, each in id order (the lock
//            order of .claude/rules/server-actions.md); each record's one cancel update (the
//            trigger purchases_cancel_only of 0024 allows nothing else); for a product a priced
//            REVERSAL at the record's own price on its branch and subtype bought, pointing at its
//            RECEIPT (decided item 1, Look first), one subtype after another in postMovements()'
//            order, every short subtype collected and refused at once with the orders it names
//            (decided item 2, Look first; review of the plan, Must fix 1); the subtype's last
//            purchase price again from its newest purchase that is not cancelled (decided item 6,
//            Look first); each order's `actual_total`, progress and finish reason from its records
//            (decided item 3, Look first; review correction 1)
//   notify   one PURCHASE_CANCELLED per branch to every active Head but the actor (10
//            Notifications; decided item 9); PRICE_DIFFERS to the Heads when the cancel made a
//            price prompt appear (plan of 3.10, decided item 8, Look first)
//
// The wrapper raises the versions and writes one history event per order with the reason. A
// trip holds one record per order (3.4), so a record and its order go one to one.

export type CancelPurchaseInput = OrdersInput & { purchaseId: string; reason: string };
export type CancelTripInput = OrdersInput & { tripId: string; reason: string };
type CancelInput = CancelPurchaseInput | CancelTripInput;

const recordInput = ordersInput({
  purchaseId: z.uuid(),
  reason: z.string().optional(),
}).refine((value) => value.orders.length === 1, {
  path: ["orders"],
  message: "A record belongs to one order.",
}) as unknown as z.ZodType<CancelPurchaseInput>;

const tripInput = ordersInput({
  tripId: z.uuid(),
  reason: z.string().optional(),
}) as unknown as z.ZodType<CancelTripInput>;

/** One reason for the action, 5 to 500 once trimmed (06 rule 3, as the other moves). */
function storedReason(input: CancelInput): string {
  if (!isMoveReason(input.reason))
    throw new ActionError("invalid_input", reasonFields(input.reason));
  return moveReason(input.reason);
}

type HeldRecord = {
  id: string;
  tripId: string;
  orderId: string;
  branchId: string;
  variantId: string;
  productId: string;
  isService: boolean;
  qty: string;
  unitPrice: bigint;
  isCancelled: boolean;
  createdAt: Date;
};

/**
 * The record or the trip's records on the sent orders behind no wall, FOR UPDATE of the records,
 * in id order: a record of any other order is neither read nor locked (permission review of 3.7,
 * Should fix 1). For a trip that has records on them, also how many of its records not cancelled
 * are on other orders: a trip is one branch (`purchases_trip_branch_fk`) and one owner (3.4), so
 * those are the actor's own branch and owner's orders the browser left out, never another
 * branch's, and they are read only for the count.
 */
async function lockRecords(
  context: OrdersContext<CancelInput>,
): Promise<{ held: HeldRecord[]; elsewhere: number }> {
  const input = context.input;
  const sent = sql.join(
    context.orders.map((order) => sql`${order.id}::uuid`),
    sql`, `,
  );
  const where =
    "purchaseId" in input
      ? sql`p.id = ${input.purchaseId} and p.order_id in (${sent})`
      : sql`p.trip_id = ${(input as CancelTripInput).tripId} and p.order_id in (${sent})`;
  const found = await context.tx.execute<{
    id: string;
    trip_id: string;
    order_id: string;
    branch_id: string;
    variant_id: string;
    product_id: string;
    type: "GOODS" | "SERVICE";
    qty: string;
    unit_price: string;
    is_cancelled: boolean;
    created_at: string | Date;
  }>(sql`
    select p.id, p.trip_id, p.order_id, p.branch_id, p.variant_id, v.product_id, pr.type,
           p.qty::text as qty, p.unit_price::text as unit_price, p.is_cancelled, p.created_at
    from purchases p
    join product_variants v on v.id = p.variant_id
    join products pr on pr.id = v.product_id
    where ${where}
    order by p.id
    for update of p`);
  const held = found.rows.map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    orderId: row.order_id,
    branchId: row.branch_id,
    variantId: row.variant_id,
    productId: row.product_id,
    isService: row.type === "SERVICE",
    qty: row.qty,
    unitPrice: BigInt(row.unit_price),
    isCancelled: row.is_cancelled,
    createdAt: new Date(row.created_at),
  }));
  if ("purchaseId" in input || held.length === 0) return { held, elsewhere: 0 };
  const others = await context.tx.execute<{ count: number }>(sql`
    select count(*)::int as count from purchases
    where trip_id = ${(input as CancelTripInput).tripId} and not is_cancelled
      and order_id not in (${sent})`);
  return { held, elsewhere: others.rows[0]!.count };
}

/** The status check of both actions: every order Open (07 Fixing a mistake 1; decided item 4). */
function statusCheck(context: OrdersContext<CancelInput>): OrderFailure[] {
  storedReason(context.input);
  return context.orders
    .filter((order) => order.status !== "PURCHASING")
    .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
}

/**
 * Which records the action cancels, or the orders it refuses: the inspect step's rule, asked
 * again by the write step on the same locked rows.
 */
function chosen(
  context: OrdersContext<CancelInput>,
  { held, elsewhere }: { held: readonly HeldRecord[]; elsewhere: number },
): { failures: OrderFailure[]; records: HeldRecord[] } {
  const sent = context.orders;
  const sentIds = new Set(sent.map((order) => order.id));
  const notFound = () => ({
    failures: sent.map((order) => ({ orderId: order.id, code: "not_found" as const })),
    records: [],
  });
  // A record or trip of another order tells nothing about it (03 rule 1).
  const onSent = held;
  if (onSent.length === 0) return notFound();

  const statusOf = new Map(sent.map((order) => [order.id, order.status]));
  if ("purchaseId" in context.input) {
    const record = onSent[0]!;
    return purchaseCancelAllows(statusOf.get(record.orderId)!, record)
      ? { failures: [], records: [record] }
      : { failures: [{ orderId: record.orderId, code: "wrong_status" }], records: [] };
  }

  // Cancel trip: every record of the trip that is not cancelled yet (decided item 7).
  const live = held.filter((record) => !record.isCancelled);
  if (live.length === 0) {
    return {
      failures: sent.map((order) => ({ orderId: order.id, code: "wrong_status" as const })),
      records: [],
    };
  }
  const liveOrders = new Set(live.map((record) => record.orderId));
  if (elsewhere > 0 || liveOrders.size !== sentIds.size) {
    throw new ActionError("invalid_input", { orders: "errors.field.notAllowed" });
  }
  return {
    failures: live
      .filter((record) => !purchaseCancelAllows(statusOf.get(record.orderId)!, record))
      .map((record) => ({ orderId: record.orderId, code: "wrong_status" as const })),
    records: live,
  };
}

/**
 * A record on an order whose owner now is not the owner it had when the record was written is
 * refused, naming that owner (08 Money ledger; edge case "A typo in a purchase record": "the Head
 * first moves it back to the Manager who held it when the record was written"; D55 (2); plan of
 * 4.10b, decided items 3 and 4, Look first). Every record, whatever its payment type: the edge case
 * names no exception, so 4.10's narrowing to records that change a cash count ends.
 */
async function movedAway(
  context: OrdersContext<CancelInput>,
  records: readonly HeldRecord[],
): Promise<OrderFailure[]> {
  const refused = new Map<string, string>();
  for (const record of records) {
    if (refused.has(record.orderId)) continue;
    const order = context.orders.find((each) => each.id === record.orderId)!;
    const then = (await movedSince(context.tx, [order], record.createdAt)).get(order.id);
    if (then) refused.set(order.id, then.name);
  }
  return [...refused].map(([orderId, manager]) => ({
    orderId,
    code: "wrong_status" as const,
    fields: { status: "errors.field.movedSince" as const },
    values: { manager },
  }));
}

/**
 * A record given straight to the department whose issue is still POSTED is refused `not_ready`,
 * naming that issue, whatever stock the branch holds: its cancel would reverse the receipt and
 * leave the issue standing, so the items would leave the stock twice (07 Fixing a mistake 2; D56
 * finding 1; plan of 5.4b, decided items 1 to 5, Look first). The record's issue is the ISSUE of
 * its branch whose client key is the record's id (5.4 decided item 7), not `give_to_requester`,
 * which records saved before 5.4b read false. Read without a lock: a POSTED issue only ever becomes
 * REVERSED (09 Issue 3), so a stale read can only refuse; asked once, before the write step.
 */
async function givenIssues(
  context: OrdersContext<CancelInput>,
  records: readonly HeldRecord[],
): Promise<OrderFailure[]> {
  if (records.length === 0) return [];
  const ids = sql.join(
    records.map((record) => sql`${record.id}::uuid`),
    sql`, `,
  );
  const posted = await context.tx.execute<{ client_key: string; number: string }>(sql`
    select d.client_key, d.number from stock_documents d
    join purchases p on p.id = d.client_key and p.branch_id = d.branch_id
    where d.client_key in (${ids}) and d.type = 'ISSUE' and d.status = 'POSTED'
    order by d.number`);
  return posted.rows.map((row) => ({
    orderId: records.find((record) => record.id === row.client_key)!.orderId,
    code: "not_ready" as const,
    fields: { stock: "errors.field.givenIssuePosted" as const },
    values: { number: row.number },
  }));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Locks the products FOR SHARE, then the subtypes bought FOR UPDATE, each in id order. */
async function lockCatalog(context: OrdersContext<CancelInput>, records: readonly HeldRecord[]) {
  const productIds = [...new Set(records.map((record) => record.productId))].sort();
  await context.tx
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.id))
    .for("share");
  const variantIds = [...new Set(records.map((record) => record.variantId))].sort();
  await context.tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds))
    .orderBy(asc(productVariants.id))
    .for("update");
}

/** The RECEIPT movement of a goods record: a reversal never points at nothing. */
async function receiptOf(context: OrdersContext<CancelInput>, record: HeldRecord): Promise<string> {
  const found = await context.tx.execute<{ id: string }>(sql`
    select id from stock_movements
    where purchase_id = ${record.id} and branch_id = ${record.branchId}
      and variant_id = ${record.variantId} and type = 'RECEIPT'`);
  if (found.rows.length !== 1) throw new ActionError("unexpected");
  return found.rows[0]!.id;
}

/**
 * The reversals of the goods records, one subtype after another in postMovements()' order (branch,
 * then subtype). A subtype that would go below 0 throws StockShortError before its insert, so the
 * next subtype is still tried; every order with a record of a short subtype is refused `not_ready`
 * at once (06 rule 8), with the message that names the two ways out (07 Fixing a mistake 2).
 */
async function reverseStock(context: OrdersContext<CancelInput>, records: readonly HeldRecord[]) {
  const goods = records
    .filter((record) => !record.isService)
    .sort((a, b) => compare(a.branchId, b.branchId) || compare(a.variantId, b.variantId));
  const short = new Set<string>();
  for (const record of goods) {
    if (short.has(`${record.branchId}/${record.variantId}`)) continue;
    try {
      await postMovement(context.tx, {
        branchId: record.branchId,
        variantId: record.variantId,
        type: "REVERSAL",
        qtyDelta: `-${record.qty}`,
        unitCost: record.unitPrice,
        createdBy: context.userId,
        purchaseId: record.id,
        reversesMovementId: await receiptOf(context, record),
      });
    } catch (error) {
      if (!(error instanceof StockShortError)) throw error;
      short.add(`${record.branchId}/${record.variantId}`);
    }
  }
  if (short.size === 0) return;
  const refused = new Set(
    goods
      .filter((record) => short.has(`${record.branchId}/${record.variantId}`))
      .map((record) => record.orderId),
  );
  throw new OrdersRefusal(
    "not_ready",
    context.input.orders
      .filter((order) => refused.has(order.id))
      .map((order) => ({
        orderId: order.id,
        code: "not_ready" as const,
        fields: { stock: "errors.field.stockShort" as const },
      })),
  );
}

/**
 * The last purchase price is "the price of the newest real purchase of a subtype"
 * (edge-cases/00-definitions.md): when the subtype's newest PURCHASE price row (by `seq`) is of a
 * record cancelled now, the price and its moment go back to its newest row whose record is not
 * cancelled, or to empty (decided item 6, Look first). A price set otherwise, or of an older record, stays.
 */
async function lastPricesAgain(
  context: OrdersContext<CancelInput>,
  records: readonly HeldRecord[],
) {
  const cancelled = new Set(records.map((record) => record.id));
  const cancelledNow = sql.join(
    records.map((record) => sql`${record.id}::uuid`),
    sql`, `,
  );
  for (const variantId of [...new Set(records.map((record) => record.variantId))].sort()) {
    // The price in force before this action: the newest row of a record live until now.
    const newest = await context.tx.execute<{ purchase_id: string }>(sql`
      select h.purchase_id from price_history h
      join purchases p on p.id = h.purchase_id
      where h.variant_id = ${variantId} and h.source = 'PURCHASE'
        and (not p.is_cancelled or p.id in (${cancelledNow}))
      order by h.seq desc limit 1`);
    const top = newest.rows[0];
    if (!top || !cancelled.has(top.purchase_id)) continue;
    const live = await context.tx.execute<{ price: string; created_at: Date }>(sql`
      select h.price::text as price, h.created_at from price_history h
      join purchases p on p.id = h.purchase_id
      where h.variant_id = ${variantId} and h.source = 'PURCHASE' and not p.is_cancelled
      order by h.seq desc limit 1`);
    const row = live.rows[0];
    await context.tx
      .update(productVariants)
      .set({
        lastPurchasePrice: row ? BigInt(row.price) : null,
        lastPurchaseAt: row ? new Date(row.created_at) : null,
      })
      .where(eq(productVariants.id, variantId));
  }
}

function defineCancel<Input extends CancelInput>(
  name: string,
  input: z.ZodType<Input>,
): OrdersActionDefinition<Input> {
  return defineOrdersAction<Input>({
    name,
    type: "CANCEL_PURCHASE",
    input,
    permission: () => "purchase.cancel",
    repeatPermission: () => "purchase.cancel",
    reason: (typed) => (isMoveReason(typed.reason) ? moveReason(typed.reason) : null),
    check: (context) => statusCheck(context),
    async inspect(context) {
      const { failures, records } = chosen(context, await lockRecords(context));
      return [
        ...failures,
        ...(await movedAway(context, records)),
        ...(await givenIssues(context, records)),
      ];
    },
    async write(context) {
      const reason = storedReason(context.input);
      const { records } = chosen(context, await lockRecords(context));
      await lockCatalog(context, records);

      const at = now();
      await context.tx
        .update(purchases)
        .set({
          isCancelled: true,
          cancelReason: reason,
          cancelledBy: context.userId,
          cancelledAt: at,
        })
        .where(
          inArray(
            purchases.id,
            records.map((record) => record.id),
          ),
        );
      await reverseStock(context, records);
      await lastPricesAgain(context, records);

      const extras = new Map<string, OrderEventExtra>();
      for (const record of records) {
        const [order] = await context.tx
          .select({
            plannedQty: orders.plannedQty,
            progress: orders.progress,
            finishReason: orders.finishReason,
          })
          .from(orders)
          .where(eq(orders.id, record.orderId));
        const after = await orderRecords(context.tx, record.orderId);
        const progress = progressAfterBuying(
          order!.progress,
          order!.plannedQty!,
          actualQuantity(after),
        );
        await context.tx
          .update(orders)
          .set({
            actualTotal: actualTotal(after),
            progress,
            finishReason: finishReasonAfter(progress, order!.finishReason),
          })
          .where(eq(orders.id, record.orderId));
        extras.set(record.orderId, {
          payload: {
            purchase: { id: record.id, tripId: record.tripId },
            progress: { from: order!.progress, to: progress },
          },
        });
      }
      return extras;
    },
    async notify(context, result) {
      const { tx, userId } = context;
      const heads = await ownersAndHeads(tx, []);
      // One record per order (3.4), so each branch's count of orders is its count of records.
      for (const { branchId, params } of await branchNotices(tx, userId, context.orders)) {
        await notify(
          { tx, userId },
          {
            to: heads,
            type: "PURCHASE_CANCELLED",
            params,
            branchId,
            link: actionLink(branchId, result.actionId),
            at: now(),
          },
        );
      }
      await noticePriceDiffers(context, result.actionId, "cancelled");
    },
  });
}

/** Cancel record: one record of one Open order, with a reason (07 Fixing a mistake 1). */
export const cancelPurchase = defineCancel("cancelPurchase", recordInput);

/** Cancel trip: every record of one trip, all or nothing (07 Fixing a mistake 1). */
export const cancelTrip = defineCancel("cancelTrip", tripInput);
