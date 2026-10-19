import { describe, expect, it } from "vitest";

import type { CashAgeBand } from "@/domain/analytics";

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
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getCashOrders } from "./cash-orders";
import { getFinanceCash } from "./finance-cash";
import { getMoneyRows } from "./money-rows";

// Finance's Cash block (10-notifications-analytics-reports.md, Analytics page per role, Finance,
// Cash: "Given, returned and paid back by month; money with managers by age: up to 7 days, 8 to 30
// days, over 30 days"; build-plan 6.6a; plan of 6.6a, decided items 2, 3 and 6, Look first). Each
// scene is a branch of its own with a Finance user of that branch only, and another branch beside
// it whose rows would change every number if let in (D40).

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };

async function financeScene() {
  const scene = await spendingScene();
  const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
  // Another branch, its Finance user and the same kinds of money: never in this Finance's numbers.
  const other = await spendingScene();
  const otherFinance = await insertUser("FINANCE", { branches: [other.branch.id] });
  return { scene, finance, other, otherFinance };
}

/** An order of the scene holding `amount` since `since` (no cash spent: the record is a gift). */
async function holding(scene: SpendingScene, financeId: string, since: string, amount: bigint) {
  const order = await bought(scene, { purchasedOn: since, unitPrice: "0" });
  await moneyOn(order, financeId, { amount, occurredOn: since });
  return order;
}

/** An order of the scene owed `amount` since `since` (bought with the Manager's own money). */
async function owed(scene: SpendingScene, since: string, amount: bigint) {
  return bought(scene, { purchasedOn: since, unitPrice: amount.toString() });
}

describe("money with managers by age, with the clock set (build-plan 6.6a, Done when; 10 Finance, Cash)", () => {
  it("puts each order in its band by the days since its first cash movement, held and owed apart (decided item 3)", async () => {
    // 15 October 2031, 10:00 in Tashkent.
    setClock("2031-10-15T05:00:00Z");
    const { scene, finance, other, otherFinance } = await financeScene();
    // Held since 0, 7, 8, 30 and 31 days before today, and owed since 9 and 45 days.
    await holding(scene, finance.id, "2031-10-15", 1_000n); // 0 days: up to 7
    await holding(scene, finance.id, "2031-10-08", 2_000n); // 7 days: up to 7
    await holding(scene, finance.id, "2031-10-07", 4_000n); // 8 days: 8 to 30
    await holding(scene, finance.id, "2031-09-15", 8_000n); // 30 days: 8 to 30
    await holding(scene, finance.id, "2031-09-14", 16_000n); // 31 days: over 30
    await owed(scene, "2031-10-06", 32_000n); // 9 days: 8 to 30, owed
    await owed(scene, "2031-08-31", 64_000n); // 45 days: over 30, owed
    // A since after today (an action dated ahead) is in the first band (review, Should fix 4).
    await holding(scene, finance.id, "2031-10-16", 128_000n);
    // A Closed order and an order whose count is back at 0 are in no band.
    const closed = await holding(scene, finance.id, "2031-10-10", 256_000n);
    await setOrderStatus(closed.orderId, "CLOSED");
    const evened = await holding(scene, finance.id, "2031-10-10", 512_000n);
    await moneyOn(evened, finance.id, {
      kind: "CASH_RETURNED",
      amount: 512_000n,
      occurredOn: "2031-10-11",
    });
    // The other branch: in every band.
    for (const since of ["2031-10-15", "2031-10-01", "2031-08-01"]) {
      await holding(other, otherFinance.id, since, 1_000_000n);
      await owed(other, since, 2_000_000n);
    }
    await refreshNow();

    const block = await getFinanceCash(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.ages).toEqual([
      { band: "week", held: 131_000n, heldCount: 3, owed: 0n, owedCount: 0 },
      { band: "month", held: 12_000n, heldCount: 2, owed: 32_000n, owedCount: 1 },
      { band: "older", held: 16_000n, heldCount: 1, owed: 64_000n, owedCount: 1 },
    ]);
    // Each amount is the list it opens (10 point 3).
    for (const row of block.ages) {
      for (const side of ["held", "owed"] as const) {
        const list = await getCashOrders(finance.id, NO_ANALYTICS_FILTERS, false, "all", {
          band: row.band,
          side,
        });
        expect(list[side]).toBe(row[side]);
        expect(list.count).toBe(side === "held" ? row.heldCount : row.owedCount);
        expect(list[side === "held" ? "owed" : "held"]).toBe(0n);
      }
    }
  });

  it("moves an order to the next band at midnight in Tashkent, not in UTC (CLAUDE.md rule 10; D46)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const { scene, finance } = await financeScene();
    await holding(scene, finance.id, "2031-10-08", 2_000n);
    await refreshNow();
    const bandAt = async (moment: string): Promise<CashAgeBand> => {
      setClock(moment);
      const block = await getFinanceCash(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
      return block.ages.find((row) => row.heldCount > 0)!.band;
    };
    // 23:59 on 15 October in Tashkent: 7 days.
    expect(await bandAt("2031-10-15T18:59:00Z")).toBe("week");
    // 00:01 on 16 October in Tashkent (still 15 October in UTC): 8 days.
    expect(await bandAt("2031-10-15T19:01:00Z")).toBe("month");
  });
});

describe("money with managers by age, the draft wall (.claude/rules/tests.md; permission review of 6.6a, Should fix 3)", () => {
  it("leaves out an order taken back to Draft after the refresh, held or owed, with every other value letting it in", async () => {
    setClock("2031-10-15T05:00:00Z");
    const { scene, finance } = await financeScene();
    const held = await holding(scene, finance.id, "2031-10-10", 1_000n);
    const owes = await owed(scene, "2031-10-10", 2_000n);
    await refreshNow();
    const before = await getFinanceCash(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(before.ages[0]).toMatchObject({ held: 1_000n, owed: 2_000n });
    await setOrderStatus(held.orderId, "DRAFT");
    await setOrderStatus(owes.orderId, "DRAFT");
    const after = await getFinanceCash(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(after.ages[0]).toEqual({ band: "week", held: 0n, heldCount: 0, owed: 0n, owedCount: 0 });
    for (const side of ["held", "owed"] as const) {
      const list = await getCashOrders(finance.id, NO_ANALYTICS_FILTERS, false, "all", {
        band: "week",
        side,
      });
      expect(list.count).toBe(0);
    }
  });

  it("leaves out the money rows of an order taken back to Draft (the draft wall of moneyWhere(); Should fix 2)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const { scene, finance } = await financeScene();
    const order = await holding(scene, finance.id, "2031-10-10", 1_000n);
    await refreshNow();
    expect(
      (await getFinanceCash(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS)).totals.given.amount,
    ).toBe(1_000n);
    await setOrderStatus(order.orderId, "DRAFT");
    expect(
      (await getFinanceCash(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS)).totals.given.amount,
    ).toBe(0n);
    const rows = await getMoneyRows(finance.id, "given", null, THIS_MONTH, NO_ANALYTICS_FILTERS, 1);
    expect(rows.count).toBe(0);
  });
});

describe("given, returned and paid back by month (10 Finance, Cash; 08 Money ledger; decided item 2)", () => {
  it("sums each cash kind of actions not cancelled on their dates, with the change against the period before", async () => {
    setClock("2031-10-15T05:00:00Z");
    const { scene, finance, other, otherFinance } = await financeScene();
    const order = await bought(scene, { purchasedOn: "2031-09-02" });
    await moneyOn(order, finance.id, { amount: 60_000n, occurredOn: "2031-09-20" });
    await moneyOn(order, finance.id, { amount: 100_000n, occurredOn: "2031-10-03" });
    await moneyOn(order, finance.id, { amount: 50_000n, occurredOn: "2031-10-10" });
    await moneyOn(order, finance.id, {
      kind: "CASH_RETURNED",
      amount: 20_000n,
      occurredOn: "2031-10-12",
    });
    await moneyOn(order, finance.id, {
      kind: "PAID_BACK",
      amount: 5_000n,
      occurredOn: "2031-10-13",
    });
    // Left out: a cancelled action, a bank transfer, another branch's cash.
    await moneyOn(order, finance.id, {
      amount: 999_000n,
      occurredOn: "2031-10-05",
      cancelled: true,
    });
    await moneyOn(order, finance.id, {
      kind: "BANK_TRANSFER",
      amount: 70_000n,
      occurredOn: "2031-10-06",
    });
    const theirs = await bought(other, { purchasedOn: "2031-10-02" });
    await moneyOn(theirs, otherFinance.id, { amount: 400_000n, occurredOn: "2031-10-04" });
    await refreshNow();

    const block = await getFinanceCash(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.totals).toEqual({
      given: { amount: 150_000n, change: { difference: 90_000n, percent: "150.0" } },
      returned: { amount: 20_000n, change: { difference: 20_000n, percent: null } },
      paidBack: { amount: 5_000n, change: { difference: 5_000n, percent: null } },
    });
    // The only month is October, its change against the whole of September.
    expect(block.months).toEqual([{ month: "2031-10", ...block.totals }]);

    // Two months: September against August (nothing), October against September (Must fix 1).
    const twoMonths: PeriodInput = { choice: "custom", from: "2031-09-01", to: "2031-10-31" };
    const both = await getFinanceCash(finance.id, twoMonths, NO_ANALYTICS_FILTERS);
    expect(both.months.map((row) => [row.month, row.given])).toEqual([
      ["2031-09", { amount: 60_000n, change: { difference: 60_000n, percent: null } }],
      ["2031-10", { amount: 150_000n, change: { difference: 90_000n, percent: "150.0" } }],
    ]);

    // Each amount is the rows it opens (10 point 3).
    for (const kind of ["given", "returned", "paidBack"] as const) {
      const list = await getMoneyRows(
        finance.id,
        kind,
        null,
        THIS_MONTH,
        NO_ANALYTICS_FILTERS,
        "all",
      );
      expect(list.total).toBe(block.totals[kind].amount);
      for (const row of both.months) {
        const cell = await getMoneyRows(
          finance.id,
          kind,
          row.month,
          twoMonths,
          NO_ANALYTICS_FILTERS,
          "all",
        );
        expect(cell.total).toBe(row[kind].amount);
      }
    }
    const given = await getMoneyRows(
      finance.id,
      "given",
      null,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      1,
    );
    expect(given.rows.map((row) => [row.occurredOn, row.amount, row.managerName])).toEqual([
      ["2031-10-10", 50_000n, expect.any(String)],
      ["2031-10-03", 100_000n, expect.any(String)],
    ]);
  });

  it("filters by the action's Manager (decided item 8)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const { scene, finance } = await financeScene();
    const colleague = await insertUser("MANAGER", { branches: [scene.branch.id] });
    const mine = await bought(scene, { purchasedOn: "2031-10-02" });
    const theirs = await bought(scene, { purchasedOn: "2031-10-02", ownerId: colleague.id });
    await moneyOn(mine, finance.id, { amount: 10_000n, occurredOn: "2031-10-03" });
    await moneyOn(theirs, finance.id, { amount: 30_000n, occurredOn: "2031-10-03" });
    await refreshNow();
    const block = await getFinanceCash(finance.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      manager: colleague.id,
    });
    expect(block.totals.given.amount).toBe(30_000n);
  });
});
