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

// Subtypes (04-catalogs.md, Catalogs table: "Product, name, own photo (optional), own reference
// price (optional), active"; rules 1 and 3; open question 18; build-plan 1.8). Table
// `product_variants`, audit `subtype.*`, under catalog.manage (Head only, global; 03 Permission
// matrix: "Manage catalogs, users, branches, settings").
// - Every product has one hidden default row until it gets real subtypes (04 rule 1). The first
//   subtype the Head adds is that row made real, same id, so its lines, stock and price stay with
//   it; `has_variants` turns true (plan of 1.8, decision 1, Look first). The rest are new rows.
// - The reference price is set on create only; on the first subtype a price the default already
//   holds stays, and a sent one is refused (decision 2, Look first). Without one a subtype has no
//   price (decision 4, Look first).
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

type Created = {
  entry: SavedSubtype;
  /** The default row's fields before it was made real; null for a new row. */
  fromDefault: { name: string; referencePrice: bigint | null } | null;
};

/**
 * Adds a subtype to a product. The same client key twice gives the first result (developer-rules
 * rule 8): the maker is the actor of the subtype's `subtype.create` row.
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
          clientKey: input.clientKey,
          createdAt: now(),
        })
        .returning(columns);
      return { entry: entry!, fromDefault: null };
    }

    const [held] = await tx
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
        clientKey: input.clientKey,
      })
      .where(eq(productVariants.id, held!.id))
      .returning(columns);
    await tx.update(products).set({ hasVariants: true }).where(eq(products.id, input.productId));
    return { entry: entry!, fromDefault: { name: held!.name, referencePrice: held!.price } };
  },
  async history({ tx, userId }, { entry, fromDefault }) {
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
  },
});

export const updateSubtype = catalog.update;
export const setSubtypeActive = catalog.setActive;
