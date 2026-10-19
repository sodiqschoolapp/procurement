import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type SpendingScene,
  bought,
  moneyOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { setOrderStatus } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getMoneyWithManagersReport } from "./money-with-managers-report";

// The Money with managers report (build-plan 6.9b, Done when: "the branch wall on each of the
// three reports"; 10-notifications-analytics-reports.md, Reports: "Open cash balances and their
// age"; 08-money-and-settlement.md, Money with managers and Manager's cash balance; plan of 6.9b,
// decided items 1 to 3 and 10, Look first; review of the plan, correction 1 and Should fix 2).
// 15 October 2031, 10:00 in Tashkent. Each scene is two new branches with a Finance user of the
// first only and a Manager working in both.

async function twoBranches() {
  setClock("2031-10-15T05:00:00Z");
  const a = await spendingScene();
  const b = await spendingScene();
  const manager = await insertUser("MANAGER", { branches: [a.branch.id, b.branch.id] });
  const finance = await insertUser("FINANCE", { branches: [a.branch.id] });
  const financeB = await insertUser("FINANCE", { branches: [b.branch.id] });
  return { a, b, manager, finance, financeB };
}

/** An order of the scene owned by `ownerId`, holding `amount` since `since` (a gift: no spend). */
async function holding(
  scene: SpendingScene,
  ownerId: string,
  financeId: string,
  since: string,
  amount: bigint,
) {
  const order = await bought(scene, { purchasedOn: since, unitPrice: "0", ownerId });
  await moneyOn(order, financeId, { amount, occurredOn: since });
  return order;
}

/** An order of the scene owned by `ownerId`, owed `amount` since `since` (bought with own money). */
async function owing(scene: SpendingScene, ownerId: string, since: string, amount: bigint) {
  return bought(scene, { purchasedOn: since, unitPrice: amount.toString(), ownerId });
}

const mine = (branch: string | null = null) => ({ filters: { ...NO_ANALYTICS_FILTERS, branch } });

describe("Money with managers: the branch wall (03 rule 1; 10 Reports: respects the user's branches)", () => {
  it("shows Finance of one branch a two-branch Manager's balance of that branch's orders only (review, correction 1)", async () => {
    const { a, b, manager, finance, financeB } = await twoBranches();
    const heldA = await holding(a, manager.id, finance.id, "2031-10-10", 50_000n);
    const owedA = await owing(a, manager.id, "2031-10-11", 20_000n);
    // The same Manager's money in the other branch: held and owed, never in branch A's numbers.
    const heldB = await holding(b, manager.id, financeB.id, "2031-09-01", 1_000_000n);
    await owing(b, manager.id, "2031-09-02", 300_000n);
    await refreshNow();

    const report = await getMoneyWithManagersReport(finance.id, mine(), "all");
    expect(
      report.owners.map((row) => [row.ownerId, row.held, row.owed, row.since, row.orderCount]),
    ).toEqual([[manager.id, 50_000n, 20_000n, "2031-10-10", 2]]);
    expect([report.held, report.owed]).toEqual([50_000n, 20_000n]);
    expect(report.orders.map((row) => row.id)).toEqual([heldA.orderId, owedA.orderId]);
    expect(report.orders.some((row) => row.id === heldB.orderId)).toBe(false);

    await expect(
      getMoneyWithManagersReport(finance.id, mine(b.branch.id), "all"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("Money with managers: balances and their age (08 Money with managers; decided items 2 and 3)", () => {
  it("keeps held and owed apart, oldest owner first, each order in its band by the days since", async () => {
    const { a, manager, finance } = await twoBranches();
    const other = await insertUser("MANAGER", { branches: [a.branch.id] });
    // 7 days: up to 7; 8 days: 8 to 30; owed 31 days: over 30.
    await holding(a, manager.id, finance.id, "2031-10-08", 4_000n);
    await holding(a, manager.id, finance.id, "2031-10-07", 2_000n);
    await owing(a, other.id, "2031-09-14", 9_000n);
    // A count back at 0 is behind no balance.
    const evened = await holding(a, manager.id, finance.id, "2031-09-01", 7_000n);
    await moneyOn(evened, finance.id, {
      kind: "CASH_RETURNED",
      amount: 7_000n,
      occurredOn: "2031-09-02",
    });
    await refreshNow();

    const report = await getMoneyWithManagersReport(finance.id, mine(), "all");
    // The other Manager's balance is the older one: first.
    expect(report.owners.map((row) => [row.ownerId, row.held, row.owed, row.days])).toEqual([
      [other.id, 0n, 9_000n, 31],
      [manager.id, 6_000n, 0n, 8],
    ]);
    expect(report.orders.map((row) => [row.cashCount, row.days, row.band])).toEqual([
      [-9_000n, 31, "older"],
      [2_000n, 8, "month"],
      [4_000n, 7, "week"],
    ]);
    expect(report.ages).toEqual([
      { band: "week", held: 4_000n, heldCount: 1, owed: 0n, owedCount: 0 },
      { band: "month", held: 2_000n, heldCount: 1, owed: 0n, owedCount: 0 },
      { band: "older", held: 0n, heldCount: 0, owed: 9_000n, owedCount: 1 },
    ]);
  });

  it("leaves out an order closed after the summary was refreshed (the live status; review, Should fix 2)", async () => {
    const { a, manager, finance } = await twoBranches();
    await holding(a, manager.id, finance.id, "2031-10-10", 5_000n);
    const closed = await holding(a, manager.id, finance.id, "2031-10-09", 8_000n);
    await refreshNow();
    // Closed after the refresh: the summary still holds its count.
    await setOrderStatus(closed.orderId, "CLOSED");

    const report = await getMoneyWithManagersReport(finance.id, mine(), "all");
    expect(report.orders.some((row) => row.id === closed.orderId)).toBe(false);
    expect([report.held, report.owners[0]!.since]).toEqual([5_000n, "2031-10-10"]);
  });

  it("pages the orders 25 at a time and keeps the owners and totals whole", async () => {
    const { a, manager, finance } = await twoBranches();
    for (let day = 1; day <= 27; day += 1) {
      await holding(a, manager.id, finance.id, `2031-09-${String(day).padStart(2, "0")}`, 1_000n);
    }
    await refreshNow();
    const report = await getMoneyWithManagersReport(finance.id, mine(), 2);
    expect([report.orderCount, report.pages, report.page, report.orders.length]).toEqual([
      27, 2, 2, 2,
    ]);
    expect(report.held).toBe(27_000n);
  });
});
