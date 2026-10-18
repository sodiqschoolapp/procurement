import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import * as z from "zod";

import { DRAFT_PICKER_MAX } from "@/domain/drafts";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import { branches, productVariants, products, stockBalances, units } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// The choices of the direct-entry form, /warehouse/documents/new?type=DIRECT_ENTRY (09-warehouse.md,
// Direct entry by the Head; plan of 5.8). All under `stock.enter_direct` (03 Permission matrix,
// "Enter stock directly, without an order": the Head only), so any other role is refused as
// authorize() refuses it. Active entries only (04 rule 2; decided items 5 and 7). Every active
// goods subtype is listed, in stock or not (decided item 10), with the branch's stock and the
// subtype's reference price, which prefills the cost (decided item 1, Look first).

export type DirectEntryBranch = { id: string; code: string; name: string };

export type DirectEntrySubtype = {
  id: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  name: string | null;
  /** The stock of the branch, numeric(14,3) text, "0" when it never had any. */
  inStock: string;
  /** The subtype's own reference price in whole so'm, as text; null when it has none. */
  referencePrice: string | null;
};

export type DirectEntryItem = {
  id: string;
  name: string;
  unitShortName: string;
  allowsDecimals: boolean;
  subtypes: DirectEntrySubtype[];
};

const idInput = z.uuid();
const searchInput = z.string().trim().max(200).catch("");

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** The active branches where the user may enter stock directly, by code; the filter is in the SQL. */
export async function directEntryBranchChoices(userId: string): Promise<DirectEntryBranch[]> {
  const actor = await authorizeList(userId, "stock.enter_direct");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return db
    .select({ id: branches.id, code: branches.code, name: branches.name })
    .from(branches)
    .where(and(eq(branches.isActive, true), branchFilter(actor, branches.id)))
    .orderBy(asc(branches.code));
}

/**
 * Up to 20 active goods products whose name holds `q` (any case), by name, each with its active
 * subtypes, the branch's stock and the reference price of each. One snapshot.
 */
export async function searchDirectEntryItems(
  userId: string,
  options: { branchId: string; q?: string },
): Promise<DirectEntryItem[]> {
  const branchId = idInput.parse(options.branchId);
  await authorize(userId, "stock.enter_direct", { branchId });
  const q = searchInput.parse(options.q ?? "");

  return readSnapshot(async (executor) => {
    const found = await executor
      .select({
        id: products.id,
        name: products.name,
        unitShortName: units.shortName,
        allowsDecimals: units.allowDecimal,
      })
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .where(
        and(
          eq(products.isActive, true),
          eq(products.type, "GOODS"),
          q === "" ? undefined : ilike(products.name, containing(q)),
        ),
      )
      .orderBy(asc(products.name), asc(products.id))
      .limit(DRAFT_PICKER_MAX);
    if (found.length === 0) return [];

    const subtypes = await executor
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        name: productVariants.name,
        isDefault: productVariants.isDefault,
        referencePrice: productVariants.referencePrice,
        inStock: stockBalances.qty,
      })
      .from(productVariants)
      .leftJoin(
        stockBalances,
        and(eq(stockBalances.variantId, productVariants.id), eq(stockBalances.branchId, branchId)),
      )
      .where(
        and(
          inArray(
            productVariants.productId,
            found.map((product) => product.id),
          ),
          eq(productVariants.isActive, true),
        ),
      )
      .orderBy(asc(productVariants.name), asc(productVariants.id));

    return found
      .map((product) => ({
        ...product,
        subtypes: subtypes
          .filter((subtype) => subtype.productId === product.id)
          .map((subtype) => ({
            id: subtype.id,
            name: subtype.isDefault ? null : subtype.name,
            inStock: subtype.inStock ?? "0",
            referencePrice: subtype.referencePrice?.toString() ?? null,
          })),
      }))
      .filter((item) => item.subtypes.length > 0);
  });
}
