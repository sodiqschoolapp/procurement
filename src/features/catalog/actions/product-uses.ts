import { sql } from "drizzle-orm";

import type { Executor } from "@/server/authorize";

// What counts as a product's "first use" (04-catalogs.md, Catalogs table: "Type and measure lock
// after first use"; plan of 1.7, decision 1, Look first, with the plan review's correction 1): any
// row that holds a quantity of one of the product's subtypes, whatever task writes it (request
// lines, stock movements and balances of every source, stock minimums). Orders are the first
// (2.5); each later task that adds such a row adds its check here, with a database test, and its
// writing action takes the product row FOR SHARE before it inserts, so a change of type or measure
// (FOR UPDATE on the product) and a first use cannot pass each other.

export type ProductUse = {
  /** For the log and the tests. */
  name: string;
  /** Whether any row of this kind holds the product, read inside the caller's transaction. */
  holds(tx: Executor, productId: string): Promise<boolean>;
};

/**
 * An order of any status on any of the product's subtypes, a draft included (plan of 2.5a,
 * decided item 6, Look first; decisions 1.7, item 1). The draft actions take the product row FOR
 * SHARE before they write the order. A deleted never-submitted draft leaves no use.
 */
export const ORDER_USES: ProductUse = {
  name: "orders.variant_id",
  async holds(tx, productId) {
    const found = await tx.execute(sql`
      select 1 from orders o
      join product_variants v on v.id = o.variant_id
      where v.product_id = ${productId}
      limit 1`);
    return found.rows.length > 0;
  },
};

/**
 * A stock movement of any type on any of the product's subtypes, in any branch (plan of 3.1,
 * decided item 7). A balance row is made only by the first movement, in its transaction, so the
 * movements alone answer. postMovement() of src/server/stock-ledger.ts takes the product row FOR
 * SHARE before it writes.
 */
export const STOCK_USES: ProductUse = {
  name: "stock_movements.variant_id",
  async holds(tx, productId) {
    const found = await tx.execute(sql`
      select 1 from stock_movements m
      join product_variants v on v.id = m.variant_id
      where v.product_id = ${productId}
      limit 1`);
    return found.rows.length > 0;
  },
};

/** Every kind of row that is a use of a product: orders from 2.5, stock from 3.1; minimums later. */
export const PRODUCT_USES: readonly ProductUse[] = [ORDER_USES, STOCK_USES];

export async function productInUse(
  tx: Executor,
  productId: string,
  uses: readonly ProductUse[] = PRODUCT_USES,
): Promise<boolean> {
  for (const use of uses) {
    if (await use.holds(tx, productId)) return true;
  }
  return false;
}
