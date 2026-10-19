import { describe, expect, it } from "vitest";

import { bought, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";
import { PeriodRefusedError } from "../resolve-period";

import { getFinanceSpending } from "./finance-spending";
import { getSpendingRecords } from "./spending-records";

// Finance's Payments block and its purchases without a receipt (10-notifications-analytics-
// reports.md, Analytics page per role, Finance: Payments, "Spending by payment type; bank
// transfers by supplier"; Plan vs actual, "purchases without a receipt"; edge-cases/purchasing-
// and-money.md, "No receipt photo"; build-plan 6.6b; plan of 6.6b, decided items 1 and 4, Look
// first). Each scene is a branch of its own with a Finance user of that branch only, and another
// branch beside it whose records would change every number if let in (D40).

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const OCTOBER = "2031-10-10";
const SEPTEMBER = "2031-09-10";

async function financeScene() {
  setClock("2031-10-15T05:00:00Z");
  const scene = await spendingScene();
  const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
  const other = await spendingScene();
  return { scene, finance, other };
}

describe("Payments (10 Finance, Payments; plan of 6.6b, decided item 1, Look first)", () => {
  it("splits the period's spending by payment type, an extra cost under its own type, with each change", async () => {
    const { scene, finance, other } = await financeScene();
    // A cash trip of 10 000 with a 2 000 transfer extra and a 500 card extra.
    await bought(scene, {
      purchasedOn: OCTOBER,
      unitPrice: "10000",
      extras: [
        { amount: 2_000n, paymentType: "TRANSFER" },
        { amount: 500n, paymentType: "CARD" },
      ],
    });
    // A transfer trip of 40 000; the period before: a transfer trip of 30 000.
    await bought(scene, { purchasedOn: OCTOBER, unitPrice: "40000", paymentType: "TRANSFER" });
    await bought(scene, { purchasedOn: SEPTEMBER, unitPrice: "30000", paymentType: "TRANSFER" });
    // The other branch, every type: never in these numbers.
    for (const paymentType of ["CASH", "TRANSFER", "CARD"] as const) {
      await bought(other, { purchasedOn: OCTOBER, unitPrice: "9000000", paymentType });
    }
    await refreshNow();

    const block = await getFinanceSpending(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.total.amount).toBe(52_500n);
    expect(block.payments).toEqual([
      { payment: "CASH", amount: 10_000n, change: { difference: 10_000n, percent: null } },
      { payment: "TRANSFER", amount: 42_000n, change: { difference: 12_000n, percent: "40.0" } },
      { payment: "CARD", amount: 500n, change: { difference: 500n, percent: null } },
    ]);
    // The slices add up to the period's spending.
    expect(block.payments.reduce((sum, row) => sum + row.amount, 0n)).toBe(block.total.amount);
    // Each slice is the list it opens (10 point 3).
    for (const row of block.payments) {
      const list = await getSpendingRecords(
        finance.id,
        THIS_MONTH,
        NO_ANALYTICS_FILTERS,
        { kind: "payment", payment: row.payment },
        "all",
      );
      expect(list.total).toBe(row.amount);
    }
  });

  it("puts the bank transfers under the trip's supplier, then the records with no supplier (the plan review's worked example)", async () => {
    const { scene, finance, other } = await financeScene();
    const s = await insertCompany();
    const t = await insertCompany();
    // A transfer trip of 1 200 000 from S, a 50 000 transfer extra on a cash trip from T.
    await bought(scene, {
      purchasedOn: OCTOBER,
      unitPrice: "1200000",
      paymentType: "TRANSFER",
      supplierId: s.id,
    });
    await bought(scene, {
      purchasedOn: OCTOBER,
      unitPrice: "70000",
      supplierId: t.id,
      extras: [{ amount: 50_000n, paymentType: "TRANSFER" }],
    });
    // S had 600 000 in the period before; a transfer trip with no supplier now and before.
    await bought(scene, {
      purchasedOn: SEPTEMBER,
      unitPrice: "600000",
      paymentType: "TRANSFER",
      supplierId: s.id,
    });
    await bought(scene, {
      purchasedOn: OCTOBER,
      unitPrice: "3000",
      paymentType: "TRANSFER",
      supplierId: null,
    });
    await bought(scene, {
      purchasedOn: SEPTEMBER,
      unitPrice: "1000",
      paymentType: "TRANSFER",
      supplierId: null,
    });
    // A cash trip from a third supplier is no transfer; the other branch's transfer from S is
    // not this Finance's.
    await bought(scene, { purchasedOn: OCTOBER, unitPrice: "8000" });
    await bought(other, {
      purchasedOn: OCTOBER,
      unitPrice: "5000000",
      paymentType: "TRANSFER",
      supplierId: s.id,
    });
    await refreshNow();

    const block = await getFinanceSpending(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.transfers.total.amount).toBe(1_253_000n);
    expect(
      block.transfers.suppliers.map((row) => [row.id, row.amount, row.change.difference]),
    ).toEqual([
      [s.id, 1_200_000n, 600_000n],
      [t.id, 50_000n, 50_000n],
    ]);
    expect(block.transfers.noSupplier).toEqual({
      amount: 3_000n,
      change: { difference: 2_000n, percent: "200.0" },
    });
    // The rows add up to the Bank transfer slice.
    expect(
      block.transfers.suppliers.reduce((sum, row) => sum + row.amount, 0n) +
        block.transfers.noSupplier!.amount,
    ).toBe(block.payments.find((row) => row.payment === "TRANSFER")!.amount);
    // Each row is the list it opens: a supplier with its filter, "No supplier" by its key.
    for (const row of block.transfers.suppliers) {
      const list = await getSpendingRecords(
        finance.id,
        THIS_MONTH,
        { ...NO_ANALYTICS_FILTERS, supplier: row.id },
        { kind: "payment", payment: "TRANSFER" },
        "all",
      );
      expect(list.total).toBe(row.amount);
    }
    const none = await getSpendingRecords(
      finance.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "payment", payment: "TRANSFER", noSupplier: true },
      "all",
    );
    expect([none.count, none.total]).toEqual([1, 3_000n]);
    // A supplier filter with the records of no supplier names no number (decided item 8).
    await expect(
      getSpendingRecords(
        finance.id,
        THIS_MONTH,
        { ...NO_ANALYTICS_FILTERS, supplier: s.id },
        { kind: "payment", payment: "TRANSFER", noSupplier: true },
        "all",
      ),
    ).rejects.toBeInstanceOf(PeriodRefusedError);
  });

  it("has no supplier rows and no No-supplier row when nothing was paid by transfer", async () => {
    const { scene, finance } = await financeScene();
    await bought(scene, { purchasedOn: OCTOBER, unitPrice: "8000" });
    await refreshNow();
    const block = await getFinanceSpending(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.transfers).toEqual({
      total: { amount: 0n, change: { difference: 0n, percent: null } },
      suppliers: [],
      noSupplier: null,
    });
  });
});

describe("purchases without a receipt (edge-cases/purchasing-and-money.md, No receipt photo; plan of 6.6b, decided item 4)", () => {
  it("counts the records whose trip has no receipt file, whatever the payment type, with their total and changes", async () => {
    const { scene, finance, other } = await financeScene();
    // Without a receipt now: a cash record of 10 000 and a transfer record of 20 000.
    const cash = await bought(scene, { purchasedOn: OCTOBER, unitPrice: "10000" });
    const transfer = await bought(scene, {
      purchasedOn: OCTOBER,
      unitPrice: "20000",
      paymentType: "TRANSFER",
    });
    // With a receipt, every other value the same: left out.
    await bought(scene, { purchasedOn: OCTOBER, unitPrice: "40000", receipt: true });
    // A cancelled record without a receipt: left out (08 Actual total).
    await bought(scene, { purchasedOn: OCTOBER, unitPrice: "80000", cancelled: true });
    // The period before: one record without a receipt.
    await bought(scene, { purchasedOn: SEPTEMBER, unitPrice: "5000" });
    // The other branch's records without a receipt: never in these numbers.
    await bought(other, { purchasedOn: OCTOBER, unitPrice: "7000000" });
    await refreshNow();

    const block = await getFinanceSpending(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.noReceipt).toEqual({
      amount: 30_000n,
      change: { difference: 25_000n, percent: "500.0" },
      count: 2,
      countChange: { difference: 1n, percent: "100.0" },
    });
    // The number is the list it opens (10 point 3).
    const list = await getSpendingRecords(
      finance.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "noreceipt" },
      "all",
    );
    expect(list.total).toBe(30_000n);
    expect(list.rows.map((row) => row.purchaseId).sort()).toEqual(
      [cash.purchaseId, transfer.purchaseId].sort(),
    );
  });
});
