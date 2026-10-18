import { sql } from "drizzle-orm";

import { quantityRefusal } from "@/domain/drafts";
import { type MovementType, nextBalance } from "@/domain/stock";

import { ActionError } from "./action";
import type { Executor } from "./authorize";
import { now } from "./clock";

// The one way stock changes (09-warehouse.md, first paragraph: "its stock is the sum of every
// movement ever recorded for that branch"; 14-data-model.md, Notes for the build, first bullet:
// the balance is kept in step with the movements inside the same transaction; plan of 3.1).
// Every receipt, issue, return, transfer, write-off, correction, direct entry and reversal of
// later tasks calls postMovement() or postMovements() inside its own action's transaction; the
// caller has already authorized its action (developer-rules.md rule 4). The arithmetic is
// nextBalance() of src/domain/stock.ts.
//
// Locks, in this order: the product row FOR SHARE (decisions 1.7 item 1: a change of type or
// measure takes it FOR UPDATE, so it cannot pass a first use), then the balance row FOR UPDATE.
// They rely on READ COMMITTED, the isolation of the action wrapper's transaction: the second of
// two first movements waits on the first's insert of the balance row, then its FOR UPDATE reads
// the committed row. Under REPEATABLE READ (src/server/read-snapshot.ts) the FOR UPDATE after a
// concurrent insert or update ends in a serialization failure instead of waiting, so a stock
// write never runs in a read snapshot (review of the plan of 3.1, correction 1).
//
// The caller's contract (permission review of 3.1): `branchId` comes from the record the caller
// locked (its document, purchase or order), never from the input; `createdBy` is the wrapper's
// `userId`, as for audit(). Each type is posted only by the action of its matrix row
// (03-roles-and-permissions.md): DIRECT_ENTRY by the Head alone; WRITE_OFF and CORRECTION only
// after the Head approves; ISSUE under ISSUE_STOCK; RETURN and REVERSAL under RETURN_REVERSE (a
// cancelled purchase under CANCEL_PURCHASES); TRANSFER_OUT under TRANSFER_STOCK, its TRANSFER_IN
// in the receiving branch; RECEIPT under RECORD_PURCHASES. A StockShortError's `available` is
// shown only for a branch the actor may see. A reversal's match to the movement it reverses is
// checked by its task (3.7 for a cancelled purchase); a document's reversal takes them from the
// movement it reverses (reverseDocument() of ./stock-documents.ts, 5.1).

export type PostedMovementInput = {
  branchId: string;
  variantId: string;
  type: MovementType;
  /** Signed numeric(14,3) text: "5" in, "-2.5" out; never 0. */
  qtyDelta: string;
  /** Whole so'm for a priced movement, `null` for one at the average (src/domain/stock.ts). */
  unitCost: bigint | null;
  /** A RETURN's cost into an empty stock (src/domain/stock.ts; plan of 5.6, decided item 1). */
  emptyCost?: bigint;
  createdBy: string;
  purchaseId?: string | null;
  documentLineId?: string | null;
  reversesMovementId?: string | null;
};

export type PostedMovement = {
  movementId: string;
  /** The stock after the movement, its `balance_after`. */
  qty: string;
  avgCost: bigint;
};

/**
 * The movement would take the stock below 0 (09, first paragraph; Issue to a department, rule 1:
 * the server "names the item and the available amount if it fails"). A refusal of the action
 * (`conflict`) that carries what the screen names (plan of 3.1, decided item 8).
 */
export class StockShortError extends ActionError {
  constructor(
    readonly branchId: string,
    readonly variantId: string,
    readonly available: string,
  ) {
    super("conflict");
    this.name = "StockShortError";
  }
}

type ProductRow = { type: "GOODS" | "SERVICE"; allow_decimal: boolean };
type BalanceRow = { qty: string; avg_cost: string };

/** Posts one movement and keeps its branch's balance in step (plan of 3.1). */
export async function postMovement(
  tx: Executor,
  movement: PostedMovementInput,
): Promise<PostedMovement> {
  const product = await tx.execute<ProductRow>(sql`
    select p.type, u.allow_decimal
    from product_variants v
    join products p on p.id = v.product_id
    join units u on u.id = p.unit_id
    where v.id = ${movement.variantId}
    for share of p`);
  const found = product.rows[0];
  if (!found) throw new ActionError("not_found");
  // 09, first paragraph: "Services are not stocked" (decided item 7).
  if (found.type === "SERVICE") {
    throw new ActionError("invalid_input", { qty: "errors.field.notAllowed" });
  }
  // .claude/rules/warehouse.md: "Quantities follow the measure" (decided item 7).
  const refusal = quantityRefusal(movement.qtyDelta.replace(/^-/, ""), found.allow_decimal);
  if (refusal) throw new ActionError("invalid_input", { qty: `errors.field.${refusal}` });

  const moment = now();
  let held = await lockBalance(tx, movement);
  if (!held) {
    // The first movement of a subtype in a branch makes its balance row; a second first movement
    // at the same moment waits here on the primary key, then locks the committed row (decided
    // item 9).
    await tx.execute(sql`
      insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
      values (${movement.branchId}, ${movement.variantId}, 0, 0, ${moment}, ${moment})
      on conflict do nothing`);
    held = (await lockBalance(tx, movement))!;
  }

  const next = nextBalance(
    { qty: held.qty, avgCost: BigInt(held.avg_cost) },
    {
      type: movement.type,
      qtyDelta: movement.qtyDelta,
      unitCost: movement.unitCost,
      ...(movement.emptyCost === undefined ? {} : { emptyCost: movement.emptyCost }),
    },
  );
  if (!next.ok) throw new StockShortError(movement.branchId, movement.variantId, next.available);

  const inserted = await tx.execute<{ id: string }>(sql`
    insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost, balance_after,
      purchase_id, document_line_id, reverses_movement_id, created_by, created_at)
    values (${movement.branchId}, ${movement.variantId}, ${movement.type}, ${movement.qtyDelta},
      ${next.unitCost.toString()}, ${next.qty}, ${movement.purchaseId ?? null},
      ${movement.documentLineId ?? null}, ${movement.reversesMovementId ?? null},
      ${movement.createdBy}, ${moment})
    returning id`);
  await tx.execute(sql`
    update stock_balances
    set qty = ${next.qty}, avg_cost = ${next.avgCost.toString()}, updated_at = ${moment}
    where branch_id = ${movement.branchId} and variant_id = ${movement.variantId}`);

  return { movementId: inserted.rows[0]!.id, qty: next.qty, avgCost: next.avgCost };
}

/**
 * The balance row FOR UPDATE, or null when there is none yet. An existing row is locked here
 * before anything writes it, so this lock alone puts two movements of it one after the other.
 */
async function lockBalance(
  tx: Executor,
  movement: PostedMovementInput,
): Promise<BalanceRow | null> {
  const balance = await tx.execute<BalanceRow>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${movement.branchId} and variant_id = ${movement.variantId}
    for update`);
  return balance.rows[0] ?? null;
}

/**
 * Posts the lines of one document in a fixed order, by branch and then subtype, so two documents
 * with the same items in another order cannot deadlock on their balance rows (plan of 3.1, review
 * remark: the same reason as the fixed lock order of decisions 2.4 item 10). Returns the results
 * in the order the movements were given.
 */
export async function postMovements(
  tx: Executor,
  movements: readonly PostedMovementInput[],
): Promise<PostedMovement[]> {
  const order = movements
    .map((movement, index) => ({ movement, index }))
    .sort(
      (a, b) =>
        compare(a.movement.branchId, b.movement.branchId) ||
        compare(a.movement.variantId, b.movement.variantId) ||
        a.index - b.index,
    );
  const results: PostedMovement[] = new Array<PostedMovement>(movements.length);
  for (const { movement, index } of order) results[index] = await postMovement(tx, movement);
  return results;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
