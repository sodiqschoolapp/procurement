import { asc, eq, inArray } from "drizzle-orm";

import { suggestedPrice } from "@/domain/drafts";
import type { PaymentType } from "@/domain/payment-types";
import { branches, orderExtras, orders, productVariants } from "@/server/db/schema";
import { type CopyContext, defineCopyAction } from "@/server/copy-action";
import type { OrderFailure } from "@/server/action-result";

import {
  type DraftTrio,
  type ExtraRow,
  isOneDraftViolation,
  lockDraftTrio,
  lockTrioDraft,
  refuse,
} from "./draft-fields";
import { type CreatedDraft, firstAnswer, insertDraft, mergeInto } from "./drafts";

// Copy as new (05-order-request-form.md, Ticking and filters: "Any order, including a rejected
// one, can be copied into a new draft; several ticked orders can be copied at once"; 15 S6; plan
// of 2.13). Each ticked order becomes a draft of the user who copies, in the order's branch, with
// the order's plan as it stands now (decided item 3, Look first): subtype, department, requested
// by, company (an empty one stays empty: review correction 2), quantity, price per unit, extra
// costs, payment type, priority and urgent reason, comment, needed-by. Number, revision, history,
// approvals, stock at submit and the reference photo stay with the order (decided item 7). An
// order without a planned price is copied with the suggested price, as any new draft takes it
// (05 field 11; plan of 2.5d-b, decided item 11).
// The draft merge of 05 Drafts 2 applies (decided item 2, Look first): where the user has a
// never-submitted draft of the same branch, subtype and department, only the quantity is added to
// it and its other fields stay; two ticked orders of one trio make one draft, the first sent
// first. A deactivated entry is copied as it is and the draft is marked; an inactive branch
// refuses the order (decided item 6). `request.create` on each order's branch: the Head, a
// Manager with CREATE_REQUESTS there (decided item 1, Look first).

/** One ticked order as the copy reads it. */
type Source = {
  branchId: string;
  branchActive: boolean;
  variantId: string | null;
  departmentId: string | null;
  quantity: string | null;
  companyId: string | null;
  requesterName: string | null;
  neededBy: string | null;
  price: bigint | null;
  extras: ExtraRow[];
  paymentType: PaymentType;
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
  comment: string | null;
};

/** The ticked orders by id, with their extra costs in their own order (05 fields 1 to 15). */
async function readSources(context: CopyContext): Promise<Map<string, Source>> {
  const ids = context.orders.map((order) => order.id);
  const rows = await context.tx
    .select({
      id: orders.id,
      branchId: orders.branchId,
      branchActive: branches.isActive,
      variantId: orders.variantId,
      departmentId: orders.departmentId,
      quantity: orders.plannedQty,
      companyId: orders.companyId,
      requesterName: orders.requesterName,
      neededBy: orders.neededBy,
      price: orders.plannedPrice,
      referencePrice: productVariants.referencePrice,
      lastPurchasePrice: productVariants.lastPurchasePrice,
      paymentType: orders.paymentType,
      priority: orders.priority,
      urgentReason: orders.urgentReason,
      comment: orders.comment,
    })
    .from(orders)
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .leftJoin(productVariants, eq(productVariants.id, orders.variantId))
    .where(inArray(orders.id, ids));
  const extras = await context.tx
    .select({
      orderId: orderExtras.orderId,
      extraCostTypeId: orderExtras.extraCostTypeId,
      amount: orderExtras.amount,
    })
    .from(orderExtras)
    .where(inArray(orderExtras.orderId, ids))
    .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));
  const sources = new Map<string, Source>();
  for (const { id, referencePrice, lastPurchasePrice, ...row } of rows) {
    const price = row.price ?? suggestedPrice(referencePrice, lastPurchasePrice);
    sources.set(id, { ...row, price, extras: [] });
  }
  for (const { orderId, ...extra } of extras) sources.get(orderId)?.extras.push(extra);
  return sources;
}

/** The copier's trio of a source; null for a draft that names no subtype or department yet. */
function trioOf(userId: string, source: Source): DraftTrio | null {
  if (source.variantId === null || source.departmentId === null) return null;
  return {
    ownerId: userId,
    branchId: source.branchId,
    variantId: source.variantId,
    departmentId: source.departmentId,
  };
}

const trioKey = (trio: DraftTrio) => `${trio.branchId}:${trio.variantId}:${trio.departmentId}`;

/** What one ticked order made: its own draft, or an add to the user's draft (05 Drafts 2). */
export type CopiedDraft = CreatedDraft;

export const copyOrdersAsNew = defineCopyAction<CopiedDraft, Map<string, Source>>({
  name: "copyOrdersAsNew",
  permission: "request.create",
  find: (tx, clientKey) => firstAnswer(tx, clientKey),
  async prepare(context) {
    const sources = await readSources(context);
    const failures: OrderFailure[] = [];
    const trios = new Map<string, DraftTrio>();
    for (const order of context.orders) {
      const source = sources.get(order.id)!;
      const trio = trioOf(context.userId, source);
      // No draft can be added to an inactive branch (decisions 2.5a item 20); a draft that
      // names no subtype, department or quantity has nothing to copy.
      if (!source.branchActive || trio === null || source.quantity === null) {
        failures.push({ orderId: order.id, code: "not_ready" });
      } else {
        trios.set(trioKey(trio), trio);
      }
    }
    // One sorted order, so two copies of one user never wait for each other in a circle (review
    // of the plan, Should fix 2).
    for (const key of [...trios.keys()].toSorted())
      await lockDraftTrio(context.tx, trios.get(key)!);
    return { failures, data: sources };
  },
  async write({ tx, userId }, sources, order) {
    const source = sources.get(order.id)!;
    const trio = trioOf(userId, source)!;
    const quantity = source.quantity!;
    const existing = await lockTrioDraft(tx, trio);
    if (existing) return mergeInto(tx, existing, quantity, order.clientKey, userId);
    try {
      return await insertDraft(tx, userId, {
        clientKey: order.clientKey,
        branchId: trio.branchId,
        variantId: trio.variantId,
        departmentId: trio.departmentId,
        quantity,
        companyId: source.companyId,
        requesterName: source.requesterName,
        neededBy: source.neededBy,
        price: source.price,
        extras: source.extras,
        paymentType: source.paymentType,
        priority: source.priority,
        urgentReason: source.urgentReason,
        comment: source.comment,
        referencePhotoFileId: null,
      });
    } catch (error) {
      // The trio's lock makes this rare; the index is the last defence (decisions 2.5a item 24).
      if (isOneDraftViolation(error)) refuse("variantId", "errors.field.draftExists");
      throw error;
    }
  },
});
