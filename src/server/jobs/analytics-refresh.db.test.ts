import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { actualGoods, actualTotal } from "@/domain/purchases";
import { db } from "@/server/db/client";
import { recordsWhere } from "@/features/purchasing/order-records";

import {
  bought,
  buyingEvent,
  decided,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../tests/helpers/analytics";
import { refusalOf } from "../../../tests/helpers/database-error";
import { setClock } from "../../../tests/helpers/clock";
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
    status: string;
  };
  async function stepsOf(orderId: string) {
    const found = await db.execute<StepRow>(sql`
      select step, entered_at, left_at, left_on::text as left_on, seconds::text as seconds,
             decision, reason, reason_key, status
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
    expect(rows.map(({ entered_at, left_at, ...rest }) => rest)).toEqual([
      {
        step: "PENDING_HEAD",
        left_on: "2031-05-02",
        seconds: "12600",
        decision: "SEND_BACK",
        reason: "  Narxni   TEKSHIRING ",
        reason_key: "narxni tekshiring",
        status: "PENDING_HEAD",
      },
      {
        step: "PENDING_HEAD",
        left_on: null,
        seconds: null,
        decision: null,
        reason: null,
        reason_key: null,
        status: "PENDING_HEAD",
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
