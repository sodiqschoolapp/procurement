import { and, asc, eq, inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { PRODUCTS, SUBTYPES } from "@/domain/catalogs";
import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import { DEFAULT_PRODUCT_TYPE, type ProductType, isProductType } from "@/domain/products";
import { ActionError, GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { auditLog, productVariants, products } from "@/server/db/schema";

import { nameField, optionalId } from "./catalog-fields";
import { findTakenProduct, insertProduct, lockProducts, recordProductCreate } from "./products";
import { addSubtypeFromSearch, recordSubtypeCreate } from "./subtypes";

// Managers add products and subtypes while ordering (04-catalogs.md rule 8; D63; build-plan
// 1.12b). Both adds are catalog.add: the Head, and a Manager whose right ADD_PRODUCTS is on
// (03, Permission matrix: "Add a product or a subtype from an order's product search"; plan of
// 1.12b, decided item 1, Look first). Global: catalogs hold no branch.
// - A new product takes name, type, category, measure and an optional photo only: "No reference
//   price, brand or description" (rule 8). Another key sent is stripped by the input check and
//   writes nothing. It is written through the create's own body (insertProduct), so every rule of
//   a product the Head makes holds: active category and measure, the photo's uploader, the hidden
//   default, the audit row.
// - A name already held, active or not, gives that entry back and writes nothing (rule 3: "the
//   existing entry is offered instead; an inactive one is named"; decided item 4, Look first).
// - `added_by` is the Manager; the Head's own add writes none (decided item 5).
// - Neither action edits an existing entry: the only change to one is the hidden default named
//   for the existing items, on a product without subtypes (rule 8; subtypes.ts).
// markAddedChecked is the Head's (catalog.manage): the Head's home list empties as the Head marks
// entries checked (rule 8: "until the Head marks them checked").

export type ProductAdd =
  | { outcome: "made"; productId: string; variantId: string; name: string }
  | { outcome: "exists"; productId: string; name: string; isActive: boolean };

export type SubtypeAdd =
  | { outcome: "made"; productId: string; variantId: string; name: string }
  | { outcome: "exists"; productId: string; variantId: string; name: string; isActive: boolean };

/** The result inside the transaction: the rows the history step writes about ride along. */
type SubtypeWritten = SubtypeAdd & {
  written?: Extract<Awaited<ReturnType<typeof addSubtypeFromSearch>>, { outcome: "made" }>;
};

const typeField = z
  .string()
  .refine(isProductType)
  .transform((value) => value as ProductType);

/** The default subtype of a product: what a draft of a product without subtypes points at. */
async function defaultVariant(
  tx: Parameters<typeof insertProduct>[0],
  productId: string,
): Promise<string> {
  const [row] = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.isDefault, true)));
  return row!.id;
}

export const addProductWhileOrdering = defineAction({
  name: "addProductWhileOrdering",
  permission: "catalog.add",
  input: z.object({
    clientKey: z.string().refine(isClientKey),
    name: nameField,
    type: typeField.default(DEFAULT_PRODUCT_TYPE),
    categoryId: z.uuid(),
    unitId: z.uuid(),
    photoFileId: optionalId,
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    // The maker is the actor of the product's `product.create` row (as the Head's create).
    async find(tx, clientKey) {
      const [row] = await tx
        .select({ productId: products.id, name: products.name, userId: auditLog.actorId })
        .from(products)
        .innerJoin(
          auditLog,
          and(
            eq(auditLog.entity, PRODUCTS.entity),
            eq(auditLog.action, "product.create"),
            eq(auditLog.entityId, sql`${products.id}::text`),
          ),
        )
        .where(eq(products.clientKey, clientKey));
      if (!row) return null;
      const variantId = await defaultVariant(tx, row.productId);
      return {
        result: { outcome: "made", productId: row.productId, variantId, name: row.name },
        userId: row.userId,
        branchId: null,
      } satisfies { result: ProductAdd; userId: string; branchId: null };
    },
  },
  async write({ tx, input, userId, actor }): Promise<ProductAdd> {
    await lockProducts(tx);
    const taken = await findTakenProduct(tx, input.name, null);
    if (taken) {
      return { outcome: "exists", productId: taken.id, name: taken.name, isActive: taken.isActive };
    }
    const entry = await insertProduct(
      tx,
      userId,
      {
        name: input.name,
        type: input.type,
        categoryId: input.categoryId,
        unitId: input.unitId,
        defaultCompanyId: null,
        referencePrice: null,
        description: null,
        photoFileId: input.photoFileId,
      },
      input.clientKey,
      { addedBy: actor.role === "MANAGER" ? userId : null },
    );
    const variantId = await defaultVariant(tx, entry.id);
    return { outcome: "made", productId: entry.id, variantId, name: entry.name };
  },
  async history({ tx, userId }, result) {
    if (result.outcome !== "made") return;
    const [entry] = await tx
      .select({
        id: products.id,
        name: products.name,
        type: products.type,
        categoryId: products.categoryId,
        unitId: products.unitId,
        defaultCompanyId: products.defaultCompanyId,
        referencePrice: products.referencePrice,
        description: products.description,
        photoFileId: products.photoFileId,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.id, result.productId));
    await recordProductCreate(tx, userId, entry!);
  },
});

export const addSubtypeWhileOrdering = defineAction({
  name: "addSubtypeWhileOrdering",
  permission: "catalog.add",
  input: z.object({
    clientKey: z.string().refine(isClientKey),
    productId: z.uuid(),
    name: nameField,
    photoFileId: optionalId,
    // "What are the existing ones called?": asked when the product has no subtypes yet.
    existingName: nameField.nullish(),
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    // Only the new row holds the key, never the renamed default (plan review, Must fix 1).
    async find(tx, clientKey) {
      const [row] = await tx
        .select({
          variantId: productVariants.id,
          productId: productVariants.productId,
          name: productVariants.name,
          userId: auditLog.actorId,
        })
        .from(productVariants)
        .innerJoin(
          auditLog,
          and(
            eq(auditLog.entity, SUBTYPES.entity),
            eq(auditLog.action, "subtype.create"),
            eq(auditLog.entityId, sql`${productVariants.id}::text`),
          ),
        )
        .where(eq(productVariants.clientKey, clientKey));
      if (!row) return null;
      const { userId, ...made } = row;
      return {
        result: { outcome: "made", ...made },
        userId,
        branchId: null,
      } satisfies { result: SubtypeWritten; userId: string; branchId: null };
    },
  },
  async write({ tx, input, userId, actor }): Promise<SubtypeWritten> {
    const added = await addSubtypeFromSearch(
      tx,
      userId,
      input,
      input.clientKey,
      actor.role === "MANAGER" ? userId : null,
    );
    if (added.outcome === "exists") {
      const { outcome, variantId, name, isActive } = added;
      return { outcome, productId: input.productId, variantId, name, isActive };
    }
    return {
      outcome: "made",
      productId: input.productId,
      variantId: added.entry.id,
      name: added.entry.name,
      written: added,
    };
  },
  async history({ tx, userId }, result) {
    if (result.outcome !== "made" || !result.written) return;
    const { entry, named } = result.written;
    if (named) await recordSubtypeCreate(tx, userId, named);
    await recordSubtypeCreate(tx, userId, { entry, fromDefault: null });
  },
});

/** What the browser is given of a subtype add: the rows the history step used are left out. */
export function subtypeAddShown(result: SubtypeWritten): SubtypeAdd {
  if (result.outcome === "exists") return result;
  const { outcome, productId, variantId, name } = result;
  return { outcome, productId, variantId, name };
}

const idList = z.array(z.uuid()).max(ORDER_ACTION_MAX);

/**
 * Marks products and subtypes added by Managers checked, all or nothing (04 rule 8; plan of
 * 1.12b, decided item 11): the rows locked FOR UPDATE, products before subtypes, each in id order
 * (the lock order of .claude/rules/server-actions.md); an unknown id, one no Manager added, or one
 * already checked refuses the whole action. One audit row per entry.
 */
export const markAddedChecked = defineAction({
  name: "markAddedChecked",
  permission: "catalog.manage",
  input: z
    .object({ productIds: idList.default([]), subtypeIds: idList.default([]) })
    .refine(
      (input) =>
        input.productIds.length + input.subtypeIds.length > 0 &&
        input.productIds.length + input.subtypeIds.length <= ORDER_ACTION_MAX &&
        new Set(input.productIds).size === input.productIds.length &&
        new Set(input.subtypeIds).size === input.subtypeIds.length,
    ),
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    const productRows =
      input.productIds.length === 0
        ? []
        : await tx
            .select({ id: products.id, addedBy: products.addedBy, checkedAt: products.checkedAt })
            .from(products)
            .where(inArray(products.id, input.productIds))
            .orderBy(asc(products.id))
            .for("update");
    const subtypeRows =
      input.subtypeIds.length === 0
        ? []
        : await tx
            .select({
              id: productVariants.id,
              productId: productVariants.productId,
              addedBy: productVariants.addedBy,
              checkedAt: productVariants.checkedAt,
            })
            .from(productVariants)
            .where(inArray(productVariants.id, input.subtypeIds))
            .orderBy(asc(productVariants.id))
            .for("update");
    if (
      productRows.length !== input.productIds.length ||
      subtypeRows.length !== input.subtypeIds.length
    ) {
      return null;
    }
    return { target: GLOBAL_TARGET, rows: { products: productRows, subtypes: subtypeRows } };
  },
  async check({ locked }) {
    const rows = [...locked!.rows.products, ...locked!.rows.subtypes];
    if (rows.some((row) => row.addedBy === null || row.checkedAt !== null)) {
      throw new ActionError("wrong_status");
    }
  },
  async write({ tx, input }) {
    const at = now();
    if (input.productIds.length > 0) {
      await tx
        .update(products)
        .set({ checkedAt: at })
        .where(inArray(products.id, input.productIds));
    }
    if (input.subtypeIds.length > 0) {
      await tx
        .update(productVariants)
        .set({ checkedAt: at })
        .where(inArray(productVariants.id, input.subtypeIds));
    }
    return { products: input.productIds.length, subtypes: input.subtypeIds.length };
  },
  async history({ tx, userId, locked }) {
    for (const row of locked!.rows.products) {
      await audit(
        { tx, userId },
        {
          action: "product.check",
          entity: PRODUCTS.entity,
          entityId: row.id,
          before: { checked: false },
          after: { checked: true },
          at: now(),
        },
      );
    }
    for (const row of locked!.rows.subtypes) {
      await audit(
        { tx, userId },
        {
          action: "subtype.check",
          entity: SUBTYPES.entity,
          entityId: row.id,
          before: { productId: row.productId, checked: false },
          after: { productId: row.productId, checked: true },
          at: now(),
        },
      );
    }
  },
});
