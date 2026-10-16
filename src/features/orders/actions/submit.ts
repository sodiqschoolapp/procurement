import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { businessDate, businessYear } from "@/domain/business-date";
import { orderActionNotices } from "@/domain/notifications";
import { orderNumber } from "@/domain/order-numbers";
import { orderTotal } from "@/domain/order-totals";
import { type SubmitFacts, submitRefusals } from "@/domain/submit-checks";
import type { FieldMessageKey, OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import {
  branches,
  companies,
  departments,
  extraCostTypes,
  numberCounters,
  orderExtras,
  orders,
  productVariants,
  products,
  units,
  userBranches,
  users,
} from "@/server/db/schema";
import { notify } from "@/server/notify";
import {
  type OrdersContext,
  type OrdersInput,
  OrdersRefusal,
  type Transaction,
  ordersInput,
} from "@/server/order-action";
import { orderMoveAction } from "@/server/order-moves";

// Submit of ticked drafts (05-order-request-form.md, Drafts 4; Order number; Checks at submit;
// 06-approval-workflow.md, Allowed moves: the Draft row; rule 8; 03-roles-and-permissions.md rule
// 6; plan of 2.7). The state machine's Submit move on the wrapper of src/server/order-action.ts:
// its lock, repeat, authorize, version and status check run first. Then, in `beforeMove`, while
// every order is still DRAFT (the CHECKs and `orders_guard` of migration 0019; review of the
// plan, correction 5):
//
//   checks    every fact read under its lock (catalog rows FOR SHARE, as the draft actions do),
//             submitRefusals() of src/domain/submit-checks.ts per order; any failure refuses the
//             whole submit with `not_ready` and each order's cells, before anything is written
//   numbers   per branch in branch-id order, one upsert of its `number_counters` row (the lock of
//             05 Order number 5), the orders numbered in the order they were created
//   plan      number, submitted_at, planned_total = orderTotal(), stock_at_submit, one statement
//   snapshot  one order_revisions row per order, inserted only (append-only, rule 7)
//
// The wrapper then writes the status (Waiting for Principal when the Head created the order,
// logged "Created by Head"), the events and the action row; `notify` tells the Heads, and the
// Principal of the orders that skipped the Head step.

type Input = OrdersInput;

/** One order as the submit reads it, with the facts of its catalog entries. */
type SubmitRow = {
  id: string;
  branchId: string;
  number: string | null;
  createdAt: Date;
  quantity: string | null;
  price: bigint | null;
  paymentType: (typeof orders.$inferSelect)["paymentType"];
  facts: SubmitFacts;
  extras: bigint[];
};

const ids = (values: readonly string[]) => [...new Set(values)].sort();

/** Every fact the checks need, each catalog row read FOR SHARE (04 rule 2). */
async function readSubmitRows(tx: Transaction, orderIds: readonly string[]): Promise<SubmitRow[]> {
  const rows = await tx
    .select({
      id: orders.id,
      branchId: orders.branchId,
      number: orders.number,
      createdAt: orders.createdAt,
      variantId: orders.variantId,
      departmentId: orders.departmentId,
      companyId: orders.companyId,
      neededBy: orders.neededBy,
      quantity: orders.plannedQty,
      price: orders.plannedPrice,
      paymentType: orders.paymentType,
      priority: orders.priority,
      urgentReason: orders.urgentReason,
    })
    .from(orders)
    .where(inArray(orders.id, [...orderIds]));

  // Each entry is held FOR SHARE in id order, so a deactivation (FOR UPDATE) and this submit
  // cannot pass each other, and two submits take the same locks in the same order.
  const branchRows = await tx
    .select({ id: branches.id, isActive: branches.isActive })
    .from(branches)
    .where(inArray(branches.id, ids(rows.map((row) => row.branchId))))
    .orderBy(asc(branches.id))
    .for("share");
  const variantIds = ids(rows.flatMap((row) => (row.variantId ? [row.variantId] : [])));
  const subtypeRows =
    variantIds.length === 0
      ? []
      : await tx
          .select({
            id: productVariants.id,
            variantActive: productVariants.isActive,
            productActive: products.isActive,
            allowsDecimals: units.allowDecimal,
          })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .innerJoin(units, eq(units.id, products.unitId))
          .where(inArray(productVariants.id, variantIds))
          .orderBy(asc(productVariants.id))
          .for("share", { of: [productVariants, products] });
  const departmentIds = ids(rows.flatMap((row) => (row.departmentId ? [row.departmentId] : [])));
  const departmentRows =
    departmentIds.length === 0
      ? []
      : await tx
          .select({ id: departments.id, isActive: departments.isActive })
          .from(departments)
          .where(inArray(departments.id, departmentIds))
          .orderBy(asc(departments.id))
          .for("share");
  const companyIds = ids(rows.flatMap((row) => (row.companyId ? [row.companyId] : [])));
  const companyRows =
    companyIds.length === 0
      ? []
      : await tx
          .select({ id: companies.id, isActive: companies.isActive })
          .from(companies)
          .where(inArray(companies.id, companyIds))
          .orderBy(asc(companies.id))
          .for("share");
  const extraRows = await tx
    .select({
      orderId: orderExtras.orderId,
      amount: orderExtras.amount,
      isActive: extraCostTypes.isActive,
    })
    .from(orderExtras)
    .innerJoin(extraCostTypes, eq(extraCostTypes.id, orderExtras.extraCostTypeId))
    .where(inArray(orderExtras.orderId, [...orderIds]))
    // The order of the grid's extra-cost rows, so `extras.<n>` names the row shown.
    .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id))
    .for("share", { of: extraCostTypes });

  const branchActive = new Map(branchRows.map((row) => [row.id, row.isActive]));
  const subtypeOf = new Map(subtypeRows.map((row) => [row.id, row]));
  const departmentActive = new Map(departmentRows.map((row) => [row.id, row.isActive]));
  const companyActive = new Map(companyRows.map((row) => [row.id, row.isActive]));
  return rows.map((row) => {
    const subtype = row.variantId ? subtypeOf.get(row.variantId) : undefined;
    const extras = extraRows.filter((extra) => extra.orderId === row.id);
    return {
      id: row.id,
      branchId: row.branchId,
      number: row.number,
      createdAt: row.createdAt,
      quantity: row.quantity,
      price: row.price,
      paymentType: row.paymentType,
      extras: extras.map((extra) => extra.amount),
      facts: {
        branchActive: branchActive.get(row.branchId) === true,
        variantId: row.variantId,
        subtypeActive: subtype ? subtype.variantActive && subtype.productActive : null,
        allowsDecimals: subtype ? subtype.allowsDecimals : null,
        departmentId: row.departmentId,
        departmentActive: row.departmentId ? departmentActive.get(row.departmentId) === true : null,
        companyId: row.companyId,
        companyActive: row.companyId ? companyActive.get(row.companyId) === true : null,
        neededBy: row.neededBy,
        quantity: row.quantity,
        price: row.price,
        priority: row.priority,
        urgentReason: row.urgentReason,
        extras: extras.map((extra) => ({ active: extra.isActive })),
      },
    };
  });
}

/**
 * The checks at submit of every order (05 Checks at submit): the failing orders, in the order
 * they were sent, each with its cells. A Draft that already has a number (taken back; 2.11) is
 * not submitted by this task (plan of 2.7, decided item 3, Look first).
 */
function failuresOf(
  sent: readonly { id: string }[],
  rows: readonly SubmitRow[],
  today: string,
): OrderFailure[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const failed: OrderFailure[] = [];
  for (const { id } of sent) {
    const row = byId.get(id);
    if (!row) continue;
    if (row.number !== null) {
      failed.push({ orderId: id, code: "not_ready" });
      continue;
    }
    const refused = Object.entries(submitRefusals(row.facts, today));
    if (refused.length === 0) continue;
    const fields: Record<string, FieldMessageKey> = {};
    for (const [cell, kind] of refused) fields[cell] = `errors.field.${kind}`;
    failed.push({ orderId: id, code: "not_ready", fields });
  }
  return failed;
}

/**
 * One number per order, per branch per Tashkent year (05 Order number 2 and 5): the counter row
 * is taken with one upsert per branch, branches in id order; the orders get the values in the
 * order they were created, then by id.
 */
async function numbersOf(
  tx: Transaction,
  rows: readonly SubmitRow[],
  at: Date,
): Promise<Map<string, string>> {
  const year = businessYear(at);
  const byBranch = new Map<string, SubmitRow[]>();
  for (const row of rows) byBranch.set(row.branchId, [...(byBranch.get(row.branchId) ?? []), row]);
  const codes = await tx
    .select({ id: branches.id, code: branches.code })
    .from(branches)
    .where(inArray(branches.id, [...byBranch.keys()]));
  const codeOf = new Map(codes.map((row) => [row.id, row.code]));

  const numbers = new Map<string, string>();
  for (const branchId of ids([...byBranch.keys()])) {
    const inBranch = byBranch
      .get(branchId)!
      .slice()
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    const [counter] = await tx
      .insert(numberCounters)
      .values({ scope: "ORD", branchId, year, lastValue: inBranch.length, createdAt: at })
      .onConflictDoUpdate({
        target: [numberCounters.scope, numberCounters.branchId, numberCounters.year],
        set: { lastValue: sql`${numberCounters.lastValue} + ${inBranch.length}` },
      })
      .returning({ lastValue: numberCounters.lastValue });
    const first = counter!.lastValue - inBranch.length + 1;
    inBranch.forEach((row, at) => {
      numbers.set(row.id, orderNumber(codeOf.get(branchId)!, year, first + at));
    });
  }
  return numbers;
}

/** The checks, the numbers, the plan facts and the snapshot, while every order is DRAFT. */
async function beforeSubmit(context: OrdersContext<Input>): Promise<void> {
  const { tx } = context;
  const at = now();
  const orderIds = context.orders.map((order) => order.id);
  const rows = await readSubmitRows(tx, orderIds);

  const failed = failuresOf(context.input.orders, rows, businessDate(at));
  if (failed.length > 0) throw new OrdersRefusal("not_ready", failed);

  const numbers = await numbersOf(tx, rows, at);
  // Every row passed the checks, so quantity and price are there (05 field 16).
  const values = rows.map(
    (row) =>
      sql`(${row.id}::uuid, ${numbers.get(row.id)!}::text, ${orderTotal({
        quantity: row.quantity!,
        price: row.price!,
        extras: row.extras,
        paymentType: row.paymentType,
      }).toString()}::bigint)`,
  );
  // stock_at_submit is copied as the numeric(14,3) the branch holds now, no row is 0, a service
  // has none (05 field 4; review of the plan, correction 3: never a JavaScript number).
  await tx.execute(sql`
    update orders o
    set number = v.number,
        submitted_at = ${at},
        planned_total = v.total,
        stock_at_submit = case when p.type = 'SERVICE' then null else coalesce(
          (select sb.qty from stock_balances sb
           where sb.branch_id = o.branch_id and sb.variant_id = o.variant_id), 0) end
    from (values ${sql.join(values, sql`, `)}) as v(id, number, total),
         product_variants pv join products p on p.id = pv.product_id
    where o.id = v.id and pv.id = o.variant_id`);

  // The full copy at each submit (14-data-model.md, order_revisions): ids and values, money as
  // whole so'm in text (plan of 2.7, decided item 12).
  await tx.execute(sql`
    insert into order_revisions (order_id, revision, snapshot, created_at)
    select o.id, o.revision, jsonb_build_object(
      'number', o.number,
      'branchId', o.branch_id,
      'variantId', o.variant_id,
      'companyId', o.company_id,
      'departmentId', o.department_id,
      'requesterName', o.requester_name,
      'neededBy', o.needed_by,
      'quantity', o.planned_qty::text,
      'price', o.planned_price::text,
      'extras', coalesce((
        select jsonb_agg(jsonb_build_object(
          'extraCostTypeId', e.extra_cost_type_id, 'amount', e.amount::text
        ) order by e.created_at, e.id)
        from order_extras e where e.order_id = o.id), '[]'::jsonb),
      'plannedTotal', o.planned_total::text,
      'paymentType', o.payment_type,
      'priority', o.priority,
      'urgentReason', o.urgent_reason,
      'comment', o.comment,
      'referencePhotoFileId', o.reference_photo_file_id,
      'stockAtSubmit', o.stock_at_submit::text
    ), ${at}
    from orders o
    where ${inArray(orders.id, orderIds)}
    order by o.id`);
}

/** The link of a submit's notification: the order list filtered to this action (decided item 7). */
function linkOf(branchId: string, actionId: string): string {
  return `/orders?${new URLSearchParams({ branch: branchId, action: actionId }).toString()}`;
}

export const submitDrafts = orderMoveAction<Input>({
  name: "submitDrafts",
  action: "SUBMIT",
  input: ordersInput({}),
  beforeMove: beforeSubmit,
  async notify(context, result) {
    const { tx, userId } = context;
    const at = now();
    const [actor] = await tx
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
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
          link: linkOf(branchId, result.actionId),
          at,
        },
      );
    }

    // An order the Head created skipped the Head step (03 rule 6) and waits for the Principal of
    // its branch: "Head approved → Principal of the branch" (10 Notifications). The actor of such
    // a submit is always a Head: the draft is its Head's own, and only its owner or a Head may
    // submit it (decisions 2.3 item 2; review of the plan, Should fix 1).
    const skipped = result.orders.filter((order) => order.status === "PENDING_PRINCIPAL");
    for (const { branchId, params } of orderActionNotices(actor!.name, inBranches(skipped))) {
      const principals = await tx
        .select({ id: userBranches.userId })
        .from(userBranches)
        .where(
          and(
            eq(userBranches.branchId, branchId),
            eq(userBranches.userRole, "PRINCIPAL"),
            eq(userBranches.userIsActive, true),
          ),
        );
      await notify(
        { tx, userId },
        {
          to: principals.map((principal) => principal.id),
          type: "REQUEST_HEAD_APPROVED",
          params,
          branchId,
          link: linkOf(branchId, result.actionId),
          at,
        },
      );
    }
  },
});

/** The numbers of submitted orders, read after the action (a repeat's too; plan, Should fix 3). */
export async function numbersOfOrders(
  tx: Pick<Transaction, "select">,
  orderIds: readonly string[],
): Promise<Map<string, string>> {
  if (orderIds.length === 0) return new Map();
  const rows = await tx
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(inArray(orders.id, [...orderIds]));
  return new Map(rows.flatMap((row) => (row.number ? [[row.id, row.number] as const] : [])));
}
