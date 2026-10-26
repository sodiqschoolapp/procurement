import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import * as z from "zod";

import { isBusinessDate } from "@/domain/business-date";
import {
  DRAFT_EXTRAS_MAX,
  draftComment,
  isDraftComment,
  isRequesterName,
  isUrgentReason,
  quantityRefusal,
  requesterName,
  urgentReason,
} from "@/domain/drafts";
import { behindDraftWall } from "@/domain/order-moves";
import type { Role, Target } from "@/domain/permissions";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import type { ProductType } from "@/domain/products";
import { ActionError } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import {
  branches,
  companies,
  departments,
  extraCostTypes,
  orders,
  productVariants,
  products,
  units,
  users,
} from "@/server/db/schema";

import { optionalId, requiredPriceField } from "../../catalog/actions/catalog-fields";

// The fields and the checks the draft actions share (05-order-request-form.md, Order fields 1 to
// 16; plan of 2.5a). Every input is checked with Zod first (developer-rules.md rule 13); what
// needs the database (the measure of the subtype, an entry that is inactive, a department of
// another branch) is checked here inside the action's transaction, each entry read FOR SHARE so a
// deactivation and a pick cannot pass each other (04 rule 2).

/** A field error of an action step, as a refusal of the whole input. */
export function refuse(field: string, kind: FieldMessageKey): never {
  throw new ActionError("invalid_input", { [field]: kind });
}

/** An optional text stored as `normalize` gives it, an empty one as null; too long is "tooLong". */
function optionalLimited(
  normalize: (value: string) => string,
  isValid: (value: string) => boolean,
) {
  return z
    .string()
    .nullish()
    .transform((value) => {
      const stored = value == null ? "" : normalize(value);
      return stored === "" ? null : stored;
    })
    .refine((value) => value === null || isValid(value), { params: { fieldError: "tooLong" } });
}

/** 05 field 10: the quantity as typed; its measure decides the rest (quantityRefusal()). */
export const quantityField = z.string().trim().min(1).max(40);

/** 05 field 8: a day that exists, YYYY-MM-DD; empty is none (decided item 16). */
export const neededByField = z
  .union([z.literal(""), z.string().refine(isBusinessDate)])
  .nullish()
  .transform((value) => (value ? value : null));

/** 05 field 11: whole so'm as typed, read by parseSom(); empty is none. */
export { priceField } from "../../catalog/actions/catalog-fields";

/** 05 field 12: up to 20 rows of a type and an amount more than 0 (decided item 13). */
export const extrasField = z
  .array(z.object({ extraCostTypeId: z.uuid(), amount: requiredPriceField }))
  .max(DRAFT_EXTRAS_MAX);

export const paymentTypeField = z.enum(PAYMENT_TYPES);
export const priorityField = z.enum(["NORMAL", "URGENT"]);
/** Checked against the priority the row will have (decided item 15). */
export const urgentReasonField = z.string().max(2000).nullish();
export const commentField = optionalLimited(draftComment, isDraftComment);
export const requesterNameField = optionalLimited(requesterName, isRequesterName);
export { optionalId };

export type Priority = z.output<typeof priorityField>;

/**
 * The stored Urgent reason of a row that will have `priority`: refused when Urgent has no reason
 * or one too long (05 field 14); none for Normal (decided item 15).
 */
export function storedUrgentReason(priority: Priority, reason: string | null): string | null {
  if (priority === "NORMAL") return null;
  const blank = (reason ?? "").trim() === "";
  if (!isUrgentReason(reason)) {
    refuse("urgentReason", blank ? "errors.field.required" : "errors.field.tooLong");
  }
  return urgentReason(reason);
}

/** A quantity good for the measure, or the refusal on `quantity` (05 field 10; decided item 5). */
export function refuseQuantity(text: string, allowsDecimals: boolean): void {
  const kind = quantityRefusal(text, allowsDecimals);
  if (kind) refuse("quantity", `errors.field.${kind}`);
}

/** The facts of a subtype a draft needs: its product, measure and prices. */
export type SubtypeFacts = {
  variantId: string;
  productId: string;
  productType: ProductType;
  allowsDecimals: boolean;
  referencePrice: bigint | null;
  lastPurchasePrice: bigint | null;
  /** The product's default company while it is active, else null (05 field 6; item 17). */
  defaultCompanyId: string | null;
  active: boolean;
};

/**
 * Reads a subtype with its product and measure. `share` takes the product row FOR SHARE, so a
 * change of type or measure (FOR UPDATE) and this first use cannot pass each other (decided item
 * 6, Look first). `null` for an unknown subtype.
 */
export async function readSubtype(
  tx: Executor,
  variantId: string,
  share: boolean,
): Promise<SubtypeFacts | null> {
  const query = tx
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productType: products.type,
      allowsDecimals: units.allowDecimal,
      referencePrice: productVariants.referencePrice,
      lastPurchasePrice: productVariants.lastPurchasePrice,
      defaultCompanyId: products.defaultCompanyId,
      companyActive: companies.isActive,
      variantActive: productVariants.isActive,
      productActive: products.isActive,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(companies, eq(companies.id, products.defaultCompanyId))
    .where(eq(productVariants.id, variantId));
  const [row] = share ? await query.for("share", { of: products }) : await query;
  if (!row) return null;
  return {
    variantId: row.variantId,
    productId: row.productId,
    productType: row.productType,
    allowsDecimals: row.allowsDecimals,
    referencePrice: row.referencePrice,
    lastPurchasePrice: row.lastPurchasePrice,
    defaultCompanyId: row.companyActive ? row.defaultCompanyId : null,
    active: row.variantActive && row.productActive,
  };
}

/**
 * A subtype picked for a draft: it exists, it and its product are active (04 rule 2; decided item
 * 20: an active subtype of an inactive product is refused too). The product row is held FOR SHARE.
 */
export async function pickedSubtype(tx: Executor, variantId: string): Promise<SubtypeFacts> {
  const subtype = await readSubtype(tx, variantId, true);
  if (!subtype) refuse("variantId", "errors.field.notAllowed");
  if (!subtype.active) refuse("variantId", "errors.field.inactive");
  return subtype;
}

/** A branch picked for a draft must be active (decisions 1.2, item 3; decided item 8). */
export async function pickedBranch(tx: Executor, branchId: string): Promise<void> {
  const [row] = await tx
    .select({ isActive: branches.isActive })
    .from(branches)
    .where(eq(branches.id, branchId))
    .for("share");
  if (!row) refuse("branchId", "errors.field.notAllowed");
  if (!row.isActive) refuse("branchId", "errors.field.inactive");
}

/** A department of the draft's branch, active (05 field 7; A6; 04 rule 2). */
export async function pickedDepartment(
  tx: Executor,
  departmentId: string,
  branchId: string,
): Promise<void> {
  const [row] = await tx
    .select({ branchId: departments.branchId, isActive: departments.isActive })
    .from(departments)
    .where(eq(departments.id, departmentId))
    .for("share");
  if (!row || row.branchId !== branchId) refuse("departmentId", "errors.field.notAllowed");
  if (!row.isActive) refuse("departmentId", "errors.field.inactive");
}

/** A brand or company picked for a draft: any active company (decisions 1.7, item 7). */
export async function pickedCompany(tx: Executor, companyId: string): Promise<void> {
  const [row] = await tx
    .select({ isActive: companies.isActive })
    .from(companies)
    .where(eq(companies.id, companyId))
    .for("share");
  if (!row) refuse("companyId", "errors.field.notAllowed");
  if (!row.isActive) refuse("companyId", "errors.field.inactive");
}

export type ExtraRow = { extraCostTypeId: string; amount: bigint };

/** Every extra cost type picked exists and is active (05 field 12; 04 rule 2). */
export async function pickedExtras(tx: Executor, extras: readonly ExtraRow[]): Promise<void> {
  if (extras.length === 0) return;
  const ids = [...new Set(extras.map((extra) => extra.extraCostTypeId))];
  const rows = await tx
    .select({ id: extraCostTypes.id, isActive: extraCostTypes.isActive })
    .from(extraCostTypes)
    .where(inArray(extraCostTypes.id, ids))
    .for("share");
  const activeOf = new Map(rows.map((row) => [row.id, row.isActive]));
  const fields: Record<string, FieldMessageKey> = {};
  extras.forEach((extra, at) => {
    const active = activeOf.get(extra.extraCostTypeId);
    if (active === undefined) fields[`extras.${at}.extraCostTypeId`] = "errors.field.notAllowed";
    else if (!active) fields[`extras.${at}.extraCostTypeId`] = "errors.field.inactive";
  });
  if (Object.keys(fields).length > 0) throw new ActionError("invalid_input", fields);
}

/** What makes a never-submitted draft one of a kind (05 Drafts 2; `orders_one_draft_key`). */
export type DraftTrio = {
  ownerId: string;
  branchId: string;
  variantId: string;
  /** `null`: no department; two such drafts are the same trio (05 Fields the Head sets 3). */
  departmentId: string | null;
};

/**
 * Two writes into one owner's branch, subtype and department wait for each other here, the add
 * and the edit alike (plan of 2.5a, decided item 24): the second then finds the first's draft.
 */
export async function lockDraftTrio(tx: Executor, trio: DraftTrio): Promise<void> {
  const key = `draft:${trio.ownerId}:${trio.branchId}:${trio.variantId}:${trio.departmentId}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

/** The owner's never-submitted draft of the trio, other than `exceptId`, or none. */
export async function neverSubmittedOf(tx: Executor, trio: DraftTrio, exceptId?: string) {
  const [row] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(ofTrio(trio), exceptId ? ne(orders.id, exceptId) : undefined));
  return row ?? null;
}

/**
 * The owner's never-submitted draft of the trio: the full match of `orders_one_draft_key`, or of
 * `orders_one_draft_no_department_key` for a trio without a department.
 */
function ofTrio(trio: DraftTrio) {
  return and(
    eq(orders.ownerId, trio.ownerId),
    eq(orders.branchId, trio.branchId),
    eq(orders.variantId, trio.variantId),
    // Two empty departments are equal (05 Fields the Head sets 3; orders_one_draft_no_department_key).
    trio.departmentId === null
      ? isNull(orders.departmentId)
      : eq(orders.departmentId, trio.departmentId),
    isNull(orders.number),
  );
}

/**
 * The owner's never-submitted draft of the trio, locked FOR UPDATE with the full match: a draft
 * that another write moves to another trio or deletes while this one waits is re-checked by
 * PostgreSQL under the lock and drops out, so an add never raises the wrong draft (review of
 * 2.5a, S1). `null` when none is left.
 */
export async function lockTrioDraft(tx: Executor, trio: DraftTrio) {
  const [row] = await tx
    .select({
      id: orders.id,
      plannedQty: orders.plannedQty,
      plannedPrice: orders.plannedPrice,
      paymentType: orders.paymentType,
      version: orders.version,
    })
    .from(orders)
    .where(ofTrio(trio))
    .for("update");
  return row ?? null;
}

/** Whether an error is the partial unique index of one never-submitted draft (05 Drafts 2). */
export function isOneDraftViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== "object") return false;
    if ("code" in current && current.code === "23505") {
      return (
        "constraint" in current &&
        (current.constraint === "orders_one_draft_key" ||
          current.constraint === "orders_one_draft_no_department_key")
      );
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

/**
 * The target of an action on one order: its branch and owner read from the database (developer-
 * rules.md rule 13), or `null` ("Not found") for an unknown order and for another user's Draft
 * of anyone but the Head (the draft wall, 06 Statuses: "Visible to the owner and the Head only";
 * checked before authorize(), so a colleague of the same branch learns nothing; decided item 7).
 */
export async function orderTarget(
  tx: Executor,
  userId: string,
  orderId: string,
): Promise<Target | null> {
  const [row] = await tx
    .select({
      branchId: orders.branchId,
      ownerId: orders.ownerId,
      status: orders.status,
      role: sql<Role | null>`(select ${users.role} from ${users} where ${users.id} = ${userId})`,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!row) return null;
  if (
    row.role &&
    behindDraftWall({ userId, role: row.role, branchIds: [], disabledRights: [] }, row)
  ) {
    return null;
  }
  return { branchId: row.branchId, ownerId: row.ownerId };
}
