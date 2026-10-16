import { describe, expect, it } from "vitest";

import { type RevisionSnapshot, revisionChanges } from "./revision-changes";

const TYPE_A = "00000000-0000-4000-8000-0000000000a1";
const TYPE_B = "00000000-0000-4000-8000-0000000000b2";

const base: RevisionSnapshot = {
  variantId: "00000000-0000-4000-8000-000000000001",
  companyId: null,
  departmentId: "00000000-0000-4000-8000-000000000002",
  requesterName: "Invented Teacher",
  neededBy: "2026-11-02",
  quantity: "100.000",
  price: "5000",
  extras: [{ extraCostTypeId: TYPE_A, amount: "20000" }],
  plannedTotal: "520000",
  paymentType: "CASH",
  priority: "NORMAL",
  urgentReason: null,
  comment: null,
  referencePhotoFileId: null,
};

describe("revisionChanges (06 rule 5: what changed on a re-submitted order)", () => {
  it("S5: 100 → 80 is one change with both values, and the total follows", () => {
    const after = { ...base, quantity: "80.000", plannedTotal: "420000" };
    expect(revisionChanges(base, after)).toEqual([
      { kind: "field", field: "quantity", from: "100.000", to: "80.000" },
      { kind: "total", from: "520000", to: "420000" },
    ]);
  });

  it("an order submitted again unchanged has no change", () => {
    expect(revisionChanges(base, { ...base, extras: [...base.extras] })).toEqual([]);
  });

  it("compares quantities and amounts as numbers, not as text", () => {
    expect(revisionChanges(base, { ...base, quantity: "100", price: "5000" })).toEqual([]);
  });

  it.each([
    ["variantId", "00000000-0000-4000-8000-000000000009"],
    ["companyId", "00000000-0000-4000-8000-000000000008"],
    ["departmentId", "00000000-0000-4000-8000-000000000007"],
    ["requesterName", "Another Teacher"],
    ["neededBy", "2026-11-09"],
    ["price", "4500"],
    ["paymentType", "TRANSFER"],
    ["priority", "URGENT"],
    ["urgentReason", "The lesson is tomorrow"],
    ["comment", "Blue only"],
    ["referencePhotoFileId", "00000000-0000-4000-8000-000000000006"],
  ] as const)("names a changed %s with its old and new value", (field, value) => {
    expect(revisionChanges(base, { ...base, [field]: value })).toEqual([
      { kind: "field", field, from: base[field], to: value },
    ]);
  });

  it("names an extra cost added, removed and changed, per type", () => {
    const after = {
      ...base,
      extras: [
        { extraCostTypeId: TYPE_B, amount: "7000" },
        { extraCostTypeId: TYPE_B, amount: "3000" },
      ],
    };
    expect(revisionChanges(base, after)).toEqual([
      { kind: "extra", extraCostTypeId: TYPE_A, from: "20000", to: null },
      { kind: "extra", extraCostTypeId: TYPE_B, from: null, to: "10000" },
    ]);
    expect(
      revisionChanges(base, { ...base, extras: [{ extraCostTypeId: TYPE_A, amount: "25000" }] }),
    ).toEqual([{ kind: "extra", extraCostTypeId: TYPE_A, from: "20000", to: "25000" }]);
  });

  it("never lists the number, the branch or the stock at submit", () => {
    const before = { ...base, number: "CHL-26-0001", branchId: "b1", stockAtSubmit: "3.000" };
    const after = { ...base, number: "CHL-26-0001", branchId: "b2", stockAtSubmit: "9.000" };
    expect(revisionChanges(before, after)).toEqual([]);
  });
});
