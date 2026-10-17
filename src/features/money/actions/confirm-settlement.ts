import { sql } from "drizzle-orm";
import * as z from "zod";

import { settlementAllows, transferNeedsNote } from "@/domain/money-ledger";
import { ActionError } from "@/server/action";
import type { FieldMessageKey, OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import { orderSettlements } from "@/server/db/schema";
import {
  type OrdersInput,
  OrdersRefusal,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";

import { settlementFactsOf } from "../settlement-facts";
import { MONEY_COMMENT_MAX } from "./record-money";

// "Confirmed" of the Bank transfer and the Corporate card blocks of the settlement screen
// (08-money-and-settlement.md, Closing 2: "Ticks 'Confirmed' per order. If transferred and
// received differ, a note is required"; A11; 03 Permission matrix: "Settle and close an order
// with differences", Finance of its own branches; plan of 4.5). In the wrapper of
// src/server/order-action.ts: lock, repeat, authorize `request.settle` per order, version, then:
//
//   check    every order Waiting for settlement (`settlementAllows()`); a note only on a transfer
//   write    the blocks read under the orders' lock (review of the plan, Should fix 5): an order
//            without the block is refused `not_ready` (`noBlock`); a transfer ticked while
//            transferred and received differ needs a note (`noteRequired`), refused whole as
//            `invalid_input`; then each order's row of order_settlements is written: ticked sets
//            by and at from the clock (and the transfer's note), unticked clears them (decided
//            item 10). The row is updated, never deleted.
//
// No notice (10 Notifications names none). The wrapper raises the versions and writes one history
// event per order with `payload.settlement`.

export type ConfirmSettlementInput = OrdersInput & {
  block: "TRANSFER" | "CARD";
  confirmed: boolean;
  /** The transfer's note per order (08 Closing 2: "the supplier owes goods or a refund"). */
  notes?: Record<string, string>;
};

/** A note as it is stored: trimmed; an empty one is no note. Up to 1000 code points (14). */
const note = z.string().transform((value) => value.trim());

const input = ordersInput({
  block: z.enum(["TRANSFER", "CARD"]),
  confirmed: z.boolean(),
  notes: z.record(z.uuid(), note).optional(),
}).refine(
  (value) => {
    const ticked = new Set(value.orders.map((order) => order.id));
    const notes = Object.keys(value.notes ?? {});
    return (
      notes.every((id) => ticked.has(id)) && (value.block === "TRANSFER" || notes.length === 0)
    );
  },
  { path: ["notes"], message: "A note names an order that is not ticked, or a card block." },
) as unknown as z.ZodType<ConfirmSettlementInput>;

function noteOf(input: ConfirmSettlementInput, orderId: string): string | null {
  const text = input.notes?.[orderId] ?? "";
  return text === "" ? null : text;
}

export const confirmSettlement = defineOrdersAction<ConfirmSettlementInput>({
  name: "confirmSettlement",
  type: "CONFIRM_SETTLEMENT",
  input,
  permission: () => "request.settle",
  repeatPermission: () => "request.settle",
  reason: () => null,
  check(context) {
    for (const order of context.orders) {
      const text = noteOf(context.input, order.id);
      if (text !== null && Array.from(text).length > MONEY_COMMENT_MAX) {
        throw new ActionError("invalid_input", { note: "errors.field.tooLong" });
      }
    }
    return context.orders
      .filter((order) => !settlementAllows(order.status))
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
  },
  async write(context) {
    const { block, confirmed } = context.input;
    const facts = await settlementFactsOf(
      context.tx,
      context.orders.map((order) => order.id),
    );
    const missing: OrderFailure[] = [];
    let noteMissing = false;
    for (const order of context.orders) {
      const blocks = facts.get(order.id)?.blocks;
      const figures = block === "TRANSFER" ? blocks?.transfer : blocks?.card;
      if (!figures) {
        const fields: Record<string, FieldMessageKey> = { block: "errors.field.noBlock" };
        missing.push({ orderId: order.id, code: "not_ready", fields });
        continue;
      }
      if (
        confirmed &&
        blocks?.transfer &&
        block === "TRANSFER" &&
        transferNeedsNote(blocks.transfer) &&
        noteOf(context.input, order.id) === null
      ) {
        noteMissing = true;
      }
    }
    if (missing.length > 0) throw new OrdersRefusal("not_ready", missing);
    if (noteMissing) throw new ActionError("invalid_input", { note: "errors.field.noteRequired" });

    const at = now();
    const by = confirmed ? context.userId : null;
    const when = confirmed ? at : null;
    const extras = new Map<string, { payload: Record<string, unknown> }>();
    const values = context.orders.map((order) => {
      const text = block === "TRANSFER" && confirmed ? noteOf(context.input, order.id) : null;
      extras.set(order.id, { payload: { settlement: { block, confirmed, note: text } } });
      return block === "TRANSFER"
        ? {
            orderId: order.id,
            transferConfirmedBy: by,
            transferConfirmedAt: when,
            transferNote: text,
            createdAt: at,
          }
        : { orderId: order.id, cardConfirmedBy: by, cardConfirmedAt: when, createdAt: at };
    });
    // One statement for every ticked order: the row is updated, never deleted (decided item 10).
    await context.tx
      .insert(orderSettlements)
      .values(values)
      .onConflictDoUpdate({
        target: orderSettlements.orderId,
        set:
          block === "TRANSFER"
            ? {
                transferConfirmedBy: sql`excluded.transfer_confirmed_by`,
                transferConfirmedAt: sql`excluded.transfer_confirmed_at`,
                transferNote: sql`excluded.transfer_note`,
              }
            : {
                cardConfirmedBy: sql`excluded.card_confirmed_by`,
                cardConfirmedAt: sql`excluded.card_confirmed_at`,
              },
      });
    return extras;
  },
});
