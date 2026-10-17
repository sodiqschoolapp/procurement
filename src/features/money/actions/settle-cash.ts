import * as z from "zod";

import {
  type SettlementCashBlock,
  type SettlementRow,
  crossingRefusal,
  orderCashCount,
  settlementAllows,
  settlementCashRows,
  settlementNet,
} from "@/domain/money-ledger";
import { ActionError } from "@/server/action";
import type { OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import { moneyActions, moneyRows } from "@/server/db/schema";
import { notify } from "@/server/notify";
import {
  type OrdersContext,
  type OrdersInput,
  OrdersRefusal,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";

import { actionLink, branchNotices } from "../../orders/actions/notices";
import { cashRecordsOf } from "../../purchasing/order-records";
import { moneyRowsOf } from "../money-rows";
import { amountField, refuseFile, storedFields } from "./record-money";

// The settlement action of Finance's settlement screen (08-money-and-settlement.md, Closing 2, the
// Cash block; Money ledger 1 to 3; 03 Permission matrix: "Settle and close an order with
// differences", Finance of its own branches; plan of 4.5). In the wrapper of
// src/server/order-action.ts: lock, repeat, authorize `request.settle` per order, version, then:
//
//   check    the comment, the date, the document number (as Record money, decided item 3, Look
//            first); every order Waiting for settlement (`settlementAllows()`); at least one row
//            above 0; the rows' orders in one branch, as the screen takes one branch (decided item
//            4, Look first; permission review, Should fix 1); a file only for one Manager
//   write    first no crossing over: each Receive (Cash returned) and Pay (Paid back) row against
//            the order's count before the action, read under the orders' lock (08 Money ledger 3;
//            decided items 1 and 2, Look first), refused `not_ready` with the field that says why;
//            then the file; then one money action per Manager with this settlement's
//            `order_actions` row and its rows of both kinds (08 Money ledger 2's exception). Rows
//            of 0 write nothing; a Manager whose rows are all 0 gets no action (`settlementCashRows()`)
//   notify   one CASH_SETTLED to each owner per branch with the net (`settlementNet()`; decided
//            item 8, Look first)
//
// The wrapper raises the versions and writes one history event per order.

export type SettleCashInput = OrdersInput & {
  occurredOn: string;
  documentNo?: string;
  fileId?: string | null;
  comment: string;
  /** Per order its row: Receive (Cash returned) or Pay (Paid back), whole so'm from 0. */
  rows: Record<string, { kind: SettlementRow["kind"]; amount: bigint }>;
};

const input = ordersInput({
  occurredOn: z.string(),
  documentNo: z.string().optional(),
  fileId: z.uuid().nullable().optional(),
  comment: z.string(),
  // Only the two kinds of 08 Money ledger 2's exception (decisions 4.1 item 10).
  rows: z.record(
    z.uuid(),
    z.object({ kind: z.enum(["CASH_RETURNED", "PAID_BACK"]), amount: amountField }),
  ),
}).refine(
  (value) => {
    const ticked = new Set(value.orders.map((order) => order.id));
    return Object.keys(value.rows).every((id) => ticked.has(id));
  },
  { path: ["rows"], message: "A row names an order that is not ticked." },
) as unknown as z.ZodType<SettleCashInput>;

/** The rows above 0, one block per Manager (the owner as locked, never from the input). */
function blocksOf(context: OrdersContext<SettleCashInput>): SettlementCashBlock[] {
  return settlementCashRows(
    context.orders.flatMap((order) => {
      const row = context.input.rows[order.id];
      return row ? [{ id: order.id, ownerId: order.ownerId, ...row }] : [];
    }),
  );
}

/** 08 Money ledger 3, against each order's count before the action, under the orders' lock. */
async function crossings(
  context: OrdersContext<SettleCashInput>,
  blocks: readonly SettlementCashBlock[],
): Promise<OrderFailure[]> {
  const ids = blocks.flatMap((block) => block.rows.map((row) => row.orderId));
  const rows = await moneyRowsOf(context.tx, ids);
  const records = await cashRecordsOf(context.tx, ids);
  const refused: OrderFailure[] = [];
  for (const row of blocks.flatMap((block) => block.rows)) {
    const count = orderCashCount(rows.get(row.orderId) ?? [], records.get(row.orderId) ?? []);
    const why = crossingRefusal(count, row);
    if (why) {
      refused.push({
        orderId: row.orderId,
        code: "not_ready",
        fields: {
          amount: why === "ABOVE_COUNT" ? "errors.field.aboveCount" : "errors.field.aboveOwed",
        },
      });
    }
  }
  return refused;
}

export const settleCash = defineOrdersAction<SettleCashInput>({
  name: "settleCash",
  type: "SETTLE_CASH",
  input,
  permission: () => "request.settle",
  repeatPermission: () => "request.settle",
  reason: () => null,
  check(context) {
    storedFields(context.input);
    const refused = context.orders
      .filter((order) => !settlementAllows(order.status))
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
    if (refused.length > 0) return refused;
    const blocks = blocksOf(context);
    if (blocks.length === 0) {
      throw new ActionError("invalid_input", { rows: "errors.field.noAmount" });
    }
    const branchOf = new Map(context.orders.map((order) => [order.id, order.branchId]));
    const branches = new Set(
      blocks.flatMap((block) => block.rows.map((row) => branchOf.get(row.orderId))),
    );
    if (branches.size > 1) {
      throw new ActionError("invalid_input", { rows: "errors.field.moneyOneBranch" });
    }
    if (context.input.fileId && blocks.length > 1) {
      throw new ActionError("invalid_input", { fileId: "errors.field.fileOneManager" });
    }
    return [];
  },
  async write(context) {
    // After every check has passed; a refusal rolls back the `order_actions` row (06 rule 8).
    const blocks = blocksOf(context);
    const refused = await crossings(context, blocks);
    if (refused.length > 0) throw new OrdersRefusal("not_ready", refused);
    if (context.input.fileId) await refuseFile(context.tx, context.userId, context.input.fileId);
    const { comment, documentNo, occurredOn } = storedFields(context.input);
    const at = now();
    const extras = new Map<string, { payload: Record<string, unknown> }>();
    for (const block of blocks) {
      const [action] = await context.tx
        .insert(moneyActions)
        .values({
          clientKey: context.input.clientKey,
          orderActionId: context.actionId,
          managerId: block.managerId,
          occurredOn,
          documentNo,
          fileId: context.input.fileId ?? null,
          comment,
          createdBy: context.userId,
          createdAt: at,
        })
        .returning({ id: moneyActions.id });
      await context.tx.insert(moneyRows).values(
        block.rows.map((row) => ({
          moneyActionId: action!.id,
          orderId: row.orderId,
          kind: row.kind,
          amount: row.amount,
          createdAt: at,
        })),
      );
      for (const row of block.rows) {
        extras.set(row.orderId, {
          payload: {
            money: { actionId: action!.id, kind: row.kind, amount: row.amount.toString() },
          },
        });
      }
    }
    return extras;
  },
  async notify(context, result) {
    const { tx, userId } = context;
    const at = now();
    const orderOf = new Map(context.orders.map((order) => [order.id, order]));
    for (const block of blocksOf(context)) {
      const moved = block.rows.map((row) => orderOf.get(row.orderId)!);
      // One branch per action (the check), so the net is this owner's in that branch.
      const net = settlementNet(block.rows);
      for (const { branchId, params } of await branchNotices(tx, userId, moved)) {
        await notify(
          { tx, userId },
          {
            to: [block.managerId],
            type: "CASH_SETTLED",
            params: { ...params, amount: net.amount.toString(), direction: net.direction },
            branchId,
            link: actionLink(branchId, result.actionId),
            at,
          },
        );
      }
    }
  },
});
