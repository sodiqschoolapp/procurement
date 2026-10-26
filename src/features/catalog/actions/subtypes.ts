import { and, eq, ne, sql } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { SUBTYPES } from "@/domain/catalogs";
import { firstSubtypePrice, firstSubtypePriceRefused } from "@/domain/products";
import { ActionError, GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { auditLog, productVariants, products } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField, optionalId, priceField } from "./catalog-fields";
import { fileNameOf, refusePhoto } from "./photos";
import { recordHeadPrice } from "./price-rows";

// Subtypes (04-catalogs.md, Catalogs table: "Product, name, own photo (optional), own reference
// price (optional), active"; rules 1 and 3; open question 18; build-plan 1.8). Table
// `product_variants`, audit `subtype.*`, under catalog.manage (Head only, global; 03 Permission
// matrix: "Manage catalogs, users, branches, settings").
// - Every product has one hidden default row until it gets real subtypes (04 rule 1). With the
//   first subtype the Head also names the existing items: the default takes that name and keeps
//   its id, lines, stock, price and photo, and the new subtype is a new row; `has_variants` turns
//   true (D64, replacing plan of 1.8, decision 1; build-plan 1.12b Build 6 and 1.12c). The rest
//   are new rows too.
// - The reference price is set on create only, the new row's own; the default keeps the price it
//   holds (D64, replacing decision 2's refusal on the first subtype). Without one a subtype has no
//   price (decision 4, Look first). A price set here gets its HEAD row of the price history; later
//   prices come through addPrice (plan of 1.9, decision 1, Look first).
// - Names are unique inside the product (04 rule 3); a product with subtypes keeps one active
//   (decision 3, Look first); an inactive product takes no new subtype (decision 5).
// - The default row is never reached by update or setActive: "not found" (decision 3).

export type SubtypeFields = {
  name: string;
  referencePrice: bigint | null;
  photoFileId: string | null;
};

export type SavedSubtype = SubtypeFields & { id: string; productId: string; isActive: boolean };

const LOCKED = "errors.field.locked" as const;

/** The product's id and its name as it is now, kept on every history row (decision 9). */
async function productShown(tx: Executor, productId: string) {
  const [product] = await tx
    .select({ name: products.name })
    .from(products)
    .where(eq(products.id, productId));
  return { productId, product: product?.name ?? null };
}

const catalog = defineCatalogActions<SubtypeFields>({
  kind: "subtypes",
  name: "Subtype",
  table: productVariants,
  prefix: "subtype",
  columns: {
    name: productVariants.name,
    referencePrice: productVariants.referencePrice,
    photoFileId: productVariants.photoFileId,
  },
  shape: { name: nameField, referencePrice: priceField, photoFileId: optionalId },
  createOnly: ["referencePrice"],
  unique: ["name"],
  within: {
    key: "productId",
    column: productVariants.productId,
    // The factory's own create is not used (createSubtype below is the one create; plan review,
    // Should fix 2), so this check is never reached; it refuses all the same.
    async check() {
      throw new ActionError("invalid_input", { productId: "errors.field.notAllowed" });
    },
    shown: productShown,
    onEveryRow: true,
  },
  lockable: eq(productVariants.isDefault, false),
  async guard({ tx, userId }, sent) {
    if (sent.photoFileId) await refusePhoto(tx, userId, sent.photoFileId);
  },
  async shownRefs(tx, values) {
    if (values.photoFileId === undefined) return {};
    return { photo: values.photoFileId ? await fileNameOf(tx, values.photoFileId) : null };
  },
  // Runs under the table's lock (lockEntry), so two deactivations cannot each see the other
  // active and leave none.
  async checkActive(tx, entry, active) {
    if (active) return;
    const current = entry as SavedSubtype;
    const [other] = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, current.productId),
          ne(productVariants.id, current.id),
          eq(productVariants.isActive, true),
        ),
      )
      .limit(1);
    if (!other) throw new ActionError("wrong_status");
  },
});

const columns = {
  id: productVariants.id,
  productId: productVariants.productId,
  name: productVariants.name,
  referencePrice: productVariants.referencePrice,
  photoFileId: productVariants.photoFileId,
  isActive: productVariants.isActive,
};

export type Created = {
  entry: SavedSubtype;
  /** The default row's fields before it was made real; null for a new row. */
  fromDefault: { name: string; referencePrice: bigint | null } | null;
  /**
   * The hidden default named for the existing items, when this was the product's first real
   * subtype (04 rule 1; D64); written to the history before the new row. Absent otherwise.
   */
  named?: Created | null;
};

/**
 * Adds a subtype to a product. The same client key twice gives the first result (developer-rules
 * rule 8): the maker is the actor of the subtype's `subtype.create` row. On a product without
 * subtypes the Head also names the existing items: the hidden default takes that name and keeps
 * its lines, stock and price, and the new subtype is a new row (04 rule 1; D64, replacing decisions
 * 1.8 item 1; build-plan 1.12b, Build 6). A name the product holds is `errors.field.taken`.
 */
export const createSubtype = defineAction({
  name: "createSubtype",
  permission: "catalog.manage",
  input: z.object({
    clientKey: z.string().refine(isClientKey),
    productId: z.uuid(),
    name: nameField,
    referencePrice: priceField,
    photoFileId: optionalId,
    existingName: nameField.nullish(),
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    async find(tx, clientKey) {
      const [row] = await tx
        .select({ ...columns, userId: auditLog.actorId })
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
      const { userId, ...entry } = row;
      return { result: { entry, fromDefault: null } satisfies Created, userId, branchId: null };
    },
  },
  async write({ tx, input, userId }): Promise<Created> {
    const added = await addSubtypeFromSearch(tx, userId, input, input.clientKey, null);
    if (added.outcome === "exists") {
      throw new ActionError("invalid_input", { name: "errors.field.taken" });
    }
    return { entry: added.entry, fromDefault: null, named: added.named };
  },
  async history({ tx, userId }, created) {
    if (created.named) await recordSubtypeCreate(tx, userId, created.named);
    await recordSubtypeCreate(tx, userId, created);
  },
});

/** What a new subtype is made from: its product and the fields of the create's input. */
type SubtypeInput = {
  productId: string;
  name: string;
  referencePrice: bigint | null;
  photoFileId: string | null;
};

/**
 * The body of createSubtype's write step, shared with an Excel import (plan of 1.10; progress 1.8,
 * "For 1.10"): the first subtype of a product turns its default real, the others are new rows. An
 * import passes `clientKey` null (spec review of the plan of 1.10, Should fix 1).
 */
export async function addSubtype(
  tx: Executor,
  userId: string,
  input: SubtypeInput,
  clientKey: string | null,
): Promise<Created> {
  // The table's lock first, as every subtype write (refuseTaken relies on it; plan review,
  // Should fix 1), then the product FOR UPDATE, and only then is has_variants read, so two
  // first subtypes of one product cannot both turn the default real.
  await catalog.lockTable(tx);
  const [product] = await tx
    .select({ isActive: products.isActive, hasVariants: products.hasVariants })
    .from(products)
    .where(eq(products.id, input.productId))
    .for("update");
  if (!product) throw new ActionError("invalid_input", { productId: "errors.field.notAllowed" });
  if (!product.isActive) {
    throw new ActionError("invalid_input", { productId: "errors.field.inactive" });
  }
  if (input.photoFileId) await refusePhoto(tx, userId, input.photoFileId);

  if (product.hasVariants) {
    await catalog.refuseTaken(tx, { name: input.name }, null, input.productId);
    const [entry] = await tx
      .insert(productVariants)
      .values({
        productId: input.productId,
        name: input.name,
        photoFileId: input.photoFileId,
        referencePrice: input.referencePrice,
        clientKey,
        createdAt: now(),
      })
      .returning(columns);
    if (entry!.referencePrice !== null) {
      await recordHeadPrice(tx, {
        variantId: entry!.id,
        price: entry!.referencePrice,
        setBy: userId,
      });
    }
    return { entry: entry!, fromDefault: null };
  }

  const [held] = await tx
    .select({
      id: productVariants.id,
      name: productVariants.name,
      price: productVariants.referencePrice,
    })
    .from(productVariants)
    .where(and(eq(productVariants.productId, input.productId), eq(productVariants.isDefault, true)))
    .for("update");
  if (firstSubtypePriceRefused(held!.price, input.referencePrice)) {
    throw new ActionError("invalid_input", { referencePrice: LOCKED });
  }
  // The default row itself is left out, so "Default" is a valid first name (decision 6).
  await catalog.refuseTaken(tx, { name: input.name }, held!.id, input.productId);
  const [entry] = await tx
    .update(productVariants)
    .set({
      name: input.name,
      photoFileId: input.photoFileId,
      referencePrice: firstSubtypePrice(held!.price, input.referencePrice),
      isDefault: false,
      clientKey,
    })
    .where(eq(productVariants.id, held!.id))
    .returning(columns);
  await tx.update(products).set({ hasVariants: true }).where(eq(products.id, input.productId));
  // A price the default held keeps its row, which points at the same id; a price taken now is
  // the Head setting one (plan of 1.9, decision 1, Look first).
  if (held!.price === null && entry!.referencePrice !== null) {
    await recordHeadPrice(tx, {
      variantId: entry!.id,
      price: entry!.referencePrice,
      setBy: userId,
    });
  }
  return { entry: entry!, fromDefault: { name: held!.name, referencePrice: held!.price } };
}

/** The body of createSubtype's history step: its `subtype.create` row, and the product's change. */
export async function recordSubtypeCreate(
  tx: Executor,
  userId: string,
  { entry, fromDefault }: Created,
): Promise<void> {
  const parent = await productShown(tx, entry.productId);
  const photo = entry.photoFileId ? await fileNameOf(tx, entry.photoFileId) : null;
  await audit(
    { tx, userId },
    {
      action: "subtype.create",
      entity: SUBTYPES.entity,
      entityId: entry.id,
      // The default made real shows what it was (plan review, Should fix 9; 04 rule 9).
      before: fromDefault ? { ...parent, ...fromDefault } : null,
      after: {
        ...parent,
        name: entry.name,
        referencePrice: entry.referencePrice,
        photoFileId: entry.photoFileId,
        photo,
        isActive: entry.isActive,
        ...(fromDefault ? { fromDefault: true } : {}),
      },
      at: now(),
    },
  );
  if (fromDefault) {
    await audit(
      { tx, userId },
      {
        action: "product.update",
        entity: "products",
        entityId: entry.productId,
        before: { hasVariants: false },
        after: { hasVariants: true },
        at: now(),
      },
    );
  }
}

/** What the add from an order's product search, and the Head's page, give (04 rules 1 and 8). */
export type SubtypeFromSearch =
  | {
      outcome: "made";
      /** The new subtype. */
      entry: SavedSubtype;
      /** The hidden default made real under the existing items' name; null when it had subtypes. */
      named: Created | null;
    }
  | { outcome: "exists"; variantId: string; name: string; isActive: boolean };

/**
 * The body of the add of a subtype from an order's product search and from the Head's catalog page
 * (04 rule 1, since D64: "from the catalog page or from an order"; rule 8: "When the product has
 * no subtypes yet, the Manager also names what its existing items are ...: the hidden default
 * subtype takes that name, so existing orders, stock and prices keep pointing at the same items";
 * plan of 1.12b, decided items 2, 4, 7, Look first). The table's lock, then the product FOR UPDATE,
 * then its default, as addSubtype(). A name the product already holds (the hidden default left
 * out) gives that entry back and writes nothing (04 rule 3). On a product without subtypes the
 * default keeps its id, price, price rows and photo and changes only its name and `is_default`;
 * the new name is a new row, which alone takes the photo, the client key and `added_by`, so a
 * repeat finds it and never the renamed default. No reference price is taken.
 */
export async function addSubtypeFromSearch(
  tx: Executor,
  userId: string,
  input: {
    productId: string;
    name: string;
    photoFileId: string | null;
    existingName?: string | null;
    /** The Head's page sends one (1.8); the add from an order never does (04 rule 8). */
    referencePrice?: bigint | null;
  },
  clientKey: string,
  addedBy: string | null,
): Promise<SubtypeFromSearch> {
  await catalog.lockTable(tx);
  const [product] = await tx
    .select({ isActive: products.isActive, hasVariants: products.hasVariants })
    .from(products)
    .where(eq(products.id, input.productId))
    .for("update");
  if (!product) throw new ActionError("invalid_input", { productId: "errors.field.notAllowed" });
  if (!product.isActive) {
    throw new ActionError("invalid_input", { productId: "errors.field.inactive" });
  }

  const [held] = product.hasVariants
    ? []
    : await tx
        .select({
          id: productVariants.id,
          name: productVariants.name,
          price: productVariants.referencePrice,
        })
        .from(productVariants)
        .where(
          and(eq(productVariants.productId, input.productId), eq(productVariants.isDefault, true)),
        )
        .for("update");

  const taken = await catalog.findTaken(tx, input.name, input.productId, held?.id ?? null);
  if (taken)
    return { outcome: "exists", variantId: taken.id, name: taken.name, isActive: taken.isActive };

  if (input.photoFileId) await refusePhoto(tx, userId, input.photoFileId);

  let named: Created | null = null;
  if (held) {
    // Read on the locked product: another add may have given it subtypes meanwhile, and then the
    // existing name is not asked (decided item 7).
    const existingName = input.existingName ?? null;
    if (existingName === null) {
      throw new ActionError("invalid_input", { existingName: "errors.field.required" });
    }
    // Compared as the unique index compares, never by a JavaScript copy (catalog-entries.ts).
    const [same] = (
      await tx.execute<{ same: boolean }>(
        sql`select lower(regexp_replace(btrim(${existingName}), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(${input.name}), '\\s+', ' ', 'g')) as same`,
      )
    ).rows;
    if (same!.same) throw new ActionError("invalid_input", { existingName: "errors.field.taken" });
    const [entry] = await tx
      .update(productVariants)
      .set({ name: existingName, isDefault: false })
      .where(eq(productVariants.id, held.id))
      .returning(columns);
    await tx.update(products).set({ hasVariants: true }).where(eq(products.id, input.productId));
    named = { entry: entry!, fromDefault: { name: held.name, referencePrice: held.price } };
  }

  const [entry] = await tx
    .insert(productVariants)
    .values({
      productId: input.productId,
      name: input.name,
      photoFileId: input.photoFileId,
      referencePrice: input.referencePrice ?? null,
      addedBy,
      clientKey,
      createdAt: now(),
    })
    .returning(columns);
  // A price set here is the Head setting one: its HEAD row (plan of 1.9, decision 1, Look first).
  if (entry!.referencePrice !== null) {
    await recordHeadPrice(tx, {
      variantId: entry!.id,
      price: entry!.referencePrice,
      setBy: userId,
    });
  }
  return { outcome: "made", entry: entry!, named };
}

export const updateSubtype = catalog.update;
export const setSubtypeActive = catalog.setActive;

/** The table's lock, for an Excel import (plan of 1.10). */
export const lockSubtypes = catalog.lockTable;
