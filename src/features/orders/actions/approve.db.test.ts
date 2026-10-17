import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { alreadyDecidedBy } from "@/domain/already-decided";
import type { RequestStatus } from "@/domain/request-status";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import {
  notifications,
  orderActions,
  orderEvents,
  orders,
  stockBalances,
  users,
} from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder, orderRow } from "../../../../tests/helpers/orders";
import { commitWhileWaiting } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { createUser } from "../../users/actions/users";
import { NO_FILTERS } from "../list-filters";
import { listOrderGroups } from "../queries/order-list";
import { getOrderPage } from "../queries/order-page";
import { newestMoves } from "../queries/newest-moves";
import { approveOrders } from "./approve";

// Approve, build plan 2.10 (Done when: the first half of S8; S19 up to the Principal; a Principal
// of another branch refused, also among own-branch ticks; Open after Finance) and the plan's
// Tests: 06-approval-workflow.md (Allowed moves: the three Approve rows; rules 1, 7, 8, 10, 11),
// 03-roles-and-permissions.md (rules 1, 3, 8), 10-notifications-analytics-reports.md
// (Notifications: Head, Principal and Finance approved), 15-quality-and-acceptance.md (S8, S19),
// edge-cases/requests-and-approval.md ("Two approvers act on the same orders", "Stock changes
// between submit and approval", "The branch's Principal changes while orders wait"), and the
// review of the plan, corrections 1 and 3. Every passing case has the refused data beside it
// (D40). The permission rows are approve-matrix in src/app/(app)/orders/actions-matrix.db.test.ts.

type Ticked = { id: string; version: number };

const ticked = (list: readonly Ticked[], extra: Record<string, unknown> = {}) => ({
  clientKey: randomUUID(),
  orders: list.map(({ id, version }) => ({ id, version })),
  ...extra,
});

function approve(userId: string, input: unknown) {
  return runOrdersAction(approveOrders, userId, input);
}

/** A branch with its Manager, Principal and Finance user, and a Head of all branches. */
async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, manager, principal, finance, head };
}

/** `count` submitted orders of an owner at a status. */
async function waiting(
  branchId: string,
  ownerId: string,
  status: RequestStatus,
  count = 1,
  options: {
    variantId?: string;
    paymentType?: "CASH" | "TRANSFER" | "CARD";
    plannedQty?: string;
  } = {},
) {
  const made = [];
  for (let at = 0; at < count; at += 1) {
    made.push(await insertOrder({ branchId, ownerId, status, ...options }));
  }
  return made;
}

async function statesOf(ids: readonly string[]) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      version: orders.version,
      paymentType: orders.paymentType,
      plannedTotal: orders.plannedTotal,
      approvedAt: orders.approvedAt,
    })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Nothing of a refused action was written (06 rule 8: all or nothing). */
/** How many notifications exist: a refused action adds none. */
async function noticeCount(): Promise<number> {
  return (await db.select({ id: notifications.id }).from(notifications)).length;
}

async function nothingSaved(clientKey: string, ids: readonly string[], noticesBefore: number) {
  expect(await noticeCount()).toBe(noticesBefore);
  expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, clientKey))).toEqual(
    [],
  );
  expect(
    await db
      .select()
      .from(orderEvents)
      .where(inArray(orderEvents.orderId, [...ids])),
  ).toEqual([]);
}

async function noticesOf(userId: string, type: (typeof notifications.$inferSelect)["type"]) {
  return db
    .select({ params: notifications.params, link: notifications.link })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
}

describe("S8, first half: two Heads approve the same ticked orders together (15 S8; 06 rule 7)", () => {
  it("one succeeds, the other is refused whole and is told who approved and when", async () => {
    setClock("2026-10-16T09:32:00Z");
    const { branch, manager } = await scene();
    const aziz = await insertUser("HEAD", { fullName: "Aziz Karimov" });
    const bekzod = await insertUser("HEAD", { fullName: "Bekzod Toshev" });
    const both = await waiting(branch.id, manager.id, "PENDING_HEAD", 2);
    const ids = both.map((order) => order.id);
    // Beside it, an order of the same branch nobody ticked (D40): it must not move.
    const [untouched] = await waiting(branch.id, manager.id, "PENDING_HEAD");

    // The two orders are held on another connection until both approvals wait on them, so they
    // meet in the middle of their transactions (15 Test layers: "prove the locks work").
    const [first, second] = await commitWhileWaiting(
      async (query) => {
        await query("select id from orders where id = any($1::uuid[]) for update", [ids]);
      },
      () => Promise.all([approve(aziz.id, ticked(both)), approve(bekzod.id, ticked(both))]),
      2,
    );
    const results = [first!, second!];
    const won = results.findIndex((result) => result.ok);
    expect(won).not.toBe(-1);
    const lost = results[1 - won]!;
    const winner = won === 0 ? aziz : bekzod;
    const loser = won === 0 ? bekzod : aziz;
    expect(lost).toMatchObject({
      ok: false,
      error: {
        code: "stale_version",
        orders: [
          { orderId: ids[0], code: "stale_version" },
          { orderId: ids[1], code: "stale_version" },
        ],
      },
    });

    // Nothing half-saved: one action, one event per order, each at the Principal step, v2.
    const states = await statesOf(ids);
    for (const id of ids) {
      expect(states.get(id)).toMatchObject({ status: "PENDING_PRINCIPAL", version: 2 });
    }
    const events = await db.select().from(orderEvents).where(inArray(orderEvents.orderId, ids));
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.actorId))).toEqual(new Set([winner.id]));
    expect(await db.select().from(orderActions).where(eq(orderActions.actorId, loser.id))).toEqual(
      [],
    );
    expect((await orderRow(untouched!.id))!.status).toBe("PENDING_HEAD");

    // "Already approved by Aziz at 14:32": the loser's refusal, read as approveOrdersAction does.
    const newest = await newestMoves(loser.id, ids);
    for (const id of ids) {
      expect(
        alreadyDecidedBy({ code: "stale_version", sentVersion: 1 }, newest.get(id)!, loser),
      ).toEqual({ verb: "APPROVE", name: winner.fullName, at: new Date("2026-10-16T09:32:00Z") });
    }
  });
});

describe("All or nothing (06 rule 8)", () => {
  it("one order changed a moment ago refuses the action, names it, saves nothing", async () => {
    const { branch, manager, head } = await scene();
    const three = await waiting(branch.id, manager.id, "PENDING_HEAD", 3);
    const sent = three.map((order) => ({ id: order.id, version: 1 }));
    // The middle order moved on to v2 since the Head saw it at v1.
    await db.update(orders).set({ version: 2 }).where(eq(orders.id, three[1]!.id));
    const input = ticked(sent);
    const notices = await noticeCount();
    expect(await approve(head.id, input)).toMatchObject({
      ok: false,
      error: { code: "stale_version", orders: [{ orderId: three[1]!.id, code: "stale_version" }] },
    });
    const states = await statesOf(three.map((order) => order.id));
    for (const order of three) expect(states.get(order.id)!.status).toBe("PENDING_HEAD");
    await nothingSaved(
      input.clientKey,
      three.map((order) => order.id),
      notices,
    );
  });

  it("ticks at mixed steps: the Head is refused whole, the Principal-step order forbidden", async () => {
    const { branch, manager, head, principal } = await scene();
    const [a] = await waiting(branch.id, manager.id, "PENDING_HEAD");
    const [b] = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL");
    const input = ticked([a!, b!]);
    const notices = await noticeCount();
    expect(await approve(head.id, input)).toMatchObject({
      ok: false,
      error: { code: "forbidden", orders: [{ orderId: b!.id, code: "forbidden" }] },
    });
    expect(await orderRow(a!.id)).toMatchObject({ status: "PENDING_HEAD", version: 1 });
    await nothingSaved(input.clientKey, [a!.id, b!.id], notices);
    // The Principal of the branch ticking the same two is refused on A the same way.
    const again = ticked([a!, b!]);
    expect(await approve(principal.id, again)).toMatchObject({
      ok: false,
      error: { code: "forbidden", orders: [{ orderId: a!.id, code: "forbidden" }] },
    });
    expect(await noticesOf(principal.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
  });
});

describe("The branch wall (03 rules 1 and 8; 15 S7)", () => {
  it("a Principal of another branch is refused, also with one such order among own ticks", async () => {
    const own = await scene();
    const other = await scene();
    const mine = await waiting(own.branch.id, own.manager.id, "PENDING_PRINCIPAL", 2);
    const [theirs] = await waiting(other.branch.id, other.manager.id, "PENDING_PRINCIPAL");

    const alone = ticked([theirs!]);
    expect(await approve(own.principal.id, alone)).toMatchObject({
      ok: false,
      error: { code: "not_found", orders: [{ orderId: theirs!.id, code: "not_found" }] },
    });

    const hidden = ticked([mine[0]!, theirs!, mine[1]!]);
    const notices = await noticeCount();
    expect(await approve(own.principal.id, hidden)).toMatchObject({
      ok: false,
      error: { code: "not_found", orders: [{ orderId: theirs!.id, code: "not_found" }] },
    });
    const states = await statesOf([...mine, theirs!].map((order) => order.id));
    for (const state of states.values()) expect(state.status).toBe("PENDING_PRINCIPAL");
    await nothingSaved(
      hidden.clientKey,
      [...mine, theirs!].map((order) => order.id),
      notices,
    );
    // Behind the wall nobody is named (03 rule 1).
    expect((await newestMoves(own.principal.id, [theirs!.id])).size).toBe(0);

    // Their own two pass alone.
    expect(await approve(own.principal.id, ticked(mine))).toMatchObject({ ok: true });
  });
});

describe("Finance's step: Open, approved_at and the payment type (06 rules 1, 11; correction 1)", () => {
  it("after Finance approves the status is Open and approved_at is the clock's time", async () => {
    const at = setClock("2026-10-16T10:15:00Z");
    const { branch, manager, head, principal, finance } = await scene();
    const [order] = await waiting(branch.id, manager.id, "PENDING_HEAD");

    expect(await approve(head.id, ticked([order!]))).toMatchObject({ ok: true });
    expect(await orderRow(order!.id)).toMatchObject({
      status: "PENDING_PRINCIPAL",
      approvedAt: null,
    });
    expect(await approve(principal.id, ticked([{ id: order!.id, version: 2 }]))).toMatchObject({
      ok: true,
    });
    expect(await orderRow(order!.id)).toMatchObject({
      status: "PENDING_FINANCE",
      approvedAt: null,
    });
    expect(await approve(finance.id, ticked([{ id: order!.id, version: 3 }]))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "PURCHASING" }] },
    });
    expect(await orderRow(order!.id)).toMatchObject({ status: "PURCHASING", approvedAt: at });
  });

  it("Finance changes the payment type in the approval: stored and logged, the total unchanged", async () => {
    const { branch, manager, finance } = await scene();
    const [changed, kept] = await waiting(branch.id, manager.id, "PENDING_FINANCE", 2, {
      paymentType: "CASH",
    });
    const before = await statesOf([changed!.id, kept!.id]);
    const result = await approve(
      finance.id,
      ticked([changed!, kept!], { paymentTypes: { [changed!.id]: "CARD", [kept!.id]: "CASH" } }),
    );
    expect(result).toMatchObject({ ok: true });
    const after = await statesOf([changed!.id, kept!.id]);
    expect(after.get(changed!.id)).toMatchObject({ status: "PURCHASING", paymentType: "CARD" });
    expect(after.get(kept!.id)).toMatchObject({ status: "PURCHASING", paymentType: "CASH" });
    // Goods plus extras stay the same (review of the plan, decision 2).
    expect(after.get(changed!.id)!.plannedTotal).toBe(before.get(changed!.id)!.plannedTotal);

    const events = await db
      .select({ orderId: orderEvents.orderId, payload: orderEvents.payload })
      .from(orderEvents)
      .where(inArray(orderEvents.orderId, [changed!.id, kept!.id]));
    const payloadOf = new Map(events.map((event) => [event.orderId, event.payload]));
    expect(payloadOf.get(changed!.id)).toEqual({ paymentType: { from: "CASH", to: "CARD" } });
    // The same type is no change: nothing logged (correction 3).
    expect(payloadOf.get(kept!.id)).toBeNull();

    // The History line reads the change (06 rule 11).
    const page = await getOrderPage(finance.id, changed!.id);
    expect(page!.events[0]!.paymentType).toEqual({ from: "CASH", to: "CARD" });
    expect((await getOrderPage(finance.id, kept!.id))!.events[0]!.paymentType).toBeNull();
  });

  it("a payment type from the Head or the Principal refuses the whole action, nothing saved", async () => {
    const { branch, manager, head, principal } = await scene();
    const [atHead] = await waiting(branch.id, manager.id, "PENDING_HEAD");
    const [atPrincipal] = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL");
    for (const [actor, order] of [
      [head, atHead!],
      [principal, atPrincipal!],
    ] as const) {
      const input = ticked([order], { paymentTypes: { [order.id]: "TRANSFER" } });
      const notices = await noticeCount();
      expect(await approve(actor.id, input)).toMatchObject({
        ok: false,
        error: { code: "forbidden", orders: [{ orderId: order.id, code: "forbidden" }] },
      });
      expect(await orderRow(order.id)).toMatchObject({ paymentType: "CASH", version: 1 });
      await nothingSaved(input.clientKey, [order.id], notices);
    }
  });

  it("a refused Finance action writes no payment type: one stale order among the ticked (06 rule 8)", async () => {
    const { branch, manager, finance } = await scene();
    const [fresh, stale] = await waiting(branch.id, manager.id, "PENDING_FINANCE", 2);
    await db.update(orders).set({ version: 2 }).where(eq(orders.id, stale!.id));
    const input = ticked([fresh!, { id: stale!.id, version: 1 }], {
      paymentTypes: { [fresh!.id]: "CARD", [stale!.id]: "TRANSFER" },
    });
    const notices = await noticeCount();
    expect(await approve(finance.id, input)).toMatchObject({
      ok: false,
      error: { code: "stale_version", orders: [{ orderId: stale!.id, code: "stale_version" }] },
    });
    const states = await statesOf([fresh!.id, stale!.id]);
    expect(states.get(fresh!.id)).toMatchObject({ status: "PENDING_FINANCE", paymentType: "CASH" });
    expect(states.get(stale!.id)).toMatchObject({ status: "PENDING_FINANCE", paymentType: "CASH" });
    await nothingSaved(input.clientKey, [fresh!.id, stale!.id], notices);
  });

  it("a payment type for an order that is not ticked is a wrong input", async () => {
    const { branch, manager, finance } = await scene();
    const [order] = await waiting(branch.id, manager.id, "PENDING_FINANCE");
    expect(
      await approve(finance.id, ticked([order!], { paymentTypes: { [randomUUID()]: "CARD" } })),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await orderRow(order!.id)).toMatchObject({ status: "PENDING_FINANCE", version: 1 });
  });
});

describe("Notifications: one per action and branch to the next step (10 Notifications)", () => {
  it("Head approved: each branch's Principal gets one notice with that branch's count only", async () => {
    const head = await insertUser("HEAD", { fullName: "Aziz Karimov" });
    const places = [await scene(), await scene(), await scene()];
    const sent: Ticked[] = [];
    for (const [at, place] of places.entries()) {
      sent.push(...(await waiting(place.branch.id, place.manager.id, "PENDING_HEAD", at + 1)));
    }
    const result = await approve(head.id, ticked(sent));
    expect(result).toMatchObject({ ok: true });
    for (const [at, place] of places.entries()) {
      const notices = await noticesOf(place.principal.id, "REQUEST_HEAD_APPROVED");
      expect(notices).toHaveLength(1);
      expect(notices[0]!.params).toEqual({
        actor: "Aziz Karimov",
        count: at + 1,
        branch: place.branch.code,
      });
      expect(notices[0]!.link).toContain(`branch=${place.branch.id}`);
      // Finance hears nothing yet.
      expect(await noticesOf(place.finance.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
    }
    expect(await noticesOf(head.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
  });

  it("Principal approved: the branch's active Finance users, never the Principal", async () => {
    const { branch, manager, principal, finance } = await scene();
    const away = await insertUser("FINANCE", { branches: [branch.id], isActive: false });
    const two = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL", 2);
    expect(await approve(principal.id, ticked(two))).toMatchObject({ ok: true });
    const notices = await noticesOf(finance.id, "REQUEST_PRINCIPAL_APPROVED");
    expect(notices.map((notice) => notice.params)).toEqual([
      { actor: principal.fullName, count: 2, branch: branch.code },
    ]);
    expect(await noticesOf(away.id, "REQUEST_PRINCIPAL_APPROVED")).toEqual([]);
    expect(await noticesOf(principal.id, "REQUEST_PRINCIPAL_APPROVED")).toEqual([]);
  });

  it("Finance approved: the owners and every Head, one each, never the actor", async () => {
    const { branch, manager, finance, head } = await scene();
    const second = await insertUser("HEAD");
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const orders = [
      ...(await waiting(branch.id, manager.id, "PENDING_FINANCE", 2)),
      // The Head owns one of them: one notice, not two.
      ...(await waiting(branch.id, head.id, "PENDING_FINANCE")),
    ];
    expect(await approve(finance.id, ticked(orders))).toMatchObject({ ok: true });
    for (const user of [manager, head, second]) {
      const notices = await noticesOf(user.id, "REQUEST_FINANCE_APPROVED");
      expect(notices.map((notice) => notice.params)).toEqual([
        { actor: finance.fullName, count: 3, branch: branch.code },
      ]);
    }
    expect(await noticesOf(colleague.id, "REQUEST_FINANCE_APPROVED")).toEqual([]);
    expect(await noticesOf(finance.id, "REQUEST_FINANCE_APPROVED")).toEqual([]);
  });
});

describe("Finance approved across two branches: one branch per notice (10 Notifications; permission review of 2.10, Must fix 2)", () => {
  it("each owner hears of their own branch only; each Head gets one notice per branch", async () => {
    const x = await insertBranch();
    const y = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [x.id, y.id] });
    const inX = await insertUser("MANAGER", { branches: [x.id] });
    const inY = await insertUser("MANAGER", { branches: [y.id] });
    // A Manager of both branches who owns orders in X only.
    const both = await insertUser("MANAGER", { branches: [x.id, y.id] });
    const head = await insertUser("HEAD");
    const sent = [
      ...(await waiting(x.id, inX.id, "PENDING_FINANCE", 2)),
      ...(await waiting(x.id, both.id, "PENDING_FINANCE")),
      ...(await waiting(y.id, inY.id, "PENDING_FINANCE")),
    ];
    expect(await approve(finance.id, ticked(sent))).toMatchObject({ ok: true });

    const paramsOf = async (userId: string) =>
      (await noticesOf(userId, "REQUEST_FINANCE_APPROVED"))
        .map((notice) => notice.params as { branch: string; count: number })
        .sort((a, b) => a.branch.localeCompare(b.branch));
    const xNotice = { actor: finance.fullName, count: 3, branch: x.code };
    const yNotice = { actor: finance.fullName, count: 1, branch: y.code };
    expect(await paramsOf(inX.id)).toEqual([xNotice]);
    expect(await paramsOf(inY.id)).toEqual([yNotice]);
    expect(await paramsOf(both.id)).toEqual([xNotice]);
    expect(await paramsOf(head.id)).toEqual(
      [xNotice, yNotice].sort((a, b) => a.branch.localeCompare(b.branch)),
    );
  });
});

describe("newestMoves keeps the draft wall (06 Statuses; permission review of 2.10, Must fix 1)", () => {
  it("a numbered Draft's mover is named to its owner and the Head only", async () => {
    const { branch, manager, principal, finance, head } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const [order] = await waiting(branch.id, manager.id, "PENDING_HEAD");
    expect(await approve(head.id, ticked([order!]))).toMatchObject({ ok: true });
    // Taken back to Draft, it keeps its number and its events (06 Allowed moves, Take back).
    await db.update(orders).set({ status: "DRAFT" }).where(eq(orders.id, order!.id));
    for (const user of [manager, head]) {
      expect((await newestMoves(user.id, [order!.id])).has(order!.id)).toBe(true);
    }
    for (const user of [colleague, principal, finance]) {
      expect((await newestMoves(user.id, [order!.id])).size).toBe(0);
    }
  });
});

describe("S19 up to the Principal (15 S19; 05 Group rows 1, 4)", () => {
  it("the Head approves a row of 20, then 10 more; the Principal approves one row of 30 holding three orders", async () => {
    // One Manager submits 10 pens, then 10 more, then (after the Head approved the first 20) 10
    // more (15 S19): three orders of quantity 10, given here, not left to the helper's default.
    const { branch, manager, principal, head } = await scene();
    const paper = await insertItem();
    const ten = async () =>
      (
        await waiting(branch.id, manager.id, "PENDING_HEAD", 1, {
          variantId: paper.variantId,
          plannedQty: "10.000",
        })
      )[0]!;
    const a = await ten();
    const b = await ten();

    const rowOf = async (userId: string, status: "PENDING_HEAD" | "PENDING_PRINCIPAL") =>
      // The branch's own view: the Head sees every branch, other tests' orders included.
      (await listOrderGroups(userId, { ...NO_FILTERS, branch: branch.id })).groups.filter(
        (group) => group.variantId === paper.variantId && group.status === status,
      );
    // "The Head first sees one row 'Tata pens, 20'": the quantity, not the count of orders.
    const headRows = await rowOf(head.id, "PENDING_HEAD");
    expect(headRows).toHaveLength(1);
    expect(headRows[0]!.summary).toMatchObject({ quantity: "20", count: 2 });

    expect(await approve(head.id, ticked(headRows[0]!.orders))).toMatchObject({ ok: true });
    // "After approving it, the Principal sees 20".
    let rows = await rowOf(principal.id, "PENDING_PRINCIPAL");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toMatchObject({ quantity: "20", count: 2 });

    const c = await ten();
    expect(await approve(head.id, ticked([c]))).toMatchObject({ ok: true });
    // "One row 'Tata pens, 30' holding three orders".
    rows = await rowOf(principal.id, "PENDING_PRINCIPAL");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toMatchObject({ quantity: "30", count: 3 });

    // Ticking the row ticks its three orders (Group rows 3); one approval moves them all.
    expect(await approve(principal.id, ticked(rows[0]!.orders))).toMatchObject({ ok: true });
    const ids = [a, b, c].map((order) => order.id);
    const states = await statesOf(ids);
    for (const id of ids) expect(states.get(id)!.status).toBe("PENDING_FINANCE");
    // Each keeps its own history (Group rows 4): one event from the Principal's step each.
    const events = await db
      .select({ orderId: orderEvents.orderId, from: orderEvents.fromStatus })
      .from(orderEvents)
      .where(
        and(inArray(orderEvents.orderId, ids), eq(orderEvents.fromStatus, "PENDING_PRINCIPAL")),
      );
    expect(events).toHaveLength(3);
    expect(new Set(events.map((event) => event.orderId)).size).toBe(3);
    // Each keeps its own number.
    const numbers = await db
      .select({ number: orders.number })
      .from(orders)
      .where(inArray(orders.id, ids));
    expect(new Set(numbers.map((row) => row.number)).size).toBe(3);
  });
});

describe("The branch's Principal is replaced while orders wait (03 rule 3)", () => {
  it("the new Principal approves; the old one is refused; History keeps the old name", async () => {
    const { branch, manager, principal: old, head } = await scene();
    const [earlier, later] = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL", 2);
    expect(await approve(old.id, ticked([earlier!]))).toMatchObject({ ok: true });

    const created = await runAction(createUser, head.id, {
      clientKey: newClientKey(),
      fullName: "Nodira Yusupova",
      username: `test_principal_${newClientKey().slice(0, 8)}`,
      phone: "+998 90 000 33 44",
      locale: "uz",
      password: "invented-password",
      role: "PRINCIPAL",
      branchIds: [branch.id],
      replacePrincipal: true,
    });
    expect(created).toMatchObject({ ok: true });
    const fresh = (created as { ok: true; data: { id: string } }).data;

    expect(await approve(old.id, ticked([later!]))).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await approve(fresh.id, ticked([later!]))).toMatchObject({ ok: true });

    const page = await getOrderPage(head.id, earlier!.id);
    expect(page!.events[0]).toMatchObject({ type: "APPROVE", actorName: old.fullName });
    const [{ active }] = (await db
      .select({ active: users.isActive })
      .from(users)
      .where(eq(users.id, old.id))) as [{ active: boolean }];
    expect(active).toBe(false);
  });
});

describe("A repeat of the same client key (developer-rules.md rule 8)", () => {
  it("returns the first result and writes nothing more", async () => {
    const { branch, manager, head } = await scene();
    const [order] = await waiting(branch.id, manager.id, "PENDING_HEAD");
    const input = ticked([order!]);
    const first = await approve(head.id, input);
    expect(first).toMatchObject({ ok: true });
    expect(await approve(head.id, input)).toEqual(first);
    expect(
      await db.select().from(orderEvents).where(eq(orderEvents.orderId, order!.id)),
    ).toHaveLength(1);
    expect(await orderRow(order!.id)).toMatchObject({ version: 2 });
  });

  it("is refused for a user who has since lost the step's role", async () => {
    const { branch, manager, principal, head } = await scene();
    const [order] = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL");
    const input = ticked([order!]);
    expect(await approve(principal.id, input)).toMatchObject({ ok: true });
    // The Head moves the Principal out: a new Principal replaces him.
    const replaced = await runAction(createUser, head.id, {
      clientKey: newClientKey(),
      fullName: "Invented Successor",
      username: `test_principal_${newClientKey().slice(0, 8)}`,
      phone: "+998 90 000 55 66",
      locale: "ru",
      password: "invented-password",
      role: "PRINCIPAL",
      branchIds: [branch.id],
      replacePrincipal: true,
    });
    expect(replaced).toMatchObject({ ok: true });
    const repeat = await approve(principal.id, input);
    expect(repeat).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("Stock at submit and stock now (06 rule 10; edge case 'Stock changes between submit and approval')", () => {
  it("the page and the opened group show both; a service shows neither", async () => {
    const { branch, manager, principal } = await scene();
    const paper = await insertItem();
    const [order] = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL", 1, {
      variantId: paper.variantId,
    });
    await db.update(orders).set({ stockAtSubmit: "4.000" }).where(eq(orders.id, order!.id));
    await db.insert(stockBalances).values({
      branchId: branch.id,
      variantId: paper.variantId,
      qty: "12.500",
      createdAt: new Date("2026-10-16T05:00:00Z"),
      updatedAt: new Date("2026-10-16T05:00:00Z"),
    });
    const page = await getOrderPage(principal.id, order!.id);
    expect(page).toMatchObject({ stockAtSubmit: "4", stockNow: "12.5" });
    const group = (await listOrderGroups(principal.id)).groups.find(
      (row) => row.variantId === paper.variantId,
    );
    expect(group!.orders[0]).toMatchObject({ stockAtSubmit: "4", stockNow: "12.5" });

    // Another branch's stock of the same subtype is not this order's (03 rule 1).
    const other = await insertBranch();
    await db.insert(stockBalances).values({
      branchId: other.id,
      variantId: paper.variantId,
      qty: "99.000",
      createdAt: new Date("2026-10-16T05:00:00Z"),
      updatedAt: new Date("2026-10-16T05:00:00Z"),
    });
    expect((await getOrderPage(principal.id, order!.id))!.stockNow).toBe("12.5");

    // No stock row is 0, at submit and now (found by the e2e run: 0 was refused as a quantity).
    const [none] = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL");
    await db.update(orders).set({ stockAtSubmit: "0.000" }).where(eq(orders.id, none!.id));
    expect(await getOrderPage(principal.id, none!.id)).toMatchObject({
      stockAtSubmit: "0",
      stockNow: "0",
    });
    // A service has no stock.
    const cleaning = await insertItem({ type: "SERVICE" });
    const [service] = await waiting(branch.id, manager.id, "PENDING_PRINCIPAL", 1, {
      variantId: cleaning.variantId,
    });
    expect(await getOrderPage(principal.id, service!.id)).toMatchObject({
      stockAtSubmit: null,
      stockNow: null,
    });
  });
});
