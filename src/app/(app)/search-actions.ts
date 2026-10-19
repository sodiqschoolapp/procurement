"use server";

import { orderHref, productHref, supplierHref } from "@/features/search/result-href";
import {
  type OrderResult,
  type ProductResult,
  type SupplierResult,
  searchEverything,
} from "@/features/search/queries/search";
import { type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// The search of Ctrl+K (11-screens-and-ux.md rule 9; plan of 6.10). A read called from the
// dialog, as the drafts grid's product search (2.5a): no REST API (D5), and it writes nothing, so
// it is not in the action wrapper (decided item 8). The query asks authorize() itself.

export type WireSearchResults = {
  orders: (OrderResult & { href: string })[];
  products: (ProductResult & { href: string })[];
  suppliers: (SupplierResult & { href: string })[];
};

/** The results of `q`, each with the address it opens. */
export async function searchAction(input: { q: string }): Promise<ActionResult<WireSearchResults>> {
  const user = await getCurrentUser();
  if (!user) return failure("signed_out");
  try {
    const found = await searchEverything(user.id, input?.q);
    return {
      ok: true,
      data: {
        orders: found.orders.map((order) => ({ ...order, href: orderHref(order.id) })),
        products: found.products.map((product) => ({ ...product, href: productHref(product) })),
        suppliers: found.suppliers.map((supplier) => ({
          ...supplier,
          href: supplierHref(supplier.id),
        })),
      },
    };
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error.kind);
    throw error;
  }
}
