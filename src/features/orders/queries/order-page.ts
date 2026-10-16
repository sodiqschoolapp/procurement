import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import * as z from "zod";

import { plainQuantity } from "@/domain/drafts";
import { type OrderAction, allowedActions } from "@/domain/order-moves";
import { type StepEvent, type StepView, orderSteps } from "@/domain/order-steps";
import { extrasSum, priceHintPercent } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import type { Actor } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import { type Executor, authorizeList, branchFilter } from "@/server/authorize";
import {
  branches,
  companies,
  departments,
  extraCostTypes,
  orderEvents,
  orderExtras,
  orders,
  productVariants,
  products,
  units,
  userBranches,
  users,
} from "@/server/db/schema";
import { orderState } from "@/server/order-moves";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { createdByHeadSql, ownerClosesAloneSql } from "../order-facts";

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
  /**
   * The other orders of the same action that this user may see now: never the action's own
   * count, which may cover other branches (decided item 1, Look first).
   */
  othersSeen: number;
};

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
  submittedAt: Date | null;
  approvedAt: Date | null;
  closedAt: Date | null;
  steps: StepView[];
  /** Newest first (decided item 11). */
  events: OrderPageEvent[];
  /** The moves the state machine allows this user on this order now (11 Order page layout 4). */
  actions: OrderAction[];
  /** The branch's active Principal now (03 rules 2 and 3; decided items 5 and 14). */
  principalName: string | null;
};

const idInput = z.uuid();

/** A Draft is seen by its owner and the Head only (06 Statuses), inside the SQL. */
function draftWall(actor: Actor, status: typeof orders.status, ownerId: typeof orders.ownerId) {
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
  const seenBranch =
    actor.role === "HEAD"
      ? sql`true`
      : sql`o2.branch_id in (select ub.branch_id from user_branches ub where ub.user_id = ${actor.userId})`;
  const seenDraft =
    actor.role === "HEAD" ? sql`true` : sql`(o2.status <> 'DRAFT' or o2.owner_id = ${actor.userId})`;
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
      headStepAuto: sql<boolean>`coalesce((${orderEvents.payload} ->> 'headStepAuto')::boolean, false)`,
      othersSeen: sql<number>`(select count(distinct e2.order_id)::int
        from order_events e2 join orders o2 on o2.id = e2.order_id
        where e2.action_id = ${orderEvents.actionId} and e2.order_id <> ${orderEvents.orderId}
          and ${seenBranch} and ${seenDraft})`,
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
    principalName: principal?.name ?? null,
  };
}
