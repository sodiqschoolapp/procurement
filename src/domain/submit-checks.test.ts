import { describe, expect, it } from "vitest";

import { type SubmitFacts, inactiveEntries, submitRefusals } from "./submit-checks";

// 05-order-request-form.md, Checks at submit; Order fields 2, 3, 7, 8, 10, 11, 14;
// edge-cases/requests-and-approval.md, "A product is deactivated while it sits in a draft";
// plan of 2.7, decided items 1 and 2 (Look first) with the review's correction 1.

const TODAY = "2026-10-16";

const complete: SubmitFacts = {
  branchActive: true,
  variantId: "variant",
  subtypeActive: true,
  allowsDecimals: false,
  departmentId: "department",
  departmentActive: true,
  companyId: null,
  companyActive: null,
  neededBy: TODAY,
  quantity: "3",
  price: 12_500n,
  priority: "NORMAL",
  urgentReason: null,
  extras: [{ active: true }],
};

describe("submitRefusals (05 Checks at submit)", () => {
  it("passes a complete draft whose needed-by date is today (05 field 8; decided item 2)", () => {
    expect(submitRefusals(complete, TODAY)).toEqual({});
  });

  it("names each missing required field on its own cell (05 fields 2, 3, 7, 8, 10, 11)", () => {
    expect(
      submitRefusals(
        {
          ...complete,
          variantId: null,
          subtypeActive: null,
          allowsDecimals: null,
          departmentId: null,
          departmentActive: null,
          neededBy: null,
          quantity: null,
          price: null,
        },
        TODAY,
      ),
    ).toEqual({
      variantId: "required",
      departmentId: "required",
      neededBy: "required",
      quantity: "required",
      price: "required",
    });
  });

  it("refuses a needed-by date of yesterday (05 Checks at submit: not in the past)", () => {
    expect(submitRefusals({ ...complete, neededBy: "2026-10-15" }, TODAY)).toEqual({
      neededBy: "inPast",
    });
    expect(submitRefusals({ ...complete, neededBy: "2026-10-17" }, TODAY)).toEqual({});
  });

  it("refuses Urgent without a reason, and passes it with one (05 field 14)", () => {
    expect(submitRefusals({ ...complete, priority: "URGENT", urgentReason: " " }, TODAY)).toEqual(
      { urgentReason: "required" },
    );
    expect(
      submitRefusals({ ...complete, priority: "URGENT", urgentReason: "Exam tomorrow" }, TODAY),
    ).toEqual({});
  });

  it("checks the quantity against the measure again (05 field 10)", () => {
    expect(submitRefusals({ ...complete, quantity: "2.5" }, TODAY)).toEqual({
      quantity: "wholeOnly",
    });
    expect(submitRefusals({ ...complete, quantity: "2.5", allowsDecimals: true }, TODAY)).toEqual(
      {},
    );
    expect(submitRefusals({ ...complete, quantity: "0" }, TODAY)).toEqual({ quantity: "tooSmall" });
  });

  it("refuses every deactivated entry the draft holds, on its cell (Checks at submit; edge case)", () => {
    expect(
      submitRefusals(
        {
          ...complete,
          branchActive: false,
          subtypeActive: false,
          departmentActive: false,
          companyId: "company",
          companyActive: false,
          extras: [{ active: true }, { active: false }],
        },
        TODAY,
      ),
    ).toEqual({
      branchId: "inactive",
      variantId: "inactive",
      departmentId: "inactive",
      companyId: "inactive",
      "extras.1.extraCostTypeId": "inactive",
    });
  });

  it("passes an active company and no extras (05 fields 6 and 12 are optional)", () => {
    expect(
      submitRefusals(
        { ...complete, companyId: "company", companyActive: true, extras: [] },
        TODAY,
      ),
    ).toEqual({});
  });
});

describe("inactiveEntries (edge case: the draft is marked)", () => {
  it("names only the deactivated entries the draft names", () => {
    expect(inactiveEntries(complete)).toEqual([]);
    expect(inactiveEntries({ ...complete, subtypeActive: false, extras: [{ active: false }] })).toEqual(
      ["variantId", "extras.0.extraCostTypeId"],
    );
  });
});
