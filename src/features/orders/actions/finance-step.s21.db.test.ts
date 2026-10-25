import { describe, expect, it } from "vitest";

import { getManagerHome } from "@/features/home/queries/manager-home";
import { getMoneyWithManagers } from "@/features/money/queries/money-with-managers";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { switchFinanceStep } from "@/features/settings/actions/switch-finance-step";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";
import { eq } from "drizzle-orm";

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

// 15-quality-and-acceptance.md, S21 "Finance step off", as a database test (build plan 4.10c,
// Done when). Branch CHL as the scene's own branch and the plan of section 8: 100 notebooks ×
// 5 000 in cash plus 20 000 delivery, 520 000. 06-approval-workflow.md, Finance step switched off
// 1 to 6; 08 Overspend guard. Every step through the real actions (D38).

describe("S21: Finance step off (15 S21)", () => {
  it("refused while an order waits for Finance and named; switched off once Finance approved it; the next order skips Finance, is bought at 6 500, closes with no settlement and no acknowledgment; switched on, the next order waits for Finance", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();

    // The first order waits for Finance: switching off is refused and names it.
    const first = await atPrincipal(s);
    await principalApproves(s, [first]);
    const [{ number }] = (await db
      .select({ number: orders.number })
      .from(orders)
      .where(eq(orders.id, first.id))) as [{ number: string }];
    expect(await runAction(switchFinanceStep, s.head.id, { on: false })).toMatchObject({
      ok: false,
      error: { available: { orders: number } },
    });

    // Finance approves it; the second try switches the step off.
    expectOk(
      await runOrdersAction(
        approveOrders,
        s.finance.id,
        await ticked([first.id], { cash: { [first.id]: "520000" } }),
      ),
    );
    expect(await runAction(switchFinanceStep, s.head.id, { on: false })).toMatchObject({
      ok: true,
      data: { on: false },
    });

    // The second order goes from the Principal straight to Open.
    const second = await atPrincipal(s);
    await principalApproves(s, [second]);
    expect((await ordersNow([second.id])).get(second.id)).toMatchObject({
      status: "PURCHASING",
      skippedFinance: true,
    });
    const opened = (await getOrderPage(s.manager.id, second.id))!;
    expect(opened.steps.find((view) => view.step === "FINANCE")?.state).toBe("skipped");
    // No Money tab: the page shows it only for an order that did not skip Finance.
    expect(opened.skippedFinance).toBe(true);

    // Bought at 6 500 each: 650 000 + 20 000 = 670 000, Total red "Over 150 000".
    expectOk(await buy(s, [{ order: second, unitPrice: "6500", comment: "Narx oshgan" }]));
    const bought = (await getOrderPage(s.manager.id, second.id))!;
    expect(bought.colours?.total).toEqual({ colour: "red", difference: -150_000n });

    // No cash count: the Manager holds only the first order's 520 000 and is owed nothing.
    expect((await getManagerHome(s.manager.id, s.branch.id)).cash).toMatchObject({
      held: 520_000n,
      owed: 0n,
    });
    const blocks = await getMoneyWithManagers(s.head.id, s.branch.id);
    expect(blocks.flatMap((block) => block.orders.map((order) => order.id))).toEqual([first.id]);

    // The Manager closes it: no settlement, no acknowledgment; the Head is told of the overspend.
    expectOk(await runOrdersAction(closeSkippedOrders, s.manager.id, await ticked([second.id])));
    expect((await ordersNow([second.id])).get(second.id)?.status).toBe("CLOSED");
    expect(await noticesOf(s.head.id, "OVERSPEND_ABOVE_GUARD")).toHaveLength(1);

    // Switched on again: the next order the Principal approves waits for Finance.
    expect(await runAction(switchFinanceStep, s.head.id, { on: true })).toMatchObject({
      ok: true,
      data: { on: true },
    });
    const third = await atPrincipal(s);
    await principalApproves(s, [third]);
    expect((await ordersNow([third.id])).get(third.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedFinance: false,
    });
  });
});
