import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { notifications, purchaseTrips, purchases } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder, orderRow } from "../../../../tests/helpers/orders";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { cancelPurchase, cancelTrip } from "./cancel-purchase";
import { recordPurchase } from "./record-purchase";

// The PRICE_DIFFERS notice, build plan 3.10: 10-notifications-analytics-reports.md, Notifications
// ("Recent purchases differ from the reference price by more than 20%" → Head); 04-catalogs.md
// rule 4; Decided ahead 2 (open question 8); plan of 3.10, decided items 8 and 9 (Look first):
// sent once when a purchase action makes a prompt appear, to every active Head but the actor,
// one per action with the count of the subtypes newly prompting. Every trip and cancel is the real
// action, so the records are the ones 3.3 writes.

const TODAY = "2031-05-10";

async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  // Told of nothing: another Manager of the branch, its Principal, a Finance user (10).
  const others = [
    await insertUser("MANAGER", { branches: [branch.id] }),
    await insertUser("PRINCIPAL", { branches: [branch.id] }),
    await insertUser("FINANCE", { branches: [branch.id] }),
  ];
  return { branch, owner, head, others };
}

type Scene = Awaited<ReturnType<typeof scene>>;

/** An Open order of the owner, approved on 5 May 2031. */
function openOrder(s: Scene, variantId: string) {
  return insertOrder({
    branchId: s.branch.id,
    ownerId: s.owner.id,
    status: "PURCHASING",
    variantId,
    plannedQty: "10",
    plannedPrice: 10_000n,
    paymentType: "CARD",
    approvedAt: new Date("2031-05-05T07:00:00Z"),
  });
}

type Order = Awaited<ReturnType<typeof openOrder>>;

/** One trip of the given orders, dated `on`, by the real action. */
async function trip(
  s: Scene,
  on: string,
  lines: readonly { order: Order; unitPrice: string }[],
  by: InsertedUser = s.owner,
) {
  const clientKey = randomUUID();
  const result = await runOrdersAction(recordPurchase, by.id, {
    clientKey,
    orders: await Promise.all(
      lines.map(async ({ order }) => ({
        id: order.id,
        version: (await orderRow(order.id))!.version,
      })),
    ),
    purchasedOn: on,
    paymentType: "CARD",
    supplierId: null,
    receiptFileIds: [],
    lines: lines.map(({ order, unitPrice }) => ({
      orderId: order.id,
      variantId: order.variantId,
      qty: "1",
      unitPrice,
      extras: [],
      comment: "Bought as the shop had it",
    })),
  });
  return { result, clientKey };
}

/** One trip that must succeed (D38). */
async function bought(s: Scene, on: string, order: Order, unitPrice: string) {
  const { result, clientKey } = await trip(s, on, [{ order, unitPrice }]);
  expect(result.ok).toBe(true);
  const [record] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .innerJoin(purchaseTrips, eq(purchaseTrips.id, purchases.tripId))
    .where(eq(purchaseTrips.clientKey, clientKey));
  return record!.id;
}

/** The PRICE_DIFFERS rows of these users. */
function told(users: readonly InsertedUser[]) {
  return db
    .select({
      userId: notifications.userId,
      params: notifications.params,
      link: notifications.link,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, "PRICE_DIFFERS"),
        inArray(
          notifications.userId,
          users.map((user) => user.id),
        ),
      ),
    );
}

describe("recordPurchase sends PRICE_DIFFERS when a trip makes a prompt appear (10; decided item 8)", () => {
  it("the trip that makes the second record past 20% tells each Head once; nobody else", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, "2031-05-06", await openOrder(s, item.variantId), "13000");
    // One record is no prompt (Decided ahead 2: at least 2).
    expect(await told([s.head])).toEqual([]);

    await bought(s, "2031-05-07", await openOrder(s, item.variantId), "13000");

    expect(await told([s.head])).toEqual([
      { userId: s.head.id, params: { count: 1, branch: s.branch.code }, link: "/prices" },
    ]);
    expect(await told([s.owner, ...s.others])).toEqual([]);
  });

  it("a next trip while the prompt stands tells nobody again", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, "2031-05-06", await openOrder(s, item.variantId), "13000");
    await bought(s, "2031-05-07", await openOrder(s, item.variantId), "13000");
    await bought(s, "2031-05-08", await openOrder(s, item.variantId), "14000");

    expect(await told([s.head])).toHaveLength(1);
  });

  it("a trip of a subtype already prompting and a new one counts only the new one", async () => {
    const s = await scene();
    const standing = await insertItem({ referencePrice: 10_000n });
    const fresh = await insertItem({ referencePrice: 10_000n });
    await bought(s, "2031-05-06", await openOrder(s, standing.variantId), "13000");
    await bought(s, "2031-05-06", await openOrder(s, fresh.variantId), "7000");
    await bought(s, "2031-05-07", await openOrder(s, standing.variantId), "13000");
    expect(await told([s.head])).toHaveLength(1);

    const { result } = await trip(s, "2031-05-08", [
      { order: await openOrder(s, standing.variantId), unitPrice: "13000" },
      { order: await openOrder(s, fresh.variantId), unitPrice: "7000" },
    ]);
    expect(result.ok).toBe(true);

    const rows = await told([s.head]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.params)).toContainEqual({ count: 1, branch: s.branch.code });
  });

  it("a trip that makes no prompt tells nobody", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, "2031-05-06", await openOrder(s, item.variantId), "12000");
    await bought(s, "2031-05-07", await openOrder(s, item.variantId), "12000");

    // Exactly +20% is not more than 20%.
    expect(await told([s.head])).toEqual([]);
  });

  it("a Head who records the trip is not told; another Head is (decided item 9)", async () => {
    const s = await scene();
    const otherHead = await insertUser("HEAD");
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, "2031-05-06", await openOrder(s, item.variantId), "13000");

    const { result } = await trip(
      s,
      "2031-05-07",
      [{ order: await openOrder(s, item.variantId), unitPrice: "13000" }],
      s.head,
    );
    expect(result.ok).toBe(true);

    expect(await told([s.head])).toEqual([]);
    expect(await told([otherHead])).toHaveLength(1);
  });

  it("a refused trip tells nobody: the notice is in its transaction", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, "2031-05-06", await openOrder(s, item.variantId), "13000");

    // A date before the Finance approval refuses the whole trip (07 Date bought).
    const { result } = await trip(s, "2031-05-01", [
      { order: await openOrder(s, item.variantId), unitPrice: "13000" },
    ]);
    expect(result.ok).toBe(false);

    expect(await told([s.head])).toEqual([]);
  });
});

describe("cancelPurchase sends PRICE_DIFFERS when a cancel makes a prompt appear (decided item 8)", () => {
  it("a cancel that takes a record out and brings the others past 20% tells the Head", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    const last = await openOrder(s, item.variantId);
    const recordId = await bought(s, "2031-05-06", last, "10000");
    await bought(s, "2031-05-07", await openOrder(s, item.variantId), "13000");
    await bought(s, "2031-05-08", await openOrder(s, item.variantId), "13000");
    // 10 000 and 13 000: +15%; with the third 13 000 the mean 12 000 is +20%, no more.
    expect(await told([s.head])).toEqual([]);

    const result = await runOrdersAction(cancelPurchase, s.owner.id, {
      clientKey: randomUUID(),
      orders: [{ id: last.id, version: (await orderRow(last.id))!.version }],
      purchaseId: recordId,
      reason: "Typed the wrong price",
    });
    expect(result.ok).toBe(true);

    expect(await told([s.head])).toEqual([
      { userId: s.head.id, params: { count: 1, branch: s.branch.code }, link: "/prices" },
    ]);
    expect(await told([s.owner, ...s.others])).toEqual([]);
  });

  it("Cancel trip shares the notice: the trip's record out, the prompt appears", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    const last = await openOrder(s, item.variantId);
    await bought(s, "2031-05-06", last, "10000");
    await bought(s, "2031-05-07", await openOrder(s, item.variantId), "13000");
    await bought(s, "2031-05-08", await openOrder(s, item.variantId), "13000");
    expect(await told([s.head])).toEqual([]);
    const [record] = await db
      .select({ tripId: purchases.tripId })
      .from(purchases)
      .where(eq(purchases.orderId, last.id));

    const result = await runOrdersAction(cancelTrip, s.owner.id, {
      clientKey: randomUUID(),
      orders: [{ id: last.id, version: (await orderRow(last.id))!.version }],
      tripId: record!.tripId,
      reason: "Typed the wrong price",
    });
    expect(result.ok).toBe(true);

    expect(await told([s.head])).toEqual([
      { userId: s.head.id, params: { count: 1, branch: s.branch.code }, link: "/prices" },
    ]);
    expect(await told([s.owner, ...s.others])).toEqual([]);
  });

  it("a cancel that makes a prompt go tells nobody", async () => {
    const s = await scene();
    const item = await insertItem({ referencePrice: 10_000n });
    await bought(s, "2031-05-06", await openOrder(s, item.variantId), "13000");
    const last = await openOrder(s, item.variantId);
    const recordId = await bought(s, "2031-05-07", last, "13000");
    expect(await told([s.head])).toHaveLength(1);

    const result = await runOrdersAction(cancelPurchase, s.owner.id, {
      clientKey: randomUUID(),
      orders: [{ id: last.id, version: (await orderRow(last.id))!.version }],
      purchaseId: recordId,
      reason: "Typed the wrong price",
    });
    expect(result.ok).toBe(true);

    expect(await told([s.head])).toHaveLength(1);
  });
});
