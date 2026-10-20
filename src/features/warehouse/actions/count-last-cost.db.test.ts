import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { stockMismatch } from "@/domain/stock-check";
import type { MovementType } from "@/domain/stock";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { runOrdersAction } from "@/server/order-action";
import { postMovement } from "@/server/stock-ledger";

import { cancelPurchase } from "../../purchasing/actions/cancel-purchase";
import { recordPurchase } from "../../purchasing/actions/record-purchase";
import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder, orderRow } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { saveCountedQuantities, startCount } from "./count";
import { decideCount } from "./count-decision";

// A count correction that adds stock to a quantity of 0 (build plan 7.4b, item 2, Done when: "20
// found by a count at 0 enter at the last average (3 000), and a later purchase of 100 at 3 000
// keeps the average at 3 000"). Spec: 09-warehouse.md, Stock value: "A count correction that adds
// stock to a quantity of 0 comes in at the subtype's last cost in that branch, the average it had
// before its stock last reached 0; at 0 only when it never had a cost"; plan of 7.4b, decided items
// 1 and 2 (Look first). Every item carries a reference price of 7 000 so'm and a last price other
// than its last average where the case allows, so a wrong reading of "last cost" fails (D40).
// Every fixture is asserted (D38).

const STARTED = "2031-05-03T06:00:00Z";
const DECIDED = "2031-05-04T09:30:00Z";

let branch: { id: string; code: string };
let manager: { id: string };
let head: { id: string };

beforeEach(async () => {
  setClock(STARTED);
  branch = await insertBranch();
  manager = await insertUser("MANAGER", { branches: [branch.id] });
  head = await insertUser("HEAD");
});

async function item() {
  return insertItem({ referencePrice: 7000n });
}

async function balanceOf(variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branch.id} and variant_id = ${variantId}`);
  return found.rows[0];
}

/** The movements of the item in the branch, in `seq` order. */
async function movementsOf(variantId: string) {
  const found = await db.execute<{ type: MovementType; qty_delta: string; unit_cost: string }>(sql`
    select type, qty_delta::text as qty_delta, unit_cost::text as unit_cost from stock_movements
    where branch_id = ${branch.id} and variant_id = ${variantId} order by seq`);
  return found.rows;
}

/** The nightly check's verdict on the item (14 Notes for the build; ./stock-check.ts). */
async function checked(variantId: string) {
  const balance = (await balanceOf(variantId))!;
  return stockMismatch(
    (await movementsOf(variantId)).map((row) => ({
      type: row.type,
      qtyDelta: row.qty_delta,
      unitCost: BigInt(row.unit_cost),
    })),
    { qty: balance.qty, avgCost: BigInt(balance.avg_cost) },
  );
}

async function issue(variantId: string, qty: string) {
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId: branch.id,
      variantId,
      type: "ISSUE",
      qtyDelta: `-${qty}`,
      unitCost: null,
      createdBy: manager.id,
    }),
  );
}

/** The Manager counts the whole branch, finds `found` of the item, and the Head approves. */
async function countAndApprove(variantId: string, found: string) {
  setClock(STARTED);
  const started = await runAction(startCount, manager.id, {
    clientKey: randomUUID(),
    branchId: branch.id,
    categoryId: null,
    comment: null,
  });
  if (!started.ok) throw new Error(`fixture: ${started.error.code}`);
  const lines = await db.execute<{ id: string; variant_id: string; qty: string }>(sql`
    select id, variant_id, qty::text as qty from stock_document_lines
    where document_id = ${started.data.documentId}`);
  const line = lines.rows.find((row) => row.variant_id === variantId)!;
  expect(line.qty).toBe("0.000");
  const saved = await runAction(saveCountedQuantities, manager.id, {
    documentId: started.data.documentId,
    lines: [{ lineId: line.id, countedQty: found }],
  });
  if (!saved.ok) throw new Error(`fixture: ${saved.error.code}`);
  setClock(DECIDED);
  const approved = await runAction(decideCount, head.id, {
    documentId: started.data.documentId,
    outcome: "APPROVE",
    seen: [{ lineId: line.id, countedQty: found }],
  });
  expect(approved).toMatchObject({ ok: true, data: { outcome: "APPROVE", recount: 0 } });
  const correction = await db.execute<{ unit_cost: string; qty_delta: string }>(sql`
    select m.unit_cost::text as unit_cost, m.qty_delta::text as qty_delta
    from stock_movements m where m.document_line_id = ${line.id}`);
  expect(correction.rows).toHaveLength(1);
  return correction.rows[0]!;
}

describe("a count correction into a stock of 0 comes in at the last cost (09 Stock value; plan of 7.4b, decided items 1 and 2)", () => {
  it("the Done-when case: 40 at 3 000 issued to 0, 20 found enter at 3 000; 100 bought at 3 000 keep 3 000", async () => {
    const { variantId } = await item();
    await receive(branch.id, variantId, "40", 3000n, manager.id);
    await issue(variantId, "40");
    expect(await balanceOf(variantId)).toEqual({ qty: "0.000", avg_cost: "0" });

    expect(await countAndApprove(variantId, "20")).toEqual({
      unit_cost: "3000",
      qty_delta: "20.000",
    });
    expect(await balanceOf(variantId)).toEqual({ qty: "20.000", avg_cost: "3000" });
    expect(await checked(variantId)).toBeNull();

    await receive(branch.id, variantId, "100", 3000n, manager.id);
    expect(await balanceOf(variantId)).toEqual({ qty: "120.000", avg_cost: "3000" });
    expect(await checked(variantId)).toBeNull();
  });

  it("the last average, not the last price: 40 at 3 000 and 40 at 5 000 (4 000) issued to 0, 20 found enter at 4 000", async () => {
    const { variantId } = await item();
    await receive(branch.id, variantId, "40", 3000n, manager.id);
    await receive(branch.id, variantId, "40", 5000n, manager.id);
    await issue(variantId, "80");

    expect((await countAndApprove(variantId, "20")).unit_cost).toBe("4000");
    expect(await balanceOf(variantId)).toEqual({ qty: "20.000", avg_cost: "4000" });
    expect(await checked(variantId)).toBeNull();
  });

  it("an item that never had a cost in the branch enters at 0, its reference price unused", async () => {
    const { variantId } = await item();
    // A balance row at 0 that no movement made, as a minimum makes one (plan of 5.10).
    await db.execute(sql`
      insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
      values (${branch.id}, ${variantId}, 0, 0, ${STARTED}, ${STARTED})`);

    expect((await countAndApprove(variantId, "5")).unit_cost).toBe("0");
    expect(await balanceOf(variantId)).toEqual({ qty: "5.000", avg_cost: "0" });
  });

  it("a stock emptied by a cancelled purchase record: 40 bought at 3 000 and cancelled, 20 found enter at 3 000 (review of the plan, correction 2)", async () => {
    const { variantId } = await item();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
      variantId,
      plannedQty: "40",
      plannedPrice: 3_000n,
      paymentType: "CARD",
      submittedAt: new Date("2031-05-01T07:00:00Z"),
      approvedAt: new Date("2031-05-02T07:00:00Z"),
    });
    const bought = await runOrdersAction(recordPurchase, manager.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: (await orderRow(order.id))!.version }],
      purchasedOn: "2031-05-03",
      paymentType: "CARD",
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: order.id,
          variantId,
          qty: "40",
          unitPrice: "3000",
          extras: [],
          comment: null,
        },
      ],
    });
    expect(bought.ok).toBe(true);
    const record = await db.execute<{ id: string }>(sql`
      select id from purchases where order_id = ${order.id}`);
    const cancelled = await runOrdersAction(cancelPurchase, manager.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: (await orderRow(order.id))!.version }],
      purchaseId: record.rows[0]!.id,
      reason: "Typed the wrong quantity",
    });
    expect(cancelled.ok).toBe(true);
    expect((await movementsOf(variantId)).map((row) => row.type)).toEqual([
      "RECEIPT",
      "REVERSAL",
    ]);
    expect(await balanceOf(variantId)).toEqual({ qty: "0.000", avg_cost: "0" });

    expect((await countAndApprove(variantId, "20")).unit_cost).toBe("3000");
    expect(await balanceOf(variantId)).toEqual({ qty: "20.000", avg_cost: "3000" });
    expect(await checked(variantId)).toBeNull();
  });
});
