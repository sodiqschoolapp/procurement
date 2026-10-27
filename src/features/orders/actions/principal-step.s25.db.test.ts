import { describe, expect, it } from "vitest";

import { getPrincipalHome } from "@/features/home/queries/principal-home";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { switchFinanceStep } from "@/features/settings/actions/switch-finance-step";
import { switchPrincipalStep } from "@/features/settings/actions/switch-principal-step";
import { runAction } from "@/server/action";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import {
  DAY,
  atPrincipal,
  expectOk,
  principalApproves,
  stepScene,
  ticked,
} from "../../../../tests/helpers/finance-step";
import {
  atHead,
  headApproves,
  headDraft,
  marksNow,
  numberOf,
} from "../../../../tests/helpers/principal-step";
import { approveOrders } from "./approve";
import { sendBackOrders } from "./send-back";
import { submitDrafts } from "./submit";
import { submitAgainOrders } from "./submit-again";

// 15-quality-and-acceptance.md, S25 "Principal step off", as a database test (build plan 4.10d,
// Done when). 06-approval-workflow.md, Principal step switched off 1 to 6; Finance step switched
// off 1 and 2; 03 rule 6. Every step through the real actions (D38). Before the fourth order the
// Principal decides the second, Finance approves the orders waiting for it, and the Principal step
// is switched off again beside the Finance step: S25's "with the Finance step off too" (both
// switches refuse while orders wait at their step; decisions 4.10d, taken during the build).

describe("S25: Principal step off (15 S25)", () => {
  it("refused while an order waits for the Principal and named; switched off once the Principal approved it; the Head's approval and own Submit go to Finance, Skipped; sent back and approved again with the step on, it waits for the Principal; with both steps off the Head opens the fourth", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const principalWaits = async () =>
      (await getPrincipalHome(s.principal.id, s.branch.id)).waiting.count;
    const principalStep = async (ids: readonly string[]) =>
      Promise.all(
        ids.map(async (id) =>
          (await getOrderPage(s.manager.id, id))!.steps.find((view) => view.step === "PRINCIPAL"),
        ),
      );

    // The first order waits for the Principal: switching off is refused and names it.
    const first = await atPrincipal(s);
    expect(await runAction(switchPrincipalStep, s.head.id, { on: false })).toMatchObject({
      ok: false,
      error: { available: { orders: await numberOf(first.id) } },
    });

    // The Principal approves it; the second try switches the step off.
    await principalApproves(s, [first]);
    expect(await runAction(switchPrincipalStep, s.head.id, { on: false })).toMatchObject({
      ok: true,
      data: { on: false },
    });

    // With the Finance step on, the Head approves a second order and creates and submits a third:
    // both go straight to Waiting for Finance, the Principal step "Skipped".
    const second = await atHead(s);
    await headApproves(s, [second.id]);
    const third = await headDraft(s);
    expectOk(await runOrdersAction(submitDrafts, s.head.id, await ticked([third.id])));
    const marks = await marksNow([second.id, third.id]);
    for (const id of [second.id, third.id]) {
      expect(marks.get(id)).toMatchObject({ status: "PENDING_FINANCE", skippedPrincipal: true });
    }
    expect(await principalStep([second.id, third.id])).toEqual([
      { step: "PRINCIPAL", state: "skipped", by: null },
      { step: "PRINCIPAL", state: "skipped", by: null },
    ]);
    // The third shows its Head step as "Created by Head".
    const created = (await getOrderPage(s.head.id, third.id))!;
    expect(created.events.find((event) => event.type === "SUBMIT")?.headStepAuto).toBe(true);
    expect(created.steps.find((view) => view.step === "HEAD")?.state).toBe("done");
    expect(await principalWaits()).toBe(0);

    // Finance sends the second back; the Head switches the Principal step on; the Manager submits
    // it again and the Head approves it: it waits for the Principal, no longer "Skipped".
    expectOk(
      await runOrdersAction(
        sendBackOrders,
        s.finance.id,
        await ticked([second.id], { reason: "Narxni tekshiring" }),
      ),
    );
    expect(await runAction(switchPrincipalStep, s.head.id, { on: true })).toMatchObject({
      ok: true,
      data: { on: true },
    });
    setClock(`${DAY}T08:00:00Z`);
    expectOk(await runOrdersAction(submitAgainOrders, s.manager.id, await ticked([second.id])));
    await headApproves(s, [second.id]);
    expect((await marksNow([second.id])).get(second.id)).toMatchObject({
      status: "PENDING_PRINCIPAL",
      skippedPrincipal: false,
    });
    expect((await principalStep([second.id]))[0]?.state).toBe("current");
    // The third stays Waiting for Finance with its mark (06 Principal step switched off 5).
    expect((await marksNow([third.id])).get(third.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedPrincipal: true,
    });

    // Before both steps go off, the Principal decides the second and Finance the three waiting.
    await principalApproves(s, [{ id: second.id, variantId: second.variantId }]);
    expectOk(
      await runOrdersAction(
        approveOrders,
        s.finance.id,
        await ticked([first.id, second.id, third.id]),
      ),
    );
    expect(await runAction(switchPrincipalStep, s.head.id, { on: false })).toMatchObject({
      ok: true,
    });
    expect(await runAction(switchFinanceStep, s.head.id, { on: false })).toMatchObject({
      ok: true,
    });

    // With the Finance step off too, the Head approves a fourth order: straight to Open, Principal
    // and Finance both "Skipped", no Money tab and no cash count.
    const fourth = await atHead(s);
    await headApproves(s, [fourth.id]);
    expect((await marksNow([fourth.id])).get(fourth.id)).toMatchObject({
      status: "PURCHASING",
      skippedPrincipal: true,
      skippedFinance: true,
    });
    const opened = (await getOrderPage(s.manager.id, fourth.id))!;
    expect(
      opened.steps.filter((view) => view.step === "PRINCIPAL" || view.step === "FINANCE"),
    ).toEqual([
      { step: "PRINCIPAL", state: "skipped", by: null },
      { step: "FINANCE", state: "skipped", by: null },
    ]);
    // No Money tab: the page shows it only for an order that did not skip Finance.
    expect(opened.skippedFinance).toBe(true);
    expect(opened.canRecordMoney).toBe(false);

    // The Principal's approval list stayed empty for every skipped order.
    expect(await principalWaits()).toBe(0);

    // Both steps back on for the rest of this file's tests.
    expect(await runAction(switchFinanceStep, s.head.id, { on: true })).toMatchObject({ ok: true });
    expect(await runAction(switchPrincipalStep, s.head.id, { on: true })).toMatchObject({
      ok: true,
    });
  });
});
