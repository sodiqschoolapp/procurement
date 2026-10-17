// The money ledger of an order and of a Manager (08-money-and-settlement.md, Money ledger; Exact
// match; When Finance approves; Closing 2; plan of 4.1). Every screen, file and action that shows
// or writes a cash count, a balance, a prefilled row or a settlement's net calls this module: the
// formula lives once (developer-rules.md rule 1).
//
// Money is whole so'm in bigint; goods are `actualGoods()` of ./purchases.ts, rounded half up there
// (developer-rules.md rule 6). Nothing here reads a database or a clock.

import { orderColours } from "./colours";
import { type OrderPlan, extrasSum, orderExtras, orderTotal } from "./order-totals";
import type { PaymentType } from "./payment-types";
import {
  type OrderProgress,
  type PurchaseRecord,
  actualExtra,
  actualGoods,
  isSubstituted,
  liveRecords,
} from "./purchases";
import type { RequestStatus } from "./request-status";

/** 14 money_rows.kind, in the order of 08's Money ledger table. */
export const MONEY_ROW_KINDS = [
  "CASH_GIVEN",
  "CASH_RETURNED",
  "PAID_BACK",
  "BANK_TRANSFER",
  "CARD_TOPUP",
  "CARD_RETURNED",
] as const;
export type MoneyRowKind = (typeof MONEY_ROW_KINDS)[number];

/** How a row of each kind moves the order's cash count (08 Money ledger table). */
const COUNT_SIGN: Record<MoneyRowKind, -1n | 0n | 1n> = {
  CASH_GIVEN: 1n,
  CASH_RETURNED: -1n,
  PAID_BACK: 1n,
  BANK_TRANSFER: 0n,
  CARD_TOPUP: 0n,
  CARD_RETURNED: 0n,
};

/** One money row as these functions read it; `isCancelled` is its action's (08 Money ledger). */
export type MoneyRow = { kind: MoneyRowKind; amount: bigint; isCancelled: boolean };

/**
 * One purchase record with the payment types cash spent needs (14: a record's payment type is its
 * trip's; each extra has its own; plan of 4.1, decided item 2, Look first).
 */
export type CashRecord = {
  variantId: string;
  qty: string;
  unitPrice: bigint;
  /** The trip's payment type. */
  paymentType: PaymentType;
  extras: readonly { amount: bigint; paymentType: PaymentType }[];
  isCancelled: boolean;
};

/** A row's amount: whole so'm above 0 (14 money_rows CHECK amount > 0). */
function amountOf(value: bigint): bigint {
  if (typeof value !== "bigint" || value <= 0n) {
    throw new RangeError(`A money amount is ${String(value)}: not whole so'm above 0`);
  }
  return value;
}

/** A CashRecord as the formulas of ./purchases.ts read it. */
function asPurchaseRecord(record: CashRecord): PurchaseRecord {
  return {
    qty: record.qty,
    unitPrice: record.unitPrice,
    extras: record.extras.map((extra) => extra.amount),
    isCancelled: record.isCancelled,
  };
}

/**
 * 08 Cash spent: every purchase and extra cost of the order with payment type Cash that is not
 * cancelled. A record's goods count when its trip is Cash; each extra counts by its own payment
 * type, so a Transfer trip with a Cash delivery counts the delivery only (decided item 2).
 */
export function cashSpent(records: readonly CashRecord[]): bigint {
  // Every record is checked first, as liveRecords() does, so a broken row is never hidden.
  liveRecords(records.map(asPurchaseRecord));
  const live = records.filter((record) => !record.isCancelled);
  const goods = actualGoods(
    live.filter((record) => record.paymentType === "CASH").map(asPurchaseRecord),
  );
  const extras = extrasSum(
    live.flatMap((record) =>
      record.extras.filter((extra) => extra.paymentType === "CASH").map((extra) => extra.amount),
    ),
  );
  return goods + extras;
}

/**
 * 08 Order's cash count: cash given + paid back − cash returned − cash spent, over the rows of
 * actions that are not cancelled and the records that are not cancelled. Bank transfer, Card
 * top-up and Card money returned never change it. Above 0 the Manager holds school money; below 0
 * he is owed; it must be 0 before the order can close.
 */
export function orderCashCount(rows: readonly MoneyRow[], records: readonly CashRecord[]): bigint {
  let count = 0n;
  for (const row of rows) {
    const amount = amountOf(row.amount);
    if (!row.isCancelled) count += COUNT_SIGN[row.kind] * amount;
  }
  return count - cashSpent(records);
}

/** 08 Manager's cash balance: two numbers, never netted. `owed` is a positive amount. */
export type CashBalance = { held: bigint; owed: bigint };

/**
 * 08 Manager's cash balance over his orders: held is the sum of the positive counts of the orders
 * that are not Closed, owed the sum of the negative ones without the minus sign (decided item 7).
 */
export function managerCashBalance(
  orders: readonly { status: RequestStatus; cashCount: bigint }[],
): CashBalance {
  let held = 0n;
  let owed = 0n;
  for (const order of orders) {
    if (order.status === "CLOSED") continue;
    if (order.cashCount > 0n) held += order.cashCount;
    else owed -= order.cashCount;
  }
  return { held, owed };
}

/** One order as exact match reads it. `cashCount` is `orderCashCount()` of the order. */
export type MatchOrder = {
  status: RequestStatus;
  progress: OrderProgress;
  /** The ordered subtype. */
  variantId: string;
  plan: OrderPlan;
  records: readonly CashRecord[];
  cashCount: bigint;
};

/**
 * 08 Exact match: Number and Price green (`orderColours()`, so an order whose buying is Open never
 * matches), actual extra costs equal planned (the sums), the subtype not substituted
 * (`isSubstituted()`), the payment type the planned one (every live record's trip and every extra
 * of it: decided item 1, Look first), and the cash count 0. Differences that cancel each other out
 * do not match.
 */
export function isExactMatch(order: MatchOrder): boolean {
  const records = order.records.map(asPurchaseRecord);
  const colours = orderColours({
    status: order.status,
    progress: order.progress,
    plan: order.plan,
    records,
  });
  if (colours === null) return false;
  if (colours.number.colour !== "green" || colours.price.colour !== "green") return false;
  if (actualExtra(records) !== orderExtras(order.plan)) return false;
  if (isSubstituted(order.variantId, order.records)) return false;
  const planned = order.plan.paymentType;
  const samePayment = order.records
    .filter((record) => !record.isCancelled)
    .every(
      (record) =>
        record.paymentType === planned &&
        record.extras.every((extra) => extra.paymentType === planned),
    );
  return samePayment && order.cashCount === 0n;
}

/** 08 When Finance approves: an order's planned cash, its planned total when it is Cash, else 0. */
export function plannedCash(plan: OrderPlan): bigint {
  return plannedCashOf(plan.paymentType, orderTotal(plan));
}

/**
 * The same from an order's payment type and planned total, for the Finance dialog, whose selects
 * may change the type (plan of 4.2, decided item 6, Look first).
 */
export function plannedCashOf(paymentType: PaymentType, plannedTotal: bigint): bigint {
  return paymentType === "CASH" ? plannedTotal : 0n;
}

/** 08 Money ledger: "The action's total is the sum of its rows." */
export function actionTotal(rows: readonly { amount: bigint }[]): bigint {
  return rows.reduce((sum, row) => sum + row.amount, 0n);
}

/** One Manager's block of the approval's table "Cash given to the Manager now". */
export type CashBlock = { managerId: string; rows: { orderId: string; amount: bigint }[] };

/**
 * 08 When Finance approves: the cash each Manager is given, one block per Manager (08 Money
 * ledger 1), blocks and rows in the order the orders are given (4.1 decided item 11). An amount is
 * the prefill (`plannedCashOf()`) or what Finance typed; "rows of 0 write nothing", so a row of 0
 * and a block of only such rows are dropped (plan of 4.2, decided item 6, Look first). What is
 * written and the result line's count of Managers come from here; the dialog's own rows do not,
 * so a row set to 0 stays on the screen (review of the plan, correction 1).
 */
export function approvalCashRows(
  orders: readonly { id: string; ownerId: string; amount: bigint }[],
): CashBlock[] {
  const blocks = new Map<string, CashBlock>();
  for (const order of orders) {
    if (order.amount === 0n) continue;
    const amount = amountOf(order.amount);
    let block = blocks.get(order.ownerId);
    if (block === undefined) {
      block = { managerId: order.ownerId, rows: [] };
      blocks.set(order.ownerId, block);
    }
    block.rows.push({ orderId: order.id, amount });
  }
  return [...blocks.values()];
}

/** A settlement row: Receive is kind Cash returned, Pay is kind Paid back (08 Closing 2). */
export type SettlementRow = {
  orderId: string;
  kind: "CASH_RETURNED" | "PAID_BACK";
  amount: bigint;
};

/**
 * 08 Closing 2, the Cash block: a Receive row for each order whose count is above 0 and a Pay row
 * for each order below 0, prefilled with the count; an order at 0 gets none.
 */
export function settlementRows(
  orders: readonly { id: string; cashCount: bigint }[],
): SettlementRow[] {
  const rows: SettlementRow[] = [];
  for (const order of orders) {
    if (order.cashCount > 0n) {
      rows.push({ orderId: order.id, kind: "CASH_RETURNED", amount: order.cashCount });
    } else if (order.cashCount < 0n) {
      rows.push({ orderId: order.id, kind: "PAID_BACK", amount: -order.cashCount });
    }
  }
  return rows;
}

/** Why a row would cross over (08 Money ledger 3). */
export type CrossingRefusal = "ABOVE_COUNT" | "ABOVE_OWED";

/**
 * 08 Money ledger 3, no crossing over, against the order's count before the action (one row per
 * order: decided items 3 and 6, Look first): Cash returned at most the count, Paid back at most
 * what the school owes (the count without the minus sign). The other kinds have no limit.
 */
export function crossingRefusal(
  cashCount: bigint,
  row: { kind: MoneyRowKind; amount: bigint },
): CrossingRefusal | null {
  const amount = amountOf(row.amount);
  if (row.kind === "CASH_RETURNED" && amount > cashCount) return "ABOVE_COUNT";
  if (row.kind === "PAID_BACK" && amount > -cashCount) return "ABOVE_OWED";
  return null;
}

/** Who hands whom the net of a settlement action, and how much (a positive amount, or 0). */
export type SettlementNet =
  | { direction: "TO_FINANCE"; amount: bigint }
  | { direction: "TO_MANAGER"; amount: bigint }
  | { direction: "NONE"; amount: 0n };

/**
 * 08 Money ledger 2: the net of a settlement action, Paid back − Cash returned. Below 0 "the
 * Manager hands Finance", above 0 "Finance pays the Manager" (decided item 8).
 */
export function settlementNet(rows: readonly SettlementRow[]): SettlementNet {
  let net = 0n;
  for (const row of rows) {
    const amount = amountOf(row.amount);
    net += row.kind === "PAID_BACK" ? amount : -amount;
  }
  if (net < 0n) return { direction: "TO_FINANCE", amount: -net };
  if (net > 0n) return { direction: "TO_MANAGER", amount: net };
  return { direction: "NONE", amount: 0n };
}

/**
 * Money can be recorded on an order (08 Money ledger; When Finance approves: "Finance can add more
 * actions at any time while the orders are Open"; Closing 2 records money in settlement): Open or
 * Waiting for settlement. An order before Open has no approval yet; a Closed one is settled and
 * changes only after the Head reopens it (plan of 4.3, decided item 1, Look first). The screen asks
 * this for its buttons, the action asks it again (review of the plan, correction 1).
 */
export function moneyRecordAllows(status: RequestStatus): boolean {
  return status === "PURCHASING" || status === "SETTLEMENT";
}

/**
 * A money action can be cancelled (08 Money ledger: "cancelled whole, with a reason, while none of
 * its orders is Closed … the Head reopens that order first"): it is not cancelled yet, since the
 * cancel is one update that is never repeated (Decided ahead, question 3), and none of its orders
 * is Closed. Asked by the screen and by the action (review of the plan, correction 1).
 */
export function moneyCancelAllows(
  action: { isCancelled: boolean },
  statuses: readonly RequestStatus[],
): boolean {
  return !action.isCancelled && statuses.every((status) => status !== "CLOSED");
}

/**
 * The prefilled amount of one order's row in a Money tab action of `kind` (08 Closing 2; edge
 * cases "Finance gives cash for several orders"; D43; plan of 4.3, decided item 2, Look first):
 * Cash given is the order's planned cash, whatever was given before; Cash returned is the count
 * when the Manager holds money, Paid back the count without its minus when he is owed, as
 * `settlementRows()` prefills them; the three information kinds have no amount in section 8. `null`
 * is an empty row.
 */
export function moneyPrefill(
  kind: MoneyRowKind,
  order: { plannedCash: bigint; cashCount: bigint },
): bigint | null {
  if (kind === "CASH_GIVEN") return order.plannedCash > 0n ? order.plannedCash : null;
  if (kind === "CASH_RETURNED" || kind === "PAID_BACK") {
    const [row] = settlementRows([{ id: "", cashCount: order.cashCount }]);
    return row?.kind === kind ? row.amount : null;
  }
  return null;
}
