// The money ledger of an order and of a Manager (08-money-and-settlement.md, Money ledger; Exact
// match; When Finance approves; Closing 2; plan of 4.1). Every screen, file and action that shows
// or writes a cash count, a balance, a prefilled row or a settlement's net calls this module: the
// formula lives once (developer-rules.md rule 1).
//
// Money is whole so'm in bigint; goods are `actualGoods()` of ./purchases.ts, rounded half up there
// (developer-rules.md rule 6). Nothing here reads a database or a clock.

import { orderColours } from "./colours";
import {
  type OrderPlan,
  type PricedPlan,
  extrasSum,
  orderExtras,
  orderTotal,
} from "./order-totals";
import type { PaymentType } from "./payment-types";
import {
  type OrderProgress,
  type PurchaseRecord,
  actualExtra,
  actualGoods,
  actualTotal,
  isSubstituted,
  liveRecords,
} from "./purchases";
import type { RequestStatus } from "./request-status";
import { type GuardSettings, type Overspend, overspend } from "./overspend";

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
 * What an order's live records paid by one payment type: the goods of records whose trip is that
 * type and every extra of that type (decided item 2, Look first). Cash spent, the transfer's
 * "value of goods received" and the card's "actually charged" of 08 Closing 2 (plan of 4.5).
 */
export function paidBy(records: readonly CashRecord[], type: PaymentType): bigint {
  // Every record is checked first, as liveRecords() does, so a broken row is never hidden.
  liveRecords(records.map(asPurchaseRecord));
  const live = records.filter((record) => !record.isCancelled);
  const goods = actualGoods(
    live.filter((record) => record.paymentType === type).map(asPurchaseRecord),
  );
  const extras = extrasSum(
    live.flatMap((record) =>
      record.extras.filter((extra) => extra.paymentType === type).map((extra) => extra.amount),
    ),
  );
  return goods + extras;
}

/**
 * 08 Cash spent: every purchase and extra cost of the order with payment type Cash that is not
 * cancelled. A record's goods count when its trip is Cash; each extra counts by its own payment
 * type, so a Transfer trip with a Cash delivery counts the delivery only (decided item 2).
 */
export function cashSpent(records: readonly CashRecord[]): bigint {
  return paidBy(records, "CASH");
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

/** A money row with its action's business date, `YYYY-MM-DD` in Tashkent. */
export type DatedMoneyRow = { row: MoneyRow; occurredOn: string };
/** A purchase record with its trip's business date, `YYYY-MM-DD` in Tashkent. */
export type DatedCashRecord = { record: CashRecord; purchasedOn: string };

/**
 * 08 Money with managers, "the date since when", of one order: the oldest date among its live
 * movements that change the cash count (a row of a kind that moves it, of an action not
 * cancelled; a live record whose `cashSpent()` is above 0, by its trip's date). The order's first
 * cash movement (plan of 4.9, decided item 2, Look first). Null when nothing changes the count.
 */
export function cashSince(
  rows: readonly DatedMoneyRow[],
  records: readonly DatedCashRecord[],
): string | null {
  const dates = [
    ...rows
      .filter(({ row }) => !row.isCancelled && COUNT_SIGN[row.kind] !== 0n)
      .map((each) => each.occurredOn),
    ...records
      .filter(({ record }) => !record.isCancelled && cashSpent([record]) > 0n)
      .map((each) => each.purchasedOn),
  ];
  // `YYYY-MM-DD` sorts as text.
  return dates.reduce<string | null>(
    (oldest, date) => (oldest && oldest <= date ? oldest : date),
    null,
  );
}

/** One counted order as the page Money with managers reads it. */
export type ManagerOrder = {
  id: string;
  number: string;
  ownerId: string;
  ownerName: string;
  status: RequestStatus;
  /** `orderCashCount()` of the order. */
  cashCount: bigint;
  /** `cashSince()` of the order. */
  since: string;
};

/** One owner's block: the balance, its date and the orders behind it. */
export type ManagerBlock<T extends ManagerOrder> = CashBalance & {
  ownerId: string;
  ownerName: string;
  since: string;
  orders: T[];
};

const bySince = (a: { since: string }, b: { since: string }) =>
  a.since < b.since ? -1 : a.since > b.since ? 1 : 0;

/**
 * 08 Money with managers: every owner's cash balance, held and owed apart (`managerCashBalance()`),
 * the oldest since date of the orders behind it, oldest first (ties by name, then id). An order
 * whose count is 0 is behind no balance. Owners are grouped whatever their role: the Head can own
 * an order (review of the plan of 4.9, correction 1). Pass only orders of the viewer's branches.
 */
export function managerBalances<T extends ManagerOrder>(orders: readonly T[]): ManagerBlock<T>[] {
  const byOwner = new Map<string, T[]>();
  for (const order of orders) {
    if (order.cashCount === 0n) continue;
    const list = byOwner.get(order.ownerId) ?? [];
    list.push(order);
    byOwner.set(order.ownerId, list);
  }
  const blocks: ManagerBlock<T>[] = [];
  for (const [ownerId, list] of byOwner) {
    const balance = managerCashBalance(list);
    // Closed is left out by managerCashBalance() only; the query reads no Closed order.
    const behind = [...list].sort(
      (a, b) => bySince(a, b) || (a.number < b.number ? -1 : a.number > b.number ? 1 : 0),
    );
    const first = behind[0];
    if (!first) continue;
    blocks.push({
      ...balance,
      ownerId,
      ownerName: first.ownerName,
      since: first.since,
      orders: behind,
    });
  }
  return blocks.sort(
    (a, b) =>
      bySince(a, b) ||
      a.ownerName.localeCompare(b.ownerName) ||
      (a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : 0),
  );
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

/**
 * 08 When Finance approves: an order's planned cash, its planned total when it is Cash, else 0;
 * null only for a Cash order without a planned price, which has no planned total (08 Numbers; plan
 * of 2.5d-b, decided item 9, Look first). A Bank transfer or Card order is 0 with or without a
 * price ("else 0"; review of 2.5d-c, finding 2, Look first): the cash sums leave out, and count,
 * only the orders they would have held.
 */
export function plannedCash(plan: PricedPlan): bigint;
export function plannedCash(plan: OrderPlan): bigint | null;
export function plannedCash(plan: OrderPlan): bigint | null {
  return plannedCashOf(plan.paymentType, orderTotal(plan));
}

/**
 * The same from an order's payment type and planned total, for the Finance dialog, whose selects
 * may change the type (plan of 4.2, decided item 6, Look first). Null for a Cash order without a
 * planned total; 0 for any other type.
 */
export function plannedCashOf(paymentType: PaymentType, plannedTotal: bigint): bigint;
export function plannedCashOf(paymentType: PaymentType, plannedTotal: bigint | null): bigint | null;
export function plannedCashOf(
  paymentType: PaymentType,
  plannedTotal: bigint | null,
): bigint | null {
  if (paymentType !== "CASH") return 0n;
  return plannedTotal;
}

/**
 * The cash handed to the Manager on an order so far: cash given + paid back − cash returned, over
 * the rows whose action is not cancelled (08 Money ledger table, the rows that move the count;
 * plan of 6.6a, decided item 4, Look first). Bank transfer and card rows hand nothing.
 */
export function cashHanded(rows: readonly MoneyRow[]): bigint {
  return rows
    .filter((row) => !row.isCancelled)
    .reduce((sum, row) => sum + COUNT_SIGN[row.kind] * row.amount, 0n);
}

/** The statuses of "orders still in approval" (10 Finance, Cash needed soon; 06 Statuses). */
export const APPROVAL_STATUSES = [
  "PENDING_HEAD",
  "PENDING_PRINCIPAL",
  "PENDING_FINANCE",
] as const satisfies readonly RequestStatus[];

/**
 * An order's part of Finance's "Cash needed soon" (10 Finance: "Planned cash of approved orders
 * not yet paid, plus orders still in approval"; plan of 6.6a, decided items 4 and 5, Look first):
 * an order waiting at Head, Principal or Finance needs its whole planned cash; an Open order whose
 * buying is still Open needs its planned cash less what was handed, never below 0; any other order
 * (Returned, buying finished, Settlement and on) needs nothing. An order that skipped Finance has
 * no cash count and needs nothing (06 Finance step switched off 2; plan of 4.10c, decided item 5,
 * Look first); an order still in approval keeps its planned cash, whatever the step.
 *
 * Null for the one order the cash sum leaves out for lack of a price: a Cash order without a
 * planned total (`plannedCashOf()` gives null only then) that did not skip Finance, in approval or
 * Open with its buying Open. The sum says how many such orders it leaves out (08 Numbers: "a sum
 * that leaves orders out says how many"; review of 2.5d-c at bad1f3f, finding 1, Look first), and
 * this is the only place that decides which.
 */
export function cashNeeded(order: {
  status: RequestStatus;
  progress: OrderProgress;
  /** Null for an order without a planned price: no planned cash, so its need is not known. */
  plannedCash: bigint | null;
  handed: bigint;
  skippedFinance?: boolean;
}): bigint | null {
  if (order.skippedFinance) return 0n;
  const inApproval = (APPROVAL_STATUSES as readonly RequestStatus[]).includes(order.status);
  if (!inApproval && (order.status !== "PURCHASING" || order.progress !== "OPEN")) return 0n;
  if (order.plannedCash === null) return null;
  if (inApproval) return order.plannedCash;
  return cashNotYetGiven(order.plannedCash, order.handed);
}

/**
 * An order's planned cash not yet in its Manager's hands: the planned cash less `cashHanded()`,
 * never below 0 (08 When Finance approves: "a later Cash given row is prefilled with the order's
 * planned cash not yet given, never below 0"). One formula for the Money tab's prefill and Cash
 * needed soon (plan of 4.10b, decided item 7, Look first).
 */
export function cashNotYetGiven(plannedCash: bigint, handed: bigint): bigint {
  const rest = plannedCash - handed;
  return rest > 0n ? rest : 0n;
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
 * this for its buttons, the action asks it again (review of the plan, correction 1). Never on an
 * order that skipped Finance: "no money action has a row on it" (06 Finance step switched off 2;
 * plan of 4.10c).
 */
export function moneyRecordAllows(status: RequestStatus, skippedFinance: boolean): boolean {
  if (skippedFinance) return false;
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
 * The prefilled amount of one order's row in a Money tab action of `kind` (08 When Finance
 * approves; 08 Closing 2; edge cases "Finance gives cash for several orders"; D55 (1); plan of
 * 4.10b, decided items 1 and 2, Look first): Cash given is the order's planned cash not yet given
 * (`cashNotYetGiven()`, 0 when all of it is), empty for an order with no planned cash; Cash returned is the count
 * when the Manager holds money, Paid back the count without its minus when he is owed, as
 * `settlementRows()` prefills them; the three information kinds have no amount in section 8. `null`
 * is an empty row.
 */
export function moneyPrefill(
  kind: MoneyRowKind,
  order: { plannedCash: bigint; cashCount: bigint; handed: bigint },
): bigint | null {
  if (kind === "CASH_GIVEN") {
    return order.plannedCash > 0n ? cashNotYetGiven(order.plannedCash, order.handed) : null;
  }
  if (kind === "CASH_RETURNED" || kind === "PAID_BACK") {
    const [row] = settlementRows([{ id: "", cashCount: order.cashCount }]);
    return row?.kind === kind ? row.amount : null;
  }
  return null;
}

/**
 * The settlement screen and its actions work on orders Waiting for settlement only (06 Allowed
 * moves: Send back for correction and Close start there; 08 Closing 2; plan of 4.5). The bar and
 * the screen ask this for their buttons; the actions ask it again.
 */
export function settlementAllows(status: RequestStatus): boolean {
  return status === "SETTLEMENT";
}

/** Sums the live rows of the kinds given. */
function liveSum(rows: readonly MoneyRow[], kinds: readonly MoneyRowKind[]): bigint {
  let sum = 0n;
  for (const row of rows) {
    const amount = amountOf(row.amount);
    if (!row.isCancelled && kinds.includes(row.kind)) sum += amount;
  }
  return sum;
}

const CASH_KINDS: readonly MoneyRowKind[] = ["CASH_GIVEN", "CASH_RETURNED", "PAID_BACK"];

/** 08 Closing 2, the Cash block: given, spent, returned, paid back and the count, per order. */
export type CashBlockFigures = {
  given: bigint;
  spent: bigint;
  returned: bigint;
  paidBack: bigint;
  count: bigint;
};
/** 08 Closing 2, the Bank transfer block: planned, transferred, value of goods received. */
export type TransferBlockFigures = { planned: bigint; transferred: bigint; received: bigint };
/**
 * 08 Closing 2, the Corporate card block: planned, actually charged, and the difference
 * (planned − charged: above 0 "Left", below 0 "Over"; A11: the order's figure, not the card's
 * balance), and the Card money returned rows.
 */
export type CardBlockFigures = {
  planned: bigint;
  charged: bigint;
  difference: bigint;
  returned: bigint;
};
/** The blocks of one order; a block is null when its payment type was not used. */
export type SettlementBlocks = {
  cash: CashBlockFigures | null;
  transfer: TransferBlockFigures | null;
  card: CardBlockFigures | null;
};

/** Whether a live record (its trip) or a live extra of it used the payment type. */
function recordsUse(records: readonly CashRecord[], type: PaymentType): boolean {
  return records.some(
    (record) =>
      !record.isCancelled &&
      (record.paymentType === type || record.extras.some((extra) => extra.paymentType === type)),
  );
}

/** Whether a live row of one of the kinds exists. */
function rowsUse(rows: readonly MoneyRow[], kinds: readonly MoneyRowKind[]): boolean {
  return rows.some((row) => !row.isCancelled && kinds.includes(row.kind));
}

/**
 * 08 Closing 2: "a block for each payment type that was used", with its figures. A type is used
 * when a live record (its trip) or extra paid by it, or a live money row of its kinds exists
 * (Cash: given, returned, paid back; Transfer: bank transfer; Card: top-up, card returned); a type
 * only planned has no block (plan of 4.5, decided item 5, Look first). "Planned" of the transfer
 * and the card is the planned total when the order's planned type is that type, else 0.
 */
export function settlementBlocks(order: {
  plan: OrderPlan;
  records: readonly CashRecord[];
  rows: readonly MoneyRow[];
}): SettlementBlocks {
  const { plan, records, rows } = order;
  const plannedTotal = orderTotal(plan);
  // An order without a planned price never reaches settlement (06 Finance step switched off 8;
  // `orders_priced_finance_check` of 0056).
  if (plannedTotal === null) throw new RangeError("An order in settlement has no planned price.");
  const plannedOf = (type: PaymentType) => (plan.paymentType === type ? plannedTotal : 0n);
  const cash =
    recordsUse(records, "CASH") || rowsUse(rows, CASH_KINDS)
      ? {
          given: liveSum(rows, ["CASH_GIVEN"]),
          spent: cashSpent(records),
          returned: liveSum(rows, ["CASH_RETURNED"]),
          paidBack: liveSum(rows, ["PAID_BACK"]),
          count: orderCashCount(rows, records),
        }
      : null;
  const transfer =
    recordsUse(records, "TRANSFER") || rowsUse(rows, ["BANK_TRANSFER"])
      ? {
          planned: plannedOf("TRANSFER"),
          transferred: liveSum(rows, ["BANK_TRANSFER"]),
          received: paidBy(records, "TRANSFER"),
        }
      : null;
  let card: CardBlockFigures | null = null;
  if (recordsUse(records, "CARD") || rowsUse(rows, ["CARD_TOPUP", "CARD_RETURNED"])) {
    const planned = plannedOf("CARD");
    const charged = paidBy(records, "CARD");
    card = {
      planned,
      charged,
      difference: planned - charged,
      returned: liveSum(rows, ["CARD_RETURNED"]),
    };
  }
  return { cash, transfer, card };
}

/** 08 Closing 2, Bank transfer: "If transferred and received differ, a note is required". */
export function transferNeedsNote(block: TransferBlockFigures): boolean {
  return block.transferred !== block.received;
}

/** One order's stored confirmations (14 order_settlements); null when none was ever written. */
export type SettlementConfirmations = {
  transferConfirmed: boolean;
  transferNote: string | null;
  cardConfirmed: boolean;
  /** The Head's "Acknowledge overspend" is given (14 order_settlements.overspend_ack_at). */
  overspendAcknowledged: boolean;
};

/**
 * Whether a block is confirmed (08 Closing 2; plan of 4.5, decided item 9, Look first): the card
 * when ticked; the transfer when ticked and, while transferred and received differ, a note is
 * stored. The figures are today's, so a Bank transfer recorded or cancelled after the tick turns
 * a mismatch without a note back to "not confirmed". The screen shows this; 4.6's readiness reads
 * it too.
 */
export function blockConfirmed(
  block: "TRANSFER" | "CARD",
  blocks: SettlementBlocks,
  stored: SettlementConfirmations | null,
): boolean {
  if (block === "CARD") return blocks.card !== null && stored?.cardConfirmed === true;
  if (blocks.transfer === null || stored?.transferConfirmed !== true) return false;
  return !transferNeedsNote(blocks.transfer) || (stored.transferNote ?? "").trim() !== "";
}

/** One Manager's part of a settlement action: his Receive and Pay rows above 0. */
export type SettlementCashBlock = { managerId: string; rows: SettlementRow[] };

/**
 * 08 Closing 2, the Cash block as Finance saves it: the typed Receive and Pay rows, one block per
 * Manager (08 Money ledger 1), blocks and rows in the order given. Rows of 0 write nothing and a
 * Manager with nothing left gets no action (as `approvalCashRows()`; review of the plan of 4.5,
 * Should fix 2). The crossing check is `crossingRefusal()`, against the counts under the lock.
 */
export function settlementCashRows(
  orders: readonly { id: string; ownerId: string; kind: SettlementRow["kind"]; amount: bigint }[],
): SettlementCashBlock[] {
  const blocks = new Map<string, SettlementCashBlock>();
  for (const order of orders) {
    if (order.amount === 0n) continue;
    const amount = amountOf(order.amount);
    let block = blocks.get(order.ownerId);
    if (block === undefined) {
      block = { managerId: order.ownerId, rows: [] };
      blocks.set(order.ownerId, block);
    }
    block.rows.push({ orderId: order.id, kind: order.kind, amount });
  }
  return [...blocks.values()];
}

/**
 * 08 Overspend guard of one order: `overspend()` of ./overspend.ts over its planned total
 * (`orderTotal()`) and its actual total (`actualTotal()` of ./purchases.ts over the live records),
 * never a second sum (review of the plan of 4.6, correction 1). The settlement screen's line reads
 * its `over` and `percent` (plan of 4.7). An order without a planned price has none: it is left
 * out of the overspend guard (08 Numbers; plan of 2.5d-b, decided item 5, Look first).
 */
export function orderOverspend(
  order: { plan: OrderPlan; records: readonly CashRecord[] },
  guard: GuardSettings,
): Overspend {
  const planned = orderTotal(order.plan);
  if (planned === null) return { over: 0n, percent: null, needsHead: false };
  return overspend(planned, actualTotal(order.records.map(asPurchaseRecord)), guard);
}

/**
 * 08 Overspend guard: the order is above the guard and the Head has not acknowledged it yet, so
 * Finance cannot close it and the Head's "Acknowledge overspend" applies (plan of 4.7, decided
 * item 3, Look first). The one rule the button, the notices, the settlement line and
 * `readyToClose()` read.
 */
export function overspendNeedsAck(
  order: {
    plan: OrderPlan;
    records: readonly CashRecord[];
    stored: SettlementConfirmations | null;
  },
  guard: GuardSettings,
): boolean {
  return orderOverspend(order, guard).needsHead && order.stored?.overspendAcknowledged !== true;
}

/**
 * 08 Closing 3: whether Finance may close the order: its cash count is 0, every block that
 * `settlementBlocks()` returns for a used payment type is confirmed (`blockConfirmed()`; the Cash
 * block by its count), and, when the order is above the overspend guard, the Head has acknowledged
 * it (08 Overspend guard: "before Finance can close it"; plan of 4.6, decided items 1 and 2, Look
 * first). The actual total is `actualTotal()` of ./purchases.ts over the records, never a second
 * sum (review of the plan of 4.6, correction 1).
 */
export function readyToClose(
  order: {
    plan: OrderPlan;
    records: readonly CashRecord[];
    blocks: SettlementBlocks;
    stored: SettlementConfirmations | null;
  },
  guard: GuardSettings,
): boolean {
  const { blocks, stored } = order;
  if ((blocks.cash?.count ?? 0n) !== 0n) return false;
  if (blocks.transfer !== null && !blockConfirmed("TRANSFER", blocks, stored)) return false;
  if (blocks.card !== null && !blockConfirmed("CARD", blocks, stored)) return false;
  return !overspendNeedsAck(order, guard);
}
