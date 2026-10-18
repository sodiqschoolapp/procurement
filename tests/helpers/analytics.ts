import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { MoneyRowKind } from "@/domain/money-ledger";
import type { OrderAction } from "@/domain/order-moves";
import type { PaymentType } from "@/domain/payment-types";
import type { RequestStatus } from "@/domain/request-status";
import type { OrderProgress } from "@/domain/purchases";
import { db } from "@/server/db/client";
import { refreshAnalytics } from "@/server/jobs/analytics-refresh";
import { createDocument, reverseDocument } from "@/server/stock-documents";

import { insertBranch } from "./branches";
import { insertCategory, insertCompany, insertProduct, insertUnit } from "./catalog";
import { insertDepartment, insertExtraCostType, insertOrder } from "./orders";
import { receive } from "./stock-documents";
import { insertUser } from "./users";

// Purchase records written straight into the tables for the analytics tests (build-plan 6.3), and
// the refresh the scheduler runs every 5 minutes, run here at once.

const AT = "2031-05-02T05:00:00Z";

/** A branch (or the one given) with a Manager, a department, a category and a supplier. */
export async function spendingScene(branchId?: string) {
  const branch = branchId ? { id: branchId } : await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const category = await insertCategory();
  const supplier = await insertCompany();
  return { branch, manager, department, category, supplier };
}

export type SpendingScene = Awaited<ReturnType<typeof spendingScene>>;

export type Bought = {
  purchasedOn: string;
  qty?: string;
  unitPrice?: string;
  /** Each extra cost, paid in cash unless its type is given (07 Purchase record). */
  extras?: readonly (bigint | { amount: bigint; paymentType: PaymentType })[];
  /** The trip's payment type, cash by default. */
  paymentType?: PaymentType;
  cancelled?: boolean;
  /** The moment of the cancel, the record's entry moment unless given (plan of 6.4c, item 5). */
  cancelledAt?: string;
  /** Defaults: the scene's own. */
  categoryId?: string;
  departmentId?: string;
  supplierId?: string | null;
  ownerId?: string;
  /** The order's buying progress, Open by default. */
  progress?: OrderProgress;
  /** The order's plan: quantity and price (no planned extra), 10 × 5 000 by default. */
  plannedQty?: string;
  plannedPrice?: bigint;
};

/** One Open order of the scene's branch with one record on its own trip. Returns the record. */
export async function bought(scene: SpendingScene, row: Bought) {
  const product = await insertProduct({ categoryId: row.categoryId ?? scene.category.id });
  const ownerId = row.ownerId ?? scene.manager.id;
  const order = await insertOrder({
    branchId: scene.branch.id,
    ownerId,
    departmentId: row.departmentId ?? scene.department.id,
    variantId: product.defaultVariantId,
    status: "PURCHASING",
    progress: row.progress ?? "OPEN",
    // A short or not-bought finish carries its reason (07 Finishing).
    finishReason:
      row.progress === "DONE_SHORT" || row.progress === "NOT_BOUGHT"
        ? "Do'konda qolmagan"
        : undefined,
    plannedQty: row.plannedQty,
    plannedPrice: row.plannedPrice,
  });
  const { purchaseId } = await recordOn(
    scene,
    { id: order.id, ownerId, variantId: product.defaultVariantId },
    row,
  );
  return {
    purchaseId,
    orderId: order.id,
    number: order.number,
    productId: product.id,
    variantId: product.defaultVariantId,
    ownerId,
  };
}

/** One more record, on a trip of its own, of an order `bought()` made. Returns the record. */
export async function recordOn(
  scene: SpendingScene,
  order: { id: string; ownerId: string; variantId: string },
  row: Bought,
) {
  const ownerId = order.ownerId;
  const supplierId = row.supplierId === undefined ? scene.supplier.id : row.supplierId;
  const trip = await db.execute<{ id: string }>(sql`
    insert into purchase_trips (client_key, branch_id, purchased_on, supplier_id, payment_type,
      created_by, created_at)
    values (${randomUUID()}, ${scene.branch.id}, ${row.purchasedOn}, ${supplierId},
      ${row.paymentType ?? "CASH"}, ${ownerId}, ${AT})
    returning id`);
  const purchase = await db.execute<{ id: string }>(sql`
    insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price, created_by,
      created_at)
    values (${trip.rows[0]!.id}, ${order.id}, ${scene.branch.id}, ${order.variantId},
      ${row.qty ?? "1.000"}, ${row.unitPrice ?? "10000"}, ${ownerId}, ${AT})
    returning id`);
  const purchaseId = purchase.rows[0]!.id;
  for (const extra of row.extras ?? []) {
    const { amount, paymentType } =
      typeof extra === "bigint" ? { amount: extra, paymentType: "CASH" } : extra;
    const type = await insertExtraCostType();
    await db.execute(sql`
      insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type,
        created_at)
      values (${purchaseId}, ${type.id}, ${amount}, ${paymentType}, ${AT})`);
  }
  if (row.cancelled) {
    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${ownerId}, cancelled_at = ${row.cancelledAt ?? AT} where id = ${purchaseId}`);
  }
  return { purchaseId };
}

/**
 * One event of an order's buying at a moment (07; plan of 6.4, decided item 5: an outcome falls
 * on the Tashkent date of the newest one), with its action, as the buying actions write them.
 */
export async function buyingEvent(
  orderId: string,
  actorId: string,
  type: "RECORD_PURCHASE" | "FINISH_ORDER" | "MARK_NOT_BOUGHT" | "CANCEL_PURCHASE",
  at: string,
) {
  const action = await db.execute<{ id: string }>(sql`
    insert into order_actions (client_key, type, actor_id, order_count, created_at)
    values (${randomUUID()}, ${type}, ${actorId}, 1, ${at}) returning id`);
  await db.execute(sql`
    insert into order_events (order_id, action_id, type, from_status, to_status, actor_id,
      created_at)
    values (${orderId}, ${action.rows[0]!.id}, ${type}, 'PURCHASING', 'PURCHASING', ${actorId},
      ${at})`);
}

/**
 * One money action of one row for an order, as Finance's actions write them (08 Money ledger),
 * cancelled when asked (Decided ahead, question 3: the cancel fields filled once). Plan of 6.4c.
 */
export async function moneyOn(
  order: { orderId: string; ownerId: string },
  createdBy: string,
  row: { kind?: MoneyRowKind; amount: bigint; occurredOn: string; cancelled?: boolean },
) {
  const action = await db.execute<{ id: string }>(sql`
    insert into money_actions (client_key, manager_id, occurred_on, created_by, created_at)
    values (${randomUUID()}, ${order.ownerId}, ${row.occurredOn}, ${createdBy}, ${AT})
    returning id`);
  const actionId = action.rows[0]!.id;
  await db.execute(sql`
    insert into money_rows (money_action_id, order_id, kind, amount, created_at)
    values (${actionId}, ${order.orderId}, ${row.kind ?? "CASH_GIVEN"}, ${row.amount.toString()}, ${AT})`);
  if (row.cancelled) {
    await db.execute(sql`update money_actions set is_cancelled = true,
      cancel_reason = 'Xato kiritildi', cancelled_by = ${createdBy}, cancelled_at = ${AT}
      where id = ${actionId}`);
  }
  return { actionId };
}

/** The refresh of the scheduler job, in a transaction of its own. */
export function refreshNow() {
  return db.transaction((tx) => refreshAnalytics(tx));
}

/** One status move of an order's history, as the order actions of 2.4 write it (06 Allowed moves). */
export type Move = {
  /** A move of 06's table, or a move of the owner (4.10). */
  type: OrderAction | "MOVE_OWNER";
  from: RequestStatus;
  to: RequestStatus;
  at: string;
  reason?: string;
  /** Who made the move, the order's owner unless given (plan of 6.5a: "my average time to decide"). */
  actorId?: string;
};

/**
 * The approval history of an order (build-plan 6.4b: the stays of Approval speed), each move with
 * its own action, as the order actions write them. The order's status is the caller's.
 */
export async function movesOf(orderId: string, actorId: string, moves: readonly Move[]) {
  for (const move of moves) {
    const action = await db.execute<{ id: string }>(sql`
      insert into order_actions (client_key, type, actor_id, reason, order_count, created_at)
      values (${randomUUID()}, ${move.type}, ${move.actorId ?? actorId}, ${move.reason ?? null}, 1,
        ${move.at})
      returning id`);
    await db.execute(sql`
      insert into order_events (order_id, action_id, type, from_status, to_status, actor_id,
        created_at)
      values (${orderId}, ${action.rows[0]!.id}, ${move.type}, ${move.from}, ${move.to},
        ${move.actorId ?? actorId}, ${move.at})`);
  }
}

/** An order of the scene at `status` with the given approval history. Returns the order. */
export async function decided(
  scene: SpendingScene,
  status: RequestStatus,
  moves: readonly Move[],
  row: {
    ownerId?: string;
    departmentId?: string;
    categoryId?: string;
    /** The order's needed-by date, first submit and buying progress (plan of 6.5a, Orders). */
    neededBy?: string;
    submittedAt?: string;
    progress?: OrderProgress;
  } = {},
) {
  const product = await insertProduct({ categoryId: row.categoryId ?? scene.category.id });
  const ownerId = row.ownerId ?? scene.manager.id;
  const order = await insertOrder({
    branchId: scene.branch.id,
    ownerId,
    departmentId: row.departmentId ?? scene.department.id,
    variantId: product.defaultVariantId,
    status,
    neededBy: row.neededBy,
    submittedAt: row.submittedAt === undefined ? undefined : new Date(row.submittedAt),
    progress: row.progress,
    finishReason:
      row.progress === "DONE_SHORT" || row.progress === "NOT_BOUGHT"
        ? "Do'konda qolmagan"
        : undefined,
  });
  await movesOf(order.id, ownerId, moves);
  return { id: order.id, number: order.number, variantId: product.defaultVariantId, ownerId };
}

/**
 * A product of the scene's category (or the one given), in a measure with decimals, with `qty` received at `unitCost` into the
 * scene's branch at the clock's moment, and its minimum when given (build-plan 6.4d). Returns
 * the subtype.
 */
export async function stocked(
  scene: SpendingScene,
  row: { qty: string; unitCost: bigint; minimum?: string; categoryId?: string },
): Promise<string> {
  // A measure with decimals, so a test can move 2.5 (04 Measures).
  const unit = await insertUnit({ allowDecimal: true });
  const product = await insertProduct({
    categoryId: row.categoryId ?? scene.category.id,
    unitId: unit.id,
  });
  await receive(scene.branch.id, product.defaultVariantId, row.qty, row.unitCost, scene.manager.id);
  if (row.minimum !== undefined) {
    await db.execute(sql`
      insert into stock_minimums (branch_id, variant_id, min_qty, created_at, updated_at)
      values (${scene.branch.id}, ${product.defaultVariantId}, ${row.minimum}, now(), now())`);
  }
  return product.defaultVariantId;
}

/**
 * A POSTED issue or return to the scene's department (or the one given), or a write-off already
 * approved by `decidedBy`, on `docDate`, at the clock's moment (build-plan 6.4d). A return's line
 * comes in at 1 000 so'm into an empty stock.
 */
export async function stockDocument(
  scene: SpendingScene,
  row: {
    type: "ISSUE" | "RETURN" | "WRITE_OFF";
    docDate: string;
    lines: { variantId: string; qty: string }[];
    departmentId?: string;
    decidedBy?: string;
    status?: "POSTED" | "PENDING_APPROVAL";
  },
): Promise<string> {
  const writeOff = row.type === "WRITE_OFF";
  const created = await db.transaction((tx) =>
    createDocument(tx, {
      type: row.type,
      branchId: scene.branch.id,
      departmentId: writeOff ? null : (row.departmentId ?? scene.department.id),
      receivedByName: row.type === "ISSUE" ? "Sinov Qabulqiluvchi" : null,
      docDate: row.docDate,
      status: row.status ?? "POSTED",
      reason: writeOff ? "DAMAGED" : null,
      comment: writeOff ? "Sinov" : null,
      clientKey: randomUUID(),
      createdBy: scene.manager.id,
      decidedBy: writeOff && row.status !== "PENDING_APPROVAL" ? (row.decidedBy ?? null) : null,
      lines: row.lines.map((line) => ({
        ...line,
        unitCost: row.type === "RETURN" ? 1000n : null,
      })),
    }),
  );
  return created.documentId;
}

/** Reverses one document, as the reverse action does after its checks (09 Movement types). */
export async function reverseNow(documentId: string, reversedBy: string): Promise<void> {
  await db.transaction((tx) =>
    reverseDocument(tx, { documentId, reason: "Sinov xato", reversedBy }),
  );
}
