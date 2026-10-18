import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { cancelPurchase } from "@/features/purchasing/actions/cancel-purchase";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { orders, purchases } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { issueStock } from "./issue";

// The acceptance scenarios of an issue (build plan 5.4, Done when: "S4 in full, S11 … as
// tests"). 15-quality-and-acceptance.md: S4 "In parts. Monday 60 notebooks; 10 issued to a
// department; Friday 40 more. Stock 60, then 50, then 90. The order stays Open until Friday."
// S11 "Blocked cancel. Manager records 100, issues 30, then tries to cancel the purchase record.
// Blocked with the explanation. Stock stays 70." The plan is section 8's: 100 notebooks × 5 000.
// Every step runs the real action; every fixture is asserted (D38).

const MONDAY = "2031-05-05";
const FRIDAY = "2031-05-09";

async function scene() {
  setClock(`${MONDAY}T07:00:00Z`);
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id, { responsibleName: "Sinov Mas'ul" });
  const item = await insertItem();
  const order = await insertOrder({
    branchId: branch.id,
    ownerId: manager.id,
    status: "PURCHASING",
    variantId: item.variantId,
    departmentId: department.id,
    plannedQty: "100",
    plannedPrice: 5_000n,
    paymentType: "CASH",
    approvedAt: new Date("2031-05-01T07:00:00Z"),
  });
  return { branch, manager, department, order };
}

type Scene = Awaited<ReturnType<typeof scene>>;

async function versionOf(orderId: string) {
  const [row] = await db
    .select({ version: orders.version, progress: orders.progress, status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row!;
}

async function buy(s: Scene, qty: string, day: string) {
  const result = await runOrdersAction(recordPurchase, s.manager.id, {
    clientKey: randomUUID(),
    orders: [{ id: s.order.id, version: (await versionOf(s.order.id)).version }],
    purchasedOn: day,
    paymentType: "CASH",
    supplierId: null,
    receiptFileIds: [],
    lines: [
      {
        orderId: s.order.id,
        variantId: s.order.variantId,
        qty,
        unitPrice: "5000",
        extras: [],
        comment: qty === "100" ? null : "Sinov: qismlarda",
      },
    ],
  });
  expect(result.ok).toBe(true);
}

async function issue(s: Scene, qty: string, day: string) {
  const result = await runAction(issueStock, s.manager.id, {
    clientKey: randomUUID(),
    branchId: s.branch.id,
    docDate: day,
    departmentId: s.department.id,
    receivedByName: "Sinov Mas'ul",
    comment: null,
    lines: [{ variantId: s.order.variantId, qty }],
  });
  expect(result.ok).toBe(true);
}

async function stockOf(s: Scene) {
  const found = await db.execute<{ qty: string }>(sql`
    select qty::text as qty from stock_balances
    where branch_id = ${s.branch.id} and variant_id = ${s.order.variantId}`);
  return found.rows[0]!.qty;
}

describe("15 S4, in parts, in full", () => {
  it("Monday 60, 10 issued, Friday 40: stock 60, then 50, then 90; the order stays Open until Friday", async () => {
    const s = await scene();
    await buy(s, "60", MONDAY);
    expect(await stockOf(s)).toBe("60.000");
    expect(await versionOf(s.order.id)).toMatchObject({ status: "PURCHASING", progress: "OPEN" });

    await issue(s, "10", MONDAY);
    expect(await stockOf(s)).toBe("50.000");
    expect(await versionOf(s.order.id)).toMatchObject({ status: "PURCHASING", progress: "OPEN" });

    setClock(`${FRIDAY}T07:00:00Z`);
    await buy(s, "40", FRIDAY);
    expect(await stockOf(s)).toBe("90.000");
    // 07 Order progress: Done once the planned quantity is received.
    expect(await versionOf(s.order.id)).toMatchObject({ status: "PURCHASING", progress: "DONE" });
  });
});

describe("15 S11, blocked cancel", () => {
  it("records 100, issues 30, then the cancel of the record is refused with the explanation; stock stays 70", async () => {
    const s = await scene();
    await buy(s, "100", MONDAY);
    await issue(s, "30", MONDAY);
    expect(await stockOf(s)).toBe("70.000");

    const [record] = await db.select().from(purchases).where(eq(purchases.orderId, s.order.id));
    const result = await runOrdersAction(cancelPurchase, s.manager.id, {
      clientKey: randomUUID(),
      orders: [{ id: s.order.id, version: (await versionOf(s.order.id)).version }],
      purchaseId: record!.id,
      reason: "Sinov: noto'g'ri yozilgan",
    });
    // 07 Fixing a mistake 2; the refusal of 3.7: the order is `not_ready` with the stock message,
    // which names the two ways out.
    expect(result).toEqual({
      ok: false,
      error: {
        code: "not_ready",
        messageKey: "errors.notReady",
        orders: [
          { orderId: s.order.id, code: "not_ready", fields: { stock: "errors.field.stockShort" } },
        ],
      },
    });
    expect(await stockOf(s)).toBe("70.000");
    const [kept] = await db.select().from(purchases).where(eq(purchases.id, record!.id));
    expect(kept!.isCancelled).toBe(false);
  });
});
