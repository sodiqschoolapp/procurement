import { describe, expect, it } from "vitest";

import { NOTE_MAX } from "./catalogs";
import {
  DEFAULT_PRODUCT_TYPE,
  MEASURE_LOCKED_AFTER_USE,
  PRODUCT_LOCKED_AFTER_USE,
  isDescription,
  isProductType,
  lockedChanges,
} from "./products";

// 04-catalogs.md, Catalogs table (Products and services: "product is the default"; "Type and
// measure lock after first use"); 02-assumptions.md A7; plan of 1.7, decisions 1, 3, 8, 9.

describe("the type (04 Catalogs table; A7)", () => {
  it("Done when: a new item is a product unless service is chosen", () => {
    expect(DEFAULT_PRODUCT_TYPE).toBe("GOODS");
  });

  it("GOODS and SERVICE only (14-data-model.md, products.type)", () => {
    expect(isProductType("GOODS")).toBe(true);
    expect(isProductType("SERVICE")).toBe(true);
    for (const value of ["goods", "PRODUCT", "", null, 1]) expect(isProductType(value)).toBe(false);
  });
});

describe("the description (plan of 1.7, decision 9)", () => {
  it("trimmed, 1 to 1000 code points", () => {
    expect(isDescription("Oq qog'oz, 500 varaq")).toBe(true);
    expect(isDescription("a".repeat(NOTE_MAX))).toBe(true);
    expect(isDescription("a".repeat(NOTE_MAX + 1))).toBe(false);
    expect(isDescription(" padded ")).toBe(false);
    expect(isDescription("")).toBe(false);
  });
});

describe("lock after first use (04 Catalogs table: type and measure lock)", () => {
  const changed = ["type", "unitId", "name", "categoryId", "photoFileId", "defaultCompanyId"];

  it("not in use: the type and the measure may change (the same input as below)", () => {
    expect(lockedChanges(PRODUCT_LOCKED_AFTER_USE, changed, false)).toEqual([]);
  });

  it("in use: the type and the measure are refused, the rest passes", () => {
    expect(lockedChanges(PRODUCT_LOCKED_AFTER_USE, changed, true)).toEqual(["type", "unitId"]);
    expect(lockedChanges(PRODUCT_LOCKED_AFTER_USE, ["name", "description"], true)).toEqual([]);
  });

  it("a measure's Allows decimals locks once a product uses it (decisions 1.5 item 2)", () => {
    expect(lockedChanges(MEASURE_LOCKED_AFTER_USE, ["allowDecimal"], false)).toEqual([]);
    expect(lockedChanges(MEASURE_LOCKED_AFTER_USE, ["allowDecimal", "name"], true)).toEqual([
      "allowDecimal",
    ]);
    expect(lockedChanges(MEASURE_LOCKED_AFTER_USE, ["name", "shortName"], true)).toEqual([]);
  });
});
