import { asc, eq, inArray, sql } from "drizzle-orm";

import { type OrderFields, withHiddenValues } from "@/domain/order-fields";
import { orderNumber } from "@/domain/order-numbers";
import { suggestedPrice } from "@/domain/drafts";
import { orderTotal } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import { type SubmitFacts, submitRefusals } from "@/domain/submit-checks";
import { businessYear } from "@/domain/business-date";
import type { FieldMessageKey, OrderFailure } from "@/server/action-result";
import {
  branches,
  companies,
  departments,
  extraCostTypes,
  orderExtras,
  orders,
  productVariants,
  products,
  units,
} from "@/server/db/schema";
import { takeNumbers } from "@/server/number-counters";
import type { Transaction } from "@/server/order-action";
import { SETTINGS_LOCK_SHARED, readSettings } from "@/server/settings";

// The steps every submit shares (05-order-request-form.md, Order number; Checks at submit;
// 06-approval-workflow.md, Allowed moves: Submit and Submit again; plan of 2.7; plan of 2.11):
// Submit of a draft, new or taken back, and Submit again of a sent-back order. One copy, so the
// checks, the total and the snapshot of the two moves never drift (developer-rules.md rule 1).
//
//   readSubmitSettings  the fields the Head sets and the default payment type, under the settings
//                   lock taken shared (plan of 2.5d)
//   readSubmitRows  every fact the checks need, each catalog row FOR SHARE
//   failuresOf      submitRefusals() per order, with the fields as set now
//   numbersOf       the numbers of the orders that have none yet
//   writePlan       the hidden values of a never-numbered draft, the number where it is new, the
//                   first submitted_at, planned_total = orderTotal(), stock_at_submit; while the order is DRAFT or RETURNED, the only
//                   statuses at which `orders_guard` lets the plan change
//   writeSnapshots  one order_revisions row per order, the next submission of its revision

/** One order as the submit reads it, with the facts of its catalog entries. */
export type SubmitRow = {
  id: string;
  branchId: string;
  number: string | null;
  createdAt: Date;
  quantity: string | null;
  price: bigint | null;
  /**
   * `suggestedPrice()` of its subtype now: the reference price, else the last purchase price, else
   * null; a hidden price takes it (05 Fields the Head sets 2; plan of 2.5d-b, decided item 8).
   */
  suggestedPrice: bigint | null;
  paymentType: (typeof orders.$inferSelect)["paymentType"];
  facts: SubmitFacts;
  extras: bigint[];
};

/** What a submit reads of the settings (05 Fields the Head sets; 05 field 13). */
export type SubmitSettings = { fields: OrderFields; defaultPaymentType: PaymentType };

/**
 * The fields the Head sets as they are at the moment of the submit (05 Fields the Head sets 4),
 * read after the settings lock is taken shared, as the Principal's approval reads `finance_step`
 * (plan of 2.5d, spec review Must fix 5): a save of the settings cannot pass a submit between its
 * read and its commit. Taken after the orders' locks, as approve takes it.
 */
export async function readSubmitSettings(tx: Transaction): Promise<SubmitSettings> {
  await tx.execute(SETTINGS_LOCK_SHARED);
  const values = await readSettings(tx);
  return { fields: values.order_fields, defaultPaymentType: values.default_payment_type };
}

/** The distinct ids, sorted: the order every lock is taken in. */
export const ids = (values: readonly string[]) => [...new Set(values)].sort();

/** Every fact the checks need, each catalog row read FOR SHARE (04 rule 2). */
export async function readSubmitRows(
  tx: Transaction,
  orderIds: readonly string[],
): Promise<SubmitRow[]> {
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
      requesterName: orders.requesterName,
      comment: orders.comment,
      referencePhotoFileId: orders.referencePhotoFileId,
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
            referencePrice: productVariants.referencePrice,
            lastPurchasePrice: productVariants.lastPurchasePrice,
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
      suggestedPrice: subtype
        ? suggestedPrice(subtype.referencePrice, subtype.lastPurchasePrice)
        : null,
      paymentType: row.paymentType,
      extras: extras.map((extra) => extra.amount),
      facts: {
        numbered: row.number !== null,
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
        requesterName: row.requesterName,
        comment: row.comment,
        referencePhotoFileId: row.referencePhotoFileId,
        extras: extras.map((extra) => ({ active: extra.isActive })),
      },
    };
  });
}

/**
 * The checks at submit of every order (05 Checks at submit): the failing orders, in the order
 * they were sent, each with its cells. The same for a first submit, a taken-back draft and a
 * Submit again (06 Allowed moves: "The order passes all checks"; plan of 2.11).
 */
export function failuresOf(
  sent: readonly { id: string }[],
  rows: readonly SubmitRow[],
  today: string,
  orderFields: OrderFields,
): OrderFailure[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const failed: OrderFailure[] = [];
  for (const { id } of sent) {
    const row = byId.get(id);
    if (!row) continue;
    const refused = Object.entries(submitRefusals(row.facts, today, orderFields));
    if (refused.length === 0) continue;
    const fields: Record<string, FieldMessageKey> = {};
    for (const [cell, kind] of refused) fields[cell] = `errors.field.${kind}`;
    failed.push({ orderId: id, code: "not_ready", fields });
  }
  return failed;
}

/**
 * One number per order, per branch per Tashkent year (05 Order number 2 and 5): the counter row
 * is taken with one takeNumbers() per branch, branches in id order; the orders get the values in the
 * order they were created, then by id.
 */
export async function numbersOf(
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
    const first = await takeNumbers(tx, { scope: "ORD", branchId, year }, inBranch.length, at);
    inBranch.forEach((row, at) => {
      numbers.set(row.id, orderNumber(codeOf.get(branchId)!, year, first + at));
    });
  }
  return numbers;
}

/**
 * The plan facts of a submit, while every order is still DRAFT or RETURNED: the number where the
 * order has none (05 Order number: "given at the first submit; never changes"), `submitted_at`
 * only at the first submit (plan of 2.11, decided item 4, Look first: 2.8 sorts by the earliest
 * submit), `planned_total` = orderTotal() and `stock_at_submit` at every submit (decided item 4:
 * the approvers of the current round decide on this plan and this stock). A draft that never had a
 * number first takes the hidden value of each hidden field; a numbered order keeps what it holds
 * (05 Fields the Head sets 2 and 4; plan of 2.5d, decided item 2, Look first).
 */
export async function writePlan(
  tx: Transaction,
  rows: readonly SubmitRow[],
  numbers: ReadonlyMap<string, string>,
  at: Date,
  settings: SubmitSettings,
): Promise<void> {
  const hidden = await writeHiddenValues(tx, rows, settings);
  // Every row passed the checks, so the quantity is there; the price unless the Head made it not
  // required, and then no planned total (05 field 16; 08 Numbers the system calculates). A draft
  // that never had a number has the price and the extras its hidden values left.
  const values = rows.map((row) => {
    const own = hidden.get(row.id);
    const extras = own && !own.keepExtras ? [] : row.extras;
    const total = orderTotal({
      quantity: row.quantity!,
      price: own ? own.price : row.price,
      extras,
      paymentType: row.paymentType,
    });
    return sql`(${row.id}::uuid, ${numbers.get(row.id) ?? null}::text, ${total?.toString() ?? null}::bigint)`;
  });
  // stock_at_submit is copied as the numeric(14,3) the branch holds now, no row is 0, a service
  // has none (05 field 4; review of the plan of 2.7, correction 3: never a JavaScript number).
  await tx.execute(sql`
    update orders o
    set number = coalesce(o.number, v.number),
        submitted_at = coalesce(o.submitted_at, ${at}),
        planned_total = v.total,
        stock_at_submit = case when p.type = 'SERVICE' then null else coalesce(
          (select sb.qty from stock_balances sb
           where sb.branch_id = o.branch_id and sb.variant_id = o.variant_id), 0) end
    from (values ${sql.join(values, sql`, `)}) as v(id, number, total),
         product_variants pv join products p on p.id = pv.product_id
    where o.id = v.id and pv.id = o.variant_id`);
}

/**
 * The hidden values of the drafts that never had a number (05 Fields the Head sets 2), by
 * withHiddenValues() of src/domain/order-fields.ts: one update per such draft, and its extra
 * costs removed when they are hidden (a draft's rows may be removed: 05 Drafts 3). Gives each
 * such draft's price and whether its extras stay, for its planned total.
 */
async function writeHiddenValues(
  tx: Transaction,
  rows: readonly SubmitRow[],
  settings: SubmitSettings,
): Promise<Map<string, { price: bigint | null; keepExtras: boolean }>> {
  const written = new Map<string, { price: bigint | null; keepExtras: boolean }>();
  const fresh = rows.filter((row) => row.number === null);
  if (fresh.length === 0) return written;
  const suggested = new Map(fresh.map((row) => [row.id, row.suggestedPrice]));
  const held = await tx
    .select({
      id: orders.id,
      departmentId: orders.departmentId,
      price: orders.plannedPrice,
      neededBy: orders.neededBy,
      paymentType: orders.paymentType,
      priority: orders.priority,
      urgentReason: orders.urgentReason,
      companyId: orders.companyId,
      requesterName: orders.requesterName,
      comment: orders.comment,
      referencePhotoFileId: orders.referencePhotoFileId,
    })
    .from(orders)
    .where(inArray(orders.id, ids(fresh.map((row) => row.id))));
  for (const plan of held) {
    const { keepExtras, price, ...values } = withHiddenValues(
      settings.fields,
      plan,
      settings.defaultPaymentType,
      suggested.get(plan.id) ?? null,
    );
    const changed =
      price !== plan.price ||
      (Object.keys(values) as (keyof typeof values)[]).some((key) => values[key] !== plan[key]);
    if (changed) {
      await tx
        .update(orders)
        .set({ ...values, plannedPrice: price })
        .where(eq(orders.id, plan.id));
    }
    if (!keepExtras) await tx.delete(orderExtras).where(eq(orderExtras.orderId, plan.id));
    written.set(plan.id, { price, keepExtras });
  }
  return written;
}

/**
 * The full copy at each submit (14-data-model.md, order_revisions): ids and values, money as
 * whole so'm in text (plan of 2.7, decided item 12), of the order's revision as it stands now, as
 * the next submission of that revision: 1 at its first submit, 2 after a Take back (plan of 2.11,
 * decided item 2, Look first; review of the plan, correction 1: numbered by the highest
 * submission, read under the orders' lock, never by time). Run after the revision is raised.
 */
export async function writeSnapshots(
  tx: Transaction,
  orderIds: readonly string[],
  at: Date,
): Promise<void> {
  await tx.execute(sql`
    insert into order_revisions (order_id, revision, submission, snapshot, created_at)
    select o.id, o.revision, coalesce((
      select max(r.submission) from order_revisions r
      where r.order_id = o.id and r.revision = o.revision), 0) + 1,
    jsonb_build_object(
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
    where o.id in (${sql.join(
      orderIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
    order by o.id`);
}
