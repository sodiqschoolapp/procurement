import { describe, expect, it } from "vitest";

import {
  CATALOG_NAME_MAX,
  NOTE_MAX,
  SHORT_NAME_MAX,
  catalogName,
  changedCatalogFields,
  companyKindsFor,
  isCatalogKind,
  isCatalogName,
  isCompanyKind,
  isNote,
  isShortName,
  isTaxId,
} from "./catalogs";

// 04-catalogs.md, Catalogs table (Measures, Categories, Extra cost types, Companies and brands)
// and rule 3 (names unique "ignoring capital letters and extra spaces"); plan of 1.5, decisions 4,
// 5 and 13.

describe("catalogName (04 rule 3)", () => {
  it('Done when: " Paper " and "paper" differ only in capital letters once stored', () => {
    expect(catalogName(" Paper ")).toBe("Paper");
    expect(catalogName(" Paper ").toLowerCase()).toBe(catalogName("paper").toLowerCase());
  });

  it("the same for a Cyrillic name (A2: names are typed in one of three languages)", () => {
    expect(catalogName(" Бумага ").toLowerCase()).toBe(catalogName("БУМАГА").toLowerCase());
  });

  it("trims and collapses inner spaces, tabs included", () => {
    expect(catalogName("  Qog'oz   A4 \t 80 g ")).toBe("Qog'oz A4 80 g");
  });
});

describe("the limits (plan of 1.5, What will exist)", () => {
  it("a name: 1 to 120 code points, stored form only", () => {
    expect(isCatalogName("a".repeat(CATALOG_NAME_MAX))).toBe(true);
    expect(isCatalogName("a".repeat(CATALOG_NAME_MAX + 1))).toBe(false);
    expect(isCatalogName("")).toBe(false);
    expect(isCatalogName(" Paper")).toBe(false);
    expect(isCatalogName("Paper  towels")).toBe(false);
    expect(isCatalogName("ў".repeat(CATALOG_NAME_MAX))).toBe(true);
    expect(isCatalogName(12)).toBe(false);
  });

  it("a short name: 1 to 20 code points", () => {
    expect(isShortName("kg")).toBe(true);
    expect(isShortName("a".repeat(SHORT_NAME_MAX))).toBe(true);
    expect(isShortName("a".repeat(SHORT_NAME_MAX + 1))).toBe(false);
    expect(isShortName("")).toBe(false);
  });

  it("a note: 1 to 1000 code points, trimmed", () => {
    expect(isNote("a".repeat(NOTE_MAX))).toBe(true);
    expect(isNote("a".repeat(NOTE_MAX + 1))).toBe(false);
    expect(isNote(" a")).toBe(false);
    expect(isNote("")).toBe(false);
  });
});

describe("isTaxId (plan of 1.5, decision 5)", () => {
  it.each(["123456789", "12345678901234"])("takes %s", (value) => {
    expect(isTaxId(value)).toBe(true);
  });

  it.each([
    "12345678",
    "1234567890",
    "1234567890123",
    "123456789012345",
    "12345678a",
    "123 456 789",
    "",
  ])("refuses %j", (value) => {
    expect(isTaxId(value)).toBe(false);
  });
});

describe("kinds", () => {
  it("the four catalogs by their address segment (decision 12)", () => {
    for (const kind of ["measures", "categories", "extra-costs", "companies"]) {
      expect(isCatalogKind(kind)).toBe(true);
    }
    expect(isCatalogKind("products")).toBe(false);
  });

  it("a company is a brand, a supplier or both (14-data-model.md, companies)", () => {
    expect(isCompanyKind("BOTH")).toBe(true);
    expect(isCompanyKind("both")).toBe(false);
  });

  it("a brand picker lists BRAND and BOTH; a supplier picker SUPPLIER and BOTH (04, Companies and brands)", () => {
    expect(companyKindsFor("BRAND")).toEqual(["BRAND", "BOTH"]);
    expect(companyKindsFor("SUPPLIER")).toEqual(["SUPPLIER", "BOTH"]);
  });
});

describe("changedCatalogFields (04 rule 9: only what changed)", () => {
  it("lists only the sent fields that differ, in the order given", () => {
    const current = { name: "Kilogram", shortName: "kg", allowDecimal: true };
    expect(
      changedCatalogFields(["name", "shortName", "allowDecimal"], current, {
        allowDecimal: false,
        name: "Kilogram",
      }),
    ).toEqual(["allowDecimal"]);
    expect(changedCatalogFields(["name"], current, {})).toEqual([]);
  });

  it("a change to null counts; a field not sent does not", () => {
    const current = { name: "Sinov MChJ", phone: "+998 90 000 00 00" as string | null };
    expect(changedCatalogFields(["name", "phone"], current, { phone: null })).toEqual(["phone"]);
  });
});
