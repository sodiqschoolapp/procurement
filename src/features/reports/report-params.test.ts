import { describe, expect, it } from "vitest";

import { parseListFilters } from "@/features/orders/list-filters";

import {
  orderListFilters,
  orderListSearch,
  parseReportParams,
  reportSearch,
} from "./report-params";

// The address of /reports (10-notifications-analytics-reports.md, Reports: "Every report filters
// by branch, date range and category"; developer-rules.md rule 13: every input checked with Zod
// on the server; plan of 6.8, decided items 4 to 6 and 12).

const TODAY = "2031-05-15";
const BRANCH = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const CATEGORY = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("parseReportParams (10 Reports; decided items 5 and 6)", () => {
  it("opens the Order register for this month to today without an address", () => {
    expect(parseReportParams({}, TODAY)).toEqual({
      report: "orders",
      range: { first: "2031-05-01", last: "2031-05-15" },
      filters: { branch: null, category: null, department: null, manager: null, supplier: null },
      // No branch in the address: the report starts at the switcher's (D55 item 11).
      branchGiven: false,
      variant: null,
      page: 1,
    });
  });

  it("reads the report, the dates, the branch, the category and the page", () => {
    const params = parseReportParams(
      {
        report: "spending",
        from: "2031-01-10",
        to: "2031-03-31",
        branch: BRANCH.toUpperCase(),
        category: CATEGORY,
        page: "3",
      },
      TODAY,
    );
    expect(params).toEqual({
      report: "spending",
      range: { first: "2031-01-10", last: "2031-03-31" },
      filters: {
        branch: BRANCH,
        category: CATEGORY,
        department: null,
        manager: null,
        supplier: null,
      },
      branchGiven: true,
      variant: null,
      page: 3,
    });
    expect(
      parseReportParams(Object.fromEntries(new URLSearchParams(reportSearch(params!))), TODAY),
    ).toEqual(params);
  });

  it("drops a broken value: a date that does not exist, an id that is no id, page 0", () => {
    expect(
      parseReportParams(
        { report: "plan", from: "2031-02-30", to: "x", branch: "EA", category: "1", page: "0" },
        TODAY,
      ),
    ).toEqual({
      report: "plan",
      range: { first: "2031-05-01", last: "2031-05-15" },
      filters: { branch: null, category: null, department: null, manager: null, supplier: null },
      // A broken branch is dropped: the switcher's branch, as with none (D55 item 11).
      branchGiven: false,
      variant: null,
      page: 1,
    });
    // "All my branches" is no branch filter, and names the branch (D55 item 11).
    expect(parseReportParams({ branch: "all" }, TODAY)).toMatchObject({
      filters: { branch: null },
      branchGiven: true,
    });
  });

  it("refuses an unknown report, a name given twice and `from` after `to`", () => {
    // `stock` became a report in 6.9a and `prices` in 6.9b; a name that is none stays refused.
    expect(parseReportParams({ report: "unknown" }, TODAY)).toBeNull();
    expect(parseReportParams({ branch: [BRANCH, BRANCH] }, TODAY)).toBeNull();
    expect(parseReportParams({ from: "2031-05-10", to: "2031-05-09" }, TODAY)).toBeNull();
    // One day is a range.
    expect(parseReportParams({ from: "2031-05-10", to: "2031-05-10" }, TODAY)!.range).toEqual({
      first: "2031-05-10",
      last: "2031-05-10",
    });
  });
});

describe("the branch of the switcher (10 Reports; D55 item 11; plan of 8.2b, decided item 12)", () => {
  it('writes "All my branches" as branch=all, so a link stays all-branches', () => {
    const params = parseReportParams({ report: "spending", branch: "all" }, TODAY)!;
    expect(new URLSearchParams(reportSearch(params)).get("branch")).toBe("all");
    expect(
      parseReportParams(Object.fromEntries(new URLSearchParams(reportSearch(params))), TODAY),
    ).toEqual(params);
  });
});

describe("the stock reports of 6.9a (10 Reports: Stock on hand, Stock movements, Use by department)", () => {
  it("reads each of them and gives back the same address", () => {
    for (const report of ["stock", "movements", "use"] as const) {
      const params = parseReportParams({ report, branch: BRANCH, page: "2" }, TODAY)!;
      expect([params.report, params.filters.branch, params.page]).toEqual([report, BRANCH, 2]);
      expect(
        parseReportParams(Object.fromEntries(new URLSearchParams(reportSearch(params))), TODAY),
      ).toEqual(params);
    }
  });
});

describe("the reports of 6.9b (10 Reports: Price history, Money with managers, Approval speed)", () => {
  const VARIANT = "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d";

  it("reads each of them and gives back the same address", () => {
    for (const report of ["prices", "cash", "speed"] as const) {
      const params = parseReportParams({ report, branch: BRANCH, page: "2" }, TODAY)!;
      expect([params.report, params.filters.branch, params.page]).toEqual([report, BRANCH, 2]);
      expect(
        parseReportParams(Object.fromEntries(new URLSearchParams(reportSearch(params))), TODAY),
      ).toEqual(params);
    }
  });

  it("reads Price history's subtype, drops a broken one, and writes it back for Price history only (decided item 6)", () => {
    const params = parseReportParams({ report: "prices", variant: VARIANT.toUpperCase() }, TODAY)!;
    expect(params.variant).toBe(VARIANT);
    // The address written back names "all", so it no longer follows the switcher (D55 item 11).
    expect(
      parseReportParams(Object.fromEntries(new URLSearchParams(reportSearch(params))), TODAY),
    ).toEqual({ ...params, branchGiven: true });
    expect(parseReportParams({ report: "prices", variant: "x" }, TODAY)!.variant).toBeNull();
    expect(reportSearch({ ...params, report: "cash" })).not.toContain("variant");
  });
});

describe("the Order register as the order list's filters (10 Reports, row 1; decided items 4, 7, 11)", () => {
  it("is the orders submitted in the dates, of the branch and the category, nothing else", () => {
    const params = parseReportParams(
      { from: "2031-04-01", to: "2031-04-30", branch: BRANCH, category: CATEGORY },
      TODAY,
    )!;
    const filters = orderListFilters(params);
    expect(filters).toMatchObject({
      dates: "submitted",
      from: "2031-04-01",
      to: "2031-04-30",
      branch: BRANCH,
      category: CATEGORY,
      status: null,
      owner: null,
      department: null,
    });
    // The list's download reads the same filters back from the link.
    expect(
      parseListFilters(Object.fromEntries(new URLSearchParams(orderListSearch(params)))).filters,
    ).toEqual(filters);
  });
});
