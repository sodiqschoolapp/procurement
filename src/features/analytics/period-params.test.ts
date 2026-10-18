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
      otherOwners: false,
      variant: null,
      reason: null,
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
      otherOwners: false,
      variant: null,
      reason: null,
      page: 3,
      block: "records",
    });
  });

  // The keys, parameters and blocks of 6.4b (plan of 6.4b, decided items 3, 10 and 12).
  it.each([
    [{ kind: "price", variant: ID, month: null, noSupplier: false }, "records"],
    [{ kind: "price", variant: ID, month: "2031-10", noSupplier: false }, "priceTrend"],
    [{ kind: "price", variant: ID, month: null, noSupplier: true }, "priceSpread"],
    [{ kind: "step", step: "PENDING_FINANCE", decision: null }, "stepHours"],
    [{ kind: "step", step: null, decision: "APPROVE" }, "decisions"],
    [{ kind: "waiting", step: "PENDING_HEAD", group: "twoDays" }, "waiting"],
    [{ kind: "waiting", step: null, group: null }, "approvals"],
    // The keys and blocks of 6.4d (plan of 6.4d, decided item 9).
    [{ kind: "stock", view: "value" }, "warehouse"],
    [{ kind: "stock", view: "low" }, "stock"],
    [{ kind: "stock", view: "still" }, "stock"],
    [{ kind: "moves", move: "use" }, "departmentUse"],
    [{ kind: "moves", move: "writeoff" }, "moves"],
  ] as const)("reads the key %o and the block %s back", (key, block) => {
    const text = analyticsSearch(
      { choice: "this_month", from: null, to: null },
      NO_ANALYTICS_FILTERS,
      {
        key,
        variant: ID,
        block,
      },
    );
    expect(parseAnalyticsParams(Object.fromEntries(new URLSearchParams(text)))).toMatchObject({
      key,
      variant: ID,
      reason: null,
      block,
    });
  });

  // The blocks of 6.4c (plan of 6.4c, decided item 7): the Managers table and its two lists, with
  // "Other owners" beside the lists.
  it.each(["managers", "cancelled", "cash"] as const)("reads the block %s back", (block) => {
    const text = analyticsSearch(
      { choice: "last_month", from: null, to: null },
      NO_ANALYTICS_FILTERS,
      { otherOwners: block !== "managers", block },
    );
    expect(parseAnalyticsParams(Object.fromEntries(new URLSearchParams(text)))).toMatchObject({
      key: { kind: "period" },
      otherOwners: block !== "managers",
      block,
    });
  });

  it("reads a reason key back beside a send back or reject key", () => {
    const key = { kind: "step", step: null, decision: "SEND_BACK" } as const;
    const text = analyticsSearch(
      { choice: "this_month", from: null, to: null },
      NO_ANALYTICS_FILTERS,
      {
        key,
        reason: "narxni tekshiring",
        block: "reasons",
      },
    );
    expect(parseAnalyticsParams(Object.fromEntries(new URLSearchParams(text)))).toMatchObject({
      key,
      reason: "narxni tekshiring",
      block: "reasons",
    });
  });

  // The keys and blocks of 6.4a (plan of 6.4, decided item 9; review of the plan, correction 1).
  it.each([
    [{ kind: "payment", payment: "CARD" }, "payments"],
    [{ kind: "colour", colour: "amber" }, "orders"],
    [{ kind: "overspent" }, "outcomeBranches"],
    [{ kind: "saved" }, "outcomeManagers"],
  ] as const)("reads the key %o and the block %s back", (key, block) => {
    const filters = { ...NO_ANALYTICS_FILTERS, branch: ID };
    const text = analyticsSearch({ choice: "this_month", from: null, to: null }, filters, {
      key,
      otherOwners: true,
      block,
    });
    expect(parseAnalyticsParams(Object.fromEntries(new URLSearchParams(text)))).toMatchObject({
      key,
      otherOwners: true,
      block,
    });
  });

  it.each(["branches", "departments", "suppliers", "payments", "outcomes"] as const)(
    "reads the export block %s",
    (block) => {
      expect(parseAnalyticsParams({ block })).toMatchObject({ block });
    },
  );

  // The Principal's keys and blocks (build-plan 6.5a; 10 Analytics, Principal, points 3 and 4).
  it.each([
    [{ kind: "product", product: ID }, "products"],
    [{ kind: "status", status: "PENDING_PRINCIPAL" }, "statusOrders"],
    [{ kind: "due", due: "soon" }, "statusOrders"],
    [{ kind: "due", due: "overdue" }, "orderStatuses"],
    [{ kind: "mine" }, "myApprovals"],
  ] as const)("reads the Principal's key %o and a block back", (key, block) => {
    const text = analyticsSearch(
      { choice: "this_month", from: null, to: null },
      NO_ANALYTICS_FILTERS,
      { key, block },
    );
    expect(parseAnalyticsParams(Object.fromEntries(new URLSearchParams(text)))).toMatchObject({
      key,
      block,
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
    ["an unknown payment type", { key: "payment:CHEQUE" }],
    ["a payment type in small letters", { key: "payment:cash" }],
    ["an unknown colour", { key: "colour:grey" }],
    ["an owner other than `other`", { owner: "all" }],
    ["other owners beside a Manager filter", { owner: "other", manager: ID }],
    ["a price key that is not an id", { key: "price:everything" }],
    ["a price key with a month that is not one", { key: `price:${ID}:2031-13` }],
    ["a price key with another suffix", { key: `price:${ID}:somewhere` }],
    ["a step that is no approval step", { key: "step:RETURNED" }],
    ["a decision that is not the approver's", { key: "step:all:CANCEL" }],
    ["an unknown age group", { key: "waiting:all:month" }],
    ["a waiting key without its group", { key: "waiting:all" }],
    ["an unknown stock view", { key: "stock:everything" }],
    ["a stock key without its view", { key: "stock" }],
    ["an unknown movement kind", { key: "moves:transfer" }],
    ["a product that is not an id", { key: "product:chalk" }],
    ["the Draft status (the draft wall; plan of 6.5a)", { key: "status:DRAFT" }],
    ["an unknown status", { key: "status:WAITING" }],
    ["an unknown due kind", { key: "due:later" }],
    ["a mine key with a value", { key: "mine:PENDING_PRINCIPAL" }],
    ["a subtype that is not an id", { variant: "chalk" }],
    ["a reason beside an approve", { key: "step:all:APPROVE", reason: "narxi qimmat" }],
    ["a reason without a decision", { reason: "narxi qimmat" }],
    ["a reason longer than 500 characters", { key: "step:all:REJECT", reason: "x".repeat(501) }],
  ])("refuses %s", (_, raw) => {
    expect(parseAnalyticsParams(raw)).toBeNull();
  });
});
