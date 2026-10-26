import { describe, expect, it } from "vitest";

import {
  ASK_CHOICES,
  ORDER_FIELDS,
  ORDER_FIELDS_DEFAULT,
  type OrderFields,
  isHidden,
  isOrderFields,
  isRequired,
  placeOf,
  sameOrderFields,
  withHiddenValues,
} from "./order-fields";

// 05-order-request-form.md, Fields the Head sets (D67); 14-data-model.md, Notes for the build
// (`order_fields`); plan of 2.5d, decided items 2 and 3.

function withRule(field: string, rule: unknown): unknown {
  return { ...ORDER_FIELDS_DEFAULT, [field]: rule };
}

describe("the fields and their choices (05 Fields the Head sets, the table)", () => {
  it("names the ten fields of the table; branch, product, subtype and quantity are not among them", () => {
    expect([...ORDER_FIELDS]).toEqual([
      "department",
      "neededBy",
      "price",
      "paymentType",
      "priority",
      "brand",
      "requesterName",
      "comment",
      "referencePhoto",
      "extras",
    ]);
    expect(Object.keys(ASK_CHOICES)).toEqual([...ORDER_FIELDS]);
  });

  it("offers each field the choices of the 'Can be' column", () => {
    for (const field of [
      "department",
      "neededBy",
      "price",
      "brand",
      "requesterName",
      "comment",
      "referencePhoto",
    ] as const) {
      expect(ASK_CHOICES[field]).toEqual(["required", "optional", "hidden"]);
    }
    expect(ASK_CHOICES.paymentType).toEqual(["shown", "hidden"]);
    expect(ASK_CHOICES.priority).toEqual(["shown", "hidden"]);
    expect(ASK_CHOICES.extras).toEqual(["optional", "hidden"]);
  });

  it("defaults to the 'Default' column: department, needed-by and price required in the row; the rest under More", () => {
    expect(ORDER_FIELDS_DEFAULT).toEqual({
      department: { ask: "required", place: "row" },
      neededBy: { ask: "required", place: "row" },
      price: { ask: "required", place: "row" },
      paymentType: { ask: "shown", place: "more" },
      priority: { ask: "shown", place: "more" },
      brand: { ask: "optional", place: "more" },
      requesterName: { ask: "optional", place: "more" },
      comment: { ask: "optional", place: "more" },
      referencePhoto: { ask: "optional", place: "more" },
      extras: { ask: "optional", place: "more" },
    });
    expect(isOrderFields(ORDER_FIELDS_DEFAULT)).toBe(true);
  });
});

describe("the shape of `order_fields` (14 Notes; decided item 3)", () => {
  it("takes every allowed choice of every field, in the row or under More", () => {
    for (const field of ORDER_FIELDS) {
      for (const ask of ASK_CHOICES[field]) {
        for (const place of ["row", "more"]) {
          expect(isOrderFields(withRule(field, { ask, place }))).toBe(true);
        }
      }
    }
  });

  it("refuses a choice the field cannot take", () => {
    expect(isOrderFields(withRule("paymentType", { ask: "required", place: "more" }))).toBe(false);
    expect(isOrderFields(withRule("priority", { ask: "optional", place: "more" }))).toBe(false);
    expect(isOrderFields(withRule("extras", { ask: "required", place: "more" }))).toBe(false);
    expect(isOrderFields(withRule("department", { ask: "shown", place: "row" }))).toBe(false);
    expect(isOrderFields(withRule("department", { ask: "required", place: "top" }))).toBe(false);
  });

  it("refuses a partial value, an unknown field, an extra key and a wrong type", () => {
    const { comment: _comment, ...partial } = ORDER_FIELDS_DEFAULT;
    expect(isOrderFields(partial)).toBe(false);
    expect(
      isOrderFields({ ...ORDER_FIELDS_DEFAULT, branch: { ask: "required", place: "row" } }),
    ).toBe(false);
    expect(isOrderFields(withRule("comment", { ask: "optional", place: "more", x: 1 }))).toBe(
      false,
    );
    expect(isOrderFields(withRule("comment", { ask: "optional" }))).toBe(false);
    expect(isOrderFields(withRule("comment", "optional"))).toBe(false);
    expect(isOrderFields(null)).toBe(false);
    expect(isOrderFields([])).toBe(false);
  });

  it("compares two values field by field", () => {
    const moved: OrderFields = {
      ...ORDER_FIELDS_DEFAULT,
      brand: { ask: "optional", place: "row" },
    };
    expect(sameOrderFields(ORDER_FIELDS_DEFAULT, { ...ORDER_FIELDS_DEFAULT })).toBe(true);
    expect(sameOrderFields(ORDER_FIELDS_DEFAULT, moved)).toBe(false);
  });
});

describe("hidden, required and where (05 Fields the Head sets 1 and 2)", () => {
  const fields: OrderFields = {
    ...ORDER_FIELDS_DEFAULT,
    neededBy: { ask: "hidden", place: "row" },
    department: { ask: "optional", place: "row" },
    brand: { ask: "required", place: "row" },
  };

  it("a hidden field stands nowhere; the others where the Head put them", () => {
    expect(placeOf(fields, "neededBy")).toBeNull();
    expect(placeOf(fields, "brand")).toBe("row");
    expect(placeOf(fields, "comment")).toBe("more");
    expect(isHidden(fields, "neededBy")).toBe(true);
    expect(isRequired(fields, "department")).toBe(false);
    expect(isRequired(fields, "brand")).toBe(true);
  });
});

describe("what a submit stores for a hidden field (05 Fields the Head sets 2; decided item 2)", () => {
  const plan = {
    departmentId: "dep",
    neededBy: "2026-11-01",
    paymentType: "TRANSFER",
    priority: "URGENT" as const,
    urgentReason: "Exams on Monday",
    companyId: "co",
    requesterName: "Invented Person",
    comment: "Blue only",
    referencePhotoFileId: "file",
  };

  it("keeps every field with the defaults", () => {
    expect(withHiddenValues(ORDER_FIELDS_DEFAULT, plan, "CASH")).toEqual({
      ...plan,
      keepExtras: true,
    });
  });

  it("a hidden payment type is the default, a hidden priority Normal with no reason, the rest empty", () => {
    const allHidden = Object.fromEntries(
      ORDER_FIELDS.map((field) => [field, { ask: "hidden", place: "more" }]),
    ) as unknown as OrderFields;
    expect(withHiddenValues(allHidden, plan, "CASH")).toEqual({
      departmentId: null,
      neededBy: null,
      paymentType: "CASH",
      priority: "NORMAL",
      urgentReason: null,
      companyId: null,
      requesterName: null,
      comment: null,
      referencePhotoFileId: null,
      keepExtras: false,
    });
  });
});
