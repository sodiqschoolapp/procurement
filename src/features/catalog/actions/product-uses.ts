import type { Executor } from "@/server/authorize";

// What counts as a product's "first use" (04-catalogs.md, Catalogs table: "Type and measure lock
// after first use"; plan of 1.7, decision 1, Look first, with the plan review's correction 1): any
// row that holds a quantity of one of the product's subtypes, whatever task writes it (request
// lines, stock movements and balances of every source, stock minimums). No such table exists in
// 1.7, so the list is empty and nothing is locked yet. Each task that adds such a row adds its
// check here, with a database test, and its writing action takes the product row FOR SHARE before
// it inserts, so a change of type or measure (FOR UPDATE on the product) and a first use cannot
// pass each other.

export type ProductUse = {
  /** For the log and the tests. */
  name: string;
  /** Whether any row of this kind holds the product, read inside the caller's transaction. */
  holds(tx: Executor, productId: string): Promise<boolean>;
};

/** Empty in 1.7: no table points at a product's subtypes yet. */
export const PRODUCT_USES: readonly ProductUse[] = [];

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
