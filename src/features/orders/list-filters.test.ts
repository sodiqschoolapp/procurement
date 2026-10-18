import { describe, expect, it } from "vitest";

import {
  NO_FILTERS,
  activeFilterCount,
  listFiltersParams,
  numberParts,
  parseListFilters,
} from "./list-filters";

// 05-order-request-form.md, Ticking and filters ("Filters and sorting stay in the address, so a
// link reopens the same view"); 11-screens-and-ux.md rule 8; plan of 2.8, decided items 9 to 13.

const BRANCH = "0b6f4c1e-1111-4a2b-9c3d-000000000001";
const ACTION = "0b6f4c1e-2222-4a2b-9c3d-000000000002";

describe("the address of the list (05 Ticking and filters; 11 rule 8)", () => {
  it("every filter and the sort make a round trip through the address", () => {
    const raw = {
      dates: "approved",
      from: "2026-10-01",
      to: "2026-10-31",
      branch: BRANCH,
      status: "PENDING_PRINCIPAL",
      owner: BRANCH,
      department: BRANCH,
      category: BRANCH,
      payment: "TRANSFER",
      urgent: "1",
      numberFrom: "CHL-26-0002",
      numberTo: "CHL-26-0010",
      action: ACTION,
      sort: "submitted",
    };
    const { filters, ignored } = parseListFilters(raw);
    expect(ignored).toEqual([]);
    expect(Object.fromEntries(listFiltersParams(filters))).toEqual(raw);
    expect(parseListFilters(Object.fromEntries(listFiltersParams(filters))).filters).toEqual(
      filters,
    );
  });

  it("no parameters are no filters, and no filters write an empty address", () => {
    expect(parseListFilters({}).filters).toEqual(NO_FILTERS);
    expect(listFiltersParams(NO_FILTERS).toString()).toBe("");
  });

  it("a broken value is dropped, never an error", () => {
    const { filters } = parseListFilters({
      dates: "yesterday",
      from: "2026-02-30",
      branch: "not-an-id",
      status: "DRAFT",
      payment: "CHEQUE",
      urgent: "yes",
      numberFrom: "CHL-0002",
      sort: "amount",
    });
    expect(filters).toEqual(NO_FILTERS);
  });

  it("Draft is not a status of the list (decided item 1, Look first)", () => {
    expect(parseListFilters({ status: "DRAFT" }).filters.status).toBeNull();
    expect(parseListFilters({ status: "RETURNED" }).filters.status).toBe("RETURNED");
  });

  it("a number is read in capitals; the first of a repeated parameter counts", () => {
    const { filters } = parseListFilters({
      numberFrom: "chl-26-0002",
      status: ["CLOSED", "REJECTED"],
    });
    expect(filters.numberFrom).toBe("CHL-26-0002");
    expect(filters.status).toBe("CLOSED");
  });

  it("a number range over two branch codes or years keeps `from` only and says so (decided item 10)", () => {
    const { filters, ignored } = parseListFilters({
      numberFrom: "CHL-26-0002",
      numberTo: "CHL-27-0010",
    });
    expect(filters.numberFrom).toBe("CHL-26-0002");
    expect(filters.numberTo).toBeNull();
    expect(ignored).toEqual(["numberTo"]);
  });

  it("the date kind is written only with a date", () => {
    expect(listFiltersParams({ ...NO_FILTERS, dates: "closed" }).toString()).toBe("");
    expect(listFiltersParams({ ...NO_FILTERS, dates: "closed", to: "2026-10-31" }).toString()).toBe(
      "dates=closed&to=2026-10-31",
    );
  });

  it("`due=soon` is the Manager home's 'Orders due soon' (plan of 6.1, decided item 2); another value is dropped", () => {
    expect(parseListFilters({ due: "soon" }).filters.dueSoon).toBe(true);
    expect(parseListFilters({ due: "1" }).filters.dueSoon).toBe(false);
    expect(parseListFilters({ due: "late" }).filters).toEqual(NO_FILTERS);
    const params = listFiltersParams({ ...NO_FILTERS, dueSoon: true, owner: null });
    expect(params.toString()).toBe("due=soon");
    expect(parseListFilters(Object.fromEntries(params)).filters).toEqual({
      ...NO_FILTERS,
      dueSoon: true,
    });
    expect(activeFilterCount({ ...NO_FILTERS, dueSoon: true })).toBe(1);
  });

  it("counts the filters that are on, not the sort", () => {
    expect(activeFilterCount({ ...NO_FILTERS, sort: "product" })).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, urgent: true, from: "2026-10-01" })).toBe(2);
  });
});

describe("numberParts (05 Order number 2: after 9999 the counter grows to five digits)", () => {
  it("the prefix and the counter as an integer", () => {
    expect(numberParts("CHL-26-0142")).toEqual({ prefix: "CHL-26", counter: 142 });
    expect(numberParts("CHL-26-10000")!.counter).toBeGreaterThan(
      numberParts("CHL-26-9999")!.counter,
    );
    expect(numberParts("CHL-0142")).toBeNull();
  });
});
