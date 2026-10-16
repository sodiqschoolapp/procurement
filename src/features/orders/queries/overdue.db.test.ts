import { describe, expect, it } from "vitest";

import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import { moveScene, tickedInput } from "../../../../tests/helpers/moves";
import { insertItem, insertOrder, orderRow } from "../../../../tests/helpers/orders";
import { approveOrders } from "../actions/approve";
import { getOrderPage } from "./order-page";
import { listOrderGroups } from "./order-list";

// "Overdue", build plan 2.13: edge-cases/requests-and-approval.md ("The needed-by date passes
// while the order waits": "The order shows 'Overdue'. Nothing is blocked"); developer-rules.md
// rule 10 (business dates in Asia/Tashkent, from the injected clock); plan of 2.13, decided item
// 8 and the review's correction 1. The domain cases are in src/domain/order-steps.test.ts; every
// reader of the value is tested here (.claude/rules/tests.md): the list's order rows, its group
// rows and the order page.

// 00:30 on 16 October in Tashkent, still 15 October in UTC: an order needed by the 15th is
// overdue only by the Tashkent date.
const AFTER_MIDNIGHT = "2026-10-15T19:30:00Z";

async function scene() {
  setClock(AFTER_MIDNIGHT);
  const people = await moveScene();
  const item = await insertItem();
  const at = (status: "PENDING_HEAD" | "REJECTED", neededBy: string) =>
    insertOrder({
      branchId: people.branch.id,
      ownerId: people.manager.id,
      status,
      variantId: item.variantId,
      neededBy,
    });
  return { ...people, at };
}

describe("Overdue in the order list and on the order page (edge case 'The needed-by date passes')", () => {
  it("a waiting order needed by yesterday is overdue; one needed today and a rejected one are not", async () => {
    const { head, at } = await scene();
    const late = await at("PENDING_HEAD", "2026-10-15");
    const today = await at("PENDING_HEAD", "2026-10-16");
    const rejected = await at("REJECTED", "2026-10-15");

    const { groups } = await listOrderGroups(head.id);
    const shown = new Map(
      groups.flatMap((group) => group.orders.map((order) => [order.id, order.overdue] as const)),
    );
    expect(shown.get(late.id)).toBe(true);
    expect(shown.get(today.id)).toBe(false);
    expect(shown.get(rejected.id)).toBe(false);

    expect((await getOrderPage(head.id, late.id))?.overdue).toBe(true);
    expect((await getOrderPage(head.id, today.id))?.overdue).toBe(false);
    expect((await getOrderPage(head.id, rejected.id))?.overdue).toBe(false);
  });

  it("a group row holding one overdue and one other order shows Overdue; a group of none does not", async () => {
    const { head, at } = await scene();
    const late = await at("PENDING_HEAD", "2026-10-15");
    await at("PENDING_HEAD", "2026-10-16");
    const rejected = await at("REJECTED", "2026-10-15");

    const { groups } = await listOrderGroups(head.id);
    const waiting = groups.find((group) => group.orders.some((order) => order.id === late.id));
    expect(waiting?.orders).toHaveLength(2);
    expect(waiting?.summary.overdue).toBe(true);
    const closed = groups.find((group) => group.orders.some((order) => order.id === rejected.id));
    expect(closed?.summary.overdue).toBe(false);
  });

  it("nothing is blocked: an overdue order is approved by the Head and then by the Principal (review correction 1)", async () => {
    const { head, principal, at } = await scene();
    const late = await at("PENDING_HEAD", "2026-10-15");
    expect(await runOrdersAction(approveOrders, head.id, tickedInput([late], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: late.id, status: "PENDING_PRINCIPAL" }] },
    });
    const [after] = [await orderRow(late.id)];
    expect(
      await runOrdersAction(
        approveOrders,
        principal.id,
        tickedInput([{ id: late.id, version: after!.version }], {}),
      ),
    ).toMatchObject({ ok: true, data: { orders: [{ id: late.id, status: "PENDING_FINANCE" }] } });
  });
});
