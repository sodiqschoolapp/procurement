import { and, asc, desc, eq } from "drizzle-orm";
import * as z from "zod";

import { authorize } from "@/server/authorize";
import { productVariants, products } from "@/server/db/schema";

// Subtypes, read (build-plan 1.8; 04-catalogs.md, Catalogs table: Subtypes; rule 1). Under
// "Manage catalogs, users, branches, settings": catalog.manage, Head only (03). No branch filter:
// a catalog is one list for the whole school. The hidden default row is never returned: a product
// without subtypes "shows none on screen" (build-plan 1.8, Done when). The subtype picker of a
// request line comes with the task that needs it (plan of 1.8, Left out).

export type SubtypeRow = {
  id: string;
  name: string;
  photoFileId: string | null;
  referencePrice: bigint | null;
  isActive: boolean;
};

export type SubtypeDetail = SubtypeRow & {
  productId: string;
  productName: string;
  productActive: boolean;
  productPhotoFileId: string | null;
};

const row = {
  id: productVariants.id,
  name: productVariants.name,
  photoFileId: productVariants.photoFileId,
  referencePrice: productVariants.referencePrice,
  isActive: productVariants.isActive,
};

const isId = (value: string) => z.uuid().safeParse(value).success;

/** A product's real subtypes, active first, then by name; `[]` for a product without any. */
export async function listSubtypes(userId: string, productId: string): Promise<SubtypeRow[]> {
  await authorize(userId, "catalog.manage");
  if (!isId(productId)) return [];
  const { db } = await import("@/server/db/client");
  return db
    .select(row)
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.isDefault, false)))
    .orderBy(desc(productVariants.isActive), asc(productVariants.name), asc(productVariants.id));
}

/**
 * One real subtype of the given product, or `null` for a default row, another product's subtype,
 * an unknown id or one that is not an id (the page: "not found").
 */
export async function getSubtype(
  userId: string,
  productId: string,
  id: string,
): Promise<SubtypeDetail | null> {
  await authorize(userId, "catalog.manage");
  if (!isId(productId) || !isId(id)) return null;
  const { db } = await import("@/server/db/client");
  const [found] = await db
    .select({
      ...row,
      productId: products.id,
      productName: products.name,
      productActive: products.isActive,
      productPhotoFileId: products.photoFileId,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.id, id),
        eq(productVariants.productId, productId),
        eq(productVariants.isDefault, false),
      ),
    );
  return found ?? null;
}
