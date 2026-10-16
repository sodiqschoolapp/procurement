import { eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { isBusinessDate } from "@/domain/business-date";
import {
  addQuantities,
  draftTotal,
  isDraftEditable,
  isNeverSubmitted,
  plainQuantity,
  suggestedPrice,
  totalFits,
} from "@/domain/drafts";
import { behindDraftWall } from "@/domain/order-moves";
import { priceHintPercent } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import { decide } from "@/domain/permissions";
import { ActionError, type FirstResult, defineAction } from "@/server/action";
import { AuthorizationError, type Executor, authorize } from "@/server/authorize";
import { now } from "@/server/clock";
import { orderDraftAdds, orderExtras, orders } from "@/server/db/schema";
import { defineDraftsAction, draftsInput } from "@/server/drafts-action";
import { readSettings } from "@/server/settings";

import { refusePhoto } from "../../catalog/actions/photos";
import {
  type ExtraRow,
  commentField,
  extrasField,
  isOneDraftViolation,
  lockDraftTrio,
  lockTrioDraft,
  neededByField,
  neverSubmittedOf,
  optionalId,
  orderTarget,
  paymentTypeField,
  pickedBranch,
  pickedCompany,
  pickedDepartment,
  pickedExtras,
  pickedSubtype,
  priceField,
  priorityField,
  quantityField,
  readSubtype,
  refuse,
  refuseQuantity,
  requesterNameField,
  storedUrgentReason,
  urgentReasonField,
} from "./draft-fields";

// The draft orders of the drafts grid (05-order-request-form.md, Order; Drafts 1 to 3 and 5;
// 06-approval-workflow.md, Statuses: Draft; plan of 2.5a). The definitions run on the action
// wrappers; the `"use server"` exports come with the screen in 2.5b.
// - createDraft: `request.create` on the branch sent (a create's target). A draft whose branch,
//   subtype and department equal the owner's never-submitted draft raises that draft's quantity
//   and keeps its other fields (05 Drafts 2; decided item 2, Look first); the merged add keeps its
//   client key in `order_draft_adds`, so a repeat returns the first answer (decided item 3).
// - updateDraft: `request.edit`, the changed fields only, with the version (developer-rules.md
//   rule 9). DRAFT and RETURNED orders (05 Drafts 5; decided item 22).
// - deleteDraft: the owner's never-submitted draft only (05 Drafts 3; rule 11; decided item 7).
// - setDraftsNeededBy: one needed-by date on ticked drafts, all or nothing (05 field 8; item 10).
// Another user's Draft is "Not found" to all but its owner and the Head (the draft wall), before
// authorize(). No audit row, event or notification (decided item 21).

/** A Draft's answer to its first add, and to the same add sent again. */
export type CreatedDraft =
  | { id: string; merged: false; version: number }
  | { id: string; merged: true; quantity: string; version: number; total: bigint | null };

const createInput = z.object({
  clientKey: z.string().refine(isClientKey),
  branchId: z.uuid(),
  variantId: z.uuid(),
  departmentId: z.uuid(),
  quantity: quantityField,
  companyId: optionalId.optional(),
  requesterName: requesterNameField.optional(),
  neededBy: neededByField.optional(),
  price: priceField.optional(),
  extras: extrasField.optional(),
  paymentType: paymentTypeField.optional(),
  priority: priorityField.optional(),
  urgentReason: urgentReasonField,
  comment: commentField.optional(),
  referencePhotoFileId: optionalId.optional(),
});

/** The extra costs of an order, as amounts. */
async function extrasOf(tx: Executor, orderId: string): Promise<ExtraRow[]> {
  return tx
    .select({ extraCostTypeId: orderExtras.extraCostTypeId, amount: orderExtras.amount })
    .from(orderExtras)
    .where(eq(orderExtras.orderId, orderId))
    .orderBy(orderExtras.createdAt, orderExtras.id);
}

/** Writes an order's extra-cost rows (05 field 12). */
async function insertExtras(tx: Executor, orderId: string, extras: readonly ExtraRow[]) {
  if (extras.length === 0) return;
  const at = now();
  await tx.insert(orderExtras).values(
    extras.map((extra) => ({
      orderId,
      extraCostTypeId: extra.extraCostTypeId,
      amount: extra.amount,
      createdAt: at,
    })),
  );
}

/** The total of a draft as it stands now, with a quantity given (05 field 16; item 19). */
async function totalWith(
  tx: Executor,
  order: { id: string; plannedPrice: bigint | null; paymentType: PaymentType },
  quantity: string | null,
): Promise<bigint | null> {
  const extras = await extrasOf(tx, order.id);
  return draftTotal({
    quantity,
    price: order.plannedPrice,
    extras: extras.map((extra) => extra.amount),
    paymentType: order.paymentType,
  });
}

/**
 * The first answer of a client key (developer-rules.md rule 8): the draft it made, or the merged
 * add it recorded (decided item 3, Look first), with its maker and the branch of its draft. The
 * key's advisory lock of runAction() is held, so a key is read once by one call at a time.
 */
export async function firstAnswer(
  tx: Executor,
  clientKey: string,
): Promise<FirstResult<CreatedDraft> | null> {
  const [made] = await tx
    .select({ id: orders.id, branchId: orders.branchId, userId: orders.createdBy })
    .from(orders)
    .where(eq(orders.clientKey, clientKey));
  if (made) {
    return {
      result: { id: made.id, merged: false, version: 1 },
      userId: made.userId,
      branchId: made.branchId,
    };
  }
  const [added] = await tx
    .select({
      id: orders.id,
      branchId: orders.branchId,
      userId: orderDraftAdds.userId,
      quantity: orderDraftAdds.qtyAfter,
      version: orderDraftAdds.versionAfter,
      total: orderDraftAdds.totalAfter,
    })
    .from(orderDraftAdds)
    .innerJoin(orders, eq(orders.id, orderDraftAdds.orderId))
    .where(eq(orderDraftAdds.clientKey, clientKey));
  if (!added) return null;
  return {
    result: {
      id: added.id,
      merged: true,
      quantity: plainQuantity(added.quantity),
      version: added.version,
      // Stored with the add, never rebuilt from the draft as it stands (review of 2.5a, S2).
      total: added.total,
    },
    userId: added.userId,
    branchId: added.branchId,
  };
}

export const createDraft = defineAction({
  name: "createDraft",
  permission: "request.create",
  input: createInput,
  // A create: the branch comes from the input and authorize() checks it is the actor's.
  async target({ input }) {
    return { branchId: input.branchId };
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    find: (tx, clientKey) => firstAnswer(tx, clientKey),
  },
  async write({ tx, input, userId }): Promise<CreatedDraft> {
    await pickedBranch(tx, input.branchId);
    const subtype = await pickedSubtype(tx, input.variantId);
    await pickedDepartment(tx, input.departmentId, input.branchId);
    refuseQuantity(input.quantity, subtype.allowsDecimals);

    const trio = {
      ownerId: userId,
      branchId: input.branchId,
      variantId: input.variantId,
      departmentId: input.departmentId,
    };
    await lockDraftTrio(tx, trio);
    const existing = await lockTrioDraft(tx, trio);
    if (existing) return mergeInto(tx, existing, input.quantity, input.clientKey, userId);

    // The picks are checked here, never in insertDraft(): a copy writes a deactivated entry as it
    // is and the draft is marked (plan of 2.13, decided item 6; review Should fix 2).
    if (input.companyId) await pickedCompany(tx, input.companyId);
    const extras = input.extras ?? [];
    await pickedExtras(tx, extras);
    if (input.referencePhotoFileId) {
      await refusePhoto(tx, userId, input.referencePhotoFileId, "referencePhotoFileId");
    }
    const priority = input.priority ?? "NORMAL";
    try {
      return await insertDraft(tx, userId, {
        clientKey: input.clientKey,
        branchId: input.branchId,
        variantId: input.variantId,
        departmentId: input.departmentId,
        quantity: input.quantity,
        companyId: input.companyId ?? subtype.defaultCompanyId,
        requesterName: input.requesterName ?? null,
        neededBy: input.neededBy ?? null,
        price: input.price ?? suggestedPrice(subtype.referencePrice, subtype.lastPurchasePrice),
        extras,
        paymentType: input.paymentType ?? (await readSettings(tx)).default_payment_type,
        priority,
        urgentReason: storedUrgentReason(priority, input.urgentReason ?? null),
        comment: input.comment ?? null,
        referencePhotoFileId: input.referencePhotoFileId ?? null,
      });
    } catch (error) {
      // The trio's lock makes this rare; the index is the last defence (decided item 24).
      if (isOneDraftViolation(error)) refuse("variantId", "errors.field.draftExists");
      throw error;
    }
  },
});

/**
 * 05 Drafts 2: the owner's never-submitted draft of the same branch, subtype and department rises
 * by the new quantity; every other field stays. The add is recorded with its client key, the
 * quantity and the version after it, so a repeat answers the same (review of the plan,
 * correction 2).
 */
export async function mergeInto(
  tx: Executor,
  draft: NonNullable<Awaited<ReturnType<typeof lockTrioDraft>>>,
  added: string,
  clientKey: string,
  userId: string,
): Promise<CreatedDraft> {
  const orderId = draft.id;
  const quantity = draft.plannedQty ? addQuantities(draft.plannedQty, added) : added;
  if (quantity === null) refuse("quantity", "errors.field.tooLarge");
  const total = await totalWith(tx, draft, quantity);
  if (!totalFits(total)) refuse("quantity", "errors.field.tooLarge");
  const version = draft.version + 1;
  const at = now();
  await tx
    .update(orders)
    .set({ plannedQty: quantity, plannedTotal: total, version, updatedAt: at })
    .where(eq(orders.id, orderId));
  await tx.insert(orderDraftAdds).values({
    clientKey,
    orderId,
    addedQty: added,
    qtyAfter: quantity,
    versionAfter: version,
    totalAfter: total,
    userId,
    createdAt: at,
  });
  return { id: orderId, merged: true, quantity, version, total };
}

/** Every field of a new draft, as it is written: the caller has filled and checked each one. */
export type NewDraft = {
  clientKey: string;
  branchId: string;
  variantId: string;
  departmentId: string;
  quantity: string;
  companyId: string | null;
  requesterName: string | null;
  neededBy: string | null;
  price: bigint | null;
  extras: readonly ExtraRow[];
  paymentType: PaymentType;
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
  comment: string | null;
  referencePhotoFileId: string | null;
};

/**
 * Writes a new draft (05 Order; Drafts 1). createDraft() fills the fields not sent from the catalog
 * and the settings (05 fields 6, 11, 13); a copy sends the ticked order's (plan of 2.13, decided
 * item 3, Look first). The total is draftTotal() of the row as written (decided item 19).
 */
export async function insertDraft(
  tx: Executor,
  userId: string,
  draft: NewDraft,
): Promise<CreatedDraft> {
  const total = draftTotal({
    quantity: draft.quantity,
    price: draft.price,
    extras: draft.extras.map((extra) => extra.amount),
    paymentType: draft.paymentType,
  });
  if (!totalFits(total)) refuse("quantity", "errors.field.tooLarge");
  const at = now();
  const [row] = await tx
    .insert(orders)
    .values({
      branchId: draft.branchId,
      ownerId: userId,
      createdBy: userId,
      status: "DRAFT",
      priority: draft.priority,
      urgentReason: draft.urgentReason,
      variantId: draft.variantId,
      companyId: draft.companyId,
      departmentId: draft.departmentId,
      requesterName: draft.requesterName,
      neededBy: draft.neededBy,
      plannedQty: draft.quantity,
      plannedPrice: draft.price,
      paymentType: draft.paymentType,
      comment: draft.comment,
      referencePhotoFileId: draft.referencePhotoFileId,
      plannedTotal: total,
      clientKey: draft.clientKey,
      createdAt: at,
      updatedAt: at,
    })
    .returning({ id: orders.id, version: orders.version });
  await insertExtras(tx, row!.id, draft.extras);
  return { id: row!.id, merged: false, version: row!.version };
}

const updateInput = z.object({
  id: z.uuid(),
  version: z.int().min(1),
  // 05 fields 1, 3, 7, 10 are required: sent, they are never empty (review of the plan,
  // correction 1).
  branchId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  quantity: quantityField.optional(),
  companyId: optionalId.optional(),
  requesterName: requesterNameField.optional(),
  neededBy: neededByField.optional(),
  price: priceField.optional(),
  extras: extrasField.optional(),
  paymentType: paymentTypeField.optional(),
  priority: priorityField.optional(),
  urgentReason: urgentReasonField,
  comment: commentField.optional(),
  referencePhotoFileId: optionalId.optional(),
});

type LockedDraft = typeof orders.$inferSelect;

/** Locks one order FOR UPDATE: its branch, owner and version are checked under the lock. */
async function lockOrder(tx: Executor, id: string) {
  const [row] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
  if (!row) return null;
  return {
    target: { branchId: row.branchId, ownerId: row.ownerId },
    version: { id: row.id, current: row.version },
    rows: row as LockedDraft,
  };
}

/** What updateDraft answers: the new version, total and price hint (05 field 16; Price hint). */
export type UpdatedDraft = { version: number; total: bigint | null; priceHint: bigint | null };

export const updateDraft = defineAction({
  name: "updateDraft",
  permission: "request.edit",
  input: updateInput,
  target: ({ tx, userId, input }) => orderTarget(tx, userId, input.id),
  lock: ({ tx, input }) => lockOrder(tx, input.id),
  versionOf: { table: orders, id: orders.id, version: orders.version },
  check({ actor, locked }) {
    const row = locked!.rows;
    if (behindDraftWall(actor, row)) throw new ActionError("not_found");
    if (!isDraftEditable(row.status)) throw new ActionError("wrong_status");
  },
  async write({ tx, input, userId, actor, locked }): Promise<UpdatedDraft> {
    const row = locked!.rows;
    const sent = <Key extends keyof typeof input>(key: Key) => input[key] !== undefined;

    // 05 field 1: the branch of a never-submitted draft may change, to an active branch the actor
    // sees and the owner may add in, with a department of it in the same write (decided item 8).
    const branchId = input.branchId ?? row.branchId;
    const branchChanged = branchId !== row.branchId;
    if (branchChanged) {
      if (row.number !== null) refuse("branchId", "errors.field.notAllowed");
      const seen = decide("request.create", actor, { branchId });
      if (seen !== "allow") throw new ActionError(seen);
      await pickedBranch(tx, branchId);
      try {
        await authorize(row.ownerId, "request.create", { branchId }, tx);
      } catch (error) {
        if (error instanceof AuthorizationError) refuse("branchId", "errors.field.notAllowed");
        throw error;
      }
      if (!sent("departmentId")) refuse("departmentId", "errors.field.required");
    }

    const departmentId = input.departmentId ?? row.departmentId;
    const departmentChanged = departmentId !== row.departmentId;
    if (departmentId && (departmentChanged || branchChanged)) {
      await pickedDepartment(tx, departmentId, branchId);
    }

    const variantId = input.variantId ?? row.variantId;
    const variantChanged = variantId !== row.variantId;
    const before = row.variantId ? await readSubtype(tx, row.variantId, false) : null;
    const subtype = variantChanged ? await pickedSubtype(tx, variantId!) : before;

    const quantity = input.quantity ?? row.plannedQty;
    if (quantity && subtype && (sent("quantity") || variantChanged)) {
      refuseQuantity(quantity, subtype.allowsDecimals);
    }

    // 05 Drafts 2: an edit never makes a second never-submitted draft of one trio (item 2).
    const trioField = variantChanged ? "variantId" : "departmentId";
    const trioChanged = branchChanged || variantChanged || departmentChanged;
    if (row.number === null && trioChanged && variantId && departmentId) {
      const trio = { ownerId: row.ownerId, branchId, variantId, departmentId };
      await lockDraftTrio(tx, trio);
      if (await neverSubmittedOf(tx, trio, row.id)) refuse(trioField, "errors.field.draftExists");
    }

    // 05 field 11: the new subtype's suggestion unless a price is sent (decided item 4).
    const price = sent("price")
      ? (input.price ?? null)
      : variantChanged && subtype
        ? suggestedPrice(subtype.referencePrice, subtype.lastPurchasePrice)
        : row.plannedPrice;

    // 05 field 6: the product's default company on a change of product, unless one is sent.
    let companyId = row.companyId;
    if (sent("companyId")) {
      companyId = input.companyId ?? null;
      if (companyId && companyId !== row.companyId) await pickedCompany(tx, companyId);
    } else if (variantChanged && subtype && subtype.productId !== before?.productId) {
      companyId = subtype.defaultCompanyId;
    }

    let extras: ExtraRow[];
    if (input.extras !== undefined) {
      await pickedExtras(tx, input.extras);
      extras = input.extras;
    } else {
      extras = await extrasOf(tx, row.id);
    }

    const priority = input.priority ?? row.priority;
    const reason = sent("urgentReason") ? (input.urgentReason ?? null) : row.urgentReason;
    const urgentReason = storedUrgentReason(priority, reason);

    const photo = sent("referencePhotoFileId")
      ? (input.referencePhotoFileId ?? null)
      : row.referencePhotoFileId;
    if (photo && photo !== row.referencePhotoFileId) {
      await refusePhoto(tx, userId, photo, "referencePhotoFileId");
    }

    const paymentType = input.paymentType ?? row.paymentType;
    const total = draftTotal({
      quantity,
      price,
      extras: extras.map((extra) => extra.amount),
      paymentType,
    });
    if (!totalFits(total)) {
      const field = sent("quantity")
        ? "quantity"
        : sent("price")
          ? "price"
          : sent("extras")
            ? "extras"
            : "quantity";
      refuse(field, "errors.field.tooLarge");
    }

    try {
      await tx
        .update(orders)
        .set({
          branchId,
          departmentId,
          variantId,
          plannedQty: quantity,
          plannedPrice: price,
          companyId,
          requesterName: sent("requesterName") ? (input.requesterName ?? null) : row.requesterName,
          neededBy: sent("neededBy") ? (input.neededBy ?? null) : row.neededBy,
          paymentType,
          priority,
          urgentReason,
          comment: sent("comment") ? (input.comment ?? null) : row.comment,
          referencePhotoFileId: photo,
          plannedTotal: total,
          updatedAt: now(),
        })
        .where(eq(orders.id, row.id));
    } catch (error) {
      if (isOneDraftViolation(error)) refuse(trioField, "errors.field.draftExists");
      throw error;
    }
    if (input.extras !== undefined) {
      await tx.delete(orderExtras).where(eq(orderExtras.orderId, row.id));
      await insertExtras(tx, row.id, extras);
    }

    const threshold = (await readSettings(tx)).price_hint_percent;
    return {
      version: row.version + 1,
      total,
      priceHint: priceHintPercent(price, subtype?.referencePrice ?? null, threshold),
    };
  },
});

/**
 * 05 Drafts 3: "The owner can delete a draft that was never submitted" (developer-rules.md rule
 * 11). The owner only, the Head included only as the owner (decided item 7, Look first). Its extra
 * costs and recorded adds go with it; its reference photo goes back to its uploader alone.
 */
export const deleteDraft = defineAction({
  name: "deleteDraft",
  permission: "request.edit",
  input: z.object({ id: z.uuid(), version: z.int().min(1) }),
  target: ({ tx, userId, input }) => orderTarget(tx, userId, input.id),
  // No `version` here: the wrapper would raise the version of a row that is gone. The version is
  // checked by the `check` step under the same lock (developer-rules.md rule 9).
  async lock({ tx, input }) {
    const locked = await lockOrder(tx, input.id);
    return locked && { target: locked.target, rows: locked.rows };
  },
  check({ input, actor, locked }) {
    const row = locked!.rows;
    if (behindDraftWall(actor, row)) throw new ActionError("not_found");
    if (row.ownerId !== actor.userId) throw new ActionError("forbidden");
    if (row.version !== input.version) throw new ActionError("stale_version");
    if (!isNeverSubmitted(row)) throw new ActionError("wrong_status");
  },
  async write({ tx, locked }) {
    await tx.delete(orders).where(eq(orders.id, locked!.rows.id));
    return { id: locked!.rows.id };
  },
});

/**
 * 05 field 8: "One click applies a date to all ticked drafts", all or nothing (06 rule 8; decided
 * item 10, Look first). Any valid day: "Not in the past" is checked at submit (decided item 16).
 */
export const setDraftsNeededBy = defineDraftsAction({
  name: "setDraftsNeededBy",
  input: draftsInput({ neededBy: z.string().refine(isBusinessDate) }),
  permission: "request.edit",
  check({ orders: ticked }) {
    return ticked
      .filter((order) => !isDraftEditable(order.status))
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
  },
  async write({ tx, input, orders: ticked }) {
    await tx
      .update(orders)
      .set({ neededBy: input.neededBy })
      .where(
        inArray(
          orders.id,
          ticked.map((order) => order.id),
        ),
      );
  },
});
