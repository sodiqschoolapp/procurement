import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { branches } from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { moveScene, ordersAt } from "../../../../tests/helpers/moves";
import { getOrderPage } from "./order-page";
import { tickedSummary } from "./order-list";

// `canCopy`, the offer of Copy as new, at both of its readers: the list's ticked orders and the
// order page (05 Ticking and filters: Copy as new; 03 Manager rights: "Switching one off removes
// those buttons"; .claude/rules/tests.md, "a test at every reader"; plan of 2.13, decided item 1,
// Look first; permission review, Must fix 3). The server asks again: copy-as-new.db.test.ts.

async function scene() {
  const people = await moveScene();
  const [order] = await ordersAt(people.branch.id, people.manager.id, "REJECTED");
  return { ...people, order: order! };
}

async function offered(userId: string, orderId: string) {
  return {
    list: (await tickedSummary(userId, [orderId])).canCopy,
    page: (await getOrderPage(userId, orderId))?.canCopy,
  };
}

describe("canCopy at both readers (decided item 1, Look first)", () => {
  it("the Head and the Manager with CREATE_REQUESTS: offered", async () => {
    const { head, manager, order } = await scene();
    expect(await offered(head.id, order.id)).toEqual({ list: true, page: true });
    expect(await offered(manager.id, order.id)).toEqual({ list: true, page: true });
  });

  it("the Manager with CREATE_REQUESTS switched off: not offered", async () => {
    const { manager, order } = await scene();
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    expect(await offered(manager.id, order.id)).toEqual({ list: false, page: false });
  });

  it("the Principal and Finance of the branch: not offered", async () => {
    const { principal, finance, order } = await scene();
    expect(await offered(principal.id, order.id)).toEqual({ list: false, page: false });
    expect(await offered(finance.id, order.id)).toEqual({ list: false, page: false });
  });

  it("an order of an inactive branch: not offered, also to the Head", async () => {
    const { head, branch, order } = await scene();
    await db.update(branches).set({ isActive: false }).where(eq(branches.id, branch.id));
    expect(await offered(head.id, order.id)).toEqual({ list: false, page: false });
  });

  it("ticked orders of an active and an inactive branch: not offered for the whole tick", async () => {
    const { head, order } = await scene();
    const closing = await insertBranch();
    const owner = (await moveScene()).manager;
    const [old] = await ordersAt(closing.id, owner.id, "CLOSED");
    expect((await tickedSummary(head.id, [order.id, old!.id])).canCopy).toBe(true);
    await db.update(branches).set({ isActive: false }).where(eq(branches.id, closing.id));
    const summary = await tickedSummary(head.id, [order.id, old!.id]);
    expect(summary.count).toBe(2);
    expect(summary.canCopy).toBe(false);
  });
});
