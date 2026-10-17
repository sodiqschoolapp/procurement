import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { moveOrdersToManager } from "../actions/move-owner";
import { moveOwnerChoices } from "./move-owner-choices";
import { tickedSummary } from "./order-list";
import { getOrderPage } from "./order-page";

// What the screen of the move reads (plan of 4.10, Server actions and queries and Tests): the
// Managers offered (03-roles-and-permissions.md rule 7: "another Manager of the same branch"), the
// list bar's `canMoveOwner` (03 Permission matrix: the Head only; decided item 1) and the history
// line with both names (06 rule 11). The matrix rows of the query are in
// ../actions/move-owner-matrix.db.test.ts.

async function scene() {
  setClock("2031-06-02T07:00:00Z");
  const branch = await insertBranch();
  const other = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const next = await insertUser("MANAGER", { branches: [branch.id] });
  const both = await insertUser("MANAGER", { branches: [branch.id, other.id] });
  const elsewhere = await insertUser("MANAGER", { branches: [other.id] });
  const inactive = await insertUser("MANAGER", { branches: [branch.id], isActive: false });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, other, manager, next, both, elsewhere, inactive, finance, head };
}

describe("moveOwnerChoices: the active Managers of the ticked orders' branch (03 rule 7)", () => {
  it("lists the branch's active Managers only, and for two branches those of both", async () => {
    const s = await scene();
    const here = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
    });
    const there = await insertOrder({
      branchId: s.other.id,
      ownerId: s.elsewhere.id,
      status: "PURCHASING",
    });

    const ids = (await moveOwnerChoices(s.head.id, [here.id])).map((choice) => choice.id);
    expect(ids).toEqual(expect.arrayContaining([s.manager.id, s.next.id, s.both.id]));
    // Another branch's Manager, an inactive Manager and a Finance user of the branch are not offered.
    for (const absent of [s.elsewhere.id, s.inactive.id, s.finance.id, s.head.id]) {
      expect(ids).not.toContain(absent);
    }
    expect((await moveOwnerChoices(s.head.id, [here.id, there.id])).map((c) => c.id)).toEqual([
      s.both.id,
    ]);
  });

  it("is refused to a Manager and is Not found for an unknown id (03 Permission matrix; rule 1)", async () => {
    const s = await scene();
    const here = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
    });
    await expect(moveOwnerChoices(s.manager.id, [here.id])).rejects.toEqual(
      new AuthorizationError("forbidden"),
    );
    await expect(moveOwnerChoices(s.head.id, [here.id, randomUUID()])).rejects.toEqual(
      new AuthorizationError("not_found"),
    );
  });
});

describe("moveOwnerChoices: mixed ticks answer Not found alike (03 rule 1; permission review of 4.10, Must fix 1)", () => {
  it.each(["MANAGER", "PRINCIPAL", "FINANCE"] as const)(
    "%s: an own order with another branch's order, a colleague's draft or an unknown id is Not found; alone it is forbidden",
    async (role) => {
      const s = await scene();
      const user =
        role === "MANAGER" ? s.manager : await insertUser(role, { branches: [s.branch.id] });
      const own = await insertOrder({
        branchId: s.branch.id,
        ownerId: s.next.id,
        status: "PURCHASING",
      });
      const there = await insertOrder({
        branchId: s.other.id,
        ownerId: s.elsewhere.id,
        status: "PURCHASING",
      });
      const draft = await insertOrder({
        branchId: s.branch.id,
        ownerId: s.next.id,
        status: "DRAFT",
      });
      for (const second of [there.id, draft.id, randomUUID()]) {
        for (const ticked of [
          [own.id, second],
          [second, own.id],
        ]) {
          await expect(moveOwnerChoices(user.id, ticked)).rejects.toEqual(
            new AuthorizationError("not_found"),
          );
        }
      }
      await expect(moveOwnerChoices(user.id, [own.id])).rejects.toEqual(
        new AuthorizationError("forbidden"),
      );
    },
  );

  it("HEAD: the same orders together are answered with the Managers of both branches", async () => {
    const s = await scene();
    const own = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.next.id,
      status: "PURCHASING",
    });
    const there = await insertOrder({
      branchId: s.other.id,
      ownerId: s.elsewhere.id,
      status: "PURCHASING",
    });
    expect((await moveOwnerChoices(s.head.id, [own.id, there.id])).map((c) => c.id)).toEqual([
      s.both.id,
    ]);
  });
});

describe("tickedSummary: canMoveOwner (03 rule 7; plan of 4.10, decided item 1)", () => {
  it("is offered to the Head on Open orders, not to a Manager, and not with a Closed order ticked", async () => {
    const s = await scene();
    const open = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
    });
    const waiting = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PENDING_PRINCIPAL",
    });
    const closed = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "CLOSED",
    });
    expect((await tickedSummary(s.head.id, [open.id, waiting.id])).canMoveOwner).toBe(true);
    expect((await tickedSummary(s.manager.id, [open.id, waiting.id])).canMoveOwner).toBe(false);
    expect((await tickedSummary(s.head.id, [open.id, closed.id])).canMoveOwner).toBe(false);
  });
});

describe("The order page's History: the move names both owners (06 rule 11; plan of 4.10)", () => {
  it("shows the old and the new owner on the MOVE_OWNER line, with the other orders of the action", async () => {
    const s = await scene();
    const a = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
    });
    const b = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
    });
    const moved = await runOrdersAction(moveOrdersToManager, s.head.id, {
      clientKey: randomUUID(),
      orders: [
        { id: a.id, version: a.version },
        { id: b.id, version: b.version },
      ],
      managerId: s.next.id,
    });
    expect(moved).toMatchObject({ ok: true });

    const page = await getOrderPage(s.head.id, a.id);
    const line = page!.events.find((event) => event.type === "MOVE_OWNER");
    expect(line).toMatchObject({
      owner: { from: s.manager.fullName, to: s.next.fullName },
      othersSeen: 1,
      comment: null,
    });
    // Every other line has no owner change.
    expect(page!.events.filter((event) => event.owner !== null)).toHaveLength(1);
  });
});
