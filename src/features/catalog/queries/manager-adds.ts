import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import * as z from "zod";

import { authorize } from "@/server/authorize";
import { productVariants, products, users } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// The Head's home list of products and subtypes added by Managers, until the Head marks them
// checked (04-catalogs.md rule 8; 10, Home page per role: Head, "products and subtypes added by
// Managers, until checked"; build-plan 1.12b). catalog.manage, the Head only; global, as catalogs
// hold no branch (plan of 1.12b, decided item 13). The rows and their count are read in one
// snapshot (.claude/rules/server-actions.md).

export type AddedEntry = {
  kind: "product" | "subtype";
  id: string;
  /** The product's id: the entry's own for a product, its product's for a subtype. */
  productId: string;
  name: string;
  /** The product's name, for a subtype; null for a product. */
  productName: string | null;
  addedByName: string;
  createdAt: Date;
};

export type AddedList = { rows: AddedEntry[]; total: number };

const limitInput = z.number().int().min(1).max(200);

/** The newest `limit` unchecked entries added by Managers, products and subtypes together. */
export async function listUncheckedAdded(
  userId: string,
  options: { limit: number },
): Promise<AddedList> {
  await authorize(userId, "catalog.manage");
  const limit = limitInput.parse(options.limit);
  return readSnapshot(async (db) => {
    const productRows = await db
      .select({
        id: products.id,
        productId: products.id,
        name: products.name,
        addedByName: users.fullName,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(users, eq(users.id, products.addedBy))
      .where(and(isNotNull(products.addedBy), isNull(products.checkedAt)))
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(limit);
    const subtypeRows = await db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        name: productVariants.name,
        productName: products.name,
        addedByName: users.fullName,
        createdAt: productVariants.createdAt,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(users, eq(users.id, productVariants.addedBy))
      .where(and(isNotNull(productVariants.addedBy), isNull(productVariants.checkedAt)))
      .orderBy(desc(productVariants.createdAt), desc(productVariants.id))
      .limit(limit);
    const [productCount] = await db
      .select({ n: count() })
      .from(products)
      .where(and(isNotNull(products.addedBy), isNull(products.checkedAt)));
    const [subtypeCount] = await db
      .select({ n: count() })
      .from(productVariants)
      .where(and(isNotNull(productVariants.addedBy), isNull(productVariants.checkedAt)));

    const rows: AddedEntry[] = [
      ...productRows.map((row) => ({ kind: "product" as const, ...row, productName: null })),
      ...subtypeRows.map((row) => ({ kind: "subtype" as const, ...row })),
    ]
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limit);
    return { rows, total: productCount!.n + subtypeCount!.n };
  });
}
