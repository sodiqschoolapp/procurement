import { eq, inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { businessDate, isBusinessDate } from "@/domain/business-date";
import { DRAFT_EXTRAS_MAX, draftComment, isDraftComment, quantityRefusal } from "@/domain/drafts";
import { FILE_MIMES } from "@/domain/files";
import { parseSomOrZero } from "@/domain/money";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import {
  actualQuantity,
  actualTotal,
  progressAfterBuying,
  purchaseCommentNeeds,
  purchaseDateRefusal,
} from "@/domain/purchases";
import { ActionError } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  companies,
  extraCostTypes,
  files,
  orders,
  priceHistory,
  productVariants,
  purchaseExtras,
  purchaseTrips,
  purchases,
  tripFiles,
} from "@/server/db/schema";
import { accessOf } from "@/server/files/owners";
import {
  type OrdersContext,
  type OrdersInput,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";
import { readSettings } from "@/server/settings";
import { postMovement } from "@/server/stock-ledger";

import { requiredPriceField } from "../../catalog/actions/catalog-fields";
import { orderRecords } from "../queries/order-records";

// Record a purchase for one Open order, a trip of one (07-purchasing.md, Purchase record; What
// saving a record does; 02-assumptions.md A7; plan of 3.3). It runs in the wrapper of
// src/server/order-action.ts: lock, repeat, authorize (`purchase.record`: the Head in any branch,
// the owner with RECORD_PURCHASES on; 03 Permission matrix), version, then the status check: the
// order is Open and its buying is not finished (decided item 3, Look first; 3.5 reopens it). The
// write step first checks under the lock what needs the database, as field errors that roll the
// whole transaction back (spec review of the plan, Should fix 1), then writes in one transaction
// (07, What saving a record does; developer-rules.md rule 3):
//
//   1  the trip (date, supplier, payment type: never copied to the record; 14 purchases), the
//      record, its extra costs and the receipt files
//   2  for a product, a Receipt movement at the record's price (09 Stock value, first bullet:
//      extra costs not included); a service changes no stock (A7)
//   3  above price 0, the subtype's last purchase price and a PURCHASE price row; a gift writes
//      neither (decided item 2, Look first)
//   4  the order's `actual_total` and `progress`, from every record of the order (progress 3.2,
//      "For 3.3 and 3.5"); the wrapper raises its version
//   6  the history event, by the wrapper; its note is the record's comment
//
// No notification (decided item 11). The trip takes the action's client key (decided item 12).

/** "0 to 5 photos or PDF files" (07 Purchase record, Receipt). */
export const RECEIPT_FILES_MAX = 5;

/** 07 Purchase record, Actual price per unit: "0 or more, whole so'm". */
const unitPriceField = z
  .string()
  .refine((value) => parseSomOrZero(value) !== null)
  .transform((value) => parseSomOrZero(value)!);

export type RecordPurchaseInput = OrdersInput & {
  purchasedOn: string;
  qty: string;
  unitPrice: bigint;
  paymentType: PaymentType;
  supplierId: string | null;
  extras: { extraCostTypeId: string; amount: bigint; paymentType: PaymentType }[];
  receiptFileIds: string[];
  comment: string | null;
};

const input = ordersInput({
  purchasedOn: z.string().refine(isBusinessDate),
  qty: z.string().trim().min(1).max(40),
  unitPrice: unitPriceField,
  paymentType: z.enum(PAYMENT_TYPES),
  supplierId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  extras: z
    .array(
      z.object({
        extraCostTypeId: z.uuid(),
        amount: requiredPriceField,
        paymentType: z.enum(PAYMENT_TYPES),
      }),
    )
    .max(DRAFT_EXTRAS_MAX),
  receiptFileIds: z.array(z.uuid()).max(RECEIPT_FILES_MAX),
  comment: z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : draftComment(value) || null))
    .refine((value) => value === null || isDraftComment(value), {
      params: { fieldError: "tooLong" },
    }),
})
  .refine((value) => value.orders.length === 1, {
    path: ["orders"],
    message: "A purchase is recorded for one order (plan of 3.3, decided item 13).",
  })
  .refine((value) => new Set(value.receiptFileIds).size === value.receiptFileIds.length, {
    path: ["receiptFileIds"],
    message: "A receipt file is sent twice.",
  }) as unknown as z.ZodType<RecordPurchaseInput>;

function refuse(field: string, kind: FieldMessageKey): never {
  throw new ActionError("invalid_input", { [field]: kind });
}

/** The order's plan and catalog facts, read under the wrapper's lock of the order. */
async function planOf(tx: Executor, orderId: string) {
  const found = await tx.execute<{
    variant_id: string;
    planned_qty: string;
    planned_price: string;
    payment_type: PaymentType;
    approved_at: Date | null;
    progress: "OPEN" | "DONE" | "DONE_SHORT" | "NOT_BOUGHT";
    product_type: "GOODS" | "SERVICE";
    allow_decimal: boolean;
  }>(sql`
    select o.variant_id, o.planned_qty, o.planned_price, o.payment_type, o.approved_at, o.progress,
           p.type as product_type, u.allow_decimal
    from orders o
    join product_variants v on v.id = o.variant_id
    join products p on p.id = v.product_id
    join units u on u.id = p.unit_id
    where o.id = ${orderId}`);
  const row = found.rows[0]!;
  return {
    variantId: row.variant_id,
    plannedQty: row.planned_qty,
    plannedPrice: BigInt(row.planned_price),
    paymentType: row.payment_type,
    approvedAt: row.approved_at === null ? null : new Date(row.approved_at),
    progress: row.progress,
    isService: row.product_type === "SERVICE",
    allowDecimal: row.allow_decimal,
  };
}

/** An active entry, read FOR SHARE so a deactivation and a pick cannot pass each other (04 rule 2). */
async function refuseInactive(
  tx: Executor,
  table: typeof companies | typeof extraCostTypes,
  ids: readonly string[],
  field: (id: string) => string,
) {
  if (ids.length === 0) return;
  const rows = await tx
    .select({ id: table.id, isActive: table.isActive })
    .from(table)
    .where(inArray(table.id, [...ids]))
    .for("share");
  const active = new Set(rows.filter((row) => row.isActive).map((row) => row.id));
  for (const id of ids) if (!active.has(id)) refuse(field(id), "errors.field.inactive");
}

/**
 * The receipt files: each uploaded by the actor, of a stored type, held by no record yet, its row
 * locked FOR UPDATE (the file contract of src/server/files/owners.ts; progress 3.2, "For 3.3").
 */
async function refuseReceipts(tx: Executor, userId: string, ids: readonly string[]) {
  for (const [at, id] of ids.entries()) {
    const [file] = await tx
      .select({ uploadedBy: files.uploadedBy, mime: files.mime })
      .from(files)
      .where(eq(files.id, id))
      .for("update");
    if (
      !file ||
      file.uploadedBy !== userId ||
      !(FILE_MIMES as readonly string[]).includes(file.mime) ||
      (await accessOf(tx, id)) !== null
    ) {
      refuse(`receiptFileIds.${at}`, "errors.field.notAllowed");
    }
  }
}

export const recordPurchase = defineOrdersAction<RecordPurchaseInput>({
  name: "recordPurchase",
  type: "RECORD_PURCHASE",
  input,
  permission: () => "purchase.record",
  repeatPermission: () => "purchase.record",
  reason: () => null,
  check({ orders: locked }) {
    // 07 Order progress: a finished order's buying is reopened first (3.5; decided item 3).
    return locked
      .filter((order) => order.status !== "PURCHASING" || order.progress !== "OPEN")
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
  },
  async write(context: OrdersContext<RecordPurchaseInput>) {
    const { tx, input: typed, userId } = context;
    const order = context.orders[0]!;
    const plan = await planOf(tx, order.id);

    // The fields the database decides, before anything is written.
    const qtyRefusal = quantityRefusal(typed.qty, plan.allowDecimal);
    if (qtyRefusal) refuse("qty", `errors.field.${qtyRefusal}`);
    const today = businessDate(now());
    const dateRefusal = purchaseDateRefusal(
      typed.purchasedOn,
      today,
      plan.approvedAt === null ? null : businessDate(plan.approvedAt),
    );
    if (dateRefusal) refuse("purchasedOn", `errors.field.${dateRefusal}`);
    const before = await orderRecords(tx, order.id);
    const needs = purchaseCommentNeeds({
      qty: typed.qty,
      unitPrice: typed.unitPrice,
      paymentType: typed.paymentType,
      plannedQty: plan.plannedQty,
      plannedPrice: plan.plannedPrice,
      plannedPaymentType: plan.paymentType,
      received: actualQuantity(before),
    });
    if (needs.length > 0 && typed.comment === null) refuse("comment", "errors.field.required");
    if (typed.supplierId) {
      await refuseInactive(tx, companies, [typed.supplierId], () => "supplierId");
    }
    await refuseInactive(
      tx,
      extraCostTypes,
      [...new Set(typed.extras.map((extra) => extra.extraCostTypeId))],
      (id) =>
        `extras.${typed.extras.findIndex((extra) => extra.extraCostTypeId === id)}.extraCostTypeId`,
    );
    const settings = await readSettings(tx);
    // 07 Purchase record, Receipt; edge case "No receipt photo"; decided item 4, Look first: a
    // cash purchase is a trip paid in cash, whatever its extra costs' payment types.
    if (
      settings.receipt_required_for_cash &&
      typed.paymentType === "CASH" &&
      typed.receiptFileIds.length === 0
    ) {
      refuse("receiptFileIds", "errors.field.required");
    }
    await refuseReceipts(tx, userId, typed.receiptFileIds);

    const at = now();
    const [trip] = await tx
      .insert(purchaseTrips)
      .values({
        clientKey: typed.clientKey,
        branchId: order.branchId,
        purchasedOn: typed.purchasedOn,
        supplierId: typed.supplierId,
        paymentType: typed.paymentType,
        createdBy: userId,
        createdAt: at,
      })
      .returning({ id: purchaseTrips.id });
    const qty = typed.qty.trim();
    const [record] = await tx
      .insert(purchases)
      .values({
        tripId: trip!.id,
        orderId: order.id,
        branchId: order.branchId,
        variantId: plan.variantId,
        qty,
        unitPrice: typed.unitPrice,
        comment: typed.comment,
        createdBy: userId,
        createdAt: at,
      })
      .returning({ id: purchases.id });
    if (typed.extras.length > 0) {
      await tx.insert(purchaseExtras).values(
        typed.extras.map((extra) => ({
          purchaseId: record!.id,
          extraCostTypeId: extra.extraCostTypeId,
          amount: extra.amount,
          paymentType: extra.paymentType,
          createdAt: at,
        })),
      );
    }
    if (typed.receiptFileIds.length > 0) {
      await tx
        .insert(tripFiles)
        .values(
          typed.receiptFileIds.map((fileId) => ({ tripId: trip!.id, fileId, createdAt: at })),
        );
    }

    if (!plan.isService) {
      await postMovement(tx, {
        branchId: order.branchId,
        variantId: plan.variantId,
        type: "RECEIPT",
        qtyDelta: qty,
        unitCost: typed.unitPrice,
        createdBy: userId,
        purchaseId: record!.id,
      });
    }

    if (typed.unitPrice > 0n) {
      await tx
        .update(productVariants)
        .set({ lastPurchasePrice: typed.unitPrice, lastPurchaseAt: at })
        .where(eq(productVariants.id, plan.variantId));
      await tx.insert(priceHistory).values({
        variantId: plan.variantId,
        price: typed.unitPrice,
        source: "PURCHASE",
        setBy: userId,
        purchaseId: record!.id,
        createdAt: at,
      });
    }

    const after = await orderRecords(tx, order.id);
    await tx
      .update(orders)
      .set({
        actualTotal: actualTotal(after),
        progress: progressAfterBuying(plan.progress, plan.plannedQty, actualQuantity(after)),
      })
      .where(eq(orders.id, order.id));

    return new Map([
      [
        order.id,
        {
          note: typed.comment,
          payload: {
            purchase: { id: record!.id, qty, unitPrice: typed.unitPrice.toString() },
          },
        },
      ],
    ]);
  },
});
