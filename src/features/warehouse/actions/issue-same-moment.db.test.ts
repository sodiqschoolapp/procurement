import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import { runOrdersAction } from "@/server/order-action";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { issueStock } from "./issue";

// Issues at the same moment (build plan 5.4, Done when: "the second half of S8 as tests").
// 15-quality-and-acceptance.md S8: "two Managers issue the last 5 notebooks together. One success
// each. The other gets a clear message. Stock never below 0"; edge-cases/warehouse.md ("Two
// Managers issue the last items at the same moment: One succeeds. The other sees how many are
// left"); 15 Test layers ("Actions run two at a time to prove the locks work"); plan of 5.4,
// decided item 15 (Look first) and the plan review's correction 1: one lock order with Record
// purchase. Both sides are the real actions, started in a fixed order while a third transaction
// holds the row the first waits on (.claude/rules/tests.md); the waits are read from
// pg_stat_activity, never timed.

const DAY = "2031-05-05";

/**
 * Holds `lock` in a transaction of its own; starts each action only once every earlier one waits
 * on a lock, then commits the hold and returns every outcome in order.
 */
async function heldWhile(
  lock: string,
  values: unknown[],
  actions: ReadonlyArray<() => Promise<ActionResult<unknown>>>,
): Promise<ActionResult<unknown>[]> {
  const client = await db.$client.connect();
  const waiting = async (count: number) => {
    for (let tries = 0; ; tries += 1) {
      await client.query("select pg_stat_clear_snapshot()");
      const found = await client.query<{ n: number }>(
        `select count(*)::int as n from pg_stat_activity
         where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
      );
      if (found.rows[0]!.n >= count) return;
      if (tries > 5_000) throw new Error(`heldWhile: only ${found.rows[0]!.n} of ${count} waited.`);
    }
  };
  try {
    await client.query("begin");
    await client.query(lock, values);
    const running: Promise<ActionResult<unknown>>[] = [];
    for (const [at, action] of actions.entries()) {
      const started = action();
      started.catch(() => undefined);
      running.push(started);
      await waiting(at + 1);
    }
    await client.query("commit");
    return await Promise.all(running);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function scene() {
  setClock(`${DAY}T07:00:00Z`);
  const branch = await insertBranch();
  const first = await insertUser("MANAGER", { branches: [branch.id] });
  const second = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id, { responsibleName: "Sinov Mas'ul" });
  return { branch, first, second, department };
}

type Scene = Awaited<ReturnType<typeof scene>>;

async function stock(s: Scene, variantId: string, qty: string) {
  const posted = await db.transaction((tx) =>
    postMovement(tx, {
      branchId: s.branch.id,
      variantId,
      type: "RECEIPT",
      qtyDelta: qty,
      unitCost: 5_000n,
      createdBy: s.first.id,
    }),
  );
  expect(Number(posted.qty)).toBe(Number(qty));
}

function issue(s: Scene, userId: string, variantId: string, qty: string) {
  return () =>
    runAction(issueStock, userId, {
      clientKey: randomUUID(),
      branchId: s.branch.id,
      docDate: DAY,
      departmentId: s.department.id,
      receivedByName: "Sinov Mas'ul",
      comment: null,
      lines: [{ variantId, qty }],
    });
}

async function balanceOf(s: Scene, variantId: string) {
  const found = await db.execute<{ qty: string }>(sql`
    select qty::text as qty from stock_balances
    where branch_id = ${s.branch.id} and variant_id = ${variantId}`);
  return found.rows[0]!.qty;
}

async function openOrder(s: Scene, variantId: string) {
  return insertOrder({
    branchId: s.branch.id,
    ownerId: s.second.id,
    status: "PURCHASING",
    variantId,
    departmentId: s.department.id,
    plannedQty: "5",
    plannedPrice: 5_000n,
    paymentType: "CASH",
    approvedAt: new Date("2031-05-01T07:00:00Z"),
  });
}

function tickedPurchase(s: Scene, order: Awaited<ReturnType<typeof openOrder>>) {
  return () =>
    runOrdersAction(recordPurchase, s.second.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      purchasedOn: DAY,
      paymentType: "CASH",
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: order.id,
          variantId: order.variantId,
          qty: "5",
          unitPrice: "5000",
          extras: [],
          comment: null,
          giveToRequester: true,
        },
      ],
    });
}

describe("15 S8, second half: two Managers issue the last 5 notebooks together", () => {
  it("one succeeds, the other is refused on that line with 0 left; stock 0, never below", async () => {
    const s = await scene();
    const notebook = (await insertItem()).variantId;
    await stock(s, notebook, "5");

    const [first, second] = await heldWhile(
      "select 1 from stock_balances where branch_id = $1 and variant_id = $2 for update",
      [s.branch.id, notebook],
      [issue(s, s.first.id, notebook, "5"), issue(s, s.second.id, notebook, "5")],
    );
    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { "lines.0.qty": "errors.field.stockShort" },
        available: { "lines.0.qty": "0" },
      },
    });
    expect(await balanceOf(s, notebook)).toBe("0.000");
    const issued = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from stock_documents where branch_id = ${s.branch.id}`,
    );
    expect(issued.rows[0]!.n).toBe(1);
  });
});

describe("one lock order with Record purchase (plan of 5.4, decided item 15, Look first)", () => {
  it("an issue of a subtype beside a ticked purchase of the same subtype: both succeed, no deadlock", async () => {
    const s = await scene();
    const notebook = (await insertItem()).variantId;
    await stock(s, notebook, "5");
    const order = await openOrder(s, notebook);

    // The purchase waits on the held subtype first (FOR UPDATE), the issue behind it (FOR SHARE).
    const [bought, issued] = await heldWhile(
      "select 1 from product_variants where id = $1 for update",
      [notebook],
      [tickedPurchase(s, order), issue(s, s.first.id, notebook, "5")],
    );
    expect(bought).toMatchObject({ ok: true });
    expect(issued).toMatchObject({ ok: true });
    // 5 in stock + 5 bought − 5 given straight − 5 issued.
    expect(await balanceOf(s, notebook)).toBe("0.000");
  });

  it("an issue of one subtype beside a ticked purchase of another: the issue holds the ISS number, the purchase waits for it; both succeed", async () => {
    const s = await scene();
    const notebook = (await insertItem()).variantId;
    const pen = (await insertItem()).variantId;
    await stock(s, notebook, "5");
    // The branch's ISS counter exists, so it is a row both meet.
    expect(await issue(s, s.first.id, notebook, "1")()).toMatchObject({ ok: true });
    const order = await openOrder(s, pen);

    const [issued, bought] = await heldWhile(
      "select 1 from number_counters where scope = 'ISS' and branch_id = $1 for update",
      [s.branch.id],
      [issue(s, s.first.id, notebook, "4"), tickedPurchase(s, order)],
    );
    expect(issued).toMatchObject({ ok: true });
    expect(bought).toMatchObject({ ok: true });
    expect(await balanceOf(s, notebook)).toBe("0.000");
    expect(await balanceOf(s, pen)).toBe("0.000");
  });
});
