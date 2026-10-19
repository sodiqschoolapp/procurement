import { and, asc, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import * as z from "zod";

import { companyKindsFor } from "@/domain/catalogs";
import type { ProductType } from "@/domain/products";
import type { RequestStatus } from "@/domain/request-status";
import { SEARCH_GROUP_MAX, SEARCH_MIN_LENGTH } from "@/domain/search";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import {
  branches,
  categories,
  companies,
  orders,
  productVariants,
  products,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// The search of Ctrl+K (11-screens-and-ux.md rule 9: "a search for order numbers, products and
// suppliers"; build-plan 6.10: "limited to what the user may see"; plan of 6.10). Orders under
// `data.view` with branchFilter() in the SQL and never a Draft, the order list's draft wall
// (decided item 1, Look first; 03 rule 1); products and suppliers under `catalog.pick`, as the
// catalogs hold no branch data (plan of 1.5, decision 2). Inactive entries are found and marked
// (decided item 5). The search ignores the top bar's branch view (decided item 9).

export type OrderResult = {
  id: string;
  number: string;
  revision: number;
  status: RequestStatus;
  branchCode: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  subtypeName: string | null;
};

export type ProductResult = {
  /** The subtype. */
  id: string;
  productName: string;
  subtypeName: string | null;
  type: ProductType;
  categoryName: string;
  isActive: boolean;
};

export type SupplierResult = { id: string; name: string; isActive: boolean };

export type SearchResults = {
  orders: OrderResult[];
  products: ProductResult[];
  suppliers: SupplierResult[];
};

const NOTHING: SearchResults = { orders: [], products: [], suppliers: [] };

/** Developer-rules rule 13: a value that is not a string, or a long one, is no search. */
const searchInput = z.string().trim().max(200).catch("");

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * Up to 8 orders, 8 subtypes and 8 suppliers holding `q`, any case: orders by number, newest
 * first; subtypes by product and subtype name (never the hidden default's stored "default");
 * suppliers (kind SUPPLIER or BOTH) by name. Fewer than 2 characters reads nothing.
 */
export async function searchEverything(userId: string, q: unknown): Promise<SearchResults> {
  const text = searchInput.parse(q);
  const actor = await authorizeList(userId, "data.view");
  await authorize(userId, "catalog.pick");
  if (text.length < SEARCH_MIN_LENGTH) return NOTHING;
  const pattern = containing(text);

  return readSnapshot(async (db) => {
    const orderRows = await db
      .select({
        id: orders.id,
        number: orders.number,
        revision: orders.revision,
        status: orders.status,
        branchCode: branches.code,
        productName: products.name,
        subtypeName: productVariants.name,
        isDefault: productVariants.isDefault,
      })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          branchFilter(actor, orders.branchId),
          // The draft wall: no Draft is found, as no Draft is in the order list.
          ne(orders.status, "DRAFT"),
          ilike(orders.number, pattern),
        ),
      )
      .orderBy(desc(orders.number))
      .limit(SEARCH_GROUP_MAX);

    const productRows = await db
      .select({
        id: productVariants.id,
        productName: products.name,
        subtypeName: productVariants.name,
        isDefault: productVariants.isDefault,
        type: products.type,
        categoryName: categories.name,
        productIsActive: products.isActive,
        subtypeIsActive: productVariants.isActive,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        or(
          ilike(products.name, pattern),
          and(eq(productVariants.isDefault, false), ilike(productVariants.name, pattern)),
        ),
      )
      .orderBy(asc(products.name), desc(productVariants.isDefault), asc(productVariants.name))
      .limit(SEARCH_GROUP_MAX);

    const supplierRows = await db
      .select({ id: companies.id, name: companies.name, isActive: companies.isActive })
      .from(companies)
      .where(
        and(inArray(companies.kind, companyKindsFor("SUPPLIER")), ilike(companies.name, pattern)),
      )
      .orderBy(asc(companies.name), asc(companies.id))
      .limit(SEARCH_GROUP_MAX);

    return {
      orders: orderRows.map((row) => ({
        id: row.id,
        // Outside DRAFT the number is set (`orders_submitted_plan_check`).
        number: row.number!,
        revision: row.revision,
        status: row.status,
        branchCode: row.branchCode,
        productName: row.productName,
        subtypeName: row.isDefault ? null : row.subtypeName,
      })),
      products: productRows.map((row) => ({
        id: row.id,
        productName: row.productName,
        subtypeName: row.isDefault ? null : row.subtypeName,
        type: row.type,
        categoryName: row.categoryName,
        isActive: row.productIsActive && row.subtypeIsActive,
      })),
      suppliers: supplierRows,
    };
  });
}
