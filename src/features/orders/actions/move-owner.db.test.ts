import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { cancelMoney } from "@/features/money/actions/cancel-money";
import { recordMoney } from "@/features/money/actions/record-money";
import { getOrderMoney } from "@/features/money/queries/order-money";
import { cancelPurchase, cancelTrip } from "@/features/purchasing/actions/cancel-purchase";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import { moneyActions, notifications, orderEvents, orders, purchases } from "@/server/db/schema";
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
  qty = "10",
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
          qty,
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

describe('Cancels after a move (08 Money ledger: "When one of its orders was moved to another Manager since, the Head first moves it back"; edge case "A typo in a purchase record"; D55 (2); plans of 4.10, decided item 3, and 4.10b, decided items 3 and 4, Look first)', () => {
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

  /** The refusal naming the Manager the order was with when the cancelled thing was written. */
  const movedSince = (manager: InsertedUser) => ({
    code: "wrong_status",
    fields: { status: "errors.field.movedSince" },
    values: { manager: manager.fullName },
  });

  function cancelMoneyOf(s: Scene, order: Order, moneyActionId: string) {
    return ticked([order.id]).then((sent) =>
      runOrdersAction(cancelMoney, s.finance.id, { ...sent, moneyActionId, reason: REASON }),
    );
  }

  function cancelPurchaseOf(s: Scene, order: Order, purchaseId: string) {
    return ticked([order.id]).then((sent) =>
      runOrdersAction(cancelPurchase, s.head.id, { ...sent, purchaseId, reason: REASON }),
    );
  }

  it("refuses the cancel of a money action written before the move, naming the Manager to move it back to", async () => {
    const s = await scene();
    const { order, actionId } = await movedAfterCash(s);
    expect(await cancelMoneyOf(s, order, actionId)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, ...movedSince(s.manager) }] },
    });
    expect(await count(s, order)).toBe(0n);
  });

  it("refuses the cancel of a cash record and of its trip written before the move, naming that Manager", async () => {
    const s = await scene();
    const { order, purchaseId, tripId } = await movedAfterCash(s);
    const cancels = [
      async () => cancelPurchaseOf(s, order, purchaseId),
      async () =>
        runOrdersAction(cancelTrip, s.head.id, {
          ...(await ticked([order.id])),
          tripId,
          reason: REASON,
        }),
    ];
    for (const cancel of cancels) {
      expect(await cancel()).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order.id, ...movedSince(s.manager) }] },
      });
    }
    expect(await count(s, order)).toBe(0n);
  });

  it("a Principal and a Manager without the right, sending a moved order, are not told whom to move it back to (permission review of 4.10b, Should fix 1)", async () => {
    const s = await scene();
    const { order, actionId, purchaseId } = await movedAfterCash(s);
    const principal = await insertUser("PRINCIPAL", { branches: [s.branch.id] });
    const answers = [
      await runOrdersAction(cancelMoney, principal.id, {
        ...(await ticked([order.id])),
        moneyActionId: actionId,
        reason: REASON,
      }),
      await runOrdersAction(cancelPurchase, principal.id, {
        ...(await ticked([order.id])),
        purchaseId,
        reason: REASON,
      }),
      await runOrdersAction(cancelMoney, s.next.id, {
        ...(await ticked([order.id])),
        moneyActionId: actionId,
        reason: REASON,
      }),
    ];
    for (const answer of answers) {
      if (answer.ok) throw new Error("expected a refusal");
      const [failed] = answer.error.orders ?? [];
      expect(failed).toBeDefined();
      expect(failed!.values).toBeUndefined();
    }
    expect(await count(s, order)).toBe(0n);
  });

  // Changed by D55 (2) and the spec change of 20.10.2026: 4.10 kept the refusal after a move back
  // (plan of 4.10b, Look first).
  it("Aziz's typo is refused while the order is with Dilnoza and cancelled once it is back with Aziz; an order still with Dilnoza beside it stays refused", async () => {
    const s = await scene();
    const back = await movedAfterCash(s);
    const still = await movedAfterCash(s);
    expectOk(await move(s, [back.order.id], s.manager.id));
    advanceClock({ minutes: 1 });
    expect(await ownerOf(back.order.id)).toBe(s.manager.id);
    expect(await ownerOf(still.order.id)).toBe(s.next.id);

    expect(await cancelPurchaseOf(s, still.order, still.purchaseId)).toMatchObject({
      ok: false,
      error: { orders: [movedSince(s.manager)] },
    });
    expect(await cancelMoneyOf(s, still.order, still.actionId)).toMatchObject({
      ok: false,
      error: { orders: [movedSince(s.manager)] },
    });
    expect(await count(s, still.order)).toBe(0n);

    // Back with Aziz: his typo is cancelled (the count goes to 50 000 he holds), then the cash
    // given is cancelled (back to 0).
    expectOk(await cancelPurchaseOf(s, back.order, back.purchaseId));
    expect(await count(s, back.order)).toBe(50_000n);
    expectOk(await cancelMoneyOf(s, back.order, back.actionId));
    expect(await count(s, back.order)).toBe(0n);
  });

  it("a record written while the order was with Dilnoza, after it is moved back to Aziz, is refused naming Dilnoza (the first move at or after the write; review correction 1)", async () => {
    const s = await scene();
    // With Aziz: 25 000 given and spent on 5 of the 10, then moved to Dilnoza at a count of 0.
    const order = await openOrder(s);
    await money(s, order, "CASH_GIVEN", "25000");
    await buy(s.manager, order, "CASH", "5");
    expect(await count(s, order)).toBe(0n);
    advanceClock({ minutes: 1 });
    expectOk(await move(s, [order.id], s.next.id));
    advanceClock({ minutes: 1 });
    // With Dilnoza: Finance gives 25 000, Dilnoza spends it in cash on the other 5.
    const given = await money(s, order, "CASH_GIVEN", "25000");
    advanceClock({ minutes: 1 });
    await buy(s.next, order, "CASH", "5");
    const [record] = await db
      .select({ id: purchases.id })
      .from(purchases)
      .where(and(eq(purchases.orderId, order.id), eq(purchases.createdBy, s.next.id)));
    expect(await count(s, order)).toBe(0n);
    advanceClock({ minutes: 1 });
    expectOk(await move(s, [order.id], s.manager.id));
    advanceClock({ minutes: 1 });
    expect(await ownerOf(order.id)).toBe(s.manager.id);

    expect(await cancelPurchaseOf(s, order, record!.id)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, ...movedSince(s.next) }] },
    });
    expect(await cancelMoneyOf(s, order, given)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, ...movedSince(s.next) }] },
    });
    expect(await count(s, order)).toBe(0n);
  });

  // Changed by D55 (2) and the spec change of 20.10.2026: the edge case names no payment type, so
  // 4.10's correction 1 (a Transfer record of a moved order is cancelled) ends (plan of 4.10b,
  // decided item 4, Look first).
  it("a Transfer record of a moved order is refused too, and cancelled once the order is back", async () => {
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
    expect(await cancelPurchaseOf(s, order, purchaseId)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, ...movedSince(s.manager) }] },
    });
    expectOk(await move(s, [order.id], s.manager.id));
    advanceClock({ minutes: 1 });
    expectOk(await cancelPurchaseOf(s, order, purchaseId));
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

/** The move notices one user got, as [type, branch id, count, manager]. */
async function moveNotices(userId: string) {
  const rows = await db
    .select({
      type: notifications.type,
      branchId: notifications.branchId,
      params: notifications.params,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.type, ["REQUEST_MOVED_IN", "REQUEST_MOVED_OUT"]),
      ),
    );
  return rows
    .map((row) => {
      const params = row.params as { count: number; manager?: string };
      return [row.type, row.branchId, params.count, params.manager ?? null];
    })
    .sort((a, b) => String(a).localeCompare(String(b)));
}

describe('Who is told of a move (10 Notifications: "Orders moved to another Manager | The new owner and the old one"; D55 item 14; plan of 2.3b, decided item 9)', () => {
  it("orders of two old owners in two branches: the new owner one notice per branch, each old owner one per branch with the new owner's name", async () => {
    setClock(`${TODAY}T07:00:00Z`);
    const chl = await insertBranch();
    const yun = await insertBranch();
    const dilnoza = await insertUser("MANAGER", { branches: [chl.id, yun.id] });
    const aziz = await insertUser("MANAGER", { branches: [chl.id] });
    const bekzod = await insertUser("MANAGER", { branches: [chl.id, yun.id] });
    const finance = await insertUser("FINANCE", { branches: [chl.id, yun.id] });
    const head = await insertUser("HEAD");
    const otherHead = await insertUser("HEAD");
    const at = (branchId: string, ownerId: string) =>
      insertOrder({ branchId, ownerId, status: "PENDING_HEAD" });
    const ids = [
      (await at(chl.id, aziz.id)).id,
      (await at(chl.id, aziz.id)).id,
      (await at(chl.id, bekzod.id)).id,
      (await at(yun.id, bekzod.id)).id,
    ];

    const result = await runOrdersAction(moveOrdersToManager, head.id, {
      ...(await ticked(ids)),
      managerId: dilnoza.id,
    });
    expectOk(result);

    expect(await moveNotices(dilnoza.id)).toEqual(
      [
        ["REQUEST_MOVED_IN", chl.id, 3, null],
        ["REQUEST_MOVED_IN", yun.id, 1, null],
      ].sort((a, b) => String(a).localeCompare(String(b))),
    );
    expect(await moveNotices(aziz.id)).toEqual([
      ["REQUEST_MOVED_OUT", chl.id, 2, dilnoza.fullName],
    ]);
    expect(await moveNotices(bekzod.id)).toEqual(
      [
        ["REQUEST_MOVED_OUT", chl.id, 1, dilnoza.fullName],
        ["REQUEST_MOVED_OUT", yun.id, 1, dilnoza.fullName],
      ].sort((a, b) => String(a).localeCompare(String(b))),
    );
    // Nobody else: not the Head who moved them, not another Head, not Finance.
    for (const user of [head, otherHead, finance]) expect(await moveNotices(user.id)).toEqual([]);
  });

  it("an old owner who left the branch or was deactivated gets no notice; the new owner still does", async () => {
    setClock(`${TODAY}T07:00:00Z`);
    const chl = await insertBranch();
    const elsewhere = await insertBranch();
    const dilnoza = await insertUser("MANAGER", { branches: [chl.id] });
    const left = await insertUser("MANAGER", { branches: [chl.id] });
    const gone = await insertUser("MANAGER", { branches: [chl.id] });
    const head = await insertUser("HEAD");
    const fromLeft = await insertOrder({ branchId: chl.id, ownerId: left.id, status: "RETURNED" });
    const fromGone = await insertOrder({ branchId: chl.id, ownerId: gone.id, status: "RETURNED" });
    // The one who left works in another branch now; the other is switched off.
    await db.execute(
      sql`update user_branches set branch_id = ${elsewhere.id} where user_id = ${left.id}`,
    );
    await db.execute(sql`update users set is_active = false where id = ${gone.id}`);

    expectOk(
      await runOrdersAction(moveOrdersToManager, head.id, {
        ...(await ticked([fromLeft.id, fromGone.id])),
        managerId: dilnoza.id,
      }),
    );
    expect(await moveNotices(dilnoza.id)).toEqual([["REQUEST_MOVED_IN", chl.id, 2, null]]);
    expect(await moveNotices(left.id)).toEqual([]);
    expect(await moveNotices(gone.id)).toEqual([]);
  });
});
