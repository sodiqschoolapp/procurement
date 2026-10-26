import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ORDER_FIELDS_DEFAULT } from "@/domain/order-fields";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { getPurchaseForm } from "@/features/purchasing/queries/purchase-form";
import { saveSettings } from "@/features/settings/actions/save-settings";
import { switchFinanceStep } from "@/features/settings/actions/switch-finance-step";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertProduct } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import {
  DAY,
  atPrincipal,
  buy,
  expectOk,
  ordersNow,
  principalApproves,
  stepScene,
  ticked,
} from "../../../../tests/helpers/finance-step";
import { noticesOf } from "../../../../tests/helpers/moves";
import { approveOrders } from "./approve";
import { closeSkippedOrders } from "./close-skipped";
import { createDraft } from "./drafts";
import { submitDrafts } from "./submit";

// 15-quality-and-acceptance.md, S24 "Fields the Head sets", as a database test (build plan 2.5d-b,
// Done when). 05-order-request-form.md, Fields the Head sets 1 to 4; 06-approval-workflow.md,
// Finance step switched off 3, 4 and 8; 08 Numbers the system calculates and Overspend guard.
// Every step through the real actions (D38); the Playwright side is acceptance-s24.spec.ts.

describe("S24: Fields the Head sets (15 S24)", () => {
  it("10 folders with no department and no price are submitted, approved, bought for 45 000 and closed with no overspend notice; the switch on is refused until the price is required, then the next order waits for Finance", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();

    // With the Finance step off, the Head hides Needed by and makes department and price optional.
    expect(await runAction(switchFinanceStep, s.head.id, { on: false })).toMatchObject({
      ok: true,
    });
    const fields = {
      ...ORDER_FIELDS_DEFAULT,
      department: { ask: "optional", place: "row" },
      neededBy: { ask: "hidden", place: "row" },
      price: { ask: "optional", place: "row" },
    } as const;
    expect(await runAction(saveSettings, s.head.id, { order_fields: fields })).toMatchObject({
      ok: true,
    });

    // The Manager adds 10 folders with no department and no price, and submits them.
    const folders = await insertProduct({ name: "Papka (S24)" });
    const created = await runAction(createDraft, s.manager.id, {
      clientKey: randomUUID(),
      branchId: s.branch.id,
      variantId: folders.defaultVariantId,
      quantity: "10",
    });
    expect(created).toMatchObject({ ok: true });
    const draftId = (created as { ok: true; data: { id: string } }).data.id;
    expectOk(await runOrdersAction(submitDrafts, s.manager.id, await ticked([draftId])));
    const [submitted] = await db.select().from(orders).where(eq(orders.id, draftId));
    expect(submitted).toMatchObject({
      status: "PENDING_HEAD",
      departmentId: null,
      neededBy: null,
      plannedPrice: null,
      plannedTotal: null,
    });
    expect(submitted!.number).not.toBeNull();

    // Approvers see "No planned price": no planned total and no colours before Open.
    const forHead = (await getOrderPage(s.head.id, draftId))!;
    expect(forHead).toMatchObject({ price: null, plannedTotal: null });
    expectOk(await runOrdersAction(approveOrders, s.head.id, await ticked([draftId])));
    const order = { id: draftId, variantId: folders.defaultVariantId };
    await principalApproves(s, [order]);
    expect((await ordersNow([draftId])).get(draftId)).toMatchObject({
      status: "PURCHASING",
      skippedFinance: true,
    });

    // "Give straight to requester" was not offered: the order has no department.
    const form = (await getPurchaseForm(s.manager.id, [draftId]))!;
    expect(form.orders[0]).toMatchObject({ plannedPrice: null, canGiveToRequester: false });

    // Bought for 45 000: Number green, Price and Total "No planned price", actual 45 000.
    expectOk(await buy(s, [{ order, qty: "10", unitPrice: "4500", extra: null }]));
    const bought = (await getOrderPage(s.manager.id, draftId))!;
    expect(bought.colours).toEqual({
      number: { colour: "green", difference: "0" },
      price: { colour: "unpriced" },
      total: { colour: "unpriced" },
    });
    expect(bought.actualTotal).toBe(45_000n);
    expect(bought.planVsActual).toMatchObject({
      total: { planned: null, actual: 45_000n, difference: null },
    });

    // The Manager closes it; no overspend notice is sent.
    expectOk(await runOrdersAction(closeSkippedOrders, s.manager.id, await ticked([draftId])));
    expect((await ordersNow([draftId])).get(draftId)?.status).toBe("CLOSED");
    expect(await noticesOf(s.head.id, "OVERSPEND_ABOVE_GUARD")).toEqual([]);

    // The first switch on is refused because the price is not required.
    expect(await runAction(switchFinanceStep, s.head.id, { on: true })).toMatchObject({
      ok: false,
      error: { fields: { orders: "errors.field.financeStepPriceNotRequired" } },
    });
    // The Head makes the price required; the second goes through.
    expect(
      await runAction(saveSettings, s.head.id, {
        order_fields: { ...fields, price: { ask: "required", place: "row" } },
      }),
    ).toMatchObject({ ok: true });
    expect(await runAction(switchFinanceStep, s.head.id, { on: true })).toMatchObject({
      ok: true,
      data: { on: true },
    });

    // The next order the Principal approves waits for Finance.
    const next = await atPrincipal(s);
    await principalApproves(s, [next]);
    expect((await ordersNow([next.id])).get(next.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedFinance: false,
    });
  });
});
