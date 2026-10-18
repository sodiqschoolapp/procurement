import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { insertProduct } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertDepartment, insertOrder } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { listOrderGroups } from "@/features/orders/queries/order-list";
import { getManagerHome } from "./manager-home";

import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";

// The Manager's home (build plan 6.1): 10-notifications-analytics-reports.md, Home page per role
// ("Sent back to me; my drafts; my open orders with progress; cash I hold; low stock; orders due
// soon"); 11-screens-and-ux.md, Interface per role: Manager; 05 Group rows 5; 07 Order progress;
// 08 Manager's cash balance; 03 rule 1 and Manager rights; plan of 6.1, decided items 1 to 5 and
// 7. Each counted row stands beside the rows the guards keep out: another Manager's order, my order
// in a branch I no longer have, a status one step off (D40).

// 16 October 2026 in Tashkent: today + 7 is 23 October.
const AT = "2026-10-16T05:00:00Z";

async function scene() {
  const branch = await insertBranch();
  // My order in a branch I no longer have: the owner stays, the wall keeps it out (03 rule 1).
  const lost = await insertBranch();
  const me = await insertUser("MANAGER", { branches: [branch.id] });
  const colleague = await insertUser("MANAGER", { branches: [branch.id] });
  const product = await insertProduct({ referencePrice: 5_000n });
  const mine = {
    branchId: branch.id,
    ownerId: me.id,
    departmentId: (await insertDepartment(branch.id)).id,
    variantId: product.defaultVariantId,
  };
  const theirs = { ...mine, ownerId: colleague.id };
  const elsewhere = {
    ...mine,
    branchId: lost.id,
    departmentId: (await insertDepartment(lost.id)).id,
  };
  return { branch, lost, me, colleague, product, mine, theirs, elsewhere };
}

type Base = Awaited<ReturnType<typeof scene>>["mine"];

/** A record of an Open-or-later order: qty × price, paid in cash (its trip's payment type). */
async function record(base: Base, orderId: string, qty: string, unitPrice: string) {
  const tripId = (await insertTrip(base.branchId, base.ownerId)).rows[0]!.id;
  return (
    await insertPurchaseRow({
      tripId,
      orderId,
      branchId: base.branchId,
      variantId: base.variantId,
      createdBy: base.ownerId,
      qty,
      unitPrice,
    })
  ).rows[0]!.id;
}

async function cashGiven(managerId: string, orderId: string, amount: string, by: string) {
  const action = (await insertMoneyAction({ managerId, createdBy: by })).rows[0]!.id;
  await insertMoneyRow({ moneyActionId: action, orderId, kind: "CASH_GIVEN", amount });
}

describe("the group blocks are the order list's own rows for their links (spec review of the plan, Should fix 1)", () => {
  it("sent back to me, my open orders and due soon: mine, in my branches, of their status only", async () => {
    setClock(AT);
    const { branch, me, mine, theirs, elsewhere } = await scene();
    const returned = await insertOrder({ ...mine, status: "RETURNED" });
    const open = await insertOrder({ ...mine, status: "PURCHASING", approvedAt: new Date(AT) });
    const due = await insertOrder({ ...mine, status: "PENDING_HEAD", neededBy: "2026-10-23" });
    // Kept out of each block, with every other value that would let it in.
    await insertOrder({ ...theirs, status: "RETURNED", neededBy: "2026-10-20" });
    await insertOrder({ ...elsewhere, status: "RETURNED", neededBy: "2026-10-20" });
    await insertOrder({ ...theirs, status: "PURCHASING", approvedAt: new Date(AT) });
    await insertOrder({ ...elsewhere, status: "PURCHASING", approvedAt: new Date(AT) });
    await insertOrder({ ...mine, status: "SETTLEMENT", approvedAt: new Date(AT) });
    await insertOrder({ ...mine, status: "PENDING_HEAD", neededBy: "2026-10-24" });
    await insertOrder({ ...theirs, status: "PENDING_HEAD", neededBy: "2026-10-20" });
    await insertOrder({ ...elsewhere, status: "PENDING_HEAD", neededBy: "2026-10-20" });

    const home = await getManagerHome(me.id, null);
    const ids = (page: { groups: { orders: { id: string }[] }[] }) =>
      page.groups.flatMap((group) => group.orders.map((order) => order.id)).sort();
    expect(ids(home.sentBack)).toEqual([returned.id]);
    expect(ids(home.open)).toEqual([open.id]);
    // The Sent back order's needed-by is the default, years ahead: not due soon.
    expect(ids(home.dueSoon)).toEqual([due.id]);
    // The home count is the list's count for the link's filters.
    for (const block of ["sentBack", "open", "dueSoon"] as const) {
      const list = await listOrderGroups(me.id, home.filters[block]);
      expect(home[block].total, block).toBe(list.total);
      expect(ids(home[block]), block).toEqual(ids(list));
    }
    expect(home.filters.sentBack).toMatchObject({ owner: me.id, status: "RETURNED" });
    expect(home.filters.open).toMatchObject({ owner: me.id, status: "PURCHASING" });
    expect(home.filters.dueSoon).toMatchObject({ owner: me.id, dueSoon: true });
    // With the top bar's branch chosen, the same.
    expect(ids((await getManagerHome(me.id, branch.id)).sentBack)).toEqual([returned.id]);
  });

  it("my open orders carry their progress: received over live records only (07 Order progress)", async () => {
    setClock(AT);
    const { me, mine } = await scene();
    const open = await insertOrder({
      ...mine,
      status: "PURCHASING",
      plannedQty: "10.000",
      approvedAt: new Date(AT),
    });
    await record(mine, open.id, "4.000", "5000");
    const cancelled = await record(mine, open.id, "3.000", "5000");
    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${me.id}, cancelled_at = ${AT} where id = ${cancelled}`);
    const done = await insertOrder({
      ...mine,
      status: "PURCHASING",
      progress: "DONE",
      approvedAt: new Date(AT),
    });

    const home = await getManagerHome(me.id, null);
    const orders = home.open.groups.flatMap((group) => group.orders);
    expect(orders.find((order) => order.id === open.id)).toMatchObject({
      progress: "OPEN",
      received: "4",
    });
    expect(orders.find((order) => order.id === done.id)).toMatchObject({
      progress: "DONE",
      received: "0",
    });
    // Both orders are of one subtype: one group row, 4 received, one of two finished.
    expect(Object.values(home.openProgress)).toEqual([{ received: "4", finished: 1 }]);
  });
});

describe("my drafts (10 Home page per role; plan of 6.1, What will exist 3)", () => {
  it("counts my drafts, never submitted or taken back; not a colleague's, not of a branch I lost, not a submitted one", async () => {
    setClock(AT);
    const { me, branch, mine, theirs, elsewhere } = await scene();
    await insertOrder({ ...mine, status: "DRAFT" });
    await insertOrder({ ...mine, status: "DRAFT", number: `${branch.code}-26-0998` });
    await insertOrder({ ...theirs, status: "DRAFT" });
    await insertOrder({ ...elsewhere, status: "DRAFT" });
    await insertOrder({ ...mine, status: "PENDING_HEAD" });
    expect((await getManagerHome(me.id, null)).drafts).toBe(2);
  });
});

describe("requested, every stage (05 Group rows 5; decided item 1, Look first)", () => {
  it("the review's worked example: Tata pens: 30 requested; Draft, Closed, Rejected, Cancelled, a colleague's and a lost branch's add nothing", async () => {
    setClock(AT);
    const { me, mine, theirs, elsewhere, product } = await scene();
    const at = new Date(AT);
    await insertOrder({ ...mine, status: "PENDING_HEAD", plannedQty: "10.000" });
    await insertOrder({ ...mine, status: "RETURNED", plannedQty: "5.000" });
    await insertOrder({ ...mine, status: "PURCHASING", plannedQty: "10.000", approvedAt: at });
    await insertOrder({ ...mine, status: "SETTLEMENT", plannedQty: "5.000", approvedAt: at });
    await insertOrder({ ...mine, status: "DRAFT", plannedQty: "3.000" });
    await insertOrder({ ...mine, status: "CLOSED", plannedQty: "20.000", closedAt: at });
    await insertOrder({ ...mine, status: "REJECTED", plannedQty: "4.000" });
    await insertOrder({ ...mine, status: "CANCELLED", plannedQty: "2.000" });
    await insertOrder({ ...theirs, status: "PENDING_HEAD", plannedQty: "7.000" });
    await insertOrder({ ...elsewhere, status: "PENDING_HEAD", plannedQty: "8.000" });

    const { requested } = await getManagerHome(me.id, null);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatchObject({
      variantId: product.defaultVariantId,
      quantity: "30",
      count: 4,
      subtypeName: null,
    });
  });
});

describe("cash I hold (08 Manager's cash balance; decided item 5)", () => {
  it("held and owed apart, over my orders that are not Closed, never netted", async () => {
    setClock(AT);
    const { me, colleague, mine, theirs, elsewhere } = await scene();
    const at = new Date(AT);
    const finance = await insertUser("FINANCE", { branches: [mine.branchId] });
    // Held 30 000: given 50 000, spent 20 000 in cash.
    const holding = await insertOrder({ ...mine, status: "PURCHASING", approvedAt: at });
    await cashGiven(me.id, holding.id, "50000", finance.id);
    await record(mine, holding.id, "2.000", "10000");
    // Owed 10 000: spent 10 000 of my own.
    const owing = await insertOrder({ ...mine, status: "SETTLEMENT", approvedAt: at });
    await record(mine, owing.id, "1.000", "10000");
    // Kept out: my Closed order with a count, a colleague's order, my order in a lost branch.
    const closed = await insertOrder({ ...mine, status: "CLOSED", closedAt: at });
    await cashGiven(me.id, closed.id, "40000", finance.id);
    const colleagues = await insertOrder({ ...theirs, status: "PURCHASING", approvedAt: at });
    await cashGiven(colleague.id, colleagues.id, "60000", finance.id);
    const lost = await insertOrder({ ...elsewhere, status: "PURCHASING", approvedAt: at });
    await cashGiven(me.id, lost.id, "70000", finance.id);

    const { cash } = await getManagerHome(me.id, null);
    expect(cash).toEqual({ held: 30_000n, owed: 10_000n, orders: 2 });
  });
});

describe("the three large buttons (11 Interface per role: Manager; 03 Manager rights; decided item 3)", () => {
  it("the Manager's home loads with all three; each right switched off takes its own button away", async () => {
    setClock(AT);
    const rights = [
      ["CREATE_REQUESTS", "newOrder"],
      ["RECORD_PURCHASES", "recordPurchase"],
      ["ISSUE_STOCK", "issue"],
    ] as const;
    for (const [right, button] of rights) {
      const { me } = await scene();
      expect((await getManagerHome(me.id, null)).buttons).toEqual({
        newOrder: true,
        recordPurchase: true,
        issue: true,
      });
      await setManagerRight(me.id, right, false);
      expect((await getManagerHome(me.id, null)).buttons, right).toEqual({
        newOrder: button !== "newOrder",
        recordPurchase: button !== "recordPurchase",
        issue: button !== "issue",
      });
    }
  });

  it("another branch's address is Not found (03 rule 1)", async () => {
    setClock(AT);
    const { me, lost } = await scene();
    await expect(getManagerHome(me.id, lost.id)).rejects.toThrow(AuthorizationError);
  });
});
