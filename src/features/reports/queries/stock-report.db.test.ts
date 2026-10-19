import { describe, expect, it } from "vitest";

import { stockValue } from "@/domain/stock";

import {
  type SpendingScene,
  recordOn,
  reverseNow,
  spendingScene,
  stocked,
} from "../../../../tests/helpers/analytics";
import { insertCategory, insertProduct } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { boughtIn, directEntry } from "../../../../tests/helpers/reports";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getPurchaseRegister } from "./purchase-register";
import { getStockReport } from "./stock-report";

// The Stock on hand report (10-notifications-analytics-reports.md, Reports: "Quantities and value
// per branch"; 09-warehouse.md, Stock value, and Direct entry by the Head 5; plan of 6.9a, decided
// items 2 to 5, Look first). The dates are 1 to 15 May 2031; the clock stands on 15 May.

const RANGE = { first: "2031-05-01", last: "2031-05-15" };
const TODAY = "2031-05-15T05:00:00Z";

/**
 * Before the dates: X, 2 at 1 000, and Y, 0.5 at 3 333 (another category). In the dates: a
 * purchase of 2 at 1 500, a cancelled one, and a direct entry of 3 × X at 4 000; a reversed entry
 * of X, and an entry and a purchase on each side of the dates, all left out of the in-lines.
 */
async function stockScene(scene: SpendingScene, headId: string) {
  setClock("2031-04-20T05:00:00Z");
  const otherCategory = await insertCategory();
  const x = await stocked(scene, { qty: "2", unitCost: 1_000n });
  const y = await stocked(scene, { qty: "0.5", unitCost: 3_333n, categoryId: otherCategory.id });
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
  await boughtIn(scene, { purchasedOn: "2031-04-30", unitPrice: "7000" });
  await boughtIn(scene, { purchasedOn: "2031-05-16", unitPrice: "8000" });
  await directEntry(scene, headId, {
    docDate: "2031-05-05",
    variantId: x,
    qty: "3",
    unitCost: 4_000n,
  });
  const wrong = await directEntry(scene, headId, {
    docDate: "2031-05-06",
    variantId: x,
    qty: "1",
    unitCost: 6_000n,
  });
  await reverseNow(wrong, headId);
  await directEntry(scene, headId, {
    docDate: "2031-04-30",
    variantId: x,
    qty: "1",
    unitCost: 500n,
  });
  await directEntry(scene, headId, {
    docDate: "2031-05-16",
    variantId: x,
    qty: "1",
    unitCost: 700n,
  });
  return { x, y, otherCategory, counted, cancelled };
}

describe("stock value equals quantity × average cost (build-plan 6.9 Done when; 09 Stock value)", () => {
  it("values each line stockValue(qty, average), half up, and a branch the sum of its lines", async () => {
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const { x, y } = await stockScene(scene, head.id);

    const report = await getStockReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    expect(report.lines.map((line) => line.variantId)).toContain(x);
    for (const line of report.lines) {
      expect(line.value).toBe(stockValue(line.qty, line.avgCost));
    }
    // 0.5 × 3 333 = 1 666.5, half up to 1 667 (CLAUDE.md rule 6).
    const yLine = report.lines.find((line) => line.variantId === y)!;
    expect([yLine.qty, yLine.avgCost, yLine.value]).toEqual(["0.500", 3_333n, 1_667n]);
    const [branch] = report.branches;
    expect(report.branches).toHaveLength(1);
    expect(branch!.value).toBe(report.lines.reduce((sum, line) => sum + line.value, 0n));
    expect(report.all.value).toBe(branch!.value);
    expect(report.lineCount).toBe(report.lines.length);
  });
});

describe("direct entries on a line of their own (09 Direct entry rule 5; decided items 2 and 5)", () => {
  it("shows what came in during the dates by purchase and by direct entry, each at its own cost", async () => {
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await stockScene(scene, head.id);

    const report = await getStockReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      1,
    );
    // Purchases: 2 × 1 500; the cancelled record and those of 30 April and 16 May left out.
    // Direct entries: 3 × 4 000; the reversed one and those of 30 April and 16 May left out.
    expect([report.all.purchases, report.all.directEntries]).toEqual([3_000n, 12_000n]);
  });

  it("counts as Purchases the goods of the Purchase register's product records, not a service's", async () => {
    // Review of the plan, correction 1: a service record writes no RECEIPT (07, What saving a
    // record does 2), so it is in the register and not in the Purchases line.
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const { counted } = await stockScene(scene, head.id);
    const service = await insertProduct({ type: "SERVICE", categoryId: scene.category.id });
    const order = await insertOrder({
      branchId: scene.branch.id,
      ownerId: scene.manager.id,
      departmentId: scene.department.id,
      variantId: service.defaultVariantId,
      status: "PURCHASING",
      progress: "OPEN",
    });
    const serviceRecord = await recordOn(
      scene,
      { id: order.id, ownerId: scene.manager.id, variantId: service.defaultVariantId },
      { purchasedOn: "2031-05-07", unitPrice: "50000" },
    );

    const params = { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } };
    const report = await getStockReport(head.id, params, "all");
    const register = await getPurchaseRegister(head.id, params, "all");
    const goods = register.rows.filter((row) => row.cancelReason === null);
    expect(goods.map((row) => row.purchaseId).sort()).toEqual(
      [counted.purchaseId, serviceRecord.purchaseId].sort(),
    );
    const productGoods = goods
      .filter((row) => row.purchaseId !== serviceRecord.purchaseId)
      .reduce((sum, row) => sum + row.goods, 0n);
    expect(report.all.purchases).toBe(productGoods);
    expect(report.all.purchases).toBe(3_000n);
  });
});

describe("the category filter (10 Reports: every report filters by category; decided item 8)", () => {
  it("keeps the lines and the in-lines of the category, a line of another category beside them", async () => {
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const { x, y, otherCategory } = await stockScene(scene, head.id);

    const own = await getStockReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, category: scene.category.id } },
      "all",
    );
    expect(own.lines.map((line) => line.variantId)).toContain(x);
    expect(own.lines.map((line) => line.variantId)).not.toContain(y);
    expect([own.all.purchases, own.all.directEntries]).toEqual([3_000n, 12_000n]);

    const other = await getStockReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, category: otherCategory.id } },
      "all",
    );
    expect(other.lines.map((line) => line.variantId)).toEqual([y]);
    expect([other.all.value, other.all.purchases, other.all.directEntries]).toEqual([
      1_667n,
      0n,
      0n,
    ]);
  });
});
