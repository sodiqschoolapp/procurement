import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { lockOrders, runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../tests/helpers/clock";
import { moveScene, tickedInput } from "../../../tests/helpers/moves";
import { insertOrder, orderRow } from "../../../tests/helpers/orders";
import { sendBackOrders } from "./actions/send-back";
import { submitDrafts } from "./actions/submit";
import { submitAgainOrders } from "./actions/submit-again";
import { takeBackOrders } from "./actions/take-back";
import { createdByHeadSql } from "./order-facts";

// Build plan 2.11b (review of #61, finding 2): the order page and the list's ticked summary read
// `created_by_head` through createdByHeadSql, the action wrapper through lockOrders(); both read
// the same fact (CLAUDE.md rule 2), true only before the first Submit of a Head-created order
// (03 rule 6 as decisions 2.11 item 8 reads it; 06 rule 4: a corrected order goes back to the
// Head). The test walks the way back to Draft (.claude/rules/server-actions.md, permission review
// of 2.11).

/** The fact as the order page and the list read it: the fragment, selected over `orders`. */
async function screenFact(id: string): Promise<boolean> {
  const [row] = await db
    .select({ createdByHead: createdByHeadSql })
    .from(orders)
    .where(eq(orders.id, id));
  return row!.createdByHead;
}

/** The fact as the action wrapper reads it, under its lock. */
async function serverFact(id: string): Promise<boolean> {
  const [locked] = await db.transaction((tx) => lockOrders(tx, [id]));
  return locked!.createdByHead;
}

async function factsOf(id: string) {
  return { screen: await screenFact(id), server: await serverFact(id) };
}

describe("created_by_head: the screen and the server read one fact (decisions 2.11 item 8)", () => {
  it("a Head-created Draft reads true before its first Submit and false once taken back; a Manager's Draft false", async () => {
    setClock("2026-10-16T05:00:00Z");
    const { branch, manager, principal, head } = await moveScene();
    const own = await insertOrder({ branchId: branch.id, ownerId: head.id });
    const managers = await insertOrder({ branchId: branch.id, ownerId: manager.id });
    expect(await factsOf(own.id)).toEqual({ screen: true, server: true });
    expect(await factsOf(managers.id)).toEqual({ screen: false, server: false });

    // The first Submit skips the Head step (03 rule 6).
    expect(await runOrdersAction(submitDrafts, head.id, tickedInput([own], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: own.id, status: "PENDING_PRINCIPAL" }] },
    });
    setClock("2026-10-16T06:00:00Z");
    expect(
      await runOrdersAction(
        sendBackOrders,
        principal.id,
        tickedInput([{ id: own.id, version: 2 }]),
      ),
    ).toMatchObject({ ok: true });
    setClock("2026-10-16T07:00:00Z");
    expect(
      await runOrdersAction(
        submitAgainOrders,
        head.id,
        tickedInput([{ id: own.id, version: 3 }], {}),
      ),
    ).toMatchObject({ ok: true, data: { orders: [{ status: "PENDING_HEAD" }] } });
    setClock("2026-10-16T08:00:00Z");
    expect(
      await runOrdersAction(takeBackOrders, head.id, tickedInput([{ id: own.id, version: 4 }], {})),
    ).toMatchObject({ ok: true, data: { orders: [{ id: own.id, status: "DRAFT" }] } });

    const takenBack = (await orderRow(own.id))!;
    expect(takenBack.status).toBe("DRAFT");
    expect(takenBack.number).not.toBeNull();
    expect(await factsOf(own.id)).toEqual({ screen: false, server: false });
    expect(await factsOf(managers.id)).toEqual({ screen: false, server: false });
  });
});
