import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { stockValue } from "@/domain/stock";
import { db } from "@/server/db/client";

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
import { boughtIn, directEntry } from "../../../../tests/helpers/reports";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getDepartmentUseReport } from "./department-use-report";
import { getStockMovementsReport } from "./stock-movements-report";
import { getStockReport } from "./stock-report";

// The Stock movements report (10-notifications-analytics-reports.md, Reports: "Everything that
// went in and out in a period"; plan of 6.9a, decided items 5 and 6, Look first). The dates are
// 1 to 15 May 2031; the clock stands on 15 May, so a reversal written today falls in them.

const RANGE = { first: "2031-05-01", last: "2031-05-15" };
const TODAY = "2031-05-15T05:00:00Z";

/** Every type of the dates, and movements on each side of them; X and Y were in stock before. */
async function movementScene(scene: SpendingScene, headId: string) {
  setClock("2031-04-20T05:00:00Z");
  const otherCategory = await insertCategory();
  const x = await stocked(scene, { qty: "20", unitCost: 1_000n });
  const y = await stocked(scene, { qty: "5", unitCost: 2_000n, categoryId: otherCategory.id });
  setClock(TODAY);
  const counted = await boughtIn(scene, {
    purchasedOn: "2031-05-03",
    qty: "2.000",
    unitPrice: "1500",
  });
  const cancelled = await boughtIn(scene, {
    purchasedOn: "2031-05-04",
    unitPrice: "9000",
    cancelled: true,
  });
  const entry = await directEntry(scene, headId, {
    docDate: "2031-05-05",
    variantId: x,
    qty: "3",
    unitCost: 4_000n,
  });
  const line = (qty: string, variantId = x) => [{ variantId, qty }];
  const issue = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-06",
    lines: line("3"),
  });
  const back = await stockDocument(scene, {
    type: "RETURN",
    docDate: "2031-05-07",
    lines: line("1"),
  });
  // Typed today with the date of 2 May: listed on 2 May (decided item 5).
  const backdated = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-02",
    lines: line("1"),
  });
  const wrong = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-08",
    lines: line("2"),
  });
  await reverseNow(wrong, headId);
  const yIssue = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-09",
    lines: line("1", y),
  });
  const before = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-04-30",
    lines: line("1"),
  });
  const after = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-16",
    lines: line("1"),
  });
  return {
    x,
    y,
    otherCategory,
    counted,
    cancelled,
    entry,
    issue,
    back,
    backdated,
    wrong,
    yIssue,
    before,
    after,
  };
}

describe("everything that went in and out in the dates (10 Reports, Stock movements)", () => {
  it("lists every type of the dates on its source's date, signed, and leaves out the rest", async () => {
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const s = await movementScene(scene, head.id);

    const report = await getStockMovementsReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    expect(new Set(report.rows.map((row) => row.type))).toEqual(
      new Set(["RECEIPT", "DIRECT_ENTRY", "ISSUE", "RETURN", "REVERSAL"]),
    );
    for (const row of report.rows) {
      expect(row.movedOn >= RANGE.first && row.movedOn <= RANGE.last).toBe(true);
    }
    const documents = report.rows.map((row) => row.documentId);
    expect(documents).not.toContain(s.before);
    expect(documents).not.toContain(s.after);
    // X and Y came in on 20 April: not in the dates.
    expect(report.rows.filter((row) => row.type === "RECEIPT")).toHaveLength(2);

    const backdated = report.rows.find((row) => row.documentId === s.backdated)!;
    expect(backdated.movedOn).toBe("2031-05-02");
    const issue = report.rows.find((row) => row.documentId === s.issue)!;
    expect([issue.qtyDelta, issue.value]).toEqual(["-3.000", -stockValue("3", issue.unitCost)]);
    const back = report.rows.find((row) => row.documentId === s.back)!;
    expect(back.value).toBe(stockValue("1", back.unitCost));
    const receipt = report.rows.find(
      (row) => row.type === "RECEIPT" && row.orderId === s.counted.orderId,
    )!;
    expect([receipt.movedOn, receipt.value, receipt.orderNumber, receipt.undone]).toEqual([
      "2031-05-03",
      3_000n,
      s.counted.number,
      false,
    ]);

    // A reversal is its own row on its own day; the row it undid is marked (decided item 6).
    const wrong = report.rows.filter((row) => row.documentId === s.wrong);
    expect(wrong.map((row) => [row.type, row.movedOn, row.undone])).toEqual([
      ["REVERSAL", "2031-05-15", false],
      ["ISSUE", "2031-05-08", true],
    ]);
    const cancelled = report.rows.filter((row) => row.orderId === s.cancelled.orderId);
    expect(cancelled.map((row) => [row.type, row.movedOn, row.undone])).toEqual([
      ["REVERSAL", "2031-05-15", false],
      ["RECEIPT", "2031-05-04", true],
    ]);
  });

  it("keeps the movements of the category, one of another category beside them", async () => {
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const s = await movementScene(scene, head.id);
    const params = (category: string) => ({
      range: RANGE,
      filters: { ...NO_ANALYTICS_FILTERS, category },
    });

    const own = await getStockMovementsReport(head.id, params(scene.category.id), "all");
    expect(own.rows.map((row) => row.documentId)).toContain(s.issue);
    expect(own.rows.map((row) => row.documentId)).not.toContain(s.yIssue);
    const other = await getStockMovementsReport(head.id, params(s.otherCategory.id), "all");
    expect(other.rows.map((row) => row.documentId)).toEqual([s.yIssue]);
  });

  it("names a purchase's order only behind the draft wall (03 rule 1; as the item card)", async () => {
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const colleague = await insertUser("MANAGER", { branches: [scene.branch.id] });
    setClock(TODAY);
    const record = await boughtIn(scene, { purchasedOn: "2031-05-03" });
    // Taken back to Draft, it keeps its number (06 Allowed moves, Take back).
    await db.execute(sql`update orders set status = 'DRAFT' where id = ${record.orderId}`);
    const params = { range: RANGE, filters: NO_ANALYTICS_FILTERS };

    const owner = await getStockMovementsReport(scene.manager.id, params, "all");
    expect(owner.rows.map((row) => row.orderNumber)).toEqual([record.number]);
    const byHead = await getStockMovementsReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    expect(byHead.rows.map((row) => row.orderNumber)).toEqual([record.number]);
    const seen = await getStockMovementsReport(colleague.id, params, "all");
    expect(seen.rows.map((row) => [row.type, row.orderId, row.orderNumber])).toEqual([
      ["RECEIPT", null, null],
    ]);
  });
});

describe("one date per movement: the three stock reports agree (decided item 5, Look first)", () => {
  it("adds the rows not undone up to Purchases, Direct entries and Use by department", async () => {
    // Review of the plan, correction 2: REVERSAL rows lie in the dates and count in no total.
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await movementScene(scene, head.id);
    await refreshNow();
    const params = { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } };

    const movements = await getStockMovementsReport(head.id, params, "all");
    const counted = movements.rows.filter((row) => !row.undone);
    const sum = (type: string) =>
      counted.filter((row) => row.type === type).reduce((total, row) => total + row.value, 0n);
    expect(movements.rows.some((row) => row.type === "REVERSAL")).toBe(true);

    const stock = await getStockReport(head.id, params, "all");
    expect(stock.all.purchases).toBe(sum("RECEIPT"));
    expect(stock.all.directEntries).toBe(sum("DIRECT_ENTRY"));
    // Issues are out (below 0): used = issued − returned = −Σ issues − Σ returns.
    const use = await getDepartmentUseReport(head.id, params, "all");
    expect(use.total).toBe(-sum("ISSUE") - sum("RETURN"));
    expect([stock.all.purchases, stock.all.directEntries]).toEqual([3_000n, 12_000n]);
  });
});
