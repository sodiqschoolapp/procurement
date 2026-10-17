import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { getPurchaseForm } from "./purchase-form";

// The trip form's query, build plan 3.4 (07-purchasing.md, One trip, many orders: "one branch and
// one owner … the trip takes the recording Manager's own orders of the row (the Head picks one
// owner)"; 03 rule 1; plan of 3.4, decided items 9 to 11 and spec review Should fix 2). An id the
// branch-filtered SQL does not return is dropped and never counted; every passing case has the
// refused data beside it (D40).

async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const colleague = await insertUser("MANAGER", { branches: [branch.id] });
  const pens = await insertItem();
  const open = (ownerId: string, branchId = branch.id, submittedAt = "07:00") =>
    insertOrder({
      branchId,
      ownerId,
      status: "PURCHASING",
      variantId: pens.variantId,
      plannedQty: "10",
      submittedAt: new Date(`2031-05-01T${submittedAt}:00Z`),
      approvedAt: new Date("2031-05-05T07:00:00Z"),
    });
  return { branch, manager, colleague, pens, open };
}

describe("getPurchaseForm for ticked orders (07 One trip, many orders; plan of 3.4)", () => {
  it("a Manager's group row of own and a colleague's orders: only the own ones, in the split's order, one left out", async () => {
    const s = await scene();
    const newer = await s.open(s.manager.id, s.branch.id, "09:00");
    const older = await s.open(s.manager.id, s.branch.id, "07:00");
    const theirs = await s.open(s.colleague.id);
    const form = await getPurchaseForm(s.manager.id, [newer.id, theirs.id, older.id]);
    expect(form?.orders.map((order) => order.orderId)).toEqual([older.id, newer.id]);
    expect(form?.owners.map((owner) => owner.id)).toEqual([s.manager.id]);
    expect(form?.leftOut).toBe(1);
  });

  it("the Head gets every owner's orders, the owner with the most orders first", async () => {
    const s = await scene();
    const head = await insertUser("HEAD");
    const theirs = await s.open(s.colleague.id);
    const mine = await s.open(s.manager.id);
    const mineToo = await s.open(s.manager.id);
    const form = await getPurchaseForm(head.id, [theirs.id, mine.id, mineToo.id]);
    expect(form?.orders).toHaveLength(3);
    expect(form?.owners.map((owner) => owner.id)).toEqual([s.manager.id, s.colleague.id]);
    expect(form?.leftOut).toBe(0);
  });

  it("the Head's orders of two branches: Not found (07 One trip: one branch)", async () => {
    const s = await scene();
    const head = await insertUser("HEAD");
    const other = await insertBranch();
    const here = await s.open(s.manager.id);
    const there = await s.open(s.manager.id, other.id);
    expect(await getPurchaseForm(head.id, [here.id, there.id])).toBeNull();
    expect(await getPurchaseForm(head.id, [here.id])).not.toBeNull();
  });

  it("another branch's id beside an own one is dropped and counted nowhere (03 rule 1)", async () => {
    const s = await scene();
    const other = await insertBranch();
    const stranger = await insertUser("MANAGER", { branches: [other.id] });
    const mine = await s.open(s.manager.id);
    const elsewhere = await s.open(stranger.id, other.id);
    const form = await getPurchaseForm(s.manager.id, [mine.id, elsewhere.id, randomUUID()]);
    expect(form?.orders.map((order) => order.orderId)).toEqual([mine.id]);
    expect(form?.leftOut).toBe(0);
    expect(
      JSON.stringify(form, (_, value: unknown) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    ).not.toContain(elsewhere.id);
  });

  it("only a colleague's orders, or the own ones with RECORD_PURCHASES off: refused (03 matrix 'Record purchases')", async () => {
    const s = await scene();
    const theirs = await s.open(s.colleague.id);
    const mine = await s.open(s.manager.id);
    await expect(getPurchaseForm(s.manager.id, [theirs.id])).rejects.toMatchObject({
      kind: "forbidden",
    });
    expect(await getPurchaseForm(s.manager.id, [theirs.id, mine.id])).not.toBeNull();
    await setManagerRight(s.manager.id, "RECORD_PURCHASES", false);
    await expect(getPurchaseForm(s.manager.id, [theirs.id, mine.id])).rejects.toMatchObject({
      kind: "forbidden",
    });
  });
});
