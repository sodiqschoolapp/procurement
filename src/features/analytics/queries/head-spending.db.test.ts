import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { bought, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import {
  type AnalyticsFilters,
  type DrillKey,
  NO_ANALYTICS_FILTERS,
  type PeriodInput,
  TOP_SUPPLIERS,
} from "../period-params";

import { getHeadSpending } from "./head-spending";
import { getSpending } from "./spending";
import { getSpendingRecords } from "./spending-records";

// The Head's Spending breakdowns (build-plan 6.4a; 10-notifications-analytics-reports.md,
// Analytics page per role, Head, Spending: "branches side by side; by department; top 10
// suppliers; split by payment type", points 1 to 3; 03 rule 1; plan of 6.4, decided items 2, 9,
// 10 and 11). Each test reads its own branches: the summary holds every branch of the test
// database. 15 October 2031 in Tashkent: this month is October, the period before September.

const AT = "2031-10-15T05:00:00Z";
const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };

async function listOf(userId: string, filters: AnalyticsFilters, key: DrillKey) {
  const list = await getSpendingRecords(userId, THIS_MONTH, filters, key, "all");
  expect(list.rows.reduce((sum, row) => sum + row.amount, 0n)).toBe(list.total);
  return list;
}

describe("branches side by side (10 Head, Spending; decided items 9 and 11)", () => {
  it("lists the user's branches, each equal to its drill-down, adding up to the total", async () => {
    setClock(AT);
    const a = await spendingScene();
    const b = await spendingScene();
    // Another branch's record with every other value the same: never counted (D40).
    const c = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [a.branch.id, b.branch.id] });
    await bought(a, { purchasedOn: "2031-10-02", unitPrice: "30000" });
    // Inside 1 to 15 September, the same days this running month is compared with (D55 item 10).
    await bought(a, { purchasedOn: "2031-09-10", unitPrice: "10000" });
    await bought(b, { purchasedOn: "2031-10-03", unitPrice: "20000" });
    await bought(c, { purchasedOn: "2031-10-02", unitPrice: "30000" });
    await refreshNow();

    const block = await getHeadSpending(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.branches.map((row) => [row.id, row.amount])).toEqual([
      [a.branch.id, 30_000n],
      [b.branch.id, 20_000n],
    ]);
    expect(block.branches[0]!.change).toEqual({ difference: 20_000n, percent: "200.0" });
    const total = await getSpending(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.branches.reduce((sum, row) => sum + row.amount, 0n)).toBe(total.total.amount);
    expect(block.total).toEqual(total.total);
    for (const row of block.branches) {
      const list = await listOf(
        finance.id,
        { ...NO_ANALYTICS_FILTERS, branch: row.id },
        { kind: "period" },
      );
      expect(list.total).toBe(row.amount);
    }
  });

  it("refuses another branch's filter, and a Manager reads only their own (03 rule 1)", async () => {
    setClock(AT);
    const a = await spendingScene();
    const b = await spendingScene();
    await bought(a, { purchasedOn: "2031-10-02", unitPrice: "30000" });
    await bought(b, { purchasedOn: "2031-10-02", unitPrice: "30000" });
    await refreshNow();
    await expect(
      getHeadSpending(a.manager.id, THIS_MONTH, { ...NO_ANALYTICS_FILTERS, branch: b.branch.id }),
    ).rejects.toMatchObject(new AuthorizationError("not_found"));
    const own = await getHeadSpending(a.manager.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(own.branches.map((row) => row.id)).toEqual([a.branch.id]);
    expect(own.departments.map((row) => row.id)).toEqual([a.department.id]);
  });
});

describe("by department, top 10 suppliers, by payment type (10 Head, Spending)", () => {
  it("each row equals its drill-down list and the rows add up to the total", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const second = await insertDepartment(scene.branch.id);
    const suppliers = [];
    // Eleven suppliers of 1 000 to 11 000; the 11th, the smallest, is no top supplier.
    for (let at = 1; at <= TOP_SUPPLIERS + 1; at += 1) {
      const supplier = await insertCompany();
      suppliers.push(supplier);
      await bought(scene, {
        purchasedOn: "2031-10-05",
        unitPrice: String(at * 1_000),
        supplierId: supplier.id,
        departmentId: at % 2 ? second.id : scene.department.id,
        paymentType: at % 3 === 0 ? "CARD" : "TRANSFER",
        extras: at === 4 ? [{ amount: 500n, paymentType: "CASH" }] : [],
      });
    }
    // No supplier: in the total and in the other charts, not among the suppliers.
    await bought(scene, { purchasedOn: "2031-10-06", unitPrice: "50000", supplierId: null });
    // The same supplier in September: the change is against that supplier then.
    await bought(scene, {
      purchasedOn: "2031-09-06",
      unitPrice: "2000",
      supplierId: suppliers[TOP_SUPPLIERS]!.id,
    });
    await refreshNow();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };

    const block = await getHeadSpending(head.id, THIS_MONTH, filters);
    const total = (await getSpending(head.id, THIS_MONTH, filters)).total.amount;
    expect(total).toBe(66_000n + 500n + 50_000n);

    expect(block.departments.reduce((sum, row) => sum + row.amount, 0n)).toBe(total);
    for (const row of block.departments) {
      const list = await listOf(head.id, { ...filters, department: row.id }, { kind: "period" });
      expect(list.total).toBe(row.amount);
    }

    expect(block.suppliers).toHaveLength(TOP_SUPPLIERS);
    expect(block.suppliers.map((row) => row.amount)).toEqual([
      11_000n,
      10_000n,
      9_000n,
      8_000n,
      7_000n,
      6_000n,
      5_000n,
      4_500n,
      3_000n,
      2_000n,
    ]);
    expect(block.suppliers.map((row) => row.id)).not.toContain(suppliers[0]!.id);
    for (const row of block.suppliers) {
      const list = await listOf(head.id, { ...filters, supplier: row.id }, { kind: "period" });
      expect(list.total).toBe(row.amount);
    }

    expect(block.payments.map((row) => [row.payment, row.amount])).toEqual([
      // 50 000 with no supplier and the 500 extra are cash.
      ["CASH", 50_500n],
      ["TRANSFER", 1_000n + 2_000n + 4_000n + 5_000n + 7_000n + 8_000n + 10_000n + 11_000n],
      ["CARD", 3_000n + 6_000n + 9_000n],
    ]);
    expect(block.payments.reduce((sum, row) => sum + row.amount, 0n)).toBe(total);
    for (const row of block.payments) {
      const list = await listOf(head.id, filters, { kind: "payment", payment: row.payment });
      expect(list.total).toBe(row.amount);
    }
    // The record of 4 000 by transfer with 500 in cash is in both lists, with each part.
    const cash = await listOf(head.id, filters, { kind: "payment", payment: "CASH" });
    expect(cash.rows.map((row) => row.amount).sort()).toEqual([500n, 50_000n].sort());
  });

  it("compares a supplier with that supplier in the period before (10 point 1)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await bought(scene, { purchasedOn: "2031-09-10", unitPrice: "1000" });
    await bought(scene, { purchasedOn: "2031-10-10", unitPrice: "3000" });
    // A supplier with spending only in September is no top supplier of October.
    const gone = await insertCompany();
    await bought(scene, { purchasedOn: "2031-09-10", unitPrice: "9000", supplierId: gone.id });
    await refreshNow();
    const block = await getHeadSpending(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: scene.branch.id,
    });
    expect(block.suppliers.map((row) => [row.id, row.amount, row.change])).toEqual([
      [scene.supplier.id, 3_000n, { difference: 2_000n, percent: "200.0" }],
    ]);
    expect(block.payments).toEqual([
      { payment: "CASH", amount: 3_000n, change: { difference: -7_000n, percent: "-70.0" } },
    ]);
  });
});
