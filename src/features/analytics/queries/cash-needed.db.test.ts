import { describe, expect, it } from "vitest";

import { APPROVAL_STATUSES } from "@/domain/money-ledger";

import {
  type SpendingScene,
  bought,
  decided,
  moneyOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { setOrderStatus } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, type NeededStage } from "../period-params";

import { getCashNeeded } from "./cash-needed";
import { getNeededOrders } from "./needed-orders";

// Finance's Cash needed soon (10-notifications-analytics-reports.md, Analytics page per role,
// Finance: "Planned cash of approved orders not yet paid, plus orders still in approval"; build-
// plan 6.6a; plan of 6.6a, decided items 4 and 5, Look first; review of the plan, Should fix 5 and
// correction 1). Every order is planned at 10 × 5 000 = 50 000 in cash unless said otherwise.

async function counted(scene: SpendingScene, financeId: string) {
  const open = await decided(scene, "PURCHASING", []);
  await moneyOn({ orderId: open.id, ownerId: open.ownerId }, financeId, {
    amount: 30_000n,
    occurredOn: "2031-10-03",
  });
  const head = await decided(scene, "PENDING_HEAD", []);
  const principal = await decided(scene, "PENDING_PRINCIPAL", []);
  const finance = await decided(scene, "PENDING_FINANCE", []);
  return { open, head, principal, finance };
}

/** Beside the counted ones, with cash planned, every order one step off that needs nothing. */
async function oneStepOff(scene: SpendingScene) {
  return [
    await decided(scene, "RETURNED", []),
    await decided(scene, "REJECTED", []),
    await decided(scene, "SETTLEMENT", [], { progress: "DONE" }),
    await decided(scene, "PURCHASING", [], { progress: "DONE" }),
    await decided(scene, "PENDING_FINANCE", [], { paymentType: "TRANSFER" }),
  ];
}

describe("Cash needed soon (10 Finance; plan of 6.6a, decided items 4 and 5)", () => {
  it("sums the rest of each Open order still buying and the planned cash of each order in approval, by step and together", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    await counted(scene, finance.id);
    await oneStepOff(scene);
    // A Draft taken back after the refresh leaves at once (the draft wall, .claude/rules/
    // server-actions.md); before the refresh it was in approval like the others.
    const takenBack = await decided(scene, "PENDING_HEAD", []);
    // Another branch with the same orders: never in this Finance's numbers (D40).
    const other = await spendingScene();
    const otherFinance = await insertUser("FINANCE", { branches: [other.branch.id] });
    await counted(other, otherFinance.id);
    await refreshNow();
    await setOrderStatus(takenBack.id, "DRAFT");

    const block = await getCashNeeded(finance.id, NO_ANALYTICS_FILTERS);
    expect(block).toEqual({
      open: { amount: 20_000n, count: 1 },
      approval: { amount: 150_000n, count: 3 },
      all: { amount: 170_000n, count: 4 },
      steps: [
        { step: "PENDING_HEAD", amount: 50_000n, count: 1 },
        { step: "PENDING_PRINCIPAL", amount: 50_000n, count: 1 },
        { step: "PENDING_FINANCE", amount: 50_000n, count: 1 },
      ],
    });

    // Each number, each step's included, is the list it opens (10 point 3; Must fix 2).
    for (const stage of ["all", "open", "approval"] as NeededStage[]) {
      const list = await getNeededOrders(finance.id, NO_ANALYTICS_FILTERS, stage, null, "all");
      expect([list.total, list.count]).toEqual([block[stage].amount, block[stage].count]);
    }
    for (const step of block.steps) {
      const list = await getNeededOrders(
        finance.id,
        NO_ANALYTICS_FILTERS,
        "approval",
        step.step,
        "all",
      );
      expect([list.total, list.count]).toEqual([step.amount, step.count]);
    }
    const open = await getNeededOrders(finance.id, NO_ANALYTICS_FILTERS, "open", null, 1);
    expect(open.rows.map((row) => [row.plannedCash, row.handed, row.needed])).toEqual([
      [50_000n, 30_000n, 20_000n],
    ]);
  });

  it("keeps an order the Head approves on after the refresh in approval, and the steps add up to it (review correction 1)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const { head } = await counted(scene, finance.id);
    await refreshNow();
    await setOrderStatus(head.id, "PENDING_PRINCIPAL");

    const block = await getCashNeeded(finance.id, NO_ANALYTICS_FILTERS);
    expect(block.approval).toEqual({ amount: 150_000n, count: 3 });
    const sum = block.steps.reduce((total, step) => total + step.amount, 0n);
    expect(sum).toBe(block.approval.amount);
    // Until the next refresh the order stays at the Head's step, where the summary saw it.
    expect(block.steps.map((step) => step.count)).toEqual(APPROVAL_STATUSES.map(() => 1));
  });

  it("drops an Open order from the approved number once its buying is finished, before the refresh", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const { open } = await counted(scene, finance.id);
    await refreshNow();
    await setOrderStatus(open.id, "SETTLEMENT");
    expect((await getCashNeeded(finance.id, NO_ANALYTICS_FILTERS)).open).toEqual({
      amount: 0n,
      count: 0,
    });
  });

  it("keeps under a supplier filter only an order with a live record from that supplier (decided item 8)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    await counted(scene, finance.id);
    // Bought 1 × 10 000 from the scene's supplier, of 50 000 planned, nothing given: needs 50 000.
    await bought(scene, { purchasedOn: "2031-10-04" });
    await refreshNow();
    const block = await getCashNeeded(finance.id, {
      ...NO_ANALYTICS_FILTERS,
      supplier: scene.supplier.id,
    });
    expect(block.open).toEqual({ amount: 50_000n, count: 1 });
    expect(block.approval).toEqual({ amount: 0n, count: 0 });
  });
});
