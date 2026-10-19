import type { ProductResult } from "./queries/search";

// Where each result of the search opens (plan of 6.10, What will exist; decided items 2 to 4):
// pages every role opens, with no dates, so each opens on its own default period.

/** The order page (11 Screens: every role). */
export function orderHref(id: string): string {
  return `/orders/${id}`;
}

/** A goods subtype: Stock on hand searched by its product's name; a service: its Price history. */
export function productHref(product: Pick<ProductResult, "id" | "type" | "productName">): string {
  if (product.type === "SERVICE") {
    return `/reports?${new URLSearchParams({ report: "prices", variant: product.id })}`;
  }
  return `/warehouse/stock?${new URLSearchParams({ q: product.productName })}`;
}

/** The records list of Analytics filtered by the supplier (plan of 6.10, decided item 2). */
export function supplierHref(id: string): string {
  return `/analytics/records?${new URLSearchParams({ supplier: id })}`;
}
