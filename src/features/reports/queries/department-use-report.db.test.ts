import { describe, expect, it } from "vitest";

import { getWarehouse } from "@/features/analytics/queries/warehouse";

import {
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
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getDepartmentUseReport } from "./department-use-report";

// The Use by department report (10-notifications-analytics-reports.md, Reports: "What each
// department received, in quantity and value"; plan of 6.4d, decided item 4, and of 6.9a,
// decided items 3 and 7, Look first). Read from `analytics_stock_moves`, so the summary is
// refreshed first. The dates are 1 to 15 May 2031.

const RANGE = { first: "2031-05-01", last: "2031-05-15" };

async function useScene() {
  const scene = await spendingScene();
  const head = await insertUser("HEAD");
  const second = await insertDepartment(scene.branch.id);
  const otherCategory = await insertCategory();
  setClock("2031-04-20T05:00:00Z");
  // A at 1 000 and B at 2 500 (another category), received before the dates.
  const a = await stocked(scene, { qty: "20", unitCost: 1_000n });
  const b = await stocked(scene, { qty: "10", unitCost: 2_500n, categoryId: otherCategory.id });
  setClock("2031-05-15T05:00:00Z");
  const line = (variantId: string, qty: string) => [{ variantId, qty }];
  // Department 1: A 4 issued, 1 returned (4 000 − 1 000); B 2 issued (5 000).
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-05-02", lines: line(a, "4") });
  await stockDocument(scene, { type: "RETURN", docDate: "2031-05-06", lines: line(a, "1") });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-05-07", lines: line(b, "2") });
  // Department 2: A 1.5 issued (1 500).
  await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-08",
    lines: line(a, "1.5"),
    departmentId: second.id,
  });
  // Left out: a reversed issue, and issues on each side of the dates.
  const wrong = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-09",
    lines: line(a, "3"),
  });
  await reverseNow(wrong, head.id);
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-04-30", lines: line(a, "1") });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-05-16", lines: line(a, "1") });
  await refreshNow();
  return { scene, head, second, otherCategory, a, b };
}

describe("what each department received, in quantity and value (10 Reports, Use by department)", () => {
  it("is issued − returned per department and subtype, reversed documents and other dates left out", async () => {
    const { scene, head, second, a, b } = await useScene();
    const report = await getDepartmentUseReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    expect(report.departments.map((row) => [row.id, row.value])).toEqual([
      [scene.department.id, 8_000n],
      [second.id, 1_500n],
    ]);
    expect(report.total).toBe(9_500n);
    const lines = report.lines.map((row) => [
      row.departmentId,
      row.variantId,
      row.issued,
      row.returned,
      row.net,
      row.value,
    ]);
    expect(lines).toEqual(
      expect.arrayContaining([
        [scene.department.id, a, "4.000", "1.000", "3.000", 3_000n],
        [scene.department.id, b, "2.000", "0", "2.000", 5_000n],
        [second.id, a, "1.500", "0", "1.500", 1_500n],
      ]),
    );
    expect(lines).toHaveLength(3);
  });

  it("equals Analytics' use by department for the same dates and filters (6.4d decided item 4)", async () => {
    const { scene, head } = await useScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const report = await getDepartmentUseReport(head.id, { range: RANGE, filters }, "all");
    const warehouse = await getWarehouse(
      head.id,
      { choice: "custom", from: RANGE.first, to: RANGE.last },
      filters,
    );
    expect(report.departments.map((row) => [row.id, row.value])).toEqual(
      warehouse.departments.map((row) => [row.id, row.used]),
    );
  });

  it("keeps the use of the category, an issue of another category beside it", async () => {
    const { head, otherCategory, scene, b } = await useScene();
    const own = await getDepartmentUseReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, category: scene.category.id } },
      "all",
    );
    expect(own.lines.map((row) => row.variantId)).not.toContain(b);
    expect(own.total).toBe(4_500n);
    const other = await getDepartmentUseReport(
      head.id,
      { range: RANGE, filters: { ...NO_ANALYTICS_FILTERS, category: otherCategory.id } },
      "all",
    );
    expect(other.lines.map((row) => row.variantId)).toEqual([b]);
    expect(other.total).toBe(5_000n);
  });
});
