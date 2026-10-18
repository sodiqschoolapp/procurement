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
import { getWarehouse } from "./warehouse";

// The Head's Warehouse block and its drill-downs (build-plan 6.4d; 10-notifications-analytics-
// reports.md, Analytics page per role, Head, Warehouse: "Stock value per branch; low-stock items;
// use by department; items with no movement for 90 days; value written off", points 1 to 3;
// 09 Low stock and Stock value; 03 rule 1; plan of 6.4d, decided items 1 to 8). 15 October 2031
// in Tashkent: this month is October, the period before September; the 90 days that end today
// start on 18 July.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const TODAY = "2031-10-15T05:00:00Z";

/**
 * One branch's stock: an item received 90 days ago and still (4 × 2 500), one received 89 days ago
 * (3 × 1 000, another category), and the item A (10 × 4 000, minimum 8) that two departments use
 * and that is written off. Every value below is worked by hand from these numbers.
 */
async function stockScene(scene: SpendingScene, head: string) {
  setClock("2031-07-17T05:00:00Z");
  const still = await stocked(scene, { qty: "4", unitCost: 2_500n });
  setClock("2031-07-18T05:00:00Z");
  const otherCategory = await insertCategory();
  const fresh = await stocked(scene, { qty: "3", unitCost: 1_000n, categoryId: otherCategory.id });
  setClock(TODAY);
  const item = await stocked(scene, { qty: "10", unitCost: 4_000n, minimum: "8" });
  const second = await insertDepartment(scene.branch.id);
  const line = (qty: string) => [{ variantId: item, qty }];
  // Department 1: 3 issued and 1 returned in October (12 000 − 4 000), 1 issued in September.
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-10-03", lines: line("3") });
  await stockDocument(scene, { type: "RETURN", docDate: "2031-10-05", lines: line("1") });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-09-10", lines: line("1") });
  // Department 2: only a return in October, of an earlier issue: its use is −4 000.
  await stockDocument(scene, {
    type: "RETURN",
    docDate: "2031-10-07",
    lines: line("1"),
    departmentId: second.id,
  });
  // Written off: 2 asked on 2 October and approved today, 1 on 28 September; one still waiting.
  await stockDocument(scene, {
    type: "WRITE_OFF",
    docDate: "2031-10-02",
    lines: line("2"),
    decidedBy: head,
  });
  await stockDocument(scene, {
    type: "WRITE_OFF",
    docDate: "2031-09-28",
    lines: line("1"),
    decidedBy: head,
  });
  await stockDocument(scene, {
    type: "WRITE_OFF",
    docDate: "2031-10-08",
    lines: line("1"),
    status: "PENDING_APPROVAL",
  });
  // An issue reversed: it and its reversal are left out (decided item 4).
  const wrong = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-10-06",
    lines: line("2"),
  });
  await reverseNow(wrong, head);
  // A: 10 − 3 + 1 − 1 + 1 − 2 − 1 = 5 at 4 000 = 20 000, at or below its minimum of 8: Low.
  return { still, fresh, item, otherCategory, second };
}

async function warehouseScene() {
  setClock(TODAY);
  const scene = await spendingScene();
  const head = await insertUser("HEAD");
  const sceneB = await spendingScene();
  const a = await stockScene(scene, head.id);
  // Another branch with the same stock and movements, beside it every time (D40).
  await stockScene(sceneB, head.id);
  setClock(TODAY);
  await refreshNow();
  return { scene, sceneB, head, ...a };
}

const ofBranch = (scene: SpendingScene): AnalyticsFilters => ({
  ...NO_ANALYTICS_FILTERS,
  branch: scene.branch.id,
});

describe("the Warehouse block (10 Analytics, Head, Warehouse; plan of 6.4d)", () => {
  it("each number of a branch equals the total of its list (point 3; decided items 1 to 7)", async () => {
    const { scene, head } = await warehouseScene();
    const filters = ofBranch(scene);
    const block = await getWarehouse(head.id, THIS_MONTH, filters);
    expect(block.stillSince).toBe("2031-07-18");
    expect(block.branches.map((row) => row.id)).toEqual([scene.branch.id]);
    const [row] = block.branches;
    // 20 000 + 4 × 2 500 + 3 × 1 000 (decided item 1).
    expect(row).toMatchObject({
      value: 33_000n,
      low: 1,
      still: 1,
      stillValue: 10_000n,
      writtenOff: 8_000n,
      writtenOffChange: { difference: 4_000n, percent: "100.0" },
    });
    expect(block.all).toMatchObject({ value: 33_000n, low: 1, still: 1, writtenOff: 8_000n });

    const value = await getStockLines(head.id, "value", filters, "all");
    expect([value.count, value.total]).toEqual([3, 33_000n]);
    const low = await getStockLines(head.id, "low", filters, "all");
    expect([low.count, low.total]).toEqual([1, 20_000n]);
    expect(low.rows[0]).toMatchObject({ quantity: "5.000", minimum: "8.000", avgCost: 4_000n });
    const still = await getStockLines(head.id, "still", filters, "all");
    expect([still.count, still.total]).toEqual([1, 10_000n]);
    expect(still.rows[0]?.lastMovedOn).toBe("2031-07-17");
    const off = await getStockMoves(head.id, "writeoff", THIS_MONTH, filters, "all");
    expect([off.count, off.total]).toEqual([1, 8_000n]);
    // Asked and dated 2 October, approved on the 15th: its document's date (decided item 5).
    expect(off.rows[0]?.movedOn).toBe("2031-10-02");
  });

  it("use by department is issued − returned, a return taken away and a reversed issue left out (decided item 4)", async () => {
    const { scene, head, second } = await warehouseScene();
    const filters = ofBranch(scene);
    const block = await getWarehouse(head.id, THIS_MONTH, filters);
    expect(
      block.departments.map(({ id, used, before, change }) => ({ id, used, before, change })),
    ).toEqual([
      {
        id: scene.department.id,
        used: 8_000n,
        before: 4_000n,
        change: { difference: 4_000n, percent: "100.0" },
      },
      // Only a return: a negative use, its change in so'm only (before not above 0).
      { id: second.id, used: -4_000n, before: 0n, change: null },
    ]);
    const all = await getStockMoves(head.id, "use", THIS_MONTH, filters, "all");
    expect([all.count, all.total]).toEqual([3, 4_000n]);
    expect(all.rows.find((row) => row.type === "RETURN" && row.value > 0n)).toBeUndefined();
    const one = await getStockMoves(
      head.id,
      "use",
      THIS_MONTH,
      { ...filters, department: scene.department.id },
      "all",
    );
    expect([one.count, one.total]).toEqual([2, 8_000n]);
  });

  it("the category filters every number; the department filters use only (decided item 6)", async () => {
    const { scene, head, otherCategory } = await warehouseScene();
    const byCategory = await getWarehouse(head.id, THIS_MONTH, {
      ...ofBranch(scene),
      category: otherCategory.id,
    });
    expect(byCategory.branches[0]).toMatchObject({
      value: 3_000n,
      low: 0,
      still: 0,
      writtenOff: 0n,
    });
    expect(byCategory.departments).toEqual([]);

    const byDepartment = await getWarehouse(head.id, THIS_MONTH, {
      ...ofBranch(scene),
      department: scene.department.id,
    });
    expect(byDepartment.branches[0]).toMatchObject({ value: 33_000n, writtenOff: 8_000n });
    expect(byDepartment.departments.map((row) => row.id)).toEqual([scene.department.id]);
  });

  it("the period before: September's use and written off, and nothing of October (point 1)", async () => {
    const { scene, head } = await warehouseScene();
    const september = await getWarehouse(
      head.id,
      { choice: "custom", from: "2031-09-01", to: "2031-09-30" },
      ofBranch(scene),
    );
    expect(september.branches[0]?.writtenOff).toBe(4_000n);
    expect(september.departments.map((row) => row.used)).toEqual([4_000n]);
    // Stock is of now, whatever the period (decided item 2).
    expect(september.branches[0]?.value).toBe(33_000n);
  });

  it("a Manager sees only their branch; another branch's filter or department is Not found (03 rule 1; D40)", async () => {
    const { scene, sceneB, head } = await warehouseScene();
    const manager = scene.manager.id;
    const own = await getWarehouse(manager, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(own.branches.map((row) => row.id)).toEqual([scene.branch.id]);
    expect(own.all.value).toBe(33_000n);
    expect(own.departments).toHaveLength(2);
    expect((await getStockLines(manager, "value", NO_ANALYTICS_FILTERS, "all")).total).toBe(
      33_000n,
    );
    expect(
      (await getStockMoves(manager, "writeoff", THIS_MONTH, NO_ANALYTICS_FILTERS, "all")).total,
    ).toBe(8_000n);
    // The Head sees both branches, each with its own numbers (the file's other tests add more).
    const every = await getWarehouse(head.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    for (const branch of [scene.branch.id, sceneB.branch.id]) {
      expect(every.branches.find((row) => row.id === branch)?.value).toBe(33_000n);
    }

    await expect(getWarehouse(manager, THIS_MONTH, ofBranch(sceneB))).rejects.toThrow(
      AuthorizationError,
    );
    await expect(
      getStockMoves(
        manager,
        "use",
        THIS_MONTH,
        { ...NO_ANALYTICS_FILTERS, department: sceneB.department.id },
        "all",
      ),
    ).rejects.toThrow(AuthorizationError);
  });
});
