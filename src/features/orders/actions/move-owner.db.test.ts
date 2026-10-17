import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { cancelMoney } from "@/features/money/actions/cancel-money";
import { recordMoney } from "@/features/money/actions/record-money";
import { getOrderMoney } from "@/features/money/queries/order-money";
import { cancelPurchase, cancelTrip } from "@/features/purchasing/actions/cancel-purchase";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import { moneyActions, orderEvents, orders, purchases } from "@/server/db/schema";
import { type OrdersResult, runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { REASON, noticeCount, nothingSaved } from "../../../../tests/helpers/moves";
import { insertOrder } from "../../../../tests/helpers/orders";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { moveOrdersToManager } from "./move-owner";

// Move orders to another Manager, build plan 4.10 (Done when: "blocked when one of three ticked
// orders has a count of 50 000, and none moves; allowed at 0; a Manager of another branch cannot
// be chosen") and the plan's Tests: 03-roles-and-permissions.md (rules 7 and 8), edge cases "A
// Manager with cash in hand leaves the branch" and "A user is deactivated with work waiting", 08
// Money ledger 1, developer-rules.md rules 8 and 9, and the plan's decided items 1 to 4 (with
// corrections 1 and 2 of the plan review). Every fixture is asserted (D38); every passing case has
// the refused data beside it (D40). The permission rows are move-owner-matrix.db.test.ts.

const TODAY = "2031-06-02";

function expectOk(result: ActionResult<unknown>) {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: OrdersResult }).data;
}

async function versionOf(id: string): Promise<number> {
  const [row] = await db.select({ version: orders.version }).from(orders).where(eq(orders.id, id));
  return row!.version;
}

async function ticked(ids: readonly string[], clientKey: string = randomUUID()) {
  return {
    clientKey,
    orders: await Promise.all(ids.map(async (id) => ({ id, version: await versionOf(id) }))),
  };
}

async function ownerOf(id: string): Promise<string> {
  const [row] = await db.select({ owner: orders.ownerId }).from(orders).where(eq(orders.id, id));
  return row!.owner;
}

/** A branch with two Managers, Finance and a Head; a second branch with its own Manager. */
async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const other = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const next = await insertUser("MANAGER", { branches: [branch.id] });
  const elsewhere = await insertUser("MANAGER", { branches: [other.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, other, manager, next, elsewhere, finance, head };
}

type Scene = Awaited<ReturnType<typeof scene>>;

/** An Open cash order of the Manager, approved a day before today. */
function openOrder(s: Scene, ownerId = s.manager.id, branchId = s.branch.id) {
  return insertOrder({
    branchId,
    ownerId,
    status: "PURCHASING",
    paymentType: "CASH",
    approvedAt: new Date("2031-06-01T07:00:00Z"),
  });
}

type Order = Awaited<ReturnType<typeof openOrder>>;

async function money(s: Scene, order: Order, kind: string, amount: string): Promise<string> {
  const clientKey = randomUUID();
  expectOk(
    await runOrdersAction(recordMoney, s.finance.id, {
      ...(await ticked([order.id], clientKey)),
      kind,
      occurredOn: TODAY,
      comment: "Invented money",
      amounts: { [order.id]: amount },
    }),
  );
  const [action] = await db
    .select({ id: moneyActions.id })
    .from(moneyActions)
    .where(eq(moneyActions.clientKey, clientKey));
  return action!.id;
}

/** One trip of the owner with one line for the order: 10 × 5 000, the plan, paid as given. */
async function buy(
  user: InsertedUser,
  order: Order,
  paymentType: "CASH" | "TRANSFER",
): Promise<{ purchaseId: string; tripId: string }> {
  expectOk(
    await runOrdersAction(recordPurchase, user.id, {
      ...(await ticked([order.id])),
      purchasedOn: TODAY,
      paymentType,
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: order.id,
          variantId: order.variantId,
          qty: "10",
          unitPrice: "5000",
          extras: [],
          comment: "Invented: bought as planned",
        },
      ],
    }),
  );
  const [record] = await db
    .select({ id: purchases.id, tripId: purchases.tripId })
    .from(purchases)
    .where(eq(purchases.orderId, order.id))
    .orderBy(purchases.createdAt);
  return { purchaseId: record!.id, tripId: record!.tripId };
}

async function count(s: Scene, order: Order): Promise<bigint> {
  return (await getOrderMoney(s.finance.id, order.id))!.count;
}

async function move(s: Scene, ids: readonly string[], managerId: string, clientKey?: string) {
  return runOrdersAction(moveOrdersToManager, s.head.id, {
    ...(await ticked(ids, clientKey)),
    managerId,
  });
}

describe("Move orders to another Manager (03 rule 7; build plan 4.10)", () => {
  it("is refused whole when one of three ticked orders has a cash count of 50 000 (Done when 1; edge case 'A Manager with cash in hand leaves the branch')", async () => {
    const s = await scene();
    const [a, b, c] = [await openOrder(s), await openOrder(s), await openOrder(s)];
    await money(s, b, "CASH_GIVEN", "50000");
    expect(await count(s, b)).toBe(50_000n);
    expect(await count(s, a)).toBe(0n);
    const before = await noticeCount();
    const versions = await Promise.all([a, b, c].map((order) => versionOf(order.id)));

    const clientKey = randomUUID();
    expect(await move(s, [a.id, b.id, c.id], s.next.id, clientKey)).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: b.id, code: "not_ready", fields: { cashCount: "errors.field.cashNotZero" } },
        ],
      },
    });
    for (const order of [a, b, c]) expect(await ownerOf(order.id)).toBe(s.manager.id);
    expect(await Promise.all([a, b, c].map((order) => versionOf(order.id)))).toEqual(versions);
    // The money events of b stay; no MOVE_OWNER event, no action row, no notice.
    expect(await noticeCount()).toBe(before);
    const moved = await db.select().from(orderEvents).where(eq(orderEvents.type, "MOVE_OWNER"));
    expect(moved.filter((event) => [a.id, b.id, c.id].includes(event.orderId))).toEqual([]);
    await nothingSaved(clientKey, [a.id, c.id], before);
  });

  it("moves every ticked order at a count of 0 and writes each one's history (Done when 2; D40)", async () => {
    const s = await scene();
    // 50 000 given and returned; 50 000 given and spent in cash; nothing at all.
    const returned = await openOrder(s);
    await money(s, returned, "CASH_GIVEN", "50000");
    await money(s, returned, "CASH_RETURNED", "50000");
    const spent = await openOrder(s);
    await money(s, spent, "CASH_GIVEN", "50000");
    await buy(s.manager, spent, "CASH");
    const none = await openOrder(s);
    // Beside them: another branch's order of another owner, which is not ticked and stays.
    const beside = await openOrder(s, s.elsewhere.id, s.other.id);
    for (const order of [returned, spent, none]) expect(await count(s, order)).toBe(0n);
    const ids = [returned.id, spent.id, none.id];
    const versions = await Promise.all(ids.map(versionOf));

    const done = expectOk(await move(s, ids, s.next.id));
    expect(done.orders.map((order) => order.status)).toEqual([
      "PURCHASING",
      "PURCHASING",
      "PURCHASING",
    ]);
    for (const [at, id] of ids.entries()) {
      expect(await ownerOf(id)).toBe(s.next.id);
      expect(await versionOf(id)).toBe(versions[at]! + 1);
      const events = await db
        .select({
          type: orderEvents.type,
          from: orderEvents.fromStatus,
          to: orderEvents.toStatus,
          actorId: orderEvents.actorId,
          comment: orderEvents.comment,
          payload: orderEvents.payload,
        })
        .from(orderEvents)
        .where(and(eq(orderEvents.orderId, id), eq(orderEvents.type, "MOVE_OWNER")));
      expect(events).toEqual([
        {
          type: "MOVE_OWNER",
          from: "PURCHASING",
          to: "PURCHASING",
          actorId: s.head.id,
          comment: null,
          payload: { owner: { from: s.manager.id, to: s.next.id } },
        },
      ]);
    }
    expect(await ownerOf(beside.id)).toBe(s.elsewhere.id);
  });

  it("refuses a count of 1 so'm and a count below 0 (03 rule 7: 'whose cash count is zero'; decided item 2)", async () => {
    const s = await scene();
    const one = await openOrder(s);
    await money(s, one, "CASH_GIVEN", "50001");
    await buy(s.manager, one, "CASH");
    expect(await count(s, one)).toBe(1n);
    const owed = await openOrder(s);
    await money(s, owed, "CASH_GIVEN", "49999");
    await buy(s.manager, owed, "CASH");
    expect(await count(s, owed)).toBe(-1n);

    for (const order of [one, owed]) {
      expect(await move(s, [order.id], s.next.id)).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order.id, code: "not_ready" }] },
      });
      expect(await ownerOf(order.id)).toBe(s.manager.id);
    }
  });

  it("refuses a Manager of another branch, and allows one of both branches (Done when 3; decided item 4)", async () => {
    const s = await scene();
    const order = await openOrder(s);
    expect(await move(s, [order.id], s.elsewhere.id)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { managerId: "errors.field.notBranchManager" } },
    });
    expect(await ownerOf(order.id)).toBe(s.manager.id);

    const both = await insertUser("MANAGER", { branches: [s.branch.id, s.other.id] });
    expectOk(await move(s, [order.id], both.id));
    expect(await ownerOf(order.id)).toBe(both.id);
  });

  it("refuses orders of two branches for a Manager of one of them (03 rule 7: 'of the same branch')", async () => {
    const s = await scene();
    const here = await openOrder(s);
    const there = await openOrder(s, s.elsewhere.id, s.other.id);
    expect(await move(s, [here.id, there.id], s.next.id)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { managerId: "errors.field.notBranchManager" } },
    });
    expect(await ownerOf(here.id)).toBe(s.manager.id);
    expect(await ownerOf(there.id)).toBe(s.elsewhere.id);
  });

  it("refuses an inactive Manager, a Finance user and a Head of the branch (03 rule 7: 'another Manager')", async () => {
    const s = await scene();
    const order = await openOrder(s);
    const inactive = await insertUser("MANAGER", { branches: [s.branch.id], isActive: false });
    for (const target of [inactive.id, s.finance.id, s.head.id]) {
      expect(await move(s, [order.id], target)).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { managerId: "errors.field.notBranchManager" } },
      });
    }
    expect(await ownerOf(order.id)).toBe(s.manager.id);
  });

  it("refuses an order the chosen Manager owns already (03 rule 7: 'another Manager')", async () => {
    const s = await scene();
    const mine = await openOrder(s, s.next.id);
    const theirs = await openOrder(s);
    expect(await move(s, [mine.id, theirs.id], s.next.id)).toMatchObject({
      ok: false,
      error: {
        orders: [
          {
            orderId: mine.id,
            code: "not_ready",
            fields: { managerId: "errors.field.alreadyOwner" },
          },
        ],
      },
    });
    expect(await ownerOf(theirs.id)).toBe(s.manager.id);
  });

  it.each(["DRAFT", "CLOSED", "REJECTED", "CANCELLED"] as const)(
    "refuses an order at %s as wrong_status (decided item 1, Look first)",
    async (status) => {
      const s = await scene();
      const order = await insertOrder({ branchId: s.branch.id, ownerId: s.manager.id, status });
      expect(await move(s, [order.id], s.next.id)).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order.id, code: "wrong_status" }] },
      });
      expect(await ownerOf(order.id)).toBe(s.manager.id);
    },
  );

  it.each([
    "PENDING_HEAD",
    "PENDING_PRINCIPAL",
    "PENDING_FINANCE",
    "RETURNED",
    "SETTLEMENT",
  ] as const)("moves an order at %s (decided item 1)", async (status) => {
    const s = await scene();
    const order = await insertOrder({ branchId: s.branch.id, ownerId: s.manager.id, status });
    expectOk(await move(s, [order.id], s.next.id));
    expect(await ownerOf(order.id)).toBe(s.next.id);
  });

  it("refuses a stale version whole, and gives the first answer to the same client key (developer-rules 8, 9)", async () => {
    const s = await scene();
    const [a, b] = [await openOrder(s), await openOrder(s)];
    const stale = await move(s, [a.id, b.id], s.next.id);
    expectOk(stale);
    // b's sent version is now old.
    const old = await runOrdersAction(moveOrdersToManager, s.head.id, {
      clientKey: randomUUID(),
      orders: [{ id: b.id, version: 1 }],
      managerId: s.manager.id,
    });
    expect(old).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: b.id, code: "stale_version" }] },
    });
    expect(await ownerOf(b.id)).toBe(s.next.id);

    const c = await openOrder(s);
    const clientKey = randomUUID();
    const input = { ...(await ticked([c.id], clientKey)), managerId: s.next.id };
    const first = expectOk(await runOrdersAction(moveOrdersToManager, s.head.id, input));
    const again = expectOk(await runOrdersAction(moveOrdersToManager, s.head.id, input));
    expect(again).toEqual(first);
    const events = await db
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, c.id), eq(orderEvents.type, "MOVE_OWNER")));
    expect(events).toHaveLength(1);
  });
});

describe("Cancels after a move (plan of 4.10, decided item 3, Look first; corrections 1 and 2)", () => {
  /** An order at 0 after 50 000 given and spent in cash by the first Manager, then moved. */
  async function movedAfterCash(s: Scene) {
    const order = await openOrder(s);
    const actionId = await money(s, order, "CASH_GIVEN", "50000");
    const bought = await buy(s.manager, order, "CASH");
    expect(await count(s, order)).toBe(0n);
    advanceClock({ minutes: 1 });
    expectOk(await move(s, [order.id], s.next.id));
    advanceClock({ minutes: 1 });
    return { order, actionId, ...bought };
  }

  const movedSince = { status: "errors.field.movedSince" };

  it("refuses the cancel of a money action written before the move", async () => {
    const s = await scene();
    const { order, actionId } = await movedAfterCash(s);
    expect(
      await runOrdersAction(cancelMoney, s.finance.id, {
        ...(await ticked([order.id])),
        moneyActionId: actionId,
        reason: REASON,
      }),
    ).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "wrong_status", fields: movedSince }] },
    });
    expect(await count(s, order)).toBe(0n);
  });

  it("refuses the cancel of a cash record and of its trip written before the move", async () => {
    const s = await scene();
    const { order, purchaseId, tripId } = await movedAfterCash(s);
    for (const [definition, field] of [
      [cancelPurchase, { purchaseId }],
      [cancelTrip, { tripId }],
    ] as const) {
      expect(
        await runOrdersAction(definition, s.head.id, {
          ...(await ticked([order.id])),
          ...field,
          reason: REASON,
        }),
      ).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order.id, code: "wrong_status", fields: movedSince }] },
      });
    }
    expect(await count(s, order)).toBe(0n);
  });

  it("still refuses after the order is moved back to the first Manager", async () => {
    const s = await scene();
    const { order, actionId, purchaseId } = await movedAfterCash(s);
    expectOk(await move(s, [order.id], s.manager.id));
    advanceClock({ minutes: 1 });
    expect(await ownerOf(order.id)).toBe(s.manager.id);
    expect(
      await runOrdersAction(cancelMoney, s.finance.id, {
        ...(await ticked([order.id])),
        moneyActionId: actionId,
        reason: REASON,
      }),
    ).toMatchObject({
      ok: false,
      error: { orders: [{ code: "wrong_status", fields: movedSince }] },
    });
    expect(
      await runOrdersAction(cancelPurchase, s.head.id, {
        ...(await ticked([order.id])),
        purchaseId,
        reason: REASON,
      }),
    ).toMatchObject({
      ok: false,
      error: { orders: [{ code: "wrong_status", fields: movedSince }] },
    });
  });

  it("lets a Transfer record of a moved order be cancelled: it changes no cash count (correction 1)", async () => {
    const s = await scene();
    const order = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
      paymentType: "TRANSFER",
      approvedAt: new Date("2031-06-01T07:00:00Z"),
    });
    const { purchaseId } = await buy(s.manager, order, "TRANSFER");
    advanceClock({ minutes: 1 });
    expectOk(await move(s, [order.id], s.next.id));
    advanceClock({ minutes: 1 });
    expectOk(
      await runOrdersAction(cancelPurchase, s.head.id, {
        ...(await ticked([order.id])),
        purchaseId,
        reason: REASON,
      }),
    );
    expect(await count(s, order)).toBe(0n);
  });

  it("lets the new owner's money action written after the move be cancelled (08 Money ledger 1)", async () => {
    const s = await scene();
    const { order } = await movedAfterCash(s);
    const actionId = await money(s, order, "CASH_GIVEN", "20000");
    const [action] = await db
      .select({ managerId: moneyActions.managerId })
      .from(moneyActions)
      .where(eq(moneyActions.id, actionId));
    expect(action!.managerId).toBe(s.next.id);
    expect(await count(s, order)).toBe(20_000n);
    advanceClock({ minutes: 1 });
    expectOk(
      await runOrdersAction(cancelMoney, s.finance.id, {
        ...(await ticked([order.id])),
        moneyActionId: actionId,
        reason: REASON,
      }),
    );
    expect(await count(s, order)).toBe(0n);
  });
});
