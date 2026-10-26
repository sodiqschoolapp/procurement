import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ordersTotals } from "@/domain/order-totals";
import { authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { orderActions, orderEvents } from "@/server/db/schema";
import { createDocument } from "@/server/stock-documents";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct } from "../../../../tests/helpers/catalog";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertOrder, setOrderStatus } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_FILTERS } from "@/features/orders/list-filters";
import { countOrdersByStatus, listOrderGroups } from "@/features/orders/queries/order-list";
import { branchSpending } from "../spending";
import { getHeadHome } from "./head-home";

// The Head's home (build plan 6.2): 10-notifications-analytics-reports.md, Home page per role
// ("Waiting for my approval, by branch; overspends to acknowledge; write-offs and corrections to
// approve; product suggestions; orders stuck over 48 hours; counts by status per branch; spending
// this month per branch"); 11-screens-and-ux.md, Interface per role: Head; 08 Overspend guard;
// 06 rule 9; plan of 6.2, decided items 1, 4, 5 and 7. The tests of this file share one database
// and the Head sees every branch: each reads its own branches. Each counted row stands beside the
// rows the rules keep out (D40).

const AT = "2031-05-15T05:00:00Z";

async function scene() {
  const branch = await insertBranch();
  const head = await insertUser("HEAD");
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const product = await insertProduct({ referencePrice: 5_000n });
  const base = {
    branchId: branch.id,
    ownerId: manager.id,
    departmentId: department.id,
    variantId: product.defaultVariantId,
  };
  return { branch, head, manager, department, product, base };
}

type Base = Awaited<ReturnType<typeof scene>>["base"];

/** An Open order with one Cash record of `qty` × `unitPrice` on a trip of `purchasedOn`. */
async function bought(base: Base, qty: string, unitPrice: string, purchasedOn = "2031-05-02") {
  const order = await insertOrder({ ...base, status: "PURCHASING", approvedAt: new Date(AT) });
  const tripId = (await insertTrip(base.branchId, base.ownerId, undefined, purchasedOn)).rows[0]!
    .id;
  const purchase = await insertPurchaseRow({
    tripId,
    orderId: order.id,
    branchId: base.branchId,
    variantId: base.variantId,
    createdBy: base.ownerId,
    qty,
    unitPrice,
  });
  return { ...order, purchaseId: purchase.rows[0]!.id };
}

describe("waiting for my approval, by branch (10 Home page per role, Head)", () => {
  it("one line per branch with its count and planned total, and the group rows; a step one off stays out", async () => {
    setClock(AT);
    const first = await scene();
    const second = await scene();
    const a = await insertOrder({ ...first.base, status: "PENDING_HEAD", plannedQty: "2.000" });
    const b = await insertOrder({ ...first.base, status: "PENDING_HEAD", paymentType: "TRANSFER" });
    const c = await insertOrder({ ...second.base, status: "PENDING_HEAD" });
    // Kept out: Waiting for Principal in the same branch, with every other value the same.
    await insertOrder({ ...first.base, status: "PENDING_PRINCIPAL" });

    const home = await getHeadHome(first.head.id, null);
    const mine = home.waiting.lines.filter((line) =>
      [first.branch.id, second.branch.id].includes(line.branchId),
    );
    expect(mine).toEqual([
      ...[
        {
          branchId: first.branch.id,
          branchCode: first.branch.code,
          count: 2,
          totals: ordersTotals([
            { quantity: "2.000", price: 5000n, extras: [], paymentType: "CASH" },
            { quantity: "10.000", price: 5000n, extras: [], paymentType: "TRANSFER" },
          ]),
        },
        {
          branchId: second.branch.id,
          branchCode: second.branch.code,
          count: 1,
          totals: ordersTotals([
            { quantity: "10.000", price: 5000n, extras: [], paymentType: "CASH" },
          ]),
        },
      ].sort((x, y) => x.branchCode.localeCompare(y.branchCode)),
    ]);

    const chosen = await getHeadHome(first.head.id, first.branch.id);
    expect(chosen.waiting.lines.map((line) => line.branchId)).toEqual([first.branch.id]);
    expect(chosen.waiting.count).toBe(2);
    expect(
      chosen.waiting.groups.groups.flatMap((group) => group.orders.map((each) => each.id)).sort(),
    ).toEqual([a.id, b.id].sort());
    expect(
      home.waiting.groups.groups.flatMap((group) => group.orders.map((each) => each.id)),
    ).toContain(c.id);
  });
});

describe("overspends to acknowledge (08 Overspend guard; decisions 4.7 item 3; decided item 4, Look first)", () => {
  it("a Waiting for settlement order above the guard and not acknowledged is in; under the guard, acknowledged, or Open is out", async () => {
    setClock(AT);
    const { branch, head, base } = await scene();
    // Planned 50 000 (10 × 5 000). Actual 200 000: over 150 000, above 10 % and 100 000.
    const above = await bought(base, "1", "200000");
    await setOrderStatus(above.id, "SETTLEMENT");
    // Over 50 000 only: under the amount of the guard.
    const under = await bought(base, "1", "100000");
    await setOrderStatus(under.id, "SETTLEMENT");
    // Above the guard but acknowledged by a Head.
    const acknowledged = await bought(base, "1", "200000");
    await setOrderStatus(acknowledged.id, "SETTLEMENT");
    await db.execute(sql`
      insert into order_settlements (order_id, overspend_ack_by, overspend_ack_at,
        overspend_ack_comment, created_at)
      values (${acknowledged.id}, ${head.id}, ${AT}, 'Narx oshgan, tasdiqlandi', ${AT})`);
    // Above the guard but still Open: the acknowledgment waits for settlement (4.7 item 2).
    await bought(base, "1", "200000");

    const home = await getHeadHome(head.id, branch.id);
    expect(home.overspends).toEqual([
      {
        id: above.id,
        number: above.number,
        branchCode: branch.code,
        productName: expect.any(String),
        subtypeName: null,
        over: 150_000n,
        percent: "300.0",
      },
    ]);
  });
});

describe("write-offs to approve (progress 5.11 and 5.12, 'For 6.2'; decided item 7)", () => {
  it("lists the branch's write-offs waiting for the Head, newest first; a posted one and another branch's are out", async () => {
    setClock(AT);
    const { branch, head, manager, base } = await scene();
    const other = await scene();
    const ask = (branchId: string, createdBy: string, status: "PENDING_APPROVAL" | "POSTED") =>
      db.transaction((tx) =>
        createDocument(tx, {
          type: "WRITE_OFF",
          branchId,
          docDate: "2031-05-15",
          status,
          reason: "DAMAGED",
          comment: "Singan (sinov)",
          clientKey: randomUUID(),
          createdBy,
          decidedBy: status === "POSTED" ? head.id : null,
          lines: [{ variantId: base.variantId, qty: "1", unitCost: null }],
        }),
      );
    const older = await ask(branch.id, manager.id, "PENDING_APPROVAL");
    advanceClock({ minutes: 1 });
    const newer = await ask(branch.id, manager.id, "PENDING_APPROVAL");
    // Kept out: posted (stock to write off received first), and another branch's pending one.
    await receive(branch.id, base.variantId, "5", 5000n, head.id);
    await ask(branch.id, head.id, "POSTED");
    await ask(other.branch.id, other.manager.id, "PENDING_APPROVAL");

    const home = await getHeadHome(head.id, branch.id);
    expect(home.writeOffs.count).toBe(2);
    expect(home.writeOffs.lines.map((line) => line.id)).toEqual([
      newer.documentId,
      older.documentId,
    ]);
    expect(home.writeOffs.lines[0]).toMatchObject({
      number: newer.number,
      branchCode: branch.code,
      docDate: "2031-05-15",
      reason: "DAMAGED",
      askedBy: manager.fullName,
    });
    const all = await getHeadHome(head.id, null);
    expect(all.writeOffs.lines.map((line) => line.id)).toContain(newer.documentId);
  });
});

describe("corrections to approve: complete waiting counts (10 Home page per role, Head; plan of 7.4, decided items 1 and 11)", () => {
  it("lists a waiting count every line of which is counted; an incomplete, a decided and another branch's complete count are out", async () => {
    setClock(AT);
    const { branch, head, manager, base } = await scene();
    const other = await scene();
    const second = await insertProduct({ referencePrice: 1_000n });
    const count = (
      branchId: string,
      createdBy: string,
      variantId: string,
      counted: [string | null, string | null],
      status: "PENDING_APPROVAL" | "REJECTED" = "PENDING_APPROVAL",
    ) =>
      db.transaction(async (tx) => {
        const made = await createDocument(tx, {
          type: "COUNT",
          branchId,
          docDate: "2031-05-15",
          status: "PENDING_APPROVAL",
          clientKey: randomUUID(),
          createdBy,
          lines: [
            { variantId, qty: "1", countedQty: counted[0] },
            { variantId: second.defaultVariantId, qty: "2", countedQty: counted[1] },
          ],
        });
        if (status !== "PENDING_APPROVAL") {
          await tx.execute(sql`update stock_documents set status = ${status},
            decided_by = ${head.id}, decided_at = ${AT}, decision_reason = 'Sinov sababi'
            where id = ${made.documentId}`);
        }
        return made;
      });
    const complete = await count(branch.id, manager.id, base.variantId, ["1", "0"]);
    // Kept out, each with every other value that would let it in (D40): one line not counted;
    // complete but decided; complete in another branch.
    await count(branch.id, manager.id, base.variantId, ["1", null]);
    await count(branch.id, manager.id, base.variantId, ["1", "0"], "REJECTED");
    const elsewhere = await count(other.branch.id, other.manager.id, base.variantId, ["1", "0"]);

    const home = await getHeadHome(head.id, branch.id);
    expect(home.writeOffs.count).toBe(1);
    expect(home.writeOffs.lines).toEqual([
      expect.objectContaining({
        id: complete.documentId,
        number: complete.number,
        type: "COUNT",
        branchCode: branch.code,
        reason: null,
        askedBy: manager.fullName,
      }),
    ]);
    const all = await getHeadHome(head.id, null);
    expect(all.writeOffs.lines.map((line) => line.id)).toContain(elsewhere.documentId);
  });
});

/** The event that moved an order into its status, at the clock's moment. */
async function enter(
  orderId: string,
  actorId: string,
  type: (typeof orderEvents.$inferInsert)["type"],
  fromStatus: (typeof orderEvents.$inferInsert)["fromStatus"],
  toStatus: (typeof orderEvents.$inferInsert)["toStatus"],
) {
  const [action] = await db
    .insert(orderActions)
    .values({ clientKey: randomUUID(), type, actorId, orderCount: 1, createdAt: now() })
    .returning({ id: orderActions.id });
  await db.insert(orderEvents).values({
    orderId,
    actionId: action!.id,
    type,
    fromStatus,
    toStatus,
    actorId,
    createdAt: now(),
  });
}

describe("orders stuck over 48 hours (06 rule 9; decided items 1 and 2, Look first)", () => {
  it("is the list's stuck=1 filter: the count and the group rows equal listOrderGroups()' for it", async () => {
    setClock(AT);
    const { branch, head, manager, base } = await scene();
    const stuck = await insertOrder({ ...base, status: "PENDING_PRINCIPAL" });
    const fresh = await insertOrder({ ...base, status: "PENDING_HEAD" });
    await enter(stuck.id, manager.id, "APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL");
    advanceClock({ hours: 47 });
    await enter(fresh.id, manager.id, "SUBMIT", "DRAFT", "PENDING_HEAD");
    advanceClock({ hours: 1, minutes: 1 });
    const home = await getHeadHome(head.id, branch.id);
    const expected = await listOrderGroups(head.id, {
      ...NO_FILTERS,
      branch: branch.id,
      stuck: true,
    });
    expect(home.stuck).toEqual(expected);
    expect(home.stuck.groups.flatMap((group) => group.orders.map((each) => each.id))).toEqual([
      stuck.id,
    ]);
  });
});

describe("counts by status and spending this month, per branch (10 Home page per role, Head; decided item 5)", () => {
  it("each branch's counts equal countOrdersByStatus() and its spending branchSpending(); an inactive branch is listed and marked", async () => {
    setClock(AT);
    const { branch, head, base } = await scene();
    await insertOrder({ ...base, status: "PENDING_HEAD" });
    await insertOrder({ ...base, status: "RETURNED" });
    await insertOrder({ ...base, status: "DRAFT" });
    await bought(base, "2", "30000");
    // Kept out of spending: a cancelled record of this month and a record of last month.
    const cancelled = await bought(base, "1", "70000");
    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${base.ownerId}, cancelled_at = ${AT} where id = ${cancelled.purchaseId}`);
    await bought(base, "1", "40000", "2031-04-30");
    // An inactive branch with a Closed order this month.
    const closed = await scene();
    await insertOrder({ ...closed.base, status: "CLOSED", closedAt: new Date(AT) });
    await db.execute(sql`update branches set is_active = false where id = ${closed.branch.id}`);

    const home = await getHeadHome(head.id, null);
    const figures = home.branches.find((each) => each.branchId === branch.id)!;
    expect(figures.byStatus).toEqual(
      await countOrdersByStatus(head.id, { ...NO_FILTERS, branch: branch.id }),
    );
    expect(figures.byStatus.map((row) => row.status)).toEqual([
      "PENDING_HEAD",
      "RETURNED",
      "PURCHASING",
    ]);
    const actor = await authorizeList(head.id, "data.view");
    expect(figures.spending).toBe(60_000n);
    expect(figures.spending).toBe(await branchSpending(db, actor, branch.id, home.month));
    expect(home.month).toEqual({ first: "2031-05-01", last: "2031-05-31" });
    const inactive = home.branches.find((each) => each.branchId === closed.branch.id)!;
    expect(inactive.isActive).toBe(false);
    expect(inactive.byStatus).toEqual([{ status: "CLOSED", count: 1 }]);

    // A chosen branch narrows the per-branch lists to that branch.
    const chosen = await getHeadHome(head.id, branch.id);
    expect(chosen.branches.map((each) => each.branchId)).toEqual([branch.id]);
  });
});

// 10 Home page per role ("Waiting for my approval, by branch"); 08 Numbers: an order without a
// planned price is left out of planned sums, which say how many; plan of 2.5d-b.
describe("an order without a planned price on the Head's home (08 Numbers; plan of 2.5d-b)", () => {
  it("the branch's waiting line shows the priced total and 1 without a price", async () => {
    setClock(AT);
    const { branch, head, base } = await scene();
    await insertOrder({ ...base, status: "PENDING_HEAD", plannedPrice: 4_500n });
    await insertOrder({ ...base, status: "PENDING_HEAD", plannedPrice: null });
    const home = await getHeadHome(head.id, branch.id);
    expect(home.waiting.lines).toHaveLength(1);
    expect(home.waiting.lines[0]).toMatchObject({
      count: 2,
      totals: { grand: 45_000n, unpriced: 1 },
    });
  });
});
