import { describe, expect, it } from "vitest";

import { orderHref, productHref, supplierHref } from "./result-href";

// Where a search result opens (11-screens-and-ux.md rule 9; plan of 6.10, decided items 2 to 4).

const ID = "0b8a3c1e-1d2f-4a5b-9c6d-7e8f9a0b1c2d";

describe("result addresses (plan of 6.10)", () => {
  it("an order opens its page", () => {
    expect(orderHref(ID)).toBe(`/orders/${ID}`);
  });

  it("a goods subtype opens Stock on hand searched by its product name", () => {
    expect(productHref({ id: ID, type: "GOODS", productName: "Qog'oz A4 & co" })).toBe(
      "/warehouse/stock?q=Qog%27oz+A4+%26+co",
    );
  });

  it("a service opens its Price history, with no dates", () => {
    expect(productHref({ id: ID, type: "SERVICE", productName: "Yetkazish" })).toBe(
      `/reports?report=prices&variant=${ID}`,
    );
  });

  it("a supplier opens the records list of Analytics filtered by it", () => {
    expect(supplierHref(ID)).toBe(`/analytics/records?supplier=${ID}`);
  });
});
