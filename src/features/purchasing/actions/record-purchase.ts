import { asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { businessDate, isBusinessDate } from "@/domain/business-date";
import { DRAFT_EXTRAS_MAX, draftComment, isDraftComment, quantityRefusal } from "@/domain/drafts";
import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import { FILE_MIMES } from "@/domain/files";
import { parseSomOrZero } from "@/domain/money";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import {
  type PurchaseRecord,
  actualQuantity,
  actualTotal,
  inSplitOrder,
  progressAfterBuying,
  purchaseCommentNeeds,
  purchaseDateRefusal,
  openedBy,
  receiptNeeded,
} from "@/domain/purchases";
import { ActionError } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { type Executor, authorize } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  companies,
  departments,
  extraCostTypes,
  files,
  orders,
  priceHistory,
  productVariants,
  products,
  purchaseExtras,
  purchaseTrips,
  purchases,
  tripFiles,
  units,
} from "@/server/db/schema";
import { accessOf } from "@/server/files/owners";
import {
  type OrderEventExtra,
  type OrdersContext,
  type OrdersInput,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";
import { readSettings } from "@/server/settings";
import { createDocument } from "@/server/stock-documents";
import { postMovements } from "@/server/stock-ledger";

import { requiredPriceField } from "../../catalog/actions/catalog-fields";
import { orderRecords } from "../order-records";
import { noticePriceDiffers } from "../price-prompts";

// Record a purchase: one shop visit, a trip, for one or many Open orders of one branch and one
// owner (07-purchasing.md, Purchase record; One trip, many orders; What saving a record does;
// 02-assumptions.md A7; plans of 3.3 and 3.4). It runs in the wrapper of src/server/order-action.ts:
// lock, repeat, authorize (`purchase.record`: the Head in any branch, the owner with
// RECORD_PURCHASES on; 03 Permission matrix), version, then the status check: every order is Open
// and its buying is not finished (3.3 decided item 3, Look first; 3.5 reopens it). The write step
// first refuses a trip over two branches or two owners (3.4 decided item 2, Look first), then
// locks every subtype bought and checks it: the ordered one, or an active subtype of the same
// product (07 Substitution; plan of 3.6, decided items 4 and 5, Look first), then checks under
// the lock what else needs the database, as field errors that roll the whole transaction
// back, then writes in one transaction, all or nothing (07 One trip 4; developer-rules.md rule 3):
//
//   1  the trip (date, supplier, payment type, shared: never copied to a record; 14 purchases) and
//      its receipt files once; then per order, oldest submit first and then the lower number (the
//      split's order, never the browser's; 3.4 decided item 4), its record and extra costs
//   2  for every product, a Receipt movement of the subtype bought at the record's price, all through one
//      postMovements() for its fixed lock order (09 Stock value, first bullet: extra costs not
//      included); a service changes no stock (A7)
//   3  above price 0, a PURCHASE price row per record, and each subtype bought its last purchase
//      price from its last record in that order (plan of 3.6, decided item 1, Look first), the subtypes updated in the order of their ids; a gift
//      writes neither (3.3 decided item 2, Look first)
//   5  for every record whose "Give straight to requester" is ticked, one ISSUE of its quantity
//      and subtype bought to the order's department, dated the date bought, received by the
//      order's requester, else the department's responsible person, with the record's id as its
//      client key (07 What saving a record does 5; plan of 5.4, decided items 4 and 6), in the
//      split's order, after every receipt; it needs `stock.issue` on the branch too (decided item
//      1, Look first), and is never made on a service (Decided ahead, question 9). After the
//      receipts it takes the ISS number counter, then the balances it already holds (issue.ts of
//      src/features/warehouse/actions, the one lock order; decided item 15, Look first)
//   4  each order's `actual_total` and `progress`, from every record of the order (progress 3.2,
//      "For 3.3 and 3.5"); the wrapper raises its version
//   6  one history event per order, by the wrapper; its note is the order's comment
//
//   7  notify: PRICE_DIFFERS to the Heads when the trip made a price prompt appear (plan of
//      3.10, decided item 8, Look first); no other notification (3.3 decided item 11)
//
// The trip takes the action's client key (3.3 decided item 12).

/** "0 to 5 photos or PDF files" (07 Purchase record, Receipt). */
export const RECEIPT_FILES_MAX = 5;

/** 07 Purchase record, Actual price per unit: "0 or more, whole so'm". */
const unitPriceField = z
  .string()
  .refine((value) => parseSomOrZero(value) !== null)
  .transform((value) => parseSomOrZero(value)!);

/** One order's part of the trip (07 One trip, many orders: 1, "Per order"). */
export type PurchaseLine = {
  orderId: string;
  /** The subtype really bought: the ordered one, or another of the same product (07 Substitution). */
  variantId: string;
  qty: string;
  unitPrice: bigint;
  extras: { extraCostTypeId: string; amount: bigint; paymentType: PaymentType }[];
  comment: string | null;
  /** 07 Purchase record: "Also creates an issue to the order's department". Goods only. */
  giveToRequester: boolean;
};

export type RecordPurchaseInput = OrdersInput & {
  purchasedOn: string;
  paymentType: PaymentType;
  supplierId: string | null;
  receiptFileIds: string[];
  /** One line per ticked order, the same ids (plan of 3.4, spec review Should fix 5). */
  lines: PurchaseLine[];
};

const line = z.object({
  orderId: z.uuid(),
  variantId: z.uuid(),
  qty: z.string().trim().min(1).max(40),
  unitPrice: unitPriceField,
  extras: z
    .array(
      z.object({
        extraCostTypeId: z.uuid(),
        amount: requiredPriceField,
        paymentType: z.enum(PAYMENT_TYPES),
      }),
    )
    .max(DRAFT_EXTRAS_MAX),
  comment: z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : draftComment(value) || null))
    .refine((value) => value === null || isDraftComment(value), {
      params: { fieldError: "tooLong" },
    }),
  giveToRequester: z.boolean().default(false),
});

const input = ordersInput({
  purchasedOn: z.string().refine(isBusinessDate),
  paymentType: z.enum(PAYMENT_TYPES),
  supplierId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  receiptFileIds: z.array(z.uuid()).max(RECEIPT_FILES_MAX),
  lines: z.array(line).min(1).max(ORDER_ACTION_MAX),
})
  .refine(
    (value) => {
      // One line per ticked order: the same ids as a set, none twice (plan of 3.4).
      const ids = new Set(value.lines.map((each) => each.orderId));
      return (
        ids.size === value.lines.length &&
        ids.size === value.orders.length &&
        value.orders.every((order) => ids.has(order.id))
      );
    },
    { path: ["lines"], message: "Each ticked order has exactly one line." },
  )
  .refine((value) => new Set(value.receiptFileIds).size === value.receiptFileIds.length, {
    path: ["receiptFileIds"],
    message: "A receipt file is sent twice.",
  }) as unknown as z.ZodType<RecordPurchaseInput>;

function refuse(field: string, kind: FieldMessageKey): never {
  throw new ActionError("invalid_input", { [field]: kind });
}

type Plan = {
  orderId: string;
  number: string;
  submittedAt: Date;
  variantId: string;
  productId: string;
  plannedQty: string;
  /** Null for an order without a planned price (05 Fields the Head sets 3). */
  plannedPrice: bigint | null;
  paymentType: PaymentType;
  approvedAt: Date | null;
  skippedFinance: boolean;
  skippedPrincipal: boolean;
  progress: "OPEN" | "DONE" | "DONE_SHORT" | "NOT_BOUGHT";
  isService: boolean;
  allowDecimal: boolean;
  /** `null`: an order for no department (05 Fields the Head sets 3). */
  departmentId: string | null;
  requesterName: string | null;
};

/**
 * The orders' plans and catalog facts, read under the wrapper's lock of the orders, in the
 * split's order (inSplitOrder()): the order in which the records are written (3.4 decided item 4).
 */
async function plansOf(tx: Executor, orderIds: readonly string[]): Promise<Plan[]> {
  const rows = await tx
    .select({
      orderId: orders.id,
      number: orders.number,
      submittedAt: orders.submittedAt,
      variantId: orders.variantId,
      productId: products.id,
      plannedQty: orders.plannedQty,
      plannedPrice: orders.plannedPrice,
      paymentType: orders.paymentType,
      approvedAt: orders.approvedAt,
      skippedFinance: orders.skippedFinance,
      skippedPrincipal: orders.skippedPrincipal,
      progress: orders.progress,
      productType: products.type,
      allowDecimal: units.allowDecimal,
      departmentId: orders.departmentId,
      requesterName: orders.requesterName,
    })
    .from(orders)
    .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(inArray(orders.id, [...orderIds]));
  return inSplitOrder(
    rows.map((row) => ({
      orderId: row.orderId,
      number: row.number!,
      submittedAt: row.submittedAt!,
      variantId: row.variantId!,
      productId: row.productId,
      plannedQty: row.plannedQty!,
      plannedPrice: row.plannedPrice,
      paymentType: row.paymentType,
      approvedAt: row.approvedAt,
      skippedFinance: row.skippedFinance,
      skippedPrincipal: row.skippedPrincipal,
      progress: row.progress,
      isService: row.productType === "SERVICE",
      allowDecimal: row.allowDecimal,
      departmentId: row.departmentId,
      requesterName: row.requesterName,
    })),
  );
}

/**
 * The products first, FOR SHARE in the order of their ids, then the subtypes bought: the catalog
 * takes a product before its subtypes (addSubtype locks the product, then its default subtype),
 * and postMovement() share-locks the product again later, so the subtype locked first would
 * deadlock against a first subtype added at the same moment (review of 3.6, finding 1; 3.4
 * decided item 4). The subtypes bought are then locked FOR UPDATE once in the order of their
 * ids: the price step updates
 * the same rows, so a share lock upgraded there would deadlock two trips of one subtype (review of
 * the plan of 3.6, Must fix 1; 3.4 decided item 4), and the lock holds off a deactivation, which
 * locks the row FOR UPDATE too (04 rule 2). Then each line's subtype is refused unless it is the
 * ordered one, or an active subtype of the same active product (07 Substitution: "It must belong
 * to the same product"; plan of 3.6, decided items 4 and 5, Look first). The ordered subtype stays
 * allowed after a deactivation: the order was approved for it.
 */
async function refuseSubtypes(
  tx: Executor,
  plans: readonly Plan[],
  lineOf: (orderId: string) => PurchaseLine,
  path: (orderId: string, field: string) => string,
) {
  const ids = [...new Set(plans.map((plan) => lineOf(plan.orderId).variantId))].sort();
  // A subtype's product never changes, so it is read without a lock before the product is locked.
  const owners = await tx
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(inArray(productVariants.id, ids));
  const productIds = [
    ...new Set([...plans.map((plan) => plan.productId), ...owners.map((row) => row.productId)]),
  ].sort();
  await tx
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds))
    .orderBy(asc(products.id))
    .for("share");
  const rows = await tx
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      isActive: productVariants.isActive,
      productActive: products.isActive,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, ids))
    .orderBy(asc(productVariants.id))
    .for("update", { of: productVariants });
  for (const plan of plans) {
    const bought = lineOf(plan.orderId).variantId;
    if (bought === plan.variantId) continue;
    const row = rows.find((each) => each.id === bought);
    if (!row || row.productId !== plan.productId) {
      refuse(path(plan.orderId, "variantId"), "errors.field.otherProduct");
    }
    if (!row.isActive || !row.productActive) {
      refuse(path(plan.orderId, "variantId"), "errors.field.inactive");
    }
  }
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
    // 07 Order progress: a finished order's buying is reopened first (3.5; 3.3 decided item 3).
    return locked
      .filter((order) => order.status !== "PURCHASING" || order.progress !== "OPEN")
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
  },
  async write(context: OrdersContext<RecordPurchaseInput>) {
    const { tx, input: typed, userId } = context;

    // 07 One trip, many orders: "a trip covers orders of one branch and one owner", the Head
    // included; here, after every per-order refusal of the wrapper (3.4 decided item 2, Look first).
    const branchId = context.orders[0]!.branchId;
    const ownerId = context.orders[0]!.ownerId;
    if (context.orders.some((order) => order.branchId !== branchId || order.ownerId !== ownerId)) {
      refuse("orders", "errors.field.tripOneOwner");
    }

    const plans = await plansOf(
      tx,
      context.orders.map((order) => order.id),
    );
    const at = typed.lines.map((each) => each.orderId);
    const lineOf = (orderId: string) => typed.lines[at.indexOf(orderId)]!;
    const path = (orderId: string, field: string) => `lines.${at.indexOf(orderId)}.${field}`;

    // 5  "Give straight to requester": goods only (Decided ahead, question 9), and an issue, so
    //    the right to issue in the branch as well (decided item 1, Look first); never on an order
    //    without a department, which is for no department (05 Fields the Head sets 3; plan of 2.5d).
    for (const plan of plans) {
      if (plan.isService && lineOf(plan.orderId).giveToRequester) {
        refuse(path(plan.orderId, "giveToRequester"), "errors.field.notAllowed");
      }
      if (plan.departmentId === null && lineOf(plan.orderId).giveToRequester) {
        refuse(path(plan.orderId, "giveToRequester"), "errors.field.noDepartment");
      }
    }
    if (typed.lines.some((each) => each.giveToRequester)) {
      await authorize(userId, "stock.issue", { branchId }, tx);
    }

    // The fields the database decides, before anything is written. The subtypes bought first, then
    // per order.
    await refuseSubtypes(tx, plans, lineOf, path);
    const before = new Map<string, PurchaseRecord[]>();
    for (const plan of plans) {
      const typedLine = lineOf(plan.orderId);
      const qtyRefusal = quantityRefusal(typedLine.qty, plan.allowDecimal);
      if (qtyRefusal) refuse(path(plan.orderId, "qty"), `errors.field.${qtyRefusal}`);
      const records = await orderRecords(tx, plan.orderId);
      before.set(plan.orderId, records);
      // 07 Comment, per order against its own plan (3.4 decided item 5, Look first).
      const needs = purchaseCommentNeeds({
        qty: typedLine.qty,
        unitPrice: typedLine.unitPrice,
        paymentType: typed.paymentType,
        plannedQty: plan.plannedQty,
        plannedPrice: plan.plannedPrice,
        plannedPaymentType: plan.paymentType,
        variantId: typedLine.variantId,
        plannedVariantId: plan.variantId,
        received: actualQuantity(records),
      });
      if (needs.length > 0 && typedLine.comment === null) {
        refuse(path(plan.orderId, "comment"), "errors.field.required");
      }
    }
    const extraTypes = [
      ...new Set(typed.lines.flatMap((each) => each.extras.map((extra) => extra.extraCostTypeId))),
    ].sort();
    await refuseInactive(tx, extraCostTypes, extraTypes, (id) => {
      const index = typed.lines.findIndex((each) =>
        each.extras.some((extra) => extra.extraCostTypeId === id),
      );
      const extra = typed.lines[index]!.extras.findIndex((each) => each.extraCostTypeId === id);
      return `lines.${index}.extras.${extra}.extraCostTypeId`;
    });

    // Then the shared fields. The one date meets every order's rule: the newest approval wins
    // (07 Date bought; 3.4 decided item 1, Look first).
    const today = businessDate(now());
    const approvals = plans.map((plan) =>
      plan.approvedAt === null ? null : businessDate(plan.approvedAt),
    );
    const newestApproval = approvals.includes(null)
      ? null
      : approvals.reduce((newest, day) => (day! > newest! ? day : newest));
    // The message names the approval that opened every order of the trip, Finance's when they
    // differ (07 Date bought; plans of 4.10c and 4.10d); the date rule is the same.
    const openers = new Set(
      plans.map((plan) => openedBy(plan.skippedFinance, plan.skippedPrincipal)),
    );
    const dateRefusal = purchaseDateRefusal(
      typed.purchasedOn,
      today,
      newestApproval,
      openers.size === 1 ? [...openers][0] : "FINANCE",
    );
    if (dateRefusal) refuse("purchasedOn", `errors.field.${dateRefusal}`);
    if (typed.supplierId) {
      await refuseInactive(tx, companies, [typed.supplierId], () => "supplierId");
    }
    const settings = await readSettings(tx);
    // 07 Purchase record, Receipt; edge case "No receipt photo": a trip paid in cash, or with any
    // extra cost paid in cash (`receiptNeeded()`; D55 (16); plan of 4.10b).
    if (
      receiptNeeded(
        settings.receipt_required_for_cash,
        typed.paymentType,
        typed.lines.flatMap((each) => each.extras.map((extra) => extra.paymentType)),
      ) &&
      typed.receiptFileIds.length === 0
    ) {
      refuse("receiptFileIds", "errors.field.required");
    }
    await refuseReceipts(tx, userId, typed.receiptFileIds);

    // 1  The trip and its receipt files once, then the records in the split's order.
    const savedAt = now();
    const [trip] = await tx
      .insert(purchaseTrips)
      .values({
        clientKey: typed.clientKey,
        branchId,
        purchasedOn: typed.purchasedOn,
        supplierId: typed.supplierId,
        paymentType: typed.paymentType,
        createdBy: userId,
        createdAt: savedAt,
      })
      .returning({ id: purchaseTrips.id });
    if (typed.receiptFileIds.length > 0) {
      await tx
        .insert(tripFiles)
        .values(
          typed.receiptFileIds.map((fileId) => ({ tripId: trip!.id, fileId, createdAt: savedAt })),
        );
    }
    const saved: {
      plan: Plan;
      recordId: string;
      variantId: string;
      qty: string;
      unitPrice: bigint;
    }[] = [];
    for (const plan of plans) {
      const typedLine = lineOf(plan.orderId);
      const qty = typedLine.qty.trim();
      const [record] = await tx
        .insert(purchases)
        .values({
          tripId: trip!.id,
          orderId: plan.orderId,
          branchId,
          variantId: typedLine.variantId,
          qty,
          unitPrice: typedLine.unitPrice,
          comment: typedLine.comment,
          // 07 Purchase record, Give straight to requester (build plan 5.4b; D56 finding 2).
          giveToRequester: typedLine.giveToRequester,
          createdBy: userId,
          createdAt: savedAt,
        })
        .returning({ id: purchases.id });
      if (typedLine.extras.length > 0) {
        await tx.insert(purchaseExtras).values(
          typedLine.extras.map((extra) => ({
            purchaseId: record!.id,
            extraCostTypeId: extra.extraCostTypeId,
            amount: extra.amount,
            paymentType: extra.paymentType,
            createdAt: savedAt,
          })),
        );
      }
      saved.push({
        plan,
        recordId: record!.id,
        variantId: typedLine.variantId,
        qty,
        unitPrice: typedLine.unitPrice,
      });
    }

    // 2  Stock for the products, in postMovements()'s fixed lock order (progress 3.1).
    await postMovements(
      tx,
      saved
        .filter(({ plan }) => !plan.isService)
        .map(({ variantId, recordId, qty, unitPrice }) => ({
          branchId,
          variantId,
          type: "RECEIPT" as const,
          qtyDelta: qty,
          unitCost: unitPrice,
          createdBy: userId,
          purchaseId: recordId,
        })),
    );

    // 5  The issues of the ticked records, after every receipt, in the split's order.
    const issues = new Map<string, { documentId: string; number: string }>();
    // Each has a department: step 5 refused a ticked one without (05 Fields the Head sets 3).
    const given = saved.flatMap(({ plan, ...rest }) =>
      lineOf(plan.orderId).giveToRequester && plan.departmentId !== null
        ? [{ ...rest, plan: { ...plan, departmentId: plan.departmentId } }]
        : [],
    );
    if (given.length > 0) {
      const responsible = await tx
        .select({ id: departments.id, name: departments.responsibleName })
        .from(departments)
        .where(inArray(departments.id, [...new Set(given.map(({ plan }) => plan.departmentId))]));
      for (const { plan, recordId, variantId, qty } of given) {
        const created = await createDocument(tx, {
          type: "ISSUE",
          branchId,
          departmentId: plan.departmentId,
          receivedByName:
            plan.requesterName ??
            responsible.find((each) => each.id === plan.departmentId)?.name ??
            null,
          docDate: typed.purchasedOn,
          status: "POSTED",
          clientKey: recordId,
          createdBy: userId,
          lines: [{ variantId, qty }],
        });
        issues.set(plan.orderId, { documentId: created.documentId, number: created.number });
      }
    }

    // 3  Prices: each subtype's last record above 0 in the split's order, the subtypes in the
    //    order of their ids so two trips cannot deadlock (3.4 decided item 4, Look first).
    const lastPrice = new Map<string, bigint>();
    for (const { variantId, unitPrice } of saved) {
      if (unitPrice > 0n) lastPrice.set(variantId, unitPrice);
    }
    for (const variantId of [...lastPrice.keys()].sort()) {
      await tx
        .update(productVariants)
        .set({ lastPurchasePrice: lastPrice.get(variantId)!, lastPurchaseAt: savedAt })
        .where(eq(productVariants.id, variantId));
    }
    const priced = saved.filter(({ unitPrice }) => unitPrice > 0n);
    if (priced.length > 0) {
      await tx.insert(priceHistory).values(
        priced.map(({ variantId, recordId, unitPrice }) => ({
          variantId,
          price: unitPrice,
          source: "PURCHASE" as const,
          setBy: userId,
          purchaseId: recordId,
          createdAt: savedAt,
        })),
      );
    }

    // 4  Each order's actual total and progress, from its records.
    const extras = new Map<string, OrderEventExtra>();
    for (const { plan, recordId, variantId, qty, unitPrice } of saved) {
      const after = await orderRecords(tx, plan.orderId);
      await tx
        .update(orders)
        .set({
          actualTotal: actualTotal(after),
          progress: progressAfterBuying(plan.progress, plan.plannedQty, actualQuantity(after)),
        })
        .where(eq(orders.id, plan.orderId));
      extras.set(plan.orderId, {
        note: lineOf(plan.orderId).comment,
        payload: {
          purchase: { id: recordId, variantId, qty, unitPrice: unitPrice.toString() },
          ...(issues.has(plan.orderId) ? { issue: issues.get(plan.orderId) } : {}),
        },
      });
    }
    return extras;
  },
  async notify(context, result) {
    await noticePriceDiffers(context, result.actionId, "recorded");
  },
});
