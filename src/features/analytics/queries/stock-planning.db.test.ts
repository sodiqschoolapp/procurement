import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type SpendingScene,
  refreshNow,
  reverseNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../../tests/helpers/analytics";
import { insertCategory } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getStockLines } from "./stock-lines";
import { getStockMoves } from "./stock-moves";
import { getStockPlanning } from "./stock-planning";

// The Manager's Stock planning block and its drill-downs (build-plan 6.5c; 10-notifications-
// analytics-reports.md, Analytics page per role, Manager, Stock planning, the "Runs out in"
// sentence, points 1 to 3; 00-definitions, Runs out in; 09 Low stock; 03 rule 1; plan of 6.5c,
// decided items 1 to 7 and the review's corrections 1 and 2). 15 October 2031 in Tashkent: this
// month is October, the period before and the month before it September; the 90 days that end
// today run from 18 July.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const TODAY = "2031-10-15T05:00:00Z";

/**
 * One branch's stock, every number worked by hand:
 * - A: 100 received, minimum 10. Issued 9 on 3 October and 1 returned on 5 October (department 1),
 *   2 issued on 7 October (department 2), 6 issued on 10 September, 4 on 18 July (the first of the
 *   90 days) and 50 on 17 July (the day before). An issue of 5 reversed, 3 written off: neither is
 *   use. On hand 100 − 9 + 1 − 2 − 6 − 4 − 50 − 3 = 27; October 10, September 6; the 90 days 20.
 * - B, another subtype of the same branch beside A (D40): 5 received, minimum 8; 3 issued on 4
 *   October. On hand 2, Low.
 * - C, another category: 4 received, never moved.
 */
async function planningScene(scene: SpendingScene, head: string) {
  setClock(TODAY);
  const a = await stocked(scene, { qty: "100", unitCost: 1_000n, minimum: "10" });
  const b = await stocked(scene, { qty: "5", unitCost: 2_000n, minimum: "8" });
  const otherCategory = await insertCategory();
  const c = await stocked(scene, { qty: "4", unitCost: 500n, categoryId: otherCategory.id });
  const second = await insertDepartment(scene.branch.id);
  const line = (variantId: string, qty: string) => [{ variantId, qty }];
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-10-03", lines: line(a, "9") });
  await stockDocument(scene, { type: "RETURN", docDate: "2031-10-05", lines: line(a, "1") });
  await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-10-07",
    lines: line(a, "2"),
    departmentId: second.id,
  });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-09-10", lines: line(a, "6") });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-07-18", lines: line(a, "4") });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-07-17", lines: line(a, "50") });
  const wrong = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-10-06",
    lines: line(a, "5"),
  });
  await reverseNow(wrong, head);
  await stockDocument(scene, {
    type: "WRITE_OFF",
    docDate: "2031-10-02",
    lines: line(a, "3"),
    decidedBy: head,
  });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-10-04", lines: line(b, "3") });
  return { a, b, c, otherCategory, second };
}

async function scene() {
  setClock(TODAY);
  const own = await spendingScene();
  const head = await insertUser("HEAD");
  const other = await spendingScene();
  const items = await planningScene(own, head.id);
  // Another branch with the same stock and movements, beside it every time (D40).
  const elsewhere = await planningScene(other, head.id);
  setClock(TODAY);
  await refreshNow();
  return { own, other, head, ...items, elsewhere };
}

const ofBranch = (each: SpendingScene): AnalyticsFilters => ({
  ...NO_ANALYTICS_FILTERS,
  branch: each.branch.id,
});

describe("Stock planning (10 Analytics, Manager, Stock planning; plan of 6.5c)", () => {
  it("reads use per month, on hand, Low, runs out in and the suggested quantity of each line", async () => {
    const { own, a, b, c } = await scene();
    const block = await getStockPlanning(own.manager.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.rate).toEqual({ first: "2031-07-18", last: "2031-10-15" });
    expect(block.months).toEqual(["2031-10"]);
    // Soonest out first, none last (decided item 6): B in 60 days, A in 122, C never.
    expect(block.lines.map((line) => line.variantId)).toEqual([b, a, c]);
    expect(block.lines.every((line) => line.branchId === own.branch.id)).toBe(true);
    const [lineB, lineA, lineC] = block.lines;
    expect(lineA).toMatchObject({
      onHand: "27.000",
      minimum: "10.000",
      low: false,
      used: "10.000",
      before: "6.000",
      change: { difference: "4", percent: "66.7" },
      rateUsed: "20.000",
      // 27 ÷ (20 ÷ 90) = 121.5 → 122, half up (decided item 2).
      runsOutIn: 122,
      // 20 × 30 ÷ 90 + 10 − 27 is below 0 (decided item 1).
      suggested: "0",
    });
    // The month before the first month is September (decided item 3).
    expect(lineA!.months).toEqual([
      {
        month: "2031-10",
        range: { first: "2031-10-01", last: "2031-10-31" },
        used: "10.000",
        change: { difference: "4", percent: "66.7" },
      },
    ]);
    // B: 2 × 90 ÷ 3 = 60 days; 3 × 30 ÷ 90 + 8 − 2 = 7.
    expect(lineB).toMatchObject({
      onHand: "2.000",
      low: true,
      used: "3.000",
      change: { difference: "3", percent: null },
      rateUsed: "3.000",
      runsOutIn: 60,
      suggested: "7",
    });
    // C: holds stock, never moved; no rate, nothing to order.
    expect(lineC).toMatchObject({
      onHand: "4.000",
      used: "0",
      rateUsed: "0",
      runsOutIn: null,
      suggested: "0",
    });
    expect(block.low).toBe(1);
  });

  it("each number equals the list it opens (point 3; decided item 7)", async () => {
    const { own, a, b } = await scene();
    const filters = ofBranch(own);
    const block = await getStockPlanning(own.manager.id, THIS_MONTH, filters);
    const lineA = block.lines.find((line) => line.variantId === a)!;
    const month = lineA.months[0]!;
    const inMonth = await getStockMoves(
      own.manager.id,
      "use",
      { choice: "custom", from: month.range.first, to: month.range.last },
      filters,
      "all",
      a,
    );
    expect(inMonth.quantity).toBe(month.used);
    // 9 issued, 1 returned, 2 issued: the reversed issue and B's issue are not A's.
    expect(inMonth.rows.map((row) => [row.type, row.quantity])).toEqual([
      ["ISSUE", "2.000"],
      ["RETURN", "1.000"],
      ["ISSUE", "9.000"],
    ]);
    const inPeriod = await getStockMoves(own.manager.id, "use", THIS_MONTH, filters, "all", a);
    expect(inPeriod.quantity).toBe(lineA.used);
    const inRate = await getStockMoves(
      own.manager.id,
      "use",
      { choice: "custom", from: block.rate.first, to: block.rate.last },
      filters,
      "all",
      a,
    );
    // 18 July counted, 17 July not.
    expect(inRate.quantity).toBe(lineA.rateUsed);
    expect(inRate.rows.map((row) => row.movedOn)).toContain("2031-07-18");
    expect(inRate.rows.map((row) => row.movedOn)).not.toContain("2031-07-17");
    const low = await getStockLines(own.manager.id, "low", filters, "all");
    expect(low.count).toBe(block.low);
    expect(low.rows.map((row) => row.variantId)).toEqual([b]);
  });

  it("the department filter changes the use, never the rate (review of the plan, correction 2)", async () => {
    const { own, a, second } = await scene();
    const all = await getStockPlanning(own.manager.id, THIS_MONTH, ofBranch(own));
    const one = await getStockPlanning(own.manager.id, THIS_MONTH, {
      ...ofBranch(own),
      department: second.id,
    });
    const lineAll = all.lines.find((line) => line.variantId === a)!;
    const lineOne = one.lines.find((line) => line.variantId === a)!;
    // Department 2 used 2 in October and nothing in September.
    expect(lineOne).toMatchObject({
      used: "2.000",
      before: "0",
      change: { difference: "2", percent: null },
    });
    expect(lineOne.months[0]!.used).toBe("2.000");
    expect([lineOne.rateUsed, lineOne.runsOutIn, lineOne.suggested]).toEqual([
      lineAll.rateUsed,
      lineAll.runsOutIn,
      lineAll.suggested,
    ]);
  });

  it("keeps the category filter (decided item 5)", async () => {
    const { own, a, b, c, otherCategory } = await scene();
    const mine = await getStockPlanning(own.manager.id, THIS_MONTH, {
      ...ofBranch(own),
      category: own.category.id,
    });
    expect(mine.lines.map((line) => line.variantId)).toEqual([b, a]);
    const theOther = await getStockPlanning(own.manager.id, THIS_MONTH, {
      ...ofBranch(own),
      category: otherCategory.id,
    });
    expect(theOther.lines.map((line) => line.variantId)).toEqual([c]);
  });

  it("lists a Low line with no use and no stock left (decided item 1; review correction 1)", async () => {
    setClock(TODAY);
    const own = await spendingScene();
    const head = await insertUser("HEAD");
    const item = await stocked(own, { qty: "2", unitCost: 1_000n, minimum: "3" });
    // All of it written off: on hand 0, no issue, Low.
    await stockDocument(own, {
      type: "WRITE_OFF",
      docDate: "2031-10-02",
      lines: [{ variantId: item, qty: "2" }],
      decidedBy: head.id,
    });
    await refreshNow();
    const block = await getStockPlanning(own.manager.id, THIS_MONTH, ofBranch(own));
    expect(block.lines).toHaveLength(1);
    expect(block.lines[0]).toMatchObject({
      variantId: item,
      onHand: "0.000",
      low: true,
      runsOutIn: null,
      suggested: "3",
    });
  });

  it("never lists another branch's line, and another branch's filter is Not found (03 rule 1)", async () => {
    const { own, other, elsewhere } = await scene();
    const block = await getStockPlanning(own.manager.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const theirs = [elsewhere.a, elsewhere.b, elsewhere.c];
    expect(block.lines.some((line) => theirs.includes(line.variantId))).toBe(false);
    await expect(getStockPlanning(own.manager.id, THIS_MONTH, ofBranch(other))).rejects.toThrow(
      AuthorizationError,
    );
  });
});
