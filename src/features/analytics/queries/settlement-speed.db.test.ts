import { describe, expect, it } from "vitest";

import {
  type Move,
  type SpendingScene,
  decided,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getSettlementSpeed } from "./settlement-speed";
import { getSettlements } from "./settlements";

// Finance's Settlement speed block (10-notifications-analytics-reports.md, Analytics page per role,
// Finance: "Average days from 'Send to settlement' to Closed"; build-plan 6.6b; plan of 6.6b,
// decided items 3 and 6, Look first). The clock is set; each scene is a branch with a Finance user
// of it only, beside another branch whose settlements would change every number if let in (D40).

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };

/** Every order was submitted and approved by Finance in July, before any settlement (06). */
const SUBMITTED = "2031-07-01T05:00:00Z";
const APPROVED: Move = {
  type: "APPROVE",
  from: "PENDING_FINANCE",
  to: "PURCHASING",
  at: "2031-07-02T05:00:00Z",
};

/** An approved order of the scene at `status` with these moves after its approval. */
function order(scene: SpendingScene, status: "CLOSED" | "SETTLEMENT", moves: Move[]) {
  return decided(scene, status, [APPROVED, ...moves], { submittedAt: SUBMITTED });
}

/** Open → Waiting for settlement at `sent`, → Closed at `closed` (06 Allowed moves). */
async function closedOrder(scene: SpendingScene, sent: string, closed: string) {
  return order(scene, "CLOSED", [
    { type: "SEND_TO_SETTLEMENT", from: "PURCHASING", to: "SETTLEMENT", at: sent },
    { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: closed },
  ]);
}

async function financeScene() {
  // 15 October 2031, 10:00 in Tashkent.
  setClock("2031-10-15T05:00:00Z");
  const scene = await spendingScene();
  const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
  const second = await spendingScene();
  const twoBranches = await insertUser("FINANCE", {
    branches: [scene.branch.id, second.branch.id],
  });
  const other = await spendingScene();
  return { scene, finance, second, twoBranches, other };
}

describe("Settlement speed, with the clock set (10 Finance, Settlement speed; decided item 3)", () => {
  it("averages the days of the settlements closed in the period, each from its first send, with its change", async () => {
    const { scene, finance, other } = await financeScene();
    // 1 day and 2 days 12 hours: 1.75 days, half up 1.8.
    await closedOrder(scene, "2031-10-01T05:00:00Z", "2031-10-02T05:00:00Z");
    await closedOrder(scene, "2031-10-03T05:00:00Z", "2031-10-05T17:00:00Z");
    // Sent back for correction and sent again: counted from the first send (4 days, closed in
    // September, so in the period before with the 1-day one below: 2.5 days before).
    await order(scene, "CLOSED", [
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        at: "2031-09-10T05:00:00Z",
      },
      {
        type: "SEND_BACK_FOR_CORRECTION",
        from: "SETTLEMENT",
        to: "PURCHASING",
        at: "2031-09-11T05:00:00Z",
        reason: "Chek yo'q",
      },
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        at: "2031-09-13T05:00:00Z",
      },
      { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: "2031-09-14T05:00:00Z" },
    ]);
    await closedOrder(scene, "2031-09-20T05:00:00Z", "2031-09-21T05:00:00Z");
    // Still waiting for settlement, and closed by exact match without a send: none.
    await order(scene, "SETTLEMENT", [
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        at: "2031-10-01T05:00:00Z",
      },
    ]);
    await order(scene, "CLOSED", [
      { type: "CLOSE_EXACT", from: "PURCHASING", to: "CLOSED", at: "2031-10-02T05:00:00Z" },
    ]);
    // The other branch: a slow settlement closed in the period.
    await closedOrder(other, "2031-08-01T05:00:00Z", "2031-10-10T05:00:00Z");
    await refreshNow();

    const block = await getSettlementSpeed(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.total).toEqual({ days: "1.8", count: 2, change: "-0.7" });
    expect(block.branches).toEqual([
      expect.objectContaining({ id: scene.branch.id, days: "1.8", count: 2, change: "-0.7" }),
    ]);
    // The number is the list it opens (10 point 3).
    const list = await getSettlements(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS, "all");
    expect([list.count, list.days]).toEqual([2, "1.8"]);
    expect(list.rows.map((row) => row.days)).toEqual(["2.5", "1.0"]);
    expect(
      list.rows.map((row) => [row.sentAt.toISOString(), row.closedAt.toISOString(), row.closedOn]),
    ).toEqual([
      ["2031-10-03T05:00:00.000Z", "2031-10-05T17:00:00.000Z", "2031-10-05"],
      ["2031-10-01T05:00:00.000Z", "2031-10-02T05:00:00.000Z", "2031-10-02"],
    ]);
  });

  it("counts a settlement by the Tashkent date of its close, not the UTC one (CLAUDE.md rule 10)", async () => {
    const { scene, finance } = await financeScene();
    // Closed at 20:00 UTC on 30 September: 1 October in Tashkent, so in this period.
    await closedOrder(scene, "2031-09-29T20:00:00Z", "2031-09-30T20:00:00Z");
    // Closed at 18:00 UTC on 30 September: still 30 September in Tashkent.
    await closedOrder(scene, "2031-09-28T18:00:00Z", "2031-09-30T18:00:00Z");
    await refreshNow();
    const block = await getSettlementSpeed(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.total).toEqual({ days: "1.0", count: 1, change: "-1.0" });
  });

  it("gives each branch its own average and the total from the whole set, never a mean of the rows", async () => {
    const { scene, second, twoBranches, other } = await financeScene();
    // Scene: 1 and 3 days; second: 8 days. All: 12 ÷ 3 = 4.0, not (2.0 + 8.0) ÷ 2.
    await closedOrder(scene, "2031-10-01T05:00:00Z", "2031-10-02T05:00:00Z");
    await closedOrder(scene, "2031-10-01T05:00:00Z", "2031-10-04T05:00:00Z");
    await closedOrder(second, "2031-10-01T05:00:00Z", "2031-10-09T05:00:00Z");
    await closedOrder(other, "2031-10-01T05:00:00Z", "2031-10-11T05:00:00Z");
    await refreshNow();

    const block = await getSettlementSpeed(twoBranches.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.total).toEqual({ days: "4.0", count: 3, change: null });
    expect(block.branches.map((row) => [row.id, row.days, row.count, row.change]).sort()).toEqual(
      [
        [scene.branch.id, "2.0", 2, null],
        [second.branch.id, "8.0", 1, null],
      ].sort(),
    );
    // A branch row opens its own settlements (decided item 8).
    const list = await getSettlements(
      twoBranches.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: second.branch.id },
      "all",
    );
    expect([list.count, list.days]).toEqual([1, "8.0"]);
  });

  it("keeps under a supplier filter only the orders with a record not cancelled from it (decided item 7)", async () => {
    const { scene, finance } = await financeScene();
    const supplier = await insertCompany();
    const from = await closedOrder(scene, "2031-10-01T05:00:00Z", "2031-10-02T05:00:00Z");
    await recordOn(
      scene,
      { id: from.id, ownerId: from.ownerId, variantId: from.variantId },
      {
        purchasedOn: "2031-09-30",
        supplierId: supplier.id,
      },
    );
    // The same supplier on a cancelled record, and another supplier: left out.
    const cancelled = await closedOrder(scene, "2031-10-01T05:00:00Z", "2031-10-04T05:00:00Z");
    await recordOn(
      scene,
      { id: cancelled.id, ownerId: cancelled.ownerId, variantId: cancelled.variantId },
      { purchasedOn: "2031-09-30", supplierId: supplier.id, cancelled: true },
    );
    const another = await closedOrder(scene, "2031-10-01T05:00:00Z", "2031-10-06T05:00:00Z");
    await recordOn(
      scene,
      { id: another.id, ownerId: another.ownerId, variantId: another.variantId },
      { purchasedOn: "2031-09-30" },
    );
    await refreshNow();
    const filters = { ...NO_ANALYTICS_FILTERS, supplier: supplier.id };
    const block = await getSettlementSpeed(finance.id, THIS_MONTH, filters);
    expect(block.total).toEqual({ days: "1.0", count: 1, change: null });
    const list = await getSettlements(finance.id, THIS_MONTH, filters, "all");
    expect(list.rows.map((row) => row.orderId)).toEqual([from.id]);
  });
});
