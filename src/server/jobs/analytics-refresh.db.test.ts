import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { actualGoods, actualTotal } from "@/domain/purchases";
import { db } from "@/server/db/client";
import { getMoneyWithManagers } from "@/features/money/queries/money-with-managers";
import { recordsWhere } from "@/features/purchasing/order-records";

import {
  bought,
  buyingEvent,
  decided,
  moneyOn,
  recordOn,
  refreshNow,
  reverseNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../tests/helpers/analytics";
import { refusalOf } from "../../../tests/helpers/database-error";
import { setClock } from "../../../tests/helpers/clock";
import { insertOrder, setOrderStatus } from "../../../tests/helpers/orders";
import { insertUser } from "../../../tests/helpers/users";
import type { Job } from "./job";
import { analyticsRefresh } from "./analytics-refresh";
import { JOBS } from "./registry";
import { runDueJobs } from "./run-due";

// The analytics refresh (build-plan 6.3; 10-notifications-analytics-reports.md, Analytics page per
// role, point 5: "Summary tables are refreshed every 5 minutes"; developer-rules.md rules 1 and 12;
// 08 Actual total; plan of 6.3, decided items 1, 5 and 7).

type Row = {
  purchase_id: string;
  order_id: string;
  branch_id: string;
  purchased_on: string;
  category_id: string;
  department_id: string;
  owner_id: string;
  supplier_id: string | null;
  amount: string;
};

async function rowsOf(branchId: string): Promise<Row[]> {
  const found = await db.execute<Row>(sql`
    select purchase_id, order_id, branch_id, purchased_on::text as purchased_on, category_id,
           department_id, owner_id, supplier_id, amount::text as amount
    from analytics_spending where branch_id = ${branchId} order by purchase_id`);
  return found.rows;
}

describe("analytics_refresh (10 point 5; developer-rules rule 12)", () => {
  it("is a job of the registry, every 5 minutes", () => {
    expect(JOBS).toContain(analyticsRefresh);
    expect(analyticsRefresh.schedule).toEqual({ everyMinutes: 5 });
  });

  it("writes each record not cancelled once, its amount actualTotal() of that record", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    // 2.5 × 3 333 = 8 332.5 → 8 333, + 1 000 extra: 9 333 (the review's worked example).
    const a = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1_000n],
    });
    const b = await bought(scene, {
      purchasedOn: "2031-04-30",
      qty: "0.001",
      unitPrice: "400",
      supplierId: null,
    });
    // Kept out: a cancelled record with every other value the same as `a` (D40).
    await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1_000n],
      cancelled: true,
    });

    await refreshNow();
    const rows = await rowsOf(scene.branch.id);
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((row) => [row.purchase_id, row]));
    expect(byId.get(a.purchaseId)).toMatchObject({
      order_id: a.orderId,
      purchased_on: "2031-05-02",
      category_id: scene.category.id,
      department_id: scene.department.id,
      owner_id: scene.manager.id,
      supplier_id: scene.supplier.id,
      amount: "9333",
    });
    expect(byId.get(b.purchaseId)).toMatchObject({ supplier_id: null, amount: "0" });

    // Each amount is the domain's Actual total of that record read from the source tables.
    for (const row of rows) {
      const records = await recordsWhere(db, sql`p.id = ${row.purchase_id}`);
      expect(BigInt(row.amount)).toBe(actualTotal(records));
    }
  });

  it("a second run gives the same rows, and a record cancelled since leaves", async () => {
    const scene = await spendingScene();
    const kept = await bought(scene, { purchasedOn: "2031-05-03", unitPrice: "7000" });
    const later = await bought(scene, { purchasedOn: "2031-05-03", unitPrice: "8000" });
    await refreshNow();
    const first = await rowsOf(scene.branch.id);
    await refreshNow();
    expect(await rowsOf(scene.branch.id)).toEqual(first);

    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${scene.manager.id}, cancelled_at = now() where id = ${later.purchaseId}`);
    await refreshNow();
    expect((await rowsOf(scene.branch.id)).map((row) => row.purchase_id)).toEqual([
      kept.purchaseId,
    ]);
  });

  it("a run that fails leaves the rows of the last good run (the savepoint, rule 3)", async () => {
    setClock("2031-05-15T06:00:00Z");
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-05-04" });
    await refreshNow();
    const before = await rowsOf(scene.branch.id);
    expect(before).toHaveLength(1);
    await bought(scene, { purchasedOn: "2031-05-04" });

    // The real refresh, then a failure in the same run.
    const failing: Job = {
      ...analyticsRefresh,
      async run(context) {
        await analyticsRefresh.run(context);
        throw new Error("invented failure");
      },
    };
    expect(await runDueJobs([failing])).toEqual({ analytics_refresh: "failed" });
    expect(await rowsOf(scene.branch.id)).toEqual(before);

    setClock("2031-05-15T06:05:00Z");
    expect(await runDueJobs([analyticsRefresh])).toEqual({ analytics_refresh: "ran" });
    expect(await rowsOf(scene.branch.id)).toHaveLength(2);
  });
});

async function partsOf(purchaseId: string) {
  const found = await db.execute<{ payment_type: string; amount: string }>(sql`
    select payment_type, amount::text as amount from analytics_spending_payments
    where purchase_id = ${purchaseId} order by payment_type`);
  return found.rows;
}

async function outcomeOf(orderId: string) {
  const found = await db.execute<{
    ended_on: string;
    colour: string;
    planned: string;
    actual: string;
    difference: string;
    category_id: string;
    department_id: string;
    owner_id: string;
    branch_id: string;
  }>(sql`
    select ended_on::text as ended_on, colour, planned::text as planned, actual::text as actual,
           difference::text as difference, category_id, department_id, owner_id, branch_id
    from analytics_outcomes where order_id = ${orderId}`);
  return found.rows[0] ?? null;
}

describe("the parts by payment type (07 Purchase record; plan of 6.4, decided item 2)", () => {
  it("gives the goods to the trip's type and each extra to its own, adding up to the amount", async () => {
    const scene = await spendingScene();
    // 3 × 3 333 by card with a 5 000 cash delivery (the plan review's example).
    const card = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "3.000",
      unitPrice: "3333",
      paymentType: "CARD",
      extras: [{ amount: 5_000n, paymentType: "CASH" }],
    });
    // Two cash extras on a transfer: one cash part of 7 000.
    const transfer = await bought(scene, {
      purchasedOn: "2031-05-02",
      unitPrice: "10000",
      paymentType: "TRANSFER",
      extras: [5_000n, 2_000n],
    });
    // A cancelled record with every other value the same as `card` writes no part (D40).
    const cancelled = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "3.000",
      unitPrice: "3333",
      paymentType: "CARD",
      extras: [{ amount: 5_000n, paymentType: "CASH" }],
      cancelled: true,
    });
    await refreshNow();

    expect(await partsOf(card.purchaseId)).toEqual([
      { payment_type: "CASH", amount: "5000" },
      { payment_type: "CARD", amount: "9999" },
    ]);
    expect(await partsOf(transfer.purchaseId)).toEqual([
      { payment_type: "CASH", amount: "7000" },
      { payment_type: "TRANSFER", amount: "10000" },
    ]);
    expect(await partsOf(cancelled.purchaseId)).toEqual([]);
    for (const row of await rowsOf(scene.branch.id)) {
      const parts = await partsOf(row.purchase_id);
      expect(parts.reduce((sum, part) => sum + BigInt(part.amount), 0n)).toBe(BigInt(row.amount));
    }
  });

  it("refuses a part of 0 or below in the database (CLAUDE.md rule 5; D39)", async () => {
    const scene = await spendingScene();
    const gift = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "0" });
    await refreshNow();
    expect(await partsOf(gift.purchaseId)).toEqual([]);
    for (const amount of [0n, -1n]) {
      expect(
        await refusalOf(
          db.execute(sql`insert into analytics_spending_payments (purchase_id, payment_type, amount)
            values (${gift.purchaseId}, 'CASH', ${amount})`),
        ),
      ).toMatchObject({ constraint: "analytics_spending_payments_amount_check" });
    }
  });
});

describe("the outcomes of Plan vs actual (08 The three colours; plan of 6.4, decided items 3 to 6)", () => {
  it("writes the colour and difference of orderOutcome() for Done and Done short", async () => {
    const scene = await spendingScene();
    // Planned 10 × 5 000 = 50 000 each.
    const red = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5200",
      progress: "DONE",
    });
    const amber = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "9.000",
      unitPrice: "5000",
      progress: "DONE_SHORT",
    });
    const green = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5000",
      progress: "DONE",
    });
    for (const order of [red, amber, green]) {
      await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    }
    await refreshNow();

    expect(await outcomeOf(red.orderId)).toEqual({
      ended_on: "2031-05-02",
      colour: "red",
      planned: "50000",
      actual: "52000",
      difference: "-2000",
      category_id: scene.category.id,
      department_id: scene.department.id,
      owner_id: scene.manager.id,
      branch_id: scene.branch.id,
    });
    expect(await outcomeOf(amber.orderId)).toMatchObject({ colour: "amber", difference: "5000" });
    expect(await outcomeOf(green.orderId)).toMatchObject({ colour: "green", difference: "0" });
  });

  it("writes none while buying is Open, nor for Not bought (decided item 4)", async () => {
    const scene = await spendingScene();
    // Open with records that would give red once finished.
    const open = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5200",
    });
    await buyingEvent(open.orderId, open.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    const notBought = await bought(scene, {
      purchasedOn: "2031-05-02",
      cancelled: true,
      progress: "NOT_BOUGHT",
    });
    await buyingEvent(
      notBought.orderId,
      notBought.ownerId,
      "MARK_NOT_BOUGHT",
      "2031-05-02T05:00:00Z",
    );
    await refreshNow();
    expect(await outcomeOf(open.orderId)).toBeNull();
    expect(await outcomeOf(notBought.orderId)).toBeNull();
  });

  it("falls on the Tashkent date of the newest buying event (CLAUDE.md rule 10)", async () => {
    const scene = await spendingScene();
    const order = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5000",
      progress: "DONE",
    });
    await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    // 19:30 UTC on 5 May is 00:30 on 6 May in Tashkent.
    await buyingEvent(order.orderId, order.ownerId, "FINISH_ORDER", "2031-05-05T19:30:00Z");
    await refreshNow();
    expect(await outcomeOf(order.orderId)).toMatchObject({ ended_on: "2031-05-06" });
  });

  it("a record cancelled that reopens buying removes the outcome (07 Fixing a mistake)", async () => {
    const scene = await spendingScene();
    const order = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5000",
      progress: "DONE",
    });
    await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    await refreshNow();
    expect(await outcomeOf(order.orderId)).toMatchObject({ colour: "green" });

    // The cancel, as cancelPurchase writes it: the record cancelled, buying Open again.
    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${order.ownerId}, cancelled_at = '2031-05-03T05:00:00Z'
      where id = ${order.purchaseId}`);
    await db.execute(sql`update orders set progress = 'OPEN' where id = ${order.orderId}`);
    await buyingEvent(order.orderId, order.ownerId, "CANCEL_PURCHASE", "2031-05-03T05:00:00Z");
    await refreshNow();
    expect(await outcomeOf(order.orderId)).toBeNull();
  });

  it("a record cancelled that leaves buying Done rewrites the outcome on the cancel's day", async () => {
    const scene = await spendingScene();
    const order = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5000",
      progress: "DONE",
    });
    // Two more over the plan: 12 × 5 000 = 60 000, red −10 000.
    const extra = await recordOn(
      scene,
      { id: order.orderId, ownerId: order.ownerId, variantId: order.variantId },
      {
        purchasedOn: "2031-05-02",
        qty: "2.000",
        unitPrice: "5000",
      },
    );
    await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    await refreshNow();
    expect(await outcomeOf(order.orderId)).toMatchObject({ colour: "red", difference: "-10000" });

    // The cancel leaves 10 received, still Done (progressAfterBuying()).
    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${order.ownerId}, cancelled_at = '2031-05-04T05:00:00Z'
      where id = ${extra.purchaseId}`);
    await buyingEvent(order.orderId, order.ownerId, "CANCEL_PURCHASE", "2031-05-04T05:00:00Z");
    await refreshNow();
    expect(await outcomeOf(order.orderId)).toMatchObject({
      colour: "green",
      difference: "0",
      actual: "50000",
      ended_on: "2031-05-04",
    });
  });

  it("refuses in the database what orderOutcome() never writes (CLAUDE.md rule 5; D39)", async () => {
    const scene = await spendingScene();
    const order = await bought(scene, { purchasedOn: "2031-05-02" });
    const insert = (colour: string, planned: bigint, actual: bigint, difference: bigint) =>
      refusalOf(
        db.execute(sql`insert into analytics_outcomes (order_id, branch_id, ended_on, category_id,
            department_id, owner_id, colour, planned, actual, difference)
          values (${order.orderId}, ${scene.branch.id}, '2031-05-02', ${scene.category.id},
            ${scene.department.id}, ${scene.manager.id}, ${colour}, ${planned}, ${actual},
            ${difference})`),
      );
    expect(await insert("red", -1n, 0n, -1n)).toMatchObject({
      constraint: "analytics_outcomes_planned_check",
    });
    expect(await insert("amber", 0n, -1n, 1n)).toMatchObject({
      constraint: "analytics_outcomes_actual_check",
    });
    expect(await insert("red", 100n, 150n, -40n)).toMatchObject({
      constraint: "analytics_outcomes_difference_check",
    });
    expect(await insert("green", 100n, 150n, -50n)).toMatchObject({
      constraint: "analytics_outcomes_colour_check",
    });
    expect(await insert("amber", 100n, 100n, 0n)).toMatchObject({
      constraint: "analytics_outcomes_colour_check",
    });
    expect(await insert("red", 150n, 100n, 50n)).toMatchObject({
      constraint: "analytics_outcomes_colour_check",
    });
    expect(await insert("grey", 100n, 100n, 0n)).toMatchObject({ code: "22P02" });
  });
});

// Task 6.4b (plan of 6.4b, Database changes; decided items 1, 6 to 10 and 13).
describe("analytics_refresh, the rows of Prices and Approval speed (build-plan 6.4b)", () => {
  it("writes each record's subtype bought, quantity, unit price, entry time and goods actualGoods()", async () => {
    const scene = await spendingScene();
    const a = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1_000n],
    });
    await refreshNow();
    const found = await db.execute<{
      variant_id: string;
      qty: string;
      unit_price: string;
      goods: string;
      created_at: Date;
    }>(sql`select variant_id, qty::text as qty, unit_price::text as unit_price,
             goods::text as goods, created_at
           from analytics_spending where purchase_id = ${a.purchaseId}`);
    const records = await recordsWhere(db, sql`p.id = ${a.purchaseId}`);
    // 2.5 × 3 333 = 8 332.5 → 8 333: the goods without the 1 000 extra (08 rounding).
    expect(found.rows[0]).toMatchObject({
      variant_id: a.variantId,
      qty: "2.500",
      unit_price: "3333",
      goods: actualGoods(records).toString(),
    });
    expect(found.rows[0]!.goods).toBe("8333");
    expect(new Date(found.rows[0]!.created_at).toISOString()).toBe("2031-05-02T05:00:00.000Z");
  });

  it("a substituted record counts under the subtype bought, not the order's (07 Substitution; Should fix 2)", async () => {
    const scene = await spendingScene();
    const order = await bought(scene, { purchasedOn: "2031-05-02" });
    const other = await bought(scene, { purchasedOn: "2031-05-02" });
    // The second record of the first order bought the other order's subtype.
    const { purchaseId } = await recordOn(
      scene,
      { id: order.orderId, ownerId: order.ownerId, variantId: other.variantId },
      { purchasedOn: "2031-05-03" },
    );
    await refreshNow();
    const found = await db.execute<{ variant_id: string }>(
      sql`select variant_id from analytics_spending where purchase_id = ${purchaseId}`,
    );
    expect(found.rows[0]!.variant_id).toBe(other.variantId);
  });

  type StepRow = {
    step: string;
    entered_at: Date;
    left_at: Date | null;
    left_on: string | null;
    seconds: string | null;
    decision: string | null;
    reason: string | null;
    reason_key: string | null;
  };
  async function stepsOf(orderId: string) {
    const found = await db.execute<StepRow>(sql`
      select step, entered_at, left_at, left_on::text as left_on, seconds::text as seconds,
             decision, reason, reason_key
      from analytics_steps where order_id = ${orderId} order by entered_at`);
    return found.rows;
  }

  it("writes one row per decided and per open stay, with its Tashkent end date and reason key", async () => {
    const scene = await spendingScene();
    const order = await decided(scene, "PENDING_HEAD", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-01T17:00:00Z" },
      // 20:30 UTC is 01:30 on 2 May in Tashkent.
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-05-01T20:30:00Z",
        reason: "  Narxni   TEKSHIRING ",
      },
      { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_HEAD", at: "2031-05-02T08:00:00Z" },
    ]);
    await refreshNow();
    const rows = await stepsOf(order.id);
    expect(
      rows.map((row) => ({
        step: row.step,
        left_on: row.left_on,
        seconds: row.seconds,
        decision: row.decision,
        reason: row.reason,
        reason_key: row.reason_key,
      })),
    ).toEqual([
      {
        step: "PENDING_HEAD",
        left_on: "2031-05-02",
        seconds: "12600",
        decision: "SEND_BACK",
        reason: "  Narxni   TEKSHIRING ",
        reason_key: "narxni tekshiring",
      },
      {
        step: "PENDING_HEAD",
        left_on: null,
        seconds: null,
        decision: null,
        reason: null,
        reason_key: null,
      },
    ]);
    expect(new Date(rows[1]!.entered_at).toISOString()).toBe("2031-05-02T08:00:00.000Z");
    expect(rows[1]!.left_at).toBeNull();
  });

  it("writes no row for a stay ended by Take back or Cancel, nor for a draft never submitted", async () => {
    const scene = await spendingScene();
    const takenBack = await decided(scene, "DRAFT", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-01T05:00:00Z" },
      { type: "TAKE_BACK", from: "PENDING_HEAD", to: "DRAFT", at: "2031-05-01T06:00:00Z" },
    ]);
    const cancelled = await decided(scene, "CANCELLED", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-01T05:00:00Z" },
      {
        type: "CANCEL",
        from: "PENDING_HEAD",
        to: "CANCELLED",
        at: "2031-05-01T06:00:00Z",
        reason: "Endi kerak emas",
      },
    ]);
    const draft = await decided(scene, "DRAFT", []);
    await refreshNow();
    expect(await stepsOf(takenBack.id)).toEqual([]);
    expect(await stepsOf(cancelled.id)).toEqual([]);
    expect(await stepsOf(draft.id)).toEqual([]);
  });

  it("a second run gives the same stays", async () => {
    const scene = await spendingScene();
    const order = await decided(scene, "PENDING_PRINCIPAL", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-01T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-05-01T06:00:00Z",
      },
    ]);
    await refreshNow();
    const first = await stepsOf(order.id);
    expect(first).toHaveLength(2);
    await refreshNow();
    expect(await stepsOf(order.id)).toEqual(first);
  });
});

describe("analytics_refresh, the rows of the Managers block (build-plan 6.4c)", () => {
  type Cancelled = { purchase_id: string; cancelled_on: string; amount: string };
  const cancelledOf = async (branchId: string) =>
    (
      await db.execute<Cancelled>(sql`
        select purchase_id, cancelled_on::text as cancelled_on, amount::text as amount
        from analytics_cancelled where branch_id = ${branchId} order by purchase_id`)
    ).rows;
  type Cash = { order_id: string; owner_id: string; cash_count: string; since: string };
  const cashOf = async (branchId: string) =>
    (
      await db.execute<Cash>(sql`
        select order_id, owner_id, cash_count::text as cash_count, since::text as since
        from analytics_cash where branch_id = ${branchId} order by order_id`)
    ).rows;

  it("writes each cancelled record on its Tashkent cancel day with its total as entered, none for a live one (plan of 6.4c, decided item 5; Must fix 1)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    // 2.5 × 3 333 = 8 332.5 → 8 333, + 1 000 extra: 9 333, bought on 2 May, cancelled at 20:30
    // UTC on 9 May, which is 01:30 on 10 May in Tashkent.
    const cancelled = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1000n],
      cancelled: true,
      cancelledAt: "2031-05-09T20:30:00Z",
    });
    await bought(scene, { purchasedOn: "2031-05-03" });
    await refreshNow();
    expect(await cancelledOf(scene.branch.id)).toEqual([
      { purchase_id: cancelled.purchaseId, cancelled_on: "2031-05-10", amount: "9333" },
    ]);
  });

  it("writes each order's cash count and its date since when; none for a count of 0, a Draft or a Closed order (08 Money ledger; review correction 3)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    // Held: 60 000 given on 3 May, 10 000 spent in cash on 2 May → 50 000 since 2 May.
    const held = await bought(scene, { purchasedOn: "2031-05-02" });
    await moneyOn(held, finance.id, { amount: 60_000n, occurredOn: "2031-05-03" });
    // Given then returned in full: 0, no row.
    const evened = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "0" });
    await moneyOn(evened, finance.id, { amount: 20_000n, occurredOn: "2031-05-04" });
    await moneyOn(evened, finance.id, {
      kind: "CASH_RETURNED",
      amount: 20_000n,
      occurredOn: "2031-05-05",
    });
    // Closed and Draft orders with a count away from 0 are left out.
    const closed = await bought(scene, { purchasedOn: "2031-05-02" });
    await moneyOn(closed, finance.id, { amount: 30_000n, occurredOn: "2031-05-03" });
    await setOrderStatus(closed.orderId, "CLOSED");
    const draft = await bought(scene, { purchasedOn: "2031-05-02" });
    await setOrderStatus(draft.orderId, "DRAFT");
    await refreshNow();
    expect(await cashOf(scene.branch.id)).toEqual([
      {
        order_id: held.orderId,
        owner_id: scene.manager.id,
        cash_count: "50000",
        since: "2031-05-02",
      },
    ]);
  });

  it("matches Money with managers on the same orders: each count, each since and each owner's held (Should fix 3)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const head = await insertUser("HEAD");
    // A cancelled action does not count; the live one given later does.
    const a = await bought(scene, { purchasedOn: "2031-05-06", unitPrice: "0" });
    await moneyOn(a, finance.id, { amount: 90_000n, occurredOn: "2031-05-01", cancelled: true });
    await moneyOn(a, finance.id, { amount: 40_000n, occurredOn: "2031-05-04" });
    // A Transfer trip with a Cash extra: only the extra is cash spent (08 Cash spent).
    const b = await bought(scene, {
      purchasedOn: "2031-05-03",
      paymentType: "TRANSFER",
      extras: [{ amount: 7_000n, paymentType: "CASH" }],
    });
    await moneyOn(b, finance.id, { amount: 20_000n, occurredOn: "2031-05-07" });
    // A cancelled cash record spends nothing; a live one of the same order is owed.
    const c = await bought(scene, { purchasedOn: "2031-05-02", cancelled: true });
    await recordOn(
      scene,
      { id: c.orderId, ownerId: c.ownerId, variantId: c.variantId },
      { purchasedOn: "2031-05-05", unitPrice: "25000" },
    );
    await refreshNow();

    const page = (await getMoneyWithManagers(head.id, scene.branch.id)).find(
      (block) => block.ownerId === scene.manager.id,
    );
    expect(page).toBeDefined();
    const rows = await cashOf(scene.branch.id);
    expect(rows.map((row) => [row.order_id, BigInt(row.cash_count), row.since])).toEqual(
      page!.orders
        .map((order) => [order.id, order.cashCount, order.since])
        .sort((x, y) => (String(x[0]) < String(y[0]) ? -1 : 1)),
    );
    // a: 40 000 since 4 May; b: 20 000 − 7 000 = 13 000 since 3 May; c: −25 000 since 5 May.
    expect(page!.held).toBe(53_000n);
    expect(page!.owed).toBe(25_000n);
    const counts = new Map(rows.map((row) => [row.order_id, row.cash_count]));
    expect(counts.get(a.orderId)).toBe("40000");
    expect(counts.get(b.orderId)).toBe("13000");
    expect(counts.get(c.orderId)).toBe("-25000");
  });
});

describe("analytics_refresh, the rows of the Warehouse block (build-plan 6.4d)", () => {
  type Line = {
    variant_id: string;
    qty: string;
    value: string;
    min_qty: string | null;
    low: boolean;
    last_moved_on: string | null;
  };
  const stockOf = async (branchId: string) =>
    new Map(
      (
        await db.execute<Line>(sql`
          select variant_id, qty::text as qty, value::text as value, min_qty::text as min_qty,
                 low, last_moved_on::text as last_moved_on
          from analytics_stock where branch_id = ${branchId}`)
      ).rows.map((row) => [row.variant_id, row]),
    );
  type Moved = { document_id: string; type: string; moved_on: string; qty: string; value: string };
  const movesOf = async (branchId: string) =>
    (
      await db.execute<Moved>(sql`
        select document_id, type::text as type, moved_on::text as moved_on, qty::text as qty,
               value::text as value
        from analytics_stock_moves where branch_id = ${branchId} order by type, moved_on`)
    ).rows;

  it("writes each stock line with its value stockValue(), Low by isLow() and the Tashkent day of its newest movement (plan of 6.4d, decided items 1, 3 and 7)", async () => {
    // 20:30 UTC on 9 May is 01:30 on 10 May in Tashkent (CLAUDE.md rule 10).
    setClock("2031-05-09T20:30:00Z");
    const scene = await spendingScene();
    // 2.5 × 3 333 = 8 332.5 → 8 333, half up once (09 Stock value; 08 Rounding).
    const fractional = await stocked(scene, { qty: "2.500", unitCost: 3333n });
    const atMinimum = await stocked(scene, { qty: "5", unitCost: 1000n, minimum: "5" });
    const above = await stocked(scene, { qty: "5", unitCost: 1000n, minimum: "4.999" });
    const below = await stocked(scene, { qty: "5", unitCost: 1000n, minimum: "6" });
    await refreshNow();
    const lines = await stockOf(scene.branch.id);
    expect(lines.size).toBe(4);
    expect(lines.get(fractional)).toEqual({
      variant_id: fractional,
      qty: "2.500",
      value: "8333",
      min_qty: null,
      low: false,
      last_moved_on: "2031-05-10",
    });
    expect(lines.get(atMinimum)?.low).toBe(true);
    expect(lines.get(above)?.low).toBe(false);
    expect(lines.get(below)?.low).toBe(true);
    expect(lines.get(below)?.value).toBe("5000");
  });

  it("writes each issue, return and approved write-off on its document's date at the cost it moved at; none for a receipt, a pending write-off, a reversed issue or its reversal (decided items 4 and 5)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const item = await stocked(scene, { qty: "10", unitCost: 3333n });
    // 0.5 × 3 333 = 1 666.5 → 1 667.
    const issue = await stockDocument(scene, {
      type: "ISSUE",
      docDate: "2031-05-03",
      lines: [{ variantId: item, qty: "0.5" }],
    });
    const back = await stockDocument(scene, {
      type: "RETURN",
      docDate: "2031-05-04",
      lines: [{ variantId: item, qty: "0.5" }],
    });
    // Asked on 1 May, approved today: it falls on its document's date (decided item 5).
    const writeOff = await stockDocument(scene, {
      type: "WRITE_OFF",
      docDate: "2031-05-01",
      lines: [{ variantId: item, qty: "2" }],
      decidedBy: head.id,
    });
    await stockDocument(scene, {
      type: "WRITE_OFF",
      docDate: "2031-05-02",
      lines: [{ variantId: item, qty: "1" }],
      status: "PENDING_APPROVAL",
    });
    const wrong = await stockDocument(scene, {
      type: "ISSUE",
      docDate: "2031-05-05",
      lines: [{ variantId: item, qty: "3" }],
    });
    await reverseNow(wrong, head.id);
    await refreshNow();
    expect(await movesOf(scene.branch.id)).toEqual([
      { document_id: issue, type: "ISSUE", moved_on: "2031-05-03", qty: "0.500", value: "1667" },
      { document_id: back, type: "RETURN", moved_on: "2031-05-04", qty: "0.500", value: "1667" },
      {
        document_id: writeOff,
        type: "WRITE_OFF",
        moved_on: "2031-05-01",
        qty: "2.000",
        value: "6666",
      },
    ]);
  });
});

describe("analytics_refresh, the rows of the Principal's page (build-plan 6.5a)", () => {
  type OrderRow = {
    status: string;
    progress: string;
    submitted_on: string;
    needed_by: string;
    category_id: string;
    department_id: string;
    owner_id: string;
  };
  async function orderRowOf(orderId: string) {
    const found = await db.execute<OrderRow>(sql`
      select status, progress, submitted_on::text as submitted_on, needed_by::text as needed_by,
             category_id, department_id, owner_id
      from analytics_orders where order_id = ${orderId}`);
    return found.rows;
  }

  it("writes each order that is not Draft with its status, progress, Tashkent first-submit day and needed-by; none for a Draft, a taken-back one included (plan of 6.5a, decided items 2 and 6)", async () => {
    const scene = await spendingScene();
    // 20:30 UTC is 01:30 on 2 May in Tashkent.
    const open = await decided(scene, "PURCHASING", [], {
      submittedAt: "2031-05-01T20:30:00Z",
      neededBy: "2031-05-20",
      progress: "DONE_SHORT",
    });
    const waiting = await decided(scene, "PENDING_PRINCIPAL", [], {
      submittedAt: "2031-05-03T05:00:00Z",
      neededBy: "2031-05-04",
    });
    const takenBack = await decided(scene, "PENDING_HEAD", [], {
      submittedAt: "2031-05-03T05:00:00Z",
    });
    await setOrderStatus(takenBack.id, "DRAFT");
    await refreshNow();
    expect(await orderRowOf(open.id)).toEqual([
      {
        status: "PURCHASING",
        progress: "DONE_SHORT",
        submitted_on: "2031-05-02",
        needed_by: "2031-05-20",
        category_id: scene.category.id,
        department_id: scene.department.id,
        owner_id: scene.manager.id,
      },
    ]);
    expect((await orderRowOf(waiting.id))[0]).toMatchObject({
      status: "PENDING_PRINCIPAL",
      progress: "OPEN",
      submitted_on: "2031-05-03",
      needed_by: "2031-05-04",
    });
    expect(await orderRowOf(takenBack.id)).toEqual([]);

    // The next run follows the order's status (10 point 5).
    await setOrderStatus(waiting.id, "PENDING_FINANCE");
    await refreshNow();
    expect((await orderRowOf(waiting.id))[0]).toMatchObject({ status: "PENDING_FINANCE" });
  });

  it("writes the decider of each decided stay, none on an open stay (plan of 6.5a, decided item 3)", async () => {
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    const order = await decided(scene, "PENDING_HEAD", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-01T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-05-01T06:00:00Z",
        actorId: head.id,
      },
      {
        type: "SEND_BACK",
        from: "PENDING_PRINCIPAL",
        to: "RETURNED",
        at: "2031-05-01T08:00:00Z",
        reason: "Narxni tekshiring",
        actorId: principal.id,
      },
      { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_HEAD", at: "2031-05-01T09:00:00Z" },
    ]);
    await refreshNow();
    const found = await db.execute<{ step: string; decided_by: string | null }>(sql`
      select step, decided_by from analytics_steps where order_id = ${order.id}
      order by entered_at`);
    expect(found.rows).toEqual([
      { step: "PENDING_HEAD", decided_by: head.id },
      { step: "PENDING_PRINCIPAL", decided_by: principal.id },
      { step: "PENDING_HEAD", decided_by: null },
    ]);
  });

  it("writes each order's first entry into Open and the whole seconds from its first submit; a send back for correction and a Reopen do not move it; none before Open (plan of 6.5b, decided item 1; review of the plan, Should fix 5)", async () => {
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    // The review's worked case: submitted 1.10 10:00 Tashkent, sent back, submitted again, Finance
    // approves 4.10 10:00 → 72 hours, counted on 4.10.
    const order = await decided(
      scene,
      "PURCHASING",
      [
        { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-01T05:00:00Z" },
        {
          type: "SEND_BACK",
          from: "PENDING_HEAD",
          to: "RETURNED",
          at: "2031-10-02T05:00:00Z",
          reason: "Miqdorni tekshiring",
        },
        { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_HEAD", at: "2031-10-03T05:00:00Z" },
        {
          type: "APPROVE",
          from: "PENDING_HEAD",
          to: "PENDING_PRINCIPAL",
          at: "2031-10-03T06:00:00Z",
        },
        {
          type: "APPROVE",
          from: "PENDING_PRINCIPAL",
          to: "PENDING_FINANCE",
          at: "2031-10-03T07:00:00Z",
        },
        {
          type: "APPROVE",
          from: "PENDING_FINANCE",
          to: "PURCHASING",
          at: "2031-10-04T05:00:00Z",
          actorId: finance.id,
        },
        // A write on the Open order that moves no status, then a send back from Settlement for
        // correction and a Reopen after Closed (06 Allowed moves).
        { type: "MOVE_OWNER", from: "PURCHASING", to: "PURCHASING", at: "2031-10-05T05:00:00Z" },
        {
          type: "SEND_TO_SETTLEMENT",
          from: "PURCHASING",
          to: "SETTLEMENT",
          at: "2031-10-06T05:00:00Z",
        },
        {
          type: "SEND_BACK_FOR_CORRECTION",
          from: "SETTLEMENT",
          to: "PURCHASING",
          at: "2031-10-07T05:00:00Z",
          actorId: finance.id,
        },
        {
          type: "SEND_TO_SETTLEMENT",
          from: "PURCHASING",
          to: "SETTLEMENT",
          at: "2031-10-08T05:00:00Z",
        },
        { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: "2031-10-09T05:00:00Z" },
        { type: "REOPEN", from: "CLOSED", to: "PURCHASING", at: "2031-10-10T05:00:00Z" },
      ],
      { submittedAt: "2031-10-01T05:00:00Z" },
    );
    const waiting = await decided(
      scene,
      "PENDING_FINANCE",
      [{ type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-01T05:00:00Z" }],
      { submittedAt: "2031-10-01T05:00:00Z" },
    );
    await refreshNow();
    const opened = (orderId: string) =>
      db.execute<{ opened_at: string | null; opened_on: string | null; seconds: string | null }>(
        sql`select to_json(opened_at)#>>'{}' as opened_at, opened_on::text as opened_on,
                   approval_seconds::text as seconds
            from analytics_orders where order_id = ${orderId}`,
      );
    expect((await opened(order.id)).rows).toEqual([
      { opened_at: "2031-10-04T05:00:00+00:00", opened_on: "2031-10-04", seconds: "259200" },
    ]);
    expect((await opened(waiting.id)).rows).toEqual([
      { opened_at: null, opened_on: null, seconds: null },
    ]);
  });
});

describe("analytics_refresh, the rows of Finance's page (build-plan 6.6a)", () => {
  type Money = { order_id: string; manager_id: string; kind: string; amount: string; on: string };
  const moneyOf = async (branchId: string) =>
    (
      await db.execute<Money>(sql`
        select order_id, manager_id, kind, amount::text as amount, occurred_on::text as on
        from analytics_money where branch_id = ${branchId} order by occurred_on, kind`)
    ).rows;
  type Need = { order_id: string; planned_cash: string; cash_handed: string; cash_needed: string };
  const needOf = async (orderId: string) =>
    (
      await db.execute<Need>(sql`
        select order_id, planned_cash::text as planned_cash, cash_handed::text as cash_handed,
               cash_needed::text as cash_needed
        from analytics_orders where order_id = ${orderId}`)
    ).rows[0];

  it("writes each Cash given, Cash returned and Paid back row of an action not cancelled on its action's date and Manager; no bank-transfer row (plan of 6.6a, decided item 2)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const order = await bought(scene, { purchasedOn: "2031-05-02" });
    await moneyOn(order, finance.id, { amount: 30_000n, occurredOn: "2031-05-03" });
    await moneyOn(order, finance.id, {
      kind: "PAID_BACK",
      amount: 5_000n,
      occurredOn: "2031-05-06",
    });
    await moneyOn(order, finance.id, {
      kind: "CASH_RETURNED",
      amount: 2_000n,
      occurredOn: "2031-05-07",
    });
    await moneyOn(order, finance.id, {
      amount: 99_000n,
      occurredOn: "2031-05-04",
      cancelled: true,
    });
    await moneyOn(order, finance.id, {
      kind: "BANK_TRANSFER",
      amount: 70_000n,
      occurredOn: "2031-05-05",
    });
    await refreshNow();
    const of = (kind: string, amount: string, on: string) => ({
      order_id: order.orderId,
      manager_id: scene.manager.id,
      kind,
      amount,
      on,
    });
    expect(await moneyOf(scene.branch.id)).toEqual([
      of("CASH_GIVEN", "30000", "2031-05-03"),
      of("PAID_BACK", "5000", "2031-05-06"),
      of("CASH_RETURNED", "2000", "2031-05-07"),
    ]);
    // The same rows hand 30 000 + 5 000 − 2 000 to the Manager: of 50 000 planned, 17 000 needed.
    expect(await needOf(order.orderId)).toEqual({
      order_id: order.orderId,
      planned_cash: "50000",
      cash_handed: "33000",
      cash_needed: "17000",
    });
  });

  it("writes each order's planned cash, cash handed and Cash needed soon by cashNeeded() (plan of 6.6a, decided items 4 and 5)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    const waiting = await decided(scene, "PENDING_PRINCIPAL", []);
    const transfer = await decided(scene, "PENDING_FINANCE", [], { paymentType: "TRANSFER" });
    const returned = await decided(scene, "RETURNED", []);
    const done = await decided(scene, "PURCHASING", [], { progress: "DONE" });
    await refreshNow();
    expect(await needOf(waiting.id)).toMatchObject({ planned_cash: "50000", cash_needed: "50000" });
    expect(await needOf(transfer.id)).toMatchObject({ planned_cash: "0", cash_needed: "0" });
    expect(await needOf(returned.id)).toMatchObject({ planned_cash: "50000", cash_needed: "0" });
    expect(await needOf(done.id)).toMatchObject({ planned_cash: "50000", cash_needed: "0" });
  });
});

describe("analytics_refresh, the rows of Finance's 6.6b blocks (build-plan 6.6b)", () => {
  it("writes has_receipt from the trip's receipt files, as the settlement screen's No receipt reads it (plan of 6.6b, decided item 4)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    const without = await bought(scene, { purchasedOn: "2031-05-02" });
    const withFile = await bought(scene, { purchasedOn: "2031-05-02", receipt: true });
    await refreshNow();
    const rows = await db.execute<{ purchase_id: string; has_receipt: boolean }>(sql`
      select purchase_id, has_receipt from analytics_spending where branch_id = ${scene.branch.id}`);
    expect(new Map(rows.rows.map((row) => [row.purchase_id, row.has_receipt]))).toEqual(
      new Map([
        [without.purchaseId, false],
        [withFile.purchaseId, true],
      ]),
    );
  });

  it("writes each settlement of settlementStays() with its first send, close, seconds and Tashkent close date; none for a close by exact match (plan of 6.6b, decided item 3)", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    const approved = {
      type: "APPROVE",
      from: "PENDING_FINANCE",
      to: "PURCHASING",
      at: "2031-05-01T05:00:00Z",
    } as const;
    const options = { submittedAt: "2031-04-30T05:00:00Z" };
    // Sent, sent back for correction, sent again, closed at 20:00 UTC (the next day in Tashkent);
    // reopened and settled a second time.
    const twice = await decided(
      scene,
      "CLOSED",
      [
        approved,
        {
          type: "SEND_TO_SETTLEMENT",
          from: "PURCHASING",
          to: "SETTLEMENT",
          at: "2031-05-02T05:00:00Z",
        },
        {
          type: "SEND_BACK_FOR_CORRECTION",
          from: "SETTLEMENT",
          to: "PURCHASING",
          at: "2031-05-03T05:00:00Z",
          reason: "Chek yo'q",
        },
        {
          type: "SEND_TO_SETTLEMENT",
          from: "PURCHASING",
          to: "SETTLEMENT",
          at: "2031-05-04T05:00:00Z",
        },
        { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: "2031-05-05T20:00:00Z" },
        {
          type: "REOPEN",
          from: "CLOSED",
          to: "PURCHASING",
          at: "2031-05-08T05:00:00Z",
          reason: "Xato topildi",
        },
        {
          type: "SEND_TO_SETTLEMENT",
          from: "PURCHASING",
          to: "SETTLEMENT",
          at: "2031-05-09T05:00:00Z",
        },
        { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: "2031-05-10T05:00:00Z" },
      ],
      options,
    );
    // Closed by exact match, never sent to settlement: no row.
    const exact = await decided(
      scene,
      "CLOSED",
      [
        approved,
        { type: "CLOSE_EXACT", from: "PURCHASING", to: "CLOSED", at: "2031-05-03T05:00:00Z" },
      ],
      options,
    );
    await refreshNow();
    const rows = await db.execute<{
      order_id: string;
      sent_at: string;
      closed_at: string;
      closed_on: string;
      seconds: string;
      category_id: string;
      department_id: string;
      owner_id: string;
    }>(sql`
      select order_id, to_json(sent_at)#>>'{}' as sent_at, to_json(closed_at)#>>'{}' as closed_at,
             closed_on::text as closed_on, seconds::text as seconds,
             category_id, department_id, owner_id
      from analytics_settlements where branch_id = ${scene.branch.id} order by closed_at`);
    expect(rows.rows).toEqual([
      {
        order_id: twice.id,
        sent_at: "2031-05-02T05:00:00+00:00",
        closed_at: "2031-05-05T20:00:00+00:00",
        closed_on: "2031-05-06",
        seconds: String(3 * 86_400 + 15 * 3_600),
        category_id: scene.category.id,
        department_id: scene.department.id,
        owner_id: scene.manager.id,
      },
      {
        order_id: twice.id,
        sent_at: "2031-05-09T05:00:00+00:00",
        closed_at: "2031-05-10T05:00:00+00:00",
        closed_on: "2031-05-10",
        seconds: "86400",
        category_id: scene.category.id,
        department_id: scene.department.id,
        owner_id: scene.manager.id,
      },
    ]);
    expect(rows.rows.some((row) => row.order_id === exact.id)).toBe(false);
  });
});

// 08 Numbers: an order without a planned price "has no planned total and no difference"; 10
// Analytics 5 (the refresh); plan of 2.5d-b, decided items 4 and 9 (Look first; review of the plan,
// correction 1: `planned_cash` empty, `cash_needed` 0; review of 2.5d-c at bad1f3f, finding 1:
// `cash_needed` empty while the order waits or its buying is Open).
describe("an order without a planned price (08 Numbers; plan of 2.5d-b)", () => {
  it("a finished and a closed unpriced order and an unpriced one waiting refresh without error: no outcome, planned cash empty, nothing needed; a priced one beside them has both", async () => {
    setClock("2031-05-10T05:00:00Z");
    const scene = await spendingScene();
    const done = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "4500",
      progress: "DONE",
      plannedPrice: null,
    });
    const closed = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "4500",
      progress: "DONE",
      plannedPrice: null,
    });
    const priced = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5200",
      progress: "DONE",
    });
    for (const order of [done, closed, priced]) {
      await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    }
    await setOrderStatus(closed.orderId, "CLOSED");
    const waiting = await insertOrder({
      branchId: scene.branch.id,
      ownerId: scene.manager.id,
      departmentId: scene.department.id,
      status: "PENDING_PRINCIPAL",
      plannedPrice: null,
    });

    await expect(refreshNow()).resolves.toBeUndefined();

    expect(await outcomeOf(done.orderId)).toBeNull();
    expect(await outcomeOf(closed.orderId)).toBeNull();
    expect(await outcomeOf(priced.orderId)).toMatchObject({ planned: "50000", colour: "red" });
    const cash = await db.execute<{
      order_id: string;
      planned_cash: string | null;
      cash_needed: string | null;
    }>(sql`
      select order_id, planned_cash::text as planned_cash, cash_needed::text as cash_needed
      from analytics_orders
      where order_id in (${done.orderId}, ${waiting.id}, ${priced.orderId})`);
    const byId = new Map(cash.rows.map((row) => [row.order_id, row]));
    expect(byId.get(done.orderId)).toMatchObject({ planned_cash: null, cash_needed: "0" });
    // Its need is not known: empty, so Cash needed soon leaves it out and counts it (review of
    // 2.5d-c at bad1f3f, finding 1, Look first).
    expect(byId.get(waiting.id)).toMatchObject({ planned_cash: null, cash_needed: null });
    expect(byId.get(priced.orderId)).toMatchObject({ planned_cash: "50000" });
  });
});
