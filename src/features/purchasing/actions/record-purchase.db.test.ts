import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import {
  orderEvents,
  priceHistory,
  productVariants,
  purchaseExtras,
  purchaseTrips,
  purchases,
  settings,
  stockBalances,
  stockMovements,
  tripFiles,
} from "@/server/db/schema";
import { now } from "@/server/clock";
import { fileForDownload } from "@/features/files/queries/file-for-download";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import {
  insertCompany,
  insertFileRow,
  setLastPurchasePrice,
} from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import {
  insertExtraCostType,
  insertItem,
  insertOrder,
  orderRow,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { recordPurchase } from "./record-purchase";

// Record a purchase, build plan 3.3 (Done when: a product purchase raises stock by its quantity;
// a service purchase raises nothing; a price of 0 without a comment is refused; a date before the
// order's Finance approval is refused; a failing last step leaves no record and no stock; with
// receipt_required_for_cash on, a cash purchase without a receipt is refused), and the plan's
// Tests: 07-purchasing.md (Purchase record; What saving a record does; Order progress), 02 A7,
// 04 rule 4, edge-cases/purchasing-and-money.md ("The item was free", "Planned by card, paid in
// cash", "Delivery for a bank-transfer item was paid in cash", "No receipt photo"), 14 settings
// keys, developer-rules.md rules 3, 8, 9. Every passing case has the refused data beside it (D40).
// The permission rows are record-purchase-matrix.db.test.ts.

const TODAY = "2031-05-10";
const APPROVED = "2031-05-05";

/** An Open order of 100 at 5 000 by card, approved by Finance on 5 May 2031, of its own item. */
async function openOrder(
  options: {
    type?: "GOODS" | "SERVICE";
    allowDecimal?: boolean;
    paymentType?: "CASH" | "TRANSFER" | "CARD";
    approvedAt?: Date | null;
  } = {},
) {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  const item = await insertItem({ type: options.type, allowDecimal: options.allowDecimal });
  const order = await insertOrder({
    branchId: branch.id,
    ownerId: owner.id,
    status: "PURCHASING",
    variantId: item.variantId,
    plannedQty: "100",
    plannedPrice: 5_000n,
    paymentType: options.paymentType ?? "CARD",
    approvedAt:
      options.approvedAt === undefined ? new Date(`${APPROVED}T07:00:00Z`) : options.approvedAt,
  });
  return { branch, owner, item, order };
}

type Opened = Awaited<ReturnType<typeof openOrder>>;

function record(
  opened: Opened,
  fields: Record<string, unknown> = {},
  version = opened.order.version,
) {
  // The order's own fields go into its line (plan of 3.4: one line per ticked order).
  const { qty, unitPrice, variantId, extras, comment, ...shared } = fields;
  return runOrdersAction(recordPurchase, opened.owner.id, {
    clientKey: randomUUID(),
    orders: [{ id: opened.order.id, version }],
    purchasedOn: TODAY,
    paymentType: "CARD",
    supplierId: null,
    receiptFileIds: [],
    ...shared,
    lines: [
      {
        orderId: opened.order.id,
        variantId: variantId ?? opened.order.variantId,
        qty: qty ?? "100",
        unitPrice: unitPrice ?? "5000",
        extras: extras ?? [],
        comment: comment ?? null,
      },
    ],
  });
}

async function balanceOf(branchId: string, variantId: string) {
  const [row] = await db
    .select({ qty: stockBalances.qty, avgCost: stockBalances.avgCost })
    .from(stockBalances)
    .where(
      sql`${stockBalances.branchId} = ${branchId} and ${stockBalances.variantId} = ${variantId}`,
    );
  return row ?? null;
}

async function recordsOf(orderId: string) {
  return db.select().from(purchases).where(eq(purchases.orderId, orderId));
}

async function setReceiptRequired(on: boolean) {
  await db
    .insert(settings)
    .values({ key: "receipt_required_for_cash", value: on, createdAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value: on } });
}

describe("recordPurchase: what saving a record does (07; plan of 3.3)", () => {
  it("a product purchase raises stock by its quantity, one Receipt at the record's price; another branch's stock stays", async () => {
    const opened = await openOrder();
    // Another branch's balance of the same subtype beside it (D40).
    const other = await openOrder();
    const otherOrder = await insertOrder({
      branchId: other.branch.id,
      ownerId: other.owner.id,
      status: "PURCHASING",
      variantId: opened.item.variantId,
      approvedAt: new Date(`${APPROVED}T07:00:00Z`),
    });
    expect(
      await record({ ...other, order: otherOrder }, { qty: "10", comment: "boshqa filial" }),
    ).toMatchObject({ ok: true });

    const result = await record(opened, { qty: "60" });
    expect(result).toMatchObject({ ok: true });

    const [saved] = await recordsOf(opened.order.id);
    expect(await balanceOf(opened.branch.id, opened.item.variantId)).toEqual({
      qty: "60.000",
      avgCost: 5_000n,
    });
    expect(await balanceOf(other.branch.id, opened.item.variantId)).toMatchObject({
      qty: "10.000",
    });
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.purchaseId, saved!.id));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: "RECEIPT",
      branchId: opened.branch.id,
      variantId: opened.item.variantId,
      qtyDelta: "60.000",
      unitCost: 5_000n,
    });
  });

  it("a service purchase writes the record and no movement and no balance (A7)", async () => {
    const opened = await openOrder({ type: "SERVICE" });
    expect(await record(opened, { qty: "100" })).toMatchObject({ ok: true });
    const [saved] = await recordsOf(opened.order.id);
    expect(saved).toBeDefined();
    expect(
      await db.select().from(stockMovements).where(eq(stockMovements.purchaseId, saved!.id)),
    ).toEqual([]);
    expect(await balanceOf(opened.branch.id, opened.item.variantId)).toBeNull();
    expect((await orderRow(opened.order.id))?.progress).toBe("DONE");
  });

  it("the date, supplier and payment type are the trip's; the record names its trip, branch and the ordered subtype (14)", async () => {
    const opened = await openOrder();
    const supplier = await insertCompany();
    expect(
      await record(opened, {
        purchasedOn: APPROVED,
        supplierId: supplier.id,
        paymentType: "TRANSFER",
        comment: "o'tkazma bilan",
      }),
    ).toMatchObject({ ok: true });
    const [saved] = await recordsOf(opened.order.id);
    const [trip] = await db.select().from(purchaseTrips).where(eq(purchaseTrips.id, saved!.tripId));
    expect(trip).toMatchObject({
      branchId: opened.branch.id,
      purchasedOn: APPROVED,
      supplierId: supplier.id,
      paymentType: "TRANSFER",
      createdBy: opened.owner.id,
    });
    expect(saved).toMatchObject({
      branchId: opened.branch.id,
      variantId: opened.item.variantId,
      qty: "100.000",
      unitPrice: 5_000n,
      comment: "o'tkazma bilan",
      createdBy: opened.owner.id,
    });
  });

  it("the last purchase price and a PURCHASE price row naming the record (07 step 3; 04 rule 4)", async () => {
    const opened = await openOrder();
    await setLastPurchasePrice(opened.item.variantId, 4_000n);
    expect(await record(opened, { unitPrice: "5200", comment: "qimmatroq" })).toMatchObject({
      ok: true,
    });
    const [saved] = await recordsOf(opened.order.id);
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, opened.item.variantId));
    expect(variant?.lastPurchasePrice).toBe(5_200n);
    expect(variant?.lastPurchaseAt).toEqual(now());
    const rows = await db.select().from(priceHistory).where(eq(priceHistory.purchaseId, saved!.id));
    expect(rows).toMatchObject([
      {
        variantId: opened.item.variantId,
        price: 5_200n,
        source: "PURCHASE",
        setBy: opened.owner.id,
      },
    ]);
  });

  it("a gift with a comment writes no price row, keeps the last price, and enters stock at cost 0 (decided item 2)", async () => {
    const opened = await openOrder();
    await setLastPurchasePrice(opened.item.variantId, 4_000n);
    expect(
      await record(opened, { qty: "10", unitPrice: "0", comment: "homiy sovg'asi" }),
    ).toMatchObject({ ok: true });
    const [saved] = await recordsOf(opened.order.id);
    expect(saved?.unitPrice).toBe(0n);
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, opened.item.variantId));
    expect(variant?.lastPurchasePrice).toBe(4_000n);
    expect(
      await db.select().from(priceHistory).where(eq(priceHistory.purchaseId, saved!.id)),
    ).toEqual([]);
    expect(await balanceOf(opened.branch.id, opened.item.variantId)).toEqual({
      qty: "10.000",
      avgCost: 0n,
    });
    expect((await orderRow(opened.order.id))?.actualTotal).toBe(0n);
  });

  it("actual_total and progress: 100 planned, 60 then 40 (07 step 4; 08 Actual total)", async () => {
    const opened = await openOrder();
    const extraType = await insertExtraCostType();
    expect(
      await record(opened, {
        qty: "60",
        extras: [{ extraCostTypeId: extraType.id, amount: "20000", paymentType: "CASH" }],
      }),
    ).toMatchObject({ ok: true });
    expect(await orderRow(opened.order.id)).toMatchObject({
      progress: "OPEN",
      actualTotal: 320_000n,
      version: opened.order.version + 1,
    });

    expect(await record(opened, { qty: "40" }, opened.order.version + 1)).toMatchObject({
      ok: true,
    });
    expect(await orderRow(opened.order.id)).toMatchObject({
      progress: "DONE",
      actualTotal: 520_000n,
    });
    const events = await db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, opened.order.id));
    expect(events.map((event) => [event.type, event.fromStatus, event.toStatus])).toEqual([
      ["RECORD_PURCHASE", "PURCHASING", "PURCHASING"],
      ["RECORD_PURCHASE", "PURCHASING", "PURCHASING"],
    ]);
    const extras = await db
      .select()
      .from(purchaseExtras)
      .where(eq(purchaseExtras.extraCostTypeId, extraType.id));
    expect(extras).toMatchObject([{ amount: 20_000n, paymentType: "CASH" }]);
  });
});

describe("recordPurchase: the field rules (07 Purchase record)", () => {
  it("price 0 without a comment is refused; with one it is saved (edge case 'The item was free')", async () => {
    const opened = await openOrder();
    expect(await record(opened, { unitPrice: "0" })).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "lines.0.comment": "errors.field.required" } },
    });
    expect(await recordsOf(opened.order.id)).toEqual([]);
    expect(await record(opened, { unitPrice: "0", comment: "sovg'a" })).toMatchObject({
      ok: true,
    });
  });

  it("another price, another payment type, or above the plan without a comment are refused; 60 of 100 at the plan is saved", async () => {
    const opened = await openOrder();
    for (const fields of [
      { unitPrice: "5500" },
      // Edge case "Planned by card, paid in cash".
      { paymentType: "CASH" },
      // Edge case "More was bought than approved".
      { qty: "101" },
    ]) {
      expect(await record(opened, fields)).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { "lines.0.comment": "errors.field.required" } },
      });
    }
    expect(await recordsOf(opened.order.id)).toEqual([]);
    expect(await record(opened, { qty: "60" })).toMatchObject({ ok: true });
  });

  it("a date before the Finance approval and a future date are refused; the approval day is saved", async () => {
    const opened = await openOrder();
    expect(await record(opened, { purchasedOn: "2031-05-04" })).toMatchObject({
      ok: false,
      error: { fields: { purchasedOn: "errors.field.beforeApproval" } },
    });
    expect(await record(opened, { purchasedOn: "2031-05-11" })).toMatchObject({
      ok: false,
      error: { fields: { purchasedOn: "errors.field.inFuture" } },
    });
    expect(await recordsOf(opened.order.id)).toEqual([]);
    expect(await record(opened, { purchasedOn: APPROVED })).toMatchObject({ ok: true });
  });

  it("an Open order without an approval date is refused, never let through (decided item 7)", async () => {
    const opened = await openOrder({ approvedAt: null });
    expect(await record(opened)).toMatchObject({
      ok: false,
      error: { fields: { purchasedOn: "errors.field.beforeApproval" } },
    });
  });

  it("decimals are refused for a measure in whole units, saved where the measure allows them", async () => {
    const whole = await openOrder();
    expect(await record(whole, { qty: "2.5" })).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.qty": "errors.field.wholeOnly" } },
    });
    const decimal = await openOrder({ allowDecimal: true });
    expect(await record(decimal, { qty: "2.5" })).toMatchObject({ ok: true });
  });

  it("an inactive supplier or extra cost type is refused (04 rule 2)", async () => {
    const opened = await openOrder();
    const inactive = await insertCompany({ isActive: false });
    expect(await record(opened, { supplierId: inactive.id })).toMatchObject({
      ok: false,
      error: { fields: { supplierId: "errors.field.inactive" } },
    });
    const gone = await insertExtraCostType({ isActive: false });
    expect(
      await record(opened, {
        extras: [{ extraCostTypeId: gone.id, amount: "1000", paymentType: "CARD" }],
      }),
    ).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.extras.0.extraCostTypeId": "errors.field.inactive" } },
    });
    expect(await recordsOf(opened.order.id)).toEqual([]);
    const active = await insertCompany();
    expect(await record(opened, { supplierId: active.id })).toMatchObject({ ok: true });
  });
});

describe("recordPurchase: receipts (07 Receipt; edge case 'No receipt photo'; 14 settings keys)", () => {
  it("with receipt_required_for_cash on: Cash without a receipt is refused, with one saved, Transfer without one saved", async () => {
    const opened = await openOrder({ paymentType: "CASH" });
    await setReceiptRequired(true);
    expect(await record(opened, { paymentType: "CASH" })).toMatchObject({
      ok: false,
      error: { fields: { receiptFileIds: "errors.field.required" } },
    });
    expect(await recordsOf(opened.order.id)).toEqual([]);

    const receipt = await insertFileRow(opened.owner.id, "application/pdf");
    expect(
      await record(opened, { paymentType: "CASH", qty: "50", receiptFileIds: [receipt.id] }),
    ).toMatchObject({ ok: true });
    const [saved] = await recordsOf(opened.order.id);
    expect(
      await db.select().from(tripFiles).where(eq(tripFiles.tripId, saved!.tripId)),
    ).toMatchObject([{ fileId: receipt.id }]);

    expect(
      await record(
        opened,
        { paymentType: "TRANSFER", qty: "50", comment: "o'tkazma" },
        opened.order.version + 1,
      ),
    ).toMatchObject({ ok: true });
  });

  // Changed by D55 (16) and the spec change of 20.10.2026 (edge case "No receipt photo": "for a
  // trip with an extra cost paid in cash"); 3.3 decided item 4 had let this trip through (plan of
  // 4.10b, Look first).
  it("a transfer-paid trip with a cash delivery fee and no receipt is refused with the setting on, saved with it off; the extra keeps its Cash (edge case 'No receipt photo'; D55 (16); plan of 4.10b)", async () => {
    const opened = await openOrder({ paymentType: "TRANSFER" });
    await setReceiptRequired(true);
    const delivery = await insertExtraCostType();
    const fee = {
      paymentType: "TRANSFER",
      extras: [{ extraCostTypeId: delivery.id, amount: "30000", paymentType: "CASH" }],
    };
    expect(await record(opened, fee)).toMatchObject({
      ok: false,
      error: { fields: { receiptFileIds: "errors.field.required" } },
    });
    expect(await recordsOf(opened.order.id)).toEqual([]);

    await setReceiptRequired(false);
    expect(await record(opened, fee)).toMatchObject({ ok: true });
    const [saved] = await recordsOf(opened.order.id);
    expect(
      await db.select().from(purchaseExtras).where(eq(purchaseExtras.purchaseId, saved!.id)),
    ).toMatchObject([{ amount: 30_000n, paymentType: "CASH" }]);
  });

  it("with the setting on, a transfer-paid trip whose extra costs are all by transfer needs no receipt (edge case 'No receipt photo')", async () => {
    const opened = await openOrder({ paymentType: "TRANSFER" });
    await setReceiptRequired(true);
    const delivery = await insertExtraCostType();
    expect(
      await record(opened, {
        paymentType: "TRANSFER",
        extras: [{ extraCostTypeId: delivery.id, amount: "30000", paymentType: "TRANSFER" }],
      }),
    ).toMatchObject({ ok: true });
  });

  it("with the setting off, Cash without a receipt is saved", async () => {
    const opened = await openOrder({ paymentType: "CASH" });
    await setReceiptRequired(false);
    expect(await record(opened, { paymentType: "CASH" })).toMatchObject({ ok: true });
  });

  it("another user's upload and a file already held are refused; six files are refused", async () => {
    const opened = await openOrder();
    const stranger = await insertUser("MANAGER", { branches: [opened.branch.id] });
    const theirs = await insertFileRow(stranger.id);
    expect(await record(opened, { receiptFileIds: [theirs.id] })).toMatchObject({
      ok: false,
      error: { fields: { "receiptFileIds.0": "errors.field.notAllowed" } },
    });

    // A file held by another trip already.
    const held = await insertFileRow(opened.owner.id);
    expect(await record(opened, { qty: "10", receiptFileIds: [held.id] })).toMatchObject({
      ok: true,
    });
    expect(
      await record(opened, { qty: "10", receiptFileIds: [held.id] }, opened.order.version + 1),
    ).toMatchObject({
      ok: false,
      error: { fields: { "receiptFileIds.0": "errors.field.notAllowed" } },
    });

    const six = await Promise.all(Array.from({ length: 6 }, () => insertFileRow(opened.owner.id)));
    expect(
      await record(
        opened,
        { qty: "10", receiptFileIds: six.map((file) => file.id) },
        opened.order.version + 1,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("a trip's file downloads for a Principal of its branch and is Not found for another branch's (FILE_OWNERS)", async () => {
    const opened = await openOrder();
    const receipt = await insertFileRow(opened.owner.id);
    expect(await record(opened, { receiptFileIds: [receipt.id] })).toMatchObject({ ok: true });
    const principal = await insertUser("PRINCIPAL", { branches: [opened.branch.id] });
    const otherBranch = await insertBranch();
    const stranger = await insertUser("PRINCIPAL", { branches: [otherBranch.id] });
    await expect(fileForDownload(principal.id, receipt.id)).resolves.toBeTruthy();
    await expect(fileForDownload(stranger.id, receipt.id)).rejects.toMatchObject({
      kind: "not_found",
    });
    // The roles of several branches (permission review, Should fix 3).
    const finance = await insertUser("FINANCE", { branches: [opened.branch.id] });
    await expect(fileForDownload(finance.id, receipt.id)).resolves.toBeTruthy();
    const otherManager = await insertUser("MANAGER", { branches: [otherBranch.id] });
    await expect(fileForDownload(otherManager.id, receipt.id)).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("recordPurchase: the wrapper's rules (developer-rules.md rules 3, 8, 9; 07 Order progress)", () => {
  it("a failing last step leaves nothing: no trip, record, extra, file, movement, balance, price or order change", async () => {
    const opened = await openOrder();
    await setLastPurchasePrice(opened.item.variantId, 4_000n);
    const receipt = await insertFileRow(opened.owner.id);
    const delivery = await insertExtraCostType();
    await db.execute(sql`
      create function fail_order_event() returns trigger language plpgsql as $$
      begin
        raise exception 'the last step fails';
      end $$`);
    await db.execute(
      sql.raw(`
      create trigger fail_order_event before insert on order_events
      for each row when (new.order_id = '${opened.order.id}')
      execute function fail_order_event()`),
    );
    try {
      expect(
        await record(opened, {
          qty: "60",
          receiptFileIds: [receipt.id],
          extras: [{ extraCostTypeId: delivery.id, amount: "1000", paymentType: "CASH" }],
        }),
      ).toMatchObject({ ok: false, error: { code: "unexpected" } });
    } finally {
      await db.execute(sql`drop trigger fail_order_event on order_events`);
      await db.execute(sql`drop function fail_order_event()`);
    }
    expect(await recordsOf(opened.order.id)).toEqual([]);
    expect(
      await db.select().from(purchaseTrips).where(eq(purchaseTrips.branchId, opened.branch.id)),
    ).toEqual([]);
    expect(await db.select().from(tripFiles).where(eq(tripFiles.fileId, receipt.id))).toEqual([]);
    expect(
      await db.select().from(purchaseExtras).where(eq(purchaseExtras.extraCostTypeId, delivery.id)),
    ).toEqual([]);
    expect(await balanceOf(opened.branch.id, opened.item.variantId)).toBeNull();
    expect(
      await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.variantId, opened.item.variantId)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(priceHistory)
        .where(
          sql`${priceHistory.variantId} = ${opened.item.variantId} and ${priceHistory.source} = 'PURCHASE'`,
        ),
    ).toEqual([]);
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, opened.item.variantId));
    expect(variant?.lastPurchasePrice).toBe(4_000n);
    expect(await orderRow(opened.order.id)).toMatchObject({
      progress: "OPEN",
      actualTotal: null,
      version: opened.order.version,
    });
    // The same record without the failing step saves (the fixture is sound; D38).
    expect(await record(opened, { qty: "60", receiptFileIds: [receipt.id] })).toMatchObject({
      ok: true,
    });
  });

  it("an order not Open, or whose buying is finished, is refused wrong_status; an Open one beside it is saved", async () => {
    for (const status of ["PENDING_FINANCE", "CLOSED"] as const) {
      const opened = await openOrder();
      await setOrderStatus(opened.order.id, status);
      expect(await record(opened)).toMatchObject({
        ok: false,
        error: { code: "wrong_status" },
      });
    }
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      const opened = await openOrder();
      // Done short and Not bought carry their reason (orders_finish_reason_check, 3.5).
      const reason = progress === "DONE" ? null : "Invented finish reason";
      await db.execute(
        sql`update orders set progress = ${progress}, finish_reason = ${reason} where id = ${opened.order.id}`,
      );
      expect(await record(opened, { qty: "10" })).toMatchObject({
        ok: false,
        error: { code: "wrong_status" },
      });
      expect(await recordsOf(opened.order.id)).toEqual([]);
    }
    const open = await openOrder();
    expect(await record(open, { qty: "10" })).toMatchObject({ ok: true });
  });

  it("an old version is refused stale_version; the same client key twice writes once and returns the first result", async () => {
    const opened = await openOrder();
    expect(await record(opened, {}, opened.order.version + 5)).toMatchObject({
      ok: false,
      error: { code: "stale_version" },
    });
    const input = {
      clientKey: randomUUID(),
      orders: [{ id: opened.order.id, version: opened.order.version }],
      purchasedOn: TODAY,
      paymentType: "CARD",
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: opened.order.id,
          variantId: opened.order.variantId,
          qty: "60",
          unitPrice: "5000",
          extras: [],
          comment: null,
        },
      ],
    };
    const first = await runOrdersAction(recordPurchase, opened.owner.id, input);
    const second = await runOrdersAction(recordPurchase, opened.owner.id, input);
    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    expect(await recordsOf(opened.order.id)).toHaveLength(1);
    expect(await balanceOf(opened.branch.id, opened.item.variantId)).toMatchObject({
      qty: "60.000",
    });
  });
});

describe("the order page after a record (07 What saving a record does; plan of 3.3, decided items 14 and 15)", () => {
  it("Record purchase is offered to the owner and the Head, not to the Principal; Received and the actual total follow the records", async () => {
    const opened = await openOrder();
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [opened.branch.id] });
    expect(await getOrderPage(opened.owner.id, opened.order.id)).toMatchObject({
      canRecordPurchase: true,
      received: "0",
      actualTotal: 0n,
      isService: false,
    });
    expect(await getOrderPage(head.id, opened.order.id)).toMatchObject({ canRecordPurchase: true });
    expect(await getOrderPage(principal.id, opened.order.id)).toMatchObject({
      canRecordPurchase: false,
    });
    // A colleague Manager, the owner's own right off, and Finance (permission review, Should fix 2).
    const colleague = await insertUser("MANAGER", { branches: [opened.branch.id] });
    const finance = await insertUser("FINANCE", { branches: [opened.branch.id] });
    for (const user of [colleague, finance]) {
      expect(await getOrderPage(user.id, opened.order.id)).toMatchObject({
        canRecordPurchase: false,
      });
    }
    await setManagerRight(opened.owner.id, "RECORD_PURCHASES", false);
    expect(await getOrderPage(opened.owner.id, opened.order.id)).toMatchObject({
      canRecordPurchase: false,
    });
    await setManagerRight(opened.owner.id, "RECORD_PURCHASES", true);

    expect(await record(opened, { qty: "60" })).toMatchObject({ ok: true });
    expect(await getOrderPage(principal.id, opened.order.id)).toMatchObject({
      received: "60",
      actualTotal: 300_000n,
    });
    expect(await record(opened, { qty: "40" }, opened.order.version + 1)).toMatchObject({
      ok: true,
    });
    // Done: the buying is finished, so the button goes (07 Finishing; decided item 3).
    expect(await getOrderPage(opened.owner.id, opened.order.id)).toMatchObject({
      canRecordPurchase: false,
      received: "100",
    });
  });

  it("a service shows Used; an order before Open has no Received", async () => {
    const service = await openOrder({ type: "SERVICE" });
    expect(await getOrderPage(service.owner.id, service.order.id)).toMatchObject({
      isService: true,
      received: "0",
    });
    const waiting = await openOrder();
    await setOrderStatus(waiting.order.id, "PENDING_FINANCE");
    expect(await getOrderPage(waiting.owner.id, waiting.order.id)).toMatchObject({
      received: null,
      actualTotal: null,
      canRecordPurchase: false,
    });
  });
});
