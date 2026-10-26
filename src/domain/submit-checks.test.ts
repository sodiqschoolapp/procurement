import { describe, expect, it } from "vitest";

import { ORDER_FIELDS_DEFAULT, type OrderFields } from "./order-fields";
import {
  type SubmitFacts,
  cancelPlanGaps,
  inactiveEntries,
  isReady,
  shownFacts,
  submitRefusals,
  submitSelection,
} from "./submit-checks";

// 05-order-request-form.md, Checks at submit; Order fields 2, 3, 7, 8, 10, 11, 14;
// edge-cases/requests-and-approval.md, "A product is deactivated while it sits in a draft";
// plan of 2.7, decided items 1 and 2 (Look first) with the review's correction 1.

const TODAY = "2026-10-16";

const complete: SubmitFacts = {
  numbered: false,
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
  requesterName: null,
  comment: null,
  referencePhotoFileId: null,
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
    expect(submitRefusals({ ...complete, priority: "URGENT", urgentReason: " " }, TODAY)).toEqual({
      urgentReason: "required",
    });
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
      submitRefusals({ ...complete, companyId: "company", companyActive: true, extras: [] }, TODAY),
    ).toEqual({});
  });
});

describe("inactiveEntries (edge case: the draft is marked)", () => {
  it("names only the deactivated entries the draft names", () => {
    expect(inactiveEntries(complete)).toEqual([]);
    expect(
      inactiveEntries({ ...complete, subtypeActive: false, extras: [{ active: false }] }),
    ).toEqual(["variantId", "extras.0.extraCostTypeId"]);
  });
});

describe("isReady (05 Checks at submit; plan of 2.5c, Build 3)", () => {
  it("a complete draft is ready; one without a price or with yesterday's date is not", () => {
    expect(isReady(complete, TODAY)).toBe(true);
    expect(isReady({ ...complete, price: null }, TODAY)).toBe(false);
    expect(isReady({ ...complete, neededBy: "2026-10-15" }, TODAY)).toBe(false);
  });
});

describe("shownFacts: the sheet's row as submitRefusals() reads it (plan of 2.5c, decided item 10)", () => {
  const shown = {
    number: null,
    variantId: "variant",
    allowsDecimals: false,
    departmentId: "department",
    companyId: "company",
    neededBy: TODAY,
    quantity: "3",
    price: 12_500n,
    priority: "NORMAL" as const,
    urgentReason: null,
    requesterName: null,
    comment: null,
    referencePhotoFileId: null,
    extras: [{}, {}],
    inactive: [],
  };

  it("with no inactive cell the row is ready, as the server's facts would be", () => {
    expect(submitRefusals(shownFacts(shown), TODAY)).toEqual({});
  });

  it("each inactive cell is refused as inactive on its own field (edge case: the draft is marked)", () => {
    const facts = shownFacts({
      ...shown,
      inactive: ["branchId", "variantId", "departmentId", "companyId", "extras.1.extraCostTypeId"],
    });
    expect(submitRefusals(facts, TODAY)).toEqual({
      branchId: "inactive",
      variantId: "inactive",
      departmentId: "inactive",
      companyId: "inactive",
      "extras.1.extraCostTypeId": "inactive",
    });
  });

  it("empty cells are required, never inactive", () => {
    const facts = shownFacts({ ...shown, variantId: null, departmentId: null, companyId: null });
    expect(facts.subtypeActive).toBeNull();
    expect(facts.departmentActive).toBeNull();
    expect(facts.companyActive).toBeNull();
    expect(submitRefusals(facts, TODAY)).toEqual({
      variantId: "required",
      departmentId: "required",
    });
  });
});

describe("submitSelection (05 Checks at submit: at most 200, the first 200 in the order added)", () => {
  const at = (second: number) => new Date(Date.UTC(2026, 9, 16, 5, 0, second));

  it("201 ready drafts: the first 200 by creation go, the 201st is held back", () => {
    const drafts = Array.from({ length: 201 }, (_, n) => ({
      id: `d${String(n).padStart(3, "0")}`,
      createdAt: new Date(at(0).getTime() + n * 1000),
      ready: true,
    }));
    const { send, heldBack, stay } = submitSelection([...drafts].reverse());
    expect(send.map((draft) => draft.id)).toEqual(drafts.slice(0, 200).map((draft) => draft.id));
    expect(heldBack.map((draft) => draft.id)).toEqual(["d200"]);
    expect(stay).toEqual([]);
  });

  it("a draft that is not ready stays and takes no place among the 200 (decided item 4)", () => {
    const notReady = { id: "a", createdAt: at(0), ready: false };
    const ready = Array.from({ length: 200 }, (_, n) => ({
      id: `r${String(n).padStart(3, "0")}`,
      createdAt: at(1 + (n % 50)),
      ready: true,
    }));
    const { send, heldBack, stay } = submitSelection([notReady, ...ready]);
    expect(send).toHaveLength(200);
    expect(heldBack).toEqual([]);
    expect(stay).toEqual([notReady]);
  });

  it("two drafts made at the same moment go by id", () => {
    const { send } = submitSelection([
      { id: "b", createdAt: at(0), ready: true },
      { id: "a", createdAt: at(0), ready: true },
    ]);
    expect(send.map((draft) => draft.id)).toEqual(["a", "b"]);
  });
});

describe("submitRefusals with the fields the Head sets (05 Fields the Head sets; Checks at submit; plan of 2.5d)", () => {
  const fields = (rules: Partial<OrderFields>): OrderFields => ({
    ...ORDER_FIELDS_DEFAULT,
    ...rules,
  });

  it("a hidden needed-by date and an empty optional department pass (05 rule 3)", () => {
    const set = fields({
      neededBy: { ask: "hidden", place: "row" },
      department: { ask: "optional", place: "row" },
    });
    expect(
      submitRefusals(
        { ...complete, neededBy: null, departmentId: null, departmentActive: null },
        TODAY,
        set,
      ),
    ).toEqual({});
  });

  it("a required field left empty is still refused, in the row and under More", () => {
    const set = fields({
      brand: { ask: "required", place: "more" },
      referencePhoto: { ask: "required", place: "row" },
      requesterName: { ask: "required", place: "more" },
      comment: { ask: "required", place: "more" },
    });
    expect(
      submitRefusals({ ...complete, departmentId: null, departmentActive: null }, TODAY, set),
    ).toEqual({
      departmentId: "required",
      companyId: "required",
      referencePhotoFileId: "required",
      requesterName: "required",
      comment: "required",
    });
    expect(
      submitRefusals(
        {
          ...complete,
          companyId: "company",
          companyActive: true,
          referencePhotoFileId: "file",
          requesterName: "Invented Person",
          comment: "Blue",
        },
        TODAY,
        set,
      ),
    ).toEqual({});
  });

  it("an optional needed-by date that is given is still not in the past (Checks at submit)", () => {
    const set = fields({ neededBy: { ask: "optional", place: "row" } });
    expect(submitRefusals({ ...complete, neededBy: "2026-10-15" }, TODAY, set)).toEqual({
      neededBy: "inPast",
    });
  });

  it("a never-submitted draft's hidden field is not checked: the submit stores its hidden value (05 rule 2; decided item 2)", () => {
    const set = fields({
      department: { ask: "hidden", place: "row" },
      neededBy: { ask: "hidden", place: "row" },
      priority: { ask: "hidden", place: "more" },
      brand: { ask: "hidden", place: "more" },
      extras: { ask: "hidden", place: "more" },
    });
    const facts: SubmitFacts = {
      ...complete,
      departmentActive: false,
      neededBy: "2026-10-01",
      priority: "URGENT",
      urgentReason: null,
      companyId: "company",
      companyActive: false,
      extras: [{ active: false }],
    };
    expect(submitRefusals(facts, TODAY, set)).toEqual({});
    // The same order with a number keeps what it holds, so what it holds is checked (05 rule 4).
    expect(submitRefusals({ ...facts, numbered: true }, TODAY, set)).toEqual({
      departmentId: "inactive",
      neededBy: "inPast",
      urgentReason: "required",
      companyId: "inactive",
      "extras.0.extraCostTypeId": "inactive",
    });
  });

  it("isReady and the defaults agree with submitRefusals", () => {
    expect(isReady(complete, TODAY)).toBe(true);
    expect(isReady({ ...complete, departmentId: null, departmentActive: null }, TODAY)).toBe(false);
    expect(
      isReady(
        { ...complete, departmentId: null, departmentActive: null },
        TODAY,
        fields({ department: { ask: "optional", place: "row" } }),
      ),
    ).toBe(true);
  });
});

describe("cancelPlanGaps (06 Allowed moves, Cancel; plan of 2.5d, decided items 4 and 6)", () => {
  const plan = {
    variantId: "variant",
    departmentId: null,
    neededBy: null,
    quantity: "3",
    price: 5000n,
    total: 15_000n,
    priority: "NORMAL" as const,
    urgentReason: null,
  };

  it("needs no department and no needed-by date (D67)", () => {
    expect(cancelPlanGaps(plan)).toEqual({});
  });

  // Changed by 2.5d-b (D67; plan of 2.5d-b, decided item 6, Look first): the requirement that held
  // the price back until then is built, so a cancel may be without a price.
  it("needs no price since 2.5d-b; a price with a quantity and no total is still refused (decided item 6)", () => {
    expect(cancelPlanGaps({ ...plan, price: null, total: null })).toEqual({});
    expect(cancelPlanGaps({ ...plan, total: null })).toEqual({ price: "required" });
  });

  it("still asks the subtype, the quantity and an urgent reason", () => {
    expect(
      cancelPlanGaps({ ...plan, variantId: null, quantity: null, priority: "URGENT" }),
    ).toEqual({ variantId: "required", quantity: "required", urgentReason: "required" });
  });
});
