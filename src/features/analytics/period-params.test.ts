import { describe, expect, it } from "vitest";

import { NO_ANALYTICS_FILTERS, analyticsSearch, parseAnalyticsParams } from "./period-params";

// The address of the Analytics pages, checked with Zod (developer-rules.md rule 13; review of the
// plan of 6.3, correction 2: "a value that does not parse is refused … one test of each refusal";
// 10-notifications-analytics-reports.md, Analytics page per role, points 1 to 4).

const ID = "0b6f3c1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b";

describe("parseAnalyticsParams", () => {
  it("reads an empty address as this month, every branch, the whole period, page 1", () => {
    expect(parseAnalyticsParams({})).toEqual({
      period: { choice: "this_month", from: null, to: null },
      filters: NO_ANALYTICS_FILTERS,
      branchGiven: false,
      key: { kind: "period" },
      page: 1,
      block: null,
    });
  });

  it("reads every value back from analyticsSearch()", () => {
    const period = { choice: "custom", from: "2031-09-25", to: "2031-10-04" } as const;
    const filters = { branch: ID, category: ID, department: ID, manager: ID, supplier: ID };
    const text = analyticsSearch(period, filters, {
      key: { kind: "category", category: ID },
      page: 3,
      block: "records",
    });
    expect(parseAnalyticsParams(Object.fromEntries(new URLSearchParams(text)))).toEqual({
      period,
      filters,
      branchGiven: true,
      key: { kind: "category", category: ID },
      page: 3,
      block: "records",
    });
  });

  it("treats empty form fields as no filter, `branch=all` as all, and drops dates beside another period", () => {
    expect(
      parseAnalyticsParams({
        period: "last_month",
        from: "2031-01-01",
        to: "",
        branch: "all",
        category: "",
      }),
    ).toMatchObject({
      period: { choice: "last_month", from: null, to: null },
      filters: NO_ANALYTICS_FILTERS,
      branchGiven: true,
    });
  });

  it.each([
    ["an unknown period", { period: "next_year" }],
    ["custom dates missing", { period: "custom", from: "2031-01-01" }],
    [
      "custom dates the wrong way round",
      { period: "custom", from: "2031-01-05", to: "2031-01-01" },
    ],
    ["a date that does not exist", { period: "custom", from: "2031-02-30", to: "2031-03-01" }],
    ["a filter id that is not an id", { category: "1; drop table orders" }],
    ["a branch that is not an id", { branch: "everything" }],
    ["a key of no kind", { key: "order:1" }],
    ["a month key that is not a month", { key: "month:2031-13" }],
    ["a category key that is not an id", { key: `category:${ID.replace(/-/g, "x")}` }],
    ["a page of 0", { page: "0" }],
    ["a page that is not a number", { page: "two" }],
    ["an unknown export block", { block: "everything" }],
    ["a value given twice", { category: [ID, ID] }],
  ])("refuses %s", (_, raw) => {
    expect(parseAnalyticsParams(raw)).toBeNull();
  });
});
