import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { type AnyPgColumn, alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import { businessDate } from "@/domain/business-date";
import { addsDraftsIn, inStock, plainQuantity } from "@/domain/drafts";
import { type OrderAction, allowedActions } from "@/domain/order-moves";
import { type StepEvent, type StepView, isOverdue, orderSteps } from "@/domain/order-steps";
import { extrasSum, priceHintPercent } from "@/domain/order-totals";
import {
  type RevisionField,
  type RevisionSnapshot,
  revisionChanges,
} from "@/domain/revision-changes";
import type { PaymentType } from "@/domain/payment-types";
import type { Actor } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import { type Executor, authorizeList, branchFilter } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  branches,
  companies,
  departments,
  extraCostTypes,
  orderEvents,
  orderExtras,
  orderRevisions,
  orders,
  productVariants,
  products,
  stockBalances,
  units,
  userBranches,
  users,
} from "@/server/db/schema";
import { orderState } from "@/server/order-moves";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { createdByHeadSql, headStepAutoSql, ownerClosesAloneSql } from "../order-facts";

// The order page /orders/[id] (11-screens-and-ux.md, Order page layout 1 to 4; 06 rule 11; plan
// of 2.9). Under `data.view` with the branch wall and the draft wall inside the SQL: another
// branch's order, another user's Draft (for anyone but its owner and the Head), an unknown id and
// a malformed id are all `null`, so every not-found looks the same (03 rule 1; decided item 6,
// Look first; .claude/rules/server-actions.md). Everything is read in one snapshot, so the order,
// its events and the count beside each event are of one moment.

export type OrderPageExtra = { typeName: string; amount: bigint };

export type OrderPageEvent = {
  id: string;
  type: OrderAction;
  from: RequestStatus;
  to: RequestStatus;
  actorName: string;
  at: Date;
  /** The action's reason (06 rule 3). */
  comment: string | null;
  /** The per-order note of a send-back (06 Allowed moves). */
  note: string | null;
  headStepAuto: boolean;
  /** Finance's change of the payment type in this Approve (06 rule 1; plan of 2.10). */
  paymentType: { from: PaymentType; to: PaymentType } | null;
  /**
   * The other orders of the same action that this user may see now: never the action's own
   * count, which may cover other branches (decided item 1, Look first).
   */
  othersSeen: number;
};

/**
 * One changed field of "What changed" (06 rule 5), its ids named: the product and subtype, the
 * company and the department as their names, an extra cost by its type's name. Other values stay
 * as stored (quantity and money as text, a date as `YYYY-MM-DD`, codes) for the screen's
 * formatters; null where the order had none.
 */
export type OrderPageChange =
  | { kind: "field"; field: RevisionField; from: string | null; to: string | null }
  | { kind: "extra"; typeName: string; from: string | null; to: string | null }
  | { kind: "total"; from: string | null; to: string | null };

export type OrderPage = {
  id: string;
  /** null on a never-submitted draft. */
  number: string | null;
  revision: number;
  version: number;
  status: RequestStatus;
  branchId: string;
  branchCode: string;
  branchName: string;
  ownerName: string;
  departmentName: string | null;
  requesterName: string | null;
  productName: string | null;
  /** null for the hidden default subtype, or a draft without a product yet. */
  subtypeName: string | null;
  unitShortName: string | null;
  companyName: string | null;
  neededBy: string | null;
  /** Plain decimal text, without trailing zeros. */
  quantity: string | null;
  /**
   * The branch's stock of the subtype when the order was submitted, and now (06 rule 10): plain
   * decimal text; null for a service, which has no stock, and before the first submit.
   */
  stockAtSubmit: string | null;
  /** The branch's stock now, 0 without a row; null for a service or a draft without a product. */
  stockNow: string | null;
  price: bigint | null;
  extras: OrderPageExtra[];
  /** The sum of the extra costs (`extrasSum()` of src/domain/order-totals.ts). */
  extrasSum: bigint;
  paymentType: PaymentType;
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
  comment: string | null;
  referencePhotoFileId: string | null;
  plannedTotal: bigint | null;
  actualTotal: bigint | null;
  /** Against today's reference price (decided item 8); null when none applies. */
  priceHint: bigint | null;
  /** "Overdue", by isOverdue() (edge case "The needed-by date passes"; plan of 2.13). */
  overdue: boolean;
  submittedAt: Date | null;
  approvedAt: Date | null;
  closedAt: Date | null;
  steps: StepView[];
  /** Newest first (decided item 11). */
  events: OrderPageEvent[];
  /** The moves the state machine allows this user on this order now (11 Order page layout 4). */
  actions: OrderAction[];
  /**
   * Copy as new is offered: the user may add drafts in the order's branch, which is active (05
   * Ticking and filters; plan of 2.13, decided item 1, Look first). The server asks again.
   */
  canCopy: boolean;
  /** The branch's active Principal now (03 rules 2 and 3; decided items 5 and 14). */
  principalName: string | null;
  /**
   * What changed since the revision before (06 rule 5; plan of 2.11, decided item 3, Look first),
   * from revision 2 on; null on revision 1.
   */
  changes: { since: number; list: OrderPageChange[] } | null;
};

const idInput = z.uuid();

/**
 * A Draft is seen by its owner and the Head only (06 Statuses), inside the SQL: the SQL form of
 * behindDraftWall() of src/domain/order-moves.ts, for the order and for the count beside each event.
 */
function draftWall(actor: Actor, status: AnyPgColumn, ownerId: AnyPgColumn) {
  if (actor.role === "HEAD") return undefined;
  return or(ne(status, "DRAFT"), eq(ownerId, actor.userId));
}

/** The order page, or null when the user may not see the order or it does not exist. */
export async function getOrderPage(userId: string, orderId: string): Promise<OrderPage | null> {
  const actor = await authorizeList(userId, "data.view");
  const parsed = idInput.safeParse(orderId);
  if (!parsed.success) return null;
  return readSnapshot((db) => readPage(db, actor, parsed.data));
}

async function readPage(db: Executor, actor: Actor, id: string): Promise<OrderPage | null> {
  const owner = users;
  const [row] = await db
    .select({
      id: orders.id,
      number: orders.number,
      revision: orders.revision,
      version: orders.version,
      status: orders.status,
      branchId: orders.branchId,
      ownerId: orders.ownerId,
      progress: orders.progress,
      createdByHead: createdByHeadSql,
      ownerClosesAlone: ownerClosesAloneSql,
      branchCode: branches.code,
      branchName: branches.name,
      branchActive: branches.isActive,
      ownerName: owner.fullName,
      departmentName: departments.name,
      requesterName: orders.requesterName,
      productName: products.name,
      variantName: productVariants.name,
      variantIsDefault: productVariants.isDefault,
      referencePrice: productVariants.referencePrice,
      unitShortName: units.shortName,
      companyName: companies.name,
      neededBy: orders.neededBy,
      quantity: orders.plannedQty,
      productType: products.type,
      stockAtSubmit: orders.stockAtSubmit,
      // In the page's one snapshot (plan of 2.10, decided item 4): the branch's row, 0 without one.
      stockNow: sql<string>`coalesce((select ${stockBalances.qty}::text from ${stockBalances}
        where ${stockBalances.branchId} = ${orders.branchId}
          and ${stockBalances.variantId} = ${orders.variantId}), '0')`,
      price: orders.plannedPrice,
      paymentType: orders.paymentType,
      priority: orders.priority,
      urgentReason: orders.urgentReason,
      comment: orders.comment,
      referencePhotoFileId: orders.referencePhotoFileId,
      plannedTotal: orders.plannedTotal,
      actualTotal: orders.actualTotal,
      submittedAt: orders.submittedAt,
      approvedAt: orders.approvedAt,
      closedAt: orders.closedAt,
    })
    .from(orders)
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .innerJoin(owner, eq(owner.id, orders.ownerId))
    .leftJoin(departments, eq(departments.id, orders.departmentId))
    .leftJoin(productVariants, eq(productVariants.id, orders.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(units, eq(units.id, products.unitId))
    .leftJoin(companies, eq(companies.id, orders.companyId))
    .where(
      and(
        eq(orders.id, id),
        branchFilter(actor, orders.branchId),
        draftWall(actor, orders.status, orders.ownerId),
      ),
    );
  if (!row) return null;

  const extras = await db
    .select({ typeName: extraCostTypes.name, amount: orderExtras.amount })
    .from(orderExtras)
    .innerJoin(extraCostTypes, eq(extraCostTypes.id, orderExtras.extraCostTypeId))
    .where(eq(orderExtras.orderId, row.id))
    .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));

  // The other orders of each event's action that this user may see now: the branch wall and the
  // draft wall inside the SQL (decided item 1, Look first).
  const e2 = alias(orderEvents, "e2");
  const o2 = alias(orders, "o2");
  const othersSeen = db
    .select({ count: sql<number>`count(distinct ${e2.orderId})::int` })
    .from(e2)
    .innerJoin(o2, eq(o2.id, e2.orderId))
    .where(
      and(
        eq(e2.actionId, orderEvents.actionId),
        ne(e2.orderId, orderEvents.orderId),
        branchFilter(actor, o2.branchId),
        draftWall(actor, o2.status, o2.ownerId),
      ),
    );
  const actor2 = users;
  const events = await db
    .select({
      id: orderEvents.id,
      type: orderEvents.type,
      from: orderEvents.fromStatus,
      to: orderEvents.toStatus,
      actorName: actor2.fullName,
      at: orderEvents.createdAt,
      comment: orderEvents.comment,
      note: orderEvents.note,
      headStepAuto: headStepAutoSql,
      paymentType: sql<OrderPageEvent["paymentType"]>`${orderEvents.payload} -> 'paymentType'`,
      othersSeen: sql<number>`(${othersSeen})`,
    })
    .from(orderEvents)
    .innerJoin(actor2, eq(actor2.id, orderEvents.actorId))
    .where(eq(orderEvents.orderId, row.id))
    .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id));

  const [principal] = await db
    .select({ name: users.fullName })
    .from(userBranches)
    .innerJoin(users, eq(users.id, userBranches.userId))
    .where(
      and(
        eq(userBranches.branchId, row.branchId),
        eq(userBranches.userRole, "PRINCIPAL"),
        eq(userBranches.userIsActive, true),
      ),
    );

  const threshold = (await readSettings(db)).price_hint_percent;
  const changes = row.revision >= 2 ? await readChanges(db, row.id, row.revision) : null;
  const stepEvents: StepEvent[] = events.map((event) => ({
    type: event.type,
    from: event.from,
    to: event.to,
    actorName: event.actorName,
    at: event.at,
    headStepAuto: event.headStepAuto,
  }));
  const amounts = extras.map((extra) => extra.amount);

  return {
    id: row.id,
    number: row.number,
    revision: row.revision,
    version: row.version,
    status: row.status,
    branchId: row.branchId,
    branchCode: row.branchCode,
    branchName: row.branchName,
    ownerName: row.ownerName,
    departmentName: row.departmentName,
    requesterName: row.requesterName,
    productName: row.productName,
    subtypeName: row.variantIsDefault === false ? row.variantName : null,
    unitShortName: row.unitShortName,
    companyName: row.companyName,
    neededBy: row.neededBy,
    quantity: row.quantity === null ? null : plainQuantity(row.quantity),
    // inStock() reads 0 as "0"; plainQuantity() refuses it (a plan quantity is above 0).
    stockAtSubmit:
      row.productType === null || row.stockAtSubmit === null
        ? null
        : inStock(row.productType, row.stockAtSubmit),
    stockNow: row.productType === null ? null : inStock(row.productType, row.stockNow),
    price: row.price,
    extras,
    extrasSum: extrasSum(amounts),
    paymentType: row.paymentType,
    priority: row.priority,
    urgentReason: row.urgentReason,
    comment: row.comment,
    referencePhotoFileId: row.referencePhotoFileId,
    plannedTotal: row.plannedTotal,
    actualTotal: row.actualTotal,
    priceHint: priceHintPercent(row.price, row.referencePrice, threshold),
    overdue: isOverdue(row.status, row.progress, row.neededBy, businessDate(now())),
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    closedAt: row.closedAt,
    steps: orderSteps(row.status, stepEvents),
    events: events.toReversed(),
    actions: allowedActions(actor, [
      orderState({
        id: row.id,
        status: row.status,
        branchId: row.branchId,
        ownerId: row.ownerId,
        createdByHead: row.createdByHead === true,
        ownerClosesAlone: row.ownerClosesAlone === true,
        version: row.version,
        revision: row.revision,
        progress: row.progress,
      }),
    ]),
    canCopy: addsDraftsIn(actor, { id: row.branchId, isActive: row.branchActive }),
    principalName: principal?.name ?? null,
    changes,
  };
}

/** The ids a field of a snapshot holds, named by the query below. */
const NAMED: readonly RevisionField[] = ["variantId", "companyId", "departmentId"];

/**
 * "What changed" of an order at `revision` (≥ 2): the newest copy of the revision before against
 * the newest copy of this one, "newest" being the highest submission, never the latest time
 * (review of the plan of 2.11, correction 1). Read in the page's snapshot, after the walls let
 * the order through.
 */
async function readChanges(
  db: Executor,
  orderId: string,
  revision: number,
): Promise<{ since: number; list: OrderPageChange[] } | null> {
  const copies = await db
    .selectDistinctOn([orderRevisions.revision], {
      revision: orderRevisions.revision,
      snapshot: orderRevisions.snapshot,
    })
    .from(orderRevisions)
    .where(
      and(
        eq(orderRevisions.orderId, orderId),
        sql`${orderRevisions.revision} in (${revision - 1}, ${revision})`,
      ),
    )
    .orderBy(asc(orderRevisions.revision), sql`${orderRevisions.submission} desc`);
  const before = copies.find((copy) => copy.revision === revision - 1)?.snapshot;
  const after = copies.find((copy) => copy.revision === revision)?.snapshot;
  if (!before || !after) return null;
  const changes = revisionChanges(before as RevisionSnapshot, after as RevisionSnapshot);

  const ids = (field: RevisionField) =>
    changes.flatMap((change) =>
      change.kind === "field" && change.field === field
        ? [change.from, change.to].filter((id): id is string => id !== null)
        : [],
    );
  const typeIds = changes.flatMap((change) =>
    change.kind === "extra" ? [change.extraCostTypeId] : [],
  );
  const names = new Map<string, string>();
  const variantIds = ids("variantId");
  if (variantIds.length > 0) {
    const rows = await db
      .select({
        id: productVariants.id,
        product: products.name,
        variant: productVariants.name,
        isDefault: productVariants.isDefault,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.id, variantIds));
    for (const row of rows) {
      names.set(row.id, row.isDefault ? row.product : `${row.product}, ${row.variant}`);
    }
  }
  const companyIds = ids("companyId");
  if (companyIds.length > 0) {
    const rows = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(inArray(companies.id, companyIds));
    for (const row of rows) names.set(row.id, row.name);
  }
  const departmentIds = ids("departmentId");
  if (departmentIds.length > 0) {
    const rows = await db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(inArray(departments.id, departmentIds));
    for (const row of rows) names.set(row.id, row.name);
  }
  if (typeIds.length > 0) {
    const rows = await db
      .select({ id: extraCostTypes.id, name: extraCostTypes.name })
      .from(extraCostTypes)
      .where(inArray(extraCostTypes.id, typeIds));
    for (const row of rows) names.set(row.id, row.name);
  }
  const named = (id: string | null) => (id === null ? null : (names.get(id) ?? id));

  return {
    since: revision - 1,
    list: changes.map((change): OrderPageChange => {
      if (change.kind === "extra") {
        return {
          kind: "extra",
          typeName: named(change.extraCostTypeId)!,
          from: change.from,
          to: change.to,
        };
      }
      if (change.kind === "field" && NAMED.includes(change.field)) {
        return { ...change, from: named(change.from), to: named(change.to) };
      }
      return change;
    }),
  };
}
