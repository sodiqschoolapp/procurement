import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type SpendingScene,
  bought,
  buyingEvent,
  decided,
  moneyOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getCashNeeded } from "./cash-needed";
import { getFinanceCash } from "./finance-cash";
import { getFinanceSpending } from "./finance-spending";
import { getOutcomeOrders } from "./outcome-orders";
import { getPlanVsActual } from "./plan-vs-actual";
import { getSettlementSpeed } from "./settlement-speed";
import { getSettlements } from "./settlements";
import { getSpendingRecords } from "./spending-records";

// Build-plan 6.6b, Done when: "A database test: Finance's page holds only Finance's branches"
// (10-notifications-analytics-reports.md, Analytics page per role, "Finance, own branches";
// 03-roles-and-permissions.md rule 1: another branch is Not found). A Finance user of branch A
// reads every query of the page (src/app/(app)/analytics/page.tsx, the FINANCE tuple) and each
// list behind them, without a filter: every number is A's alone, with branch B beside it holding
// the same kinds of rows at other amounts (D40), each of which would change a number if let in.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const APPROVED = {
  type: "APPROVE",
  from: "PENDING_FINANCE",
  to: "PURCHASING",
  at: "2031-10-01T05:00:00Z",
} as const;

/**
 * Every kind of row Finance's page reads, in one branch, its amounts times `x`: a transfer record
 * with no supplier and no receipt, a cash record ended red, cash given, an order waiting at
 * Finance, and a settlement of `days` days closed this month.
 */
async function branchRows(scene: SpendingScene, x: bigint, days: number) {
  const transfer = await bought(scene, {
    purchasedOn: "2031-10-05",
    unitPrice: String(10_000n * x),
    paymentType: "TRANSFER",
    supplierId: null,
  });
  // Planned 10 × 5 000 = 50 000; bought for 60 000 × x and Done: red, overspent.
  const red = await bought(scene, {
    purchasedOn: "2031-10-06",
    unitPrice: String(60_000n * x),
    progress: "DONE",
    receipt: true,
  });
  // Its buying ended on 6 October (plan of 6.4, decided item 5: the newest buying event).
  await buyingEvent(red.orderId, red.ownerId, "FINISH_ORDER", "2031-10-06T05:00:00Z");
  await moneyOn(red, scene.manager.id, { amount: 1_000n * x, occurredOn: "2031-10-06" });
  await decided(scene, "PENDING_FINANCE", [], { submittedAt: "2031-10-02T05:00:00Z" });
  const closedAt = new Date(Date.parse("2031-10-03T05:00:00Z") + days * 86_400_000);
  const settled = await decided(
    scene,
    "CLOSED",
    [
      APPROVED,
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        at: "2031-10-03T05:00:00Z",
      },
      { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: closedAt.toISOString() },
    ],
    { submittedAt: "2031-09-30T05:00:00Z" },
  );
  return { transfer, red, settled };
}

describe("Finance's page holds only Finance's branches (build-plan 6.6b, Done when; 03 rule 1)", () => {
  it("every block and every list behind it reads branch A only, never branch B", async () => {
    // 15 October 2031, 10:00 in Tashkent.
    setClock("2031-10-15T05:00:00Z");
    const a = await spendingScene();
    const b = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [a.branch.id] });
    const ours = await branchRows(a, 1n, 2);
    const theirs = await branchRows(b, 7n, 9);
    await refreshNow();
    const all = NO_ANALYTICS_FILTERS;

    // Cash and Cash needed soon (6.6a).
    const cash = await getFinanceCash(finance.id, THIS_MONTH, all);
    expect(cash.totals.given.amount).toBe(1_000n);
    const needed = await getCashNeeded(finance.id, all);
    expect(needed.approval).toEqual({ amount: 50_000n, count: 1 });

    // Payments and purchases without a receipt.
    const spending = await getFinanceSpending(finance.id, THIS_MONTH, all);
    expect(spending.total.amount).toBe(70_000n);
    expect(spending.payments.map((row) => [row.payment, row.amount])).toEqual([
      ["CASH", 60_000n],
      ["TRANSFER", 10_000n],
    ]);
    expect(spending.transfers.suppliers).toEqual([]);
    expect(spending.transfers.noSupplier?.amount).toBe(10_000n);
    expect([spending.noReceipt.count, spending.noReceipt.amount]).toEqual([1, 10_000n]);

    // Plan vs actual: overspent by branch and by Manager.
    const plan = await getPlanVsActual(finance.id, THIS_MONTH, all);
    expect(plan.total.overspent.amount).toBe(10_000n);
    expect(plan.branches.map((row) => row.id)).toEqual([a.branch.id]);
    expect(plan.managers.map((row) => row.id)).toEqual([a.manager.id]);

    // Settlement speed.
    const speed = await getSettlementSpeed(finance.id, THIS_MONTH, all);
    expect(speed.total).toEqual({ days: "2.0", count: 1, change: null });
    expect(speed.branches.map((row) => row.id)).toEqual([a.branch.id]);

    // The lists behind the numbers.
    const records = async (key: Parameters<typeof getSpendingRecords>[3]) =>
      (await getSpendingRecords(finance.id, THIS_MONTH, all, key, "all")).rows.map(
        (row) => row.purchaseId,
      );
    expect(await records({ kind: "payment", payment: "TRANSFER" })).toEqual([
      ours.transfer.purchaseId,
    ]);
    expect(await records({ kind: "payment", payment: "TRANSFER", noSupplier: true })).toEqual([
      ours.transfer.purchaseId,
    ]);
    expect(await records({ kind: "noreceipt" })).toEqual([ours.transfer.purchaseId]);
    const overspent = await getOutcomeOrders(
      finance.id,
      THIS_MONTH,
      all,
      { kind: "overspent" },
      false,
      "all",
    );
    expect(overspent.rows.map((row) => row.orderId)).toEqual([ours.red.orderId]);
    const settlements = await getSettlements(finance.id, THIS_MONTH, all, "all");
    expect(settlements.rows.map((row) => row.orderId)).toEqual([ours.settled.id]);
    expect(settlements.rows.some((row) => row.orderId === theirs.settled.id)).toBe(false);

    // Branch B by its filter is Not found, on every query of the page (03 rule 1).
    const theirBranch = { ...all, branch: b.branch.id };
    for (const read of [
      () => getFinanceCash(finance.id, THIS_MONTH, theirBranch),
      () => getCashNeeded(finance.id, theirBranch),
      () => getFinanceSpending(finance.id, THIS_MONTH, theirBranch),
      () => getPlanVsActual(finance.id, THIS_MONTH, theirBranch),
      () => getSettlementSpeed(finance.id, THIS_MONTH, theirBranch),
      () => getSettlements(finance.id, THIS_MONTH, theirBranch, "all"),
    ]) {
      await expect(read()).rejects.toMatchObject({ kind: "not_found" });
      await expect(read()).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
});
