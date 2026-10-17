import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getOrderPage } from "@/features/orders/queries/order-page";
import { db } from "@/server/db/client";
import {
  priceHistory,
  productVariants,
  products,
  purchaseTrips,
  purchases,
  stockBalances,
  stockMovements,
} from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { commitWhileWaiting } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { recordPurchase } from "./record-purchase";

// Substitution, build plan 3.6 (Done when: a subtype of another product is refused; S10 up to the
// stock check: stock rises for black pens, not for blue), and the plan's Tests: 07-purchasing.md
// (Substitution; Purchase record: Subtype bought, Comment; One trip 1; What saving a record does
// 2 and 3), 15 S10, edge cases "A different colour or size was bought" and "A completely
// different product is needed", 04 rule 2, and the plan's decided items 1 to 5. The form's list
// is purchase-form.db.test.ts; isSubstituted() and the comment reason are purchases.test.ts.

const TODAY = "2031-05-10";

/** Pens with a blue and a black subtype; a Manager's Open order of 10 blue at 2 000 by card. */
async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  const pens = await insertProduct();
  const [blue, black] = await insertSubtypes(pens.id, [{ name: "Ko'k" }, { name: "Qora" }]);
  const order = await openOrder(branch.id, owner.id, blue!);
  return { branch, owner, pens, blue: blue!, black: black!, order };
}

type Scene = Awaited<ReturnType<typeof scene>>;

function openOrder(branchId: string, ownerId: string, variantId: string) {
  return insertOrder({
    branchId,
    ownerId,
    status: "PURCHASING",
    variantId,
    plannedQty: "10",
    plannedPrice: 2_000n,
    paymentType: "CARD",
    approvedAt: new Date("2031-05-05T07:00:00Z"),
  });
}

type Order = Awaited<ReturnType<typeof openOrder>>;

/** One trip of the scene's owner: each order with the subtype it bought (07 One trip 1). */
function trip(
  s: Scene,
  lines: readonly { order: Order; variantId: string; comment?: string | null }[],
) {
  return runOrdersAction(recordPurchase, s.owner.id, {
    clientKey: randomUUID(),
    orders: lines.map(({ order }) => ({ id: order.id, version: order.version })),
    purchasedOn: TODAY,
    paymentType: "CARD",
    supplierId: null,
    receiptFileIds: [],
    lines: lines.map(({ order, variantId, comment }) => ({
      orderId: order.id,
      variantId,
      qty: "10",
      unitPrice: "2000",
      extras: [],
      comment: comment === undefined ? "Ko'k yo'q edi, qora olindi" : comment,
    })),
  });
}

async function balanceOf(branchId: string, variantId: string) {
  const [row] = await db
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .where(and(eq(stockBalances.branchId, branchId), eq(stockBalances.variantId, variantId)));
  return row?.qty ?? null;
}

async function variantRow(id: string) {
  const [row] = await db
    .select({ lastPurchasePrice: productVariants.lastPurchasePrice })
    .from(productVariants)
    .where(eq(productVariants.id, id));
  return row!;
}

/** Nothing of a trip was written for the scene's order (07 One trip 4: all or nothing). */
async function expectNothingWritten(s: Scene) {
  expect(await db.select().from(purchases).where(eq(purchases.orderId, s.order.id))).toEqual([]);
  expect(
    await db.select().from(purchaseTrips).where(eq(purchaseTrips.branchId, s.branch.id)),
  ).toEqual([]);
  expect(
    await db.select().from(stockMovements).where(eq(stockMovements.branchId, s.branch.id)),
  ).toEqual([]);
  for (const variantId of [s.blue, s.black]) {
    expect(
      await db.select().from(priceHistory).where(eq(priceHistory.variantId, variantId)),
    ).toEqual([]);
  }
}

describe("S10: blue pens ordered, black pens bought at the same price (15 S10; 07 Substitution)", () => {
  it("stock rises for black, not for blue; the record, the movement and the prices are black's; the order shows Substituted", async () => {
    const s = await scene();
    expect(await trip(s, [{ order: s.order, variantId: s.black }])).toMatchObject({ ok: true });

    expect(await balanceOf(s.branch.id, s.black)).toBe("10.000");
    expect(await balanceOf(s.branch.id, s.blue)).toBeNull();
    const [saved] = await db.select().from(purchases).where(eq(purchases.orderId, s.order.id));
    expect(saved).toMatchObject({ variantId: s.black, qty: "10.000", unitPrice: 2_000n });
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.purchaseId, saved!.id));
    expect(movements).toEqual([
      expect.objectContaining({ type: "RECEIPT", variantId: s.black, qtyDelta: "10.000" }),
    ]);
    // 07 What saving does 3: the subtype bought takes the price (decided item 1, Look first).
    expect(await variantRow(s.black)).toEqual({ lastPurchasePrice: 2_000n });
    expect(await variantRow(s.blue)).toEqual({ lastPurchasePrice: null });
    expect(
      await db.select().from(priceHistory).where(eq(priceHistory.purchaseId, saved!.id)),
    ).toEqual([expect.objectContaining({ variantId: s.black, source: "PURCHASE" })]);
    expect(await db.select().from(priceHistory).where(eq(priceHistory.variantId, s.blue))).toEqual(
      [],
    );

    const page = await getOrderPage(s.owner.id, s.order.id);
    expect(page).toMatchObject({ substituted: true });
    expect(page!.purchases).toEqual([
      expect.objectContaining({ id: saved!.id, variantId: s.black, boughtSubtypeName: "Qora" }),
    ]);
  });

  it("a trip of a substituted and a plain order: each record, movement and Substituted fact is its own (07 One trip 1, per order)", async () => {
    const s = await scene();
    const plain = await openOrder(s.branch.id, s.owner.id, s.blue);
    expect(
      await trip(s, [
        { order: s.order, variantId: s.black },
        { order: plain, variantId: s.blue, comment: null },
      ]),
    ).toMatchObject({ ok: true });
    expect(await balanceOf(s.branch.id, s.black)).toBe("10.000");
    expect(await balanceOf(s.branch.id, s.blue)).toBe("10.000");
    expect(await getOrderPage(s.owner.id, s.order.id)).toMatchObject({ substituted: true });
    // The ordered subtype's record names no subtype bought (review of the plan, correction 2).
    const page = await getOrderPage(s.owner.id, plain.id);
    expect(page).toMatchObject({ substituted: false });
    expect(page!.purchases).toEqual([
      expect.objectContaining({ variantId: s.blue, boughtSubtypeName: null }),
    ]);
  });
});

describe("which subtype may be bought (07 Substitution; 04 rule 2; plan of 3.6, decided item 4)", () => {
  it("a subtype of another product is refused, and nothing is written (Done when; edge case 'A completely different product')", async () => {
    const s = await scene();
    const other = await insertItem();
    expect(await trip(s, [{ order: s.order, variantId: other.variantId }])).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { "lines.0.variantId": "errors.field.otherProduct" },
      },
    });
    expect(await balanceOf(s.branch.id, other.variantId)).toBeNull();
    await expectNothingWritten(s);
  });

  it("an id that is no subtype is refused the same", async () => {
    const s = await scene();
    expect(await trip(s, [{ order: s.order, variantId: randomUUID() }])).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.otherProduct" } },
    });
    await expectNothingWritten(s);
  });

  it("an inactive subtype of the same product is refused; an active one beside it is saved", async () => {
    const s = await scene();
    const [green] = await insertSubtypes(s.pens.id, [{ name: "Yashil", isActive: false }]);
    expect(await trip(s, [{ order: s.order, variantId: green! }])).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.inactive" } },
    });
    await expectNothingWritten(s);
    expect(await trip(s, [{ order: s.order, variantId: s.black }])).toMatchObject({ ok: true });
  });

  it("while the product is inactive another subtype is refused; the ordered subtype, inactive too, is still bought", async () => {
    const s = await scene();
    await db.update(products).set({ isActive: false }).where(eq(products.id, s.pens.id));
    await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.id, s.blue));
    expect(await trip(s, [{ order: s.order, variantId: s.black }])).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.inactive" } },
    });
    await expectNothingWritten(s);
    expect(await trip(s, [{ order: s.order, variantId: s.blue }])).toMatchObject({ ok: true });
    expect(await balanceOf(s.branch.id, s.blue)).toBe("10.000");
    expect(await getOrderPage(s.owner.id, s.order.id)).toMatchObject({ substituted: false });
  });

  it("a substitution without a comment is refused; the ordered subtype needs none (07 Comment: on a substitution)", async () => {
    const s = await scene();
    expect(await trip(s, [{ order: s.order, variantId: s.black, comment: null }])).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.comment": "errors.field.required" } },
    });
    await expectNothingWritten(s);
    expect(await trip(s, [{ order: s.order, variantId: s.blue, comment: null }])).toMatchObject({
      ok: true,
    });
  });
});

describe("two trips of one subtype at the same moment (15 Test layers; review of the plan, Must fix 1)", () => {
  it("both commit and the stock is their sum: the subtype is locked for update once, never a share lock upgraded", async () => {
    const s = await scene();
    const blackOrder = await openOrder(s.branch.id, s.owner.id, s.black);
    // A third transaction holds black's row; both trips queue on it, then go one after the other.
    // With a share lock taken first, both would hold it and deadlock on the price update.
    const [onto, plain] = await commitWhileWaiting(
      (query) =>
        query("select id from product_variants where id = $1 for update", [s.black]).then(
          () => undefined,
        ),
      () =>
        Promise.all([
          trip(s, [{ order: s.order, variantId: s.black }]),
          trip(s, [{ order: blackOrder, variantId: s.black, comment: null }]),
        ]),
      2,
    );
    expect(onto).toMatchObject({ ok: true });
    expect(plain).toMatchObject({ ok: true });
    expect(await balanceOf(s.branch.id, s.black)).toBe("20.000");
  });
});
