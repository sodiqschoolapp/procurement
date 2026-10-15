import { eq } from "drizzle-orm";
import * as z from "zod";

import {
  DEFAULT_PRODUCT_TYPE,
  DEFAULT_SUBTYPE_NAME,
  PRODUCT_LOCKED_AFTER_USE,
  type ProductType,
  isDescription,
  isProductType,
  lockedChanges,
} from "@/domain/products";
import { ActionError } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { categories, companies, productVariants, products, units } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField, optionalId, optionalText, priceField } from "./catalog-fields";
import { fileNameOf, refusePhoto } from "./photos";
import { productInUse } from "./product-uses";

// Products and services (04-catalogs.md, Catalogs table: "Name, type (product or service; product
// is the default), category, measure, photo, default brand or company, reference price,
// description, active"; "Type and measure lock after first use"; A7; build-plan 1.7). Table
// `products`, audit `product.*`, through the shared catalog actions (catalog.manage, Head only).
// - A new item is GOODS unless SERVICE is chosen (plan of 1.7, decision 8).
// - Category and measure must exist and be active when picked; the default brand or company too,
//   of any kind (decision 7). Each is locked FOR SHARE, so a deactivation (FOR UPDATE) waits or is
//   seen; an unchanged inactive one stays on an edit (04 rule 2).
// - The photo is an image the Head uploaded and no record holds, checked with the file row locked
//   FOR UPDATE (src/server/files/owners.ts contract; decision 10; plan review, Should fix 6).
// - The reference price is whole so'm, set on create only (decision 2, Look first): it changes
//   through a new price with a note in 1.9.
// - Type and measure lock once the product is in use (decision 1, Look first; product-uses.ts).
// - A new product gets its hidden default subtype, holding its reference price, in the same
//   transaction (04 rule 1; plan of 1.8, decision 2, Look first; the shape trigger of 0013).

export type ProductFields = {
  name: string;
  type: ProductType;
  categoryId: string;
  unitId: string;
  defaultCompanyId: string | null;
  referencePrice: bigint | null;
  description: string | null;
  photoFileId: string | null;
};

const typeField = z
  .string()
  .refine(isProductType)
  .transform((value) => value as ProductType);

const LOCKED: FieldMessageKey = "errors.field.locked";

/** An entry a product points at must exist and be active when it is picked (04 rule 2). */
async function refuseInactive(
  tx: Executor,
  field: string,
  table: typeof categories | typeof units | typeof companies,
  id: string,
) {
  const [row] = await tx
    .select({ isActive: table.isActive })
    .from(table)
    .where(eq(table.id, id))
    .for("share");
  if (!row) throw new ActionError("invalid_input", { [field]: "errors.field.notAllowed" });
  if (!row.isActive) throw new ActionError("invalid_input", { [field]: "errors.field.inactive" });
}

async function nameOf(
  tx: Executor,
  table: typeof categories | typeof units | typeof companies,
  id: string,
) {
  const [row] = await tx.select({ name: table.name }).from(table).where(eq(table.id, id));
  return row?.name ?? null;
}

const catalog = defineCatalogActions<ProductFields>({
  kind: "products",
  name: "Product",
  table: products,
  prefix: "product",
  columns: {
    name: products.name,
    type: products.type,
    categoryId: products.categoryId,
    unitId: products.unitId,
    defaultCompanyId: products.defaultCompanyId,
    referencePrice: products.referencePrice,
    description: products.description,
    photoFileId: products.photoFileId,
  },
  shape: {
    name: nameField,
    type: typeField,
    categoryId: z.uuid(),
    unitId: z.uuid(),
    defaultCompanyId: optionalId,
    referencePrice: priceField,
    description: optionalText((value) => value.trim(), isDescription),
    photoFileId: optionalId,
  },
  // "Product is the default" (04; A7): on create only, so an edit never resets a service.
  createShape: { type: typeField.default(DEFAULT_PRODUCT_TYPE) },
  createOnly: ["referencePrice"],
  unique: ["name"],
  async afterInsert(tx, entry) {
    await tx.insert(productVariants).values({
      productId: entry.id,
      name: DEFAULT_SUBTYPE_NAME,
      isDefault: true,
      referencePrice: entry.referencePrice,
      createdAt: now(),
    });
  },
  async guard({ tx, userId }, sent, current) {
    if (current) {
      const locked = lockedChanges(
        PRODUCT_LOCKED_AFTER_USE,
        Object.keys(sent),
        await productInUse(tx, current.id),
      );
      if (locked.length > 0) {
        throw new ActionError(
          "invalid_input",
          Object.fromEntries(locked.map((field) => [field, LOCKED])),
        );
      }
    }
    if (sent.categoryId) await refuseInactive(tx, "categoryId", categories, sent.categoryId);
    if (sent.unitId) await refuseInactive(tx, "unitId", units, sent.unitId);
    if (sent.defaultCompanyId) {
      await refuseInactive(tx, "defaultCompanyId", companies, sent.defaultCompanyId);
    }
    if (sent.photoFileId) await refusePhoto(tx, userId, sent.photoFileId);
  },
  // The names beside the ids, as they are now (decision 11), and the photo's file name; an absent
  // reference adds nothing.
  async shownRefs(tx, values) {
    const shown: Record<string, string | null> = {};
    if (values.categoryId) shown.category = await nameOf(tx, categories, values.categoryId);
    if (values.unitId) shown.unit = await nameOf(tx, units, values.unitId);
    if (values.defaultCompanyId !== undefined) {
      shown.defaultCompany = values.defaultCompanyId
        ? await nameOf(tx, companies, values.defaultCompanyId)
        : null;
    }
    if (values.photoFileId !== undefined) {
      shown.photo = values.photoFileId ? await fileNameOf(tx, values.photoFileId) : null;
    }
    return shown;
  },
});

export const createProduct = catalog.create;
export const updateProduct = catalog.update;
export const setProductActive = catalog.setActive;
