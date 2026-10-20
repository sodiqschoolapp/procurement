import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import type { OrderAction } from "@/domain/order-moves";
import { db } from "@/server/db/client";
import { orderActions, orderEvents, orders } from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../tests/helpers/branches";
import { catchErrorReports, eventOf } from "../../tests/helpers/error-reports";
import { insertOrder, inventedNumber } from "../../tests/helpers/orders";
import { runTogether } from "../../tests/helpers/together";
import { type InsertedUser, insertUser } from "../../tests/helpers/users";
import type { ActionResult } from "./action-result";
import { OrdersRefusal, type OrdersResult, ordersInput, runOrdersAction } from "./order-action";
import { orderMoveAction } from "./order-moves";

// The wrapper for one action on many ticked orders (build plan 2.4, Done when; plan of 2.4,
// Tests), driven through the move step every later order action uses. Spec: developer-rules.md
// rules 3, 8, 9 and 13; 06-approval-workflow.md rules 7, 8 and 11; 03-roles-and-permissions.md
// rule 8. Every fixture is asserted, never made under a guard (D38).

const withReason = ordersInput({ reason: z.string().optional() });
const move = (action: OrderAction, notify?: () => Promise<void>) =>
  orderMoveAction({ name: `test ${action}`, action, input: withReason, notify });

let branchId: string;
let otherBranchId: string;
let head: InsertedUser;
let manager: InsertedUser;
let colleague: InsertedUser;
let principal: InsertedUser;
let finance: InsertedUser;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  otherBranchId = (await insertBranch()).id;
  head = await insertUser("HEAD");
  manager = await insertUser("MANAGER", { branches: [branchId] });
  colleague = await insertUser("MANAGER", { branches: [branchId] });
  principal = await insertUser("PRINCIPAL", { branches: [branchId] });
  finance = await insertUser("FINANCE", { branches: [branchId] });
  // Each role also exists in the other branch, so "other branch" is a branch where it acts (D40).
  await insertUser("MANAGER", { branches: [otherBranchId] });
  await insertUser("PRINCIPAL", { branches: [otherBranchId] });
});

type Placed = Awaited<ReturnType<typeof insertOrder>>;

function placed(count: number, row: Partial<Parameters<typeof insertOrder>[0]> = {}) {
  return Promise.all(
    Array.from({ length: count }, () =>
      insertOrder({ branchId, ownerId: manager.id, status: "PENDING_HEAD", ...row }),
    ),
  );
}

const ticked = (list: readonly Placed[], clientKey = randomUUID()) => ({
  clientKey,
  orders: list.map((order) => ({ id: order.id, version: order.version })),
});

function expectOk(result: ActionResult<OrdersResult>): OrdersResult {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: OrdersResult }).data;
}

function expectRefused(result: ActionResult<OrdersResult>) {
  expect(result.ok).toBe(false);
  return (
    result as { ok: false; error: Extract<ActionResult<OrdersResult>, { ok: false }>["error"] }
  ).error;
}

async function stateOf(list: readonly { id: string }[]) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      version: orders.version,
      revision: orders.revision,
    })
    .from(orders)
    .where(
      inArray(
        orders.id,
        list.map((order) => order.id),
      ),
    );
  return new Map(rows.map((row) => [row.id, row]));
}

async function historyOf(list: readonly { id: string }[]) {
  return db
    .select()
    .from(orderEvents)
    .where(
      inArray(
        orderEvents.orderId,
        list.map((order) => order.id),
      ),
    );
}

async function actionsWith(clientKey: string) {
  return db.select().from(orderActions).where(eq(orderActions.clientKey, clientKey));
}

describe("one action on many orders, all or nothing (06 rule 8; developer-rules rule 3)", () => {
  it("approves three orders: each moves, each version rises, one action row, one event each", async () => {
    const three = await placed(3);
    const input = ticked(three);
    const result = expectOk(await runOrdersAction(move("APPROVE"), head.id, input));

    expect(result.orders).toHaveLength(3);
    for (const order of result.orders) expect(order.status).toBe("PENDING_PRINCIPAL");
    const state = await stateOf(three);
    for (const order of three) {
      expect(state.get(order.id)).toMatchObject({ status: "PENDING_PRINCIPAL", version: 2 });
    }
    const [action] = await actionsWith(input.clientKey);
    expect(action).toMatchObject({
      id: result.actionId,
      type: "APPROVE",
      actorId: head.id,
      orderCount: 3,
      reason: null,
    });
    const events = await historyOf(three);
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event).toMatchObject({
        actionId: result.actionId,
        type: "APPROVE",
        fromStatus: "PENDING_HEAD",
        toStatus: "PENDING_PRINCIPAL",
        actorId: head.id,
      });
    }
  });

  it("three orders where one has an old version save nothing, and that order is named (rule 9)", async () => {
    const three = await placed(3);
    const input = ticked(three);
    input.orders[1]!.version = 7;
    const error = expectRefused(await runOrdersAction(move("APPROVE"), head.id, input));

    expect(error.code).toBe("stale_version");
    expect(error.orders).toEqual([{ orderId: three[1]!.id, code: "stale_version" }]);
    const state = await stateOf(three);
    for (const order of three) {
      expect(state.get(order.id)).toMatchObject({ status: "PENDING_HEAD", version: 1 });
    }
    expect(await actionsWith(input.clientKey)).toHaveLength(0);
    expect(await historyOf(three)).toHaveLength(0);
  });

  it("an old version is named stale_version before the role's refusal (review, correction 2)", async () => {
    const [waiting] = await placed(1);
    const input = ticked([waiting!]);
    input.orders[0]!.version = 2;
    // Finance has no permission at the Head step, and the version is old: the order changed.
    const error = expectRefused(await runOrdersAction(move("APPROVE"), finance.id, input));
    expect(error.code).toBe("stale_version");
    expect(error.orders).toEqual([{ orderId: waiting!.id, code: "stale_version" }]);
  });

  it("names every failing order with its first code, and the action's code is the first of them", async () => {
    const [good, stale] = await placed(2);
    const open = await insertOrder({ branchId, ownerId: manager.id, status: "PURCHASING" });
    const input = ticked([good!, stale!, open]);
    input.orders[1]!.version = 3;
    const error = expectRefused(await runOrdersAction(move("APPROVE"), head.id, input));
    expect(error.code).toBe("stale_version");
    expect(error.orders).toEqual([
      { orderId: stale!.id, code: "stale_version" },
      { orderId: open.id, code: "wrong_status" },
    ]);
  });

  it("a failing last step (notify) leaves nothing saved (rule 3)", async () => {
    const two = await placed(2);
    const input = ticked(two);
    // The wrapper logs the unexpected error; the test keeps the log quiet (D37).
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = move("APPROVE", async () => {
      throw new Error("The bell is broken.");
    });
    const error = expectRefused(await runOrdersAction(failing, head.id, input));
    expect(error.code).toBe("unexpected");
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
    const state = await stateOf(two);
    for (const order of two) expect(state.get(order.id)?.status).toBe("PENDING_HEAD");
    expect(await actionsWith(input.clientKey)).toHaveLength(0);
  });

  it("an unexpected error is also handed to the error reporter (build-plan 9.3)", async () => {
    const two = await placed(2);
    const input = ticked(two);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reports = catchErrorReports();
    const failing = move("APPROVE", async () => {
      throw new Error("The bell is broken.");
    });
    expect(expectRefused(await runOrdersAction(failing, head.id, input)).code).toBe("unexpected");
    expect(reports).toHaveLength(1);
    expect(eventOf(reports[0]!)).toMatchObject({
      transaction: `action ${failing.name}`,
      exception: { values: [{ value: "Error: The bell is broken." }] },
    });
    logged.mockRestore();
  });

  it("the write sees its own order_actions row by context.actionId (plan of 4.2, decided item 8)", async () => {
    const two = await placed(2);
    const input = ticked(two);
    let seen: { id: string; clientKey: string }[] = [];
    let named = "";
    const looking = orderMoveAction({
      name: "test APPROVE looking",
      action: "APPROVE",
      input: withReason,
      async afterMove(context) {
        named = context.actionId;
        seen = await context.tx
          .select({ id: orderActions.id, clientKey: orderActions.clientKey })
          .from(orderActions)
          .where(eq(orderActions.id, context.actionId));
      },
    });
    const result = expectOk(await runOrdersAction(looking, head.id, input));
    expect(named).toBe(result.actionId);
    expect(seen).toEqual([{ id: result.actionId, clientKey: input.clientKey }]);
  });

  it("a refusal in the write leaves no order_actions row, and a retry with the key runs again (rule 8; review of the plan of 4.2, correction 3)", async () => {
    const two = await placed(2);
    const input = ticked(two);
    let refuse = true;
    const refusing = orderMoveAction({
      name: "test APPROVE refusing",
      action: "APPROVE",
      input: withReason,
      async afterMove() {
        if (refuse) throw new OrdersRefusal("invalid_input");
      },
    });
    const error = expectRefused(await runOrdersAction(refusing, head.id, input));
    expect(error.code).toBe("invalid_input");
    expect(await actionsWith(input.clientKey)).toHaveLength(0);
    const state = await stateOf(two);
    for (const order of two)
      expect(state.get(order.id)).toMatchObject({ status: "PENDING_HEAD", version: 1 });

    refuse = false;
    const again = expectOk(await runOrdersAction(refusing, head.id, input));
    for (const order of again.orders) expect(order.status).toBe("PENDING_PRINCIPAL");
    expect(await actionsWith(input.clientKey)).toEqual([
      expect.objectContaining({ id: again.actionId }),
    ]);
  });

  it("201 orders, an order ticked twice and none are refused before the transaction", async () => {
    const [one] = await placed(1);
    const many = {
      clientKey: randomUUID(),
      orders: Array.from({ length: 201 }, () => ({ id: randomUUID(), version: 1 })),
    };
    expect(expectRefused(await runOrdersAction(move("APPROVE"), head.id, many)).code).toBe(
      "invalid_input",
    );
    const twice = ticked([one!, one!]);
    expect(expectRefused(await runOrdersAction(move("APPROVE"), head.id, twice)).code).toBe(
      "invalid_input",
    );
    const none = { clientKey: randomUUID(), orders: [] };
    expect(expectRefused(await runOrdersAction(move("APPROVE"), head.id, none)).code).toBe(
      "invalid_input",
    );
    expect(await actionsWith(twice.clientKey)).toHaveLength(0);
    expect((await stateOf([one!])).get(one!.id)?.status).toBe("PENDING_HEAD");
  });

  it("an unknown order is not_found and nothing is saved", async () => {
    const [one] = await placed(1);
    const input = ticked([one!]);
    const missing = randomUUID();
    input.orders.push({ id: missing, version: 1 });
    const error = expectRefused(await runOrdersAction(move("APPROVE"), head.id, input));
    expect(error).toMatchObject({
      code: "not_found",
      orders: [{ orderId: missing, code: "not_found" }],
    });
    expect((await stateOf([one!])).get(one!.id)?.status).toBe("PENDING_HEAD");
  });
});

describe("the branch wall and the draft wall (03 rules 1 and 8; 06 Statuses)", () => {
  it("one order of another branch among the Principal's own refuses the whole action", async () => {
    const own = await placed(2, { status: "PENDING_PRINCIPAL" });
    const foreign = await insertOrder({
      branchId: otherBranchId,
      ownerId: (await insertUser("MANAGER", { branches: [otherBranchId] })).id,
      status: "PENDING_PRINCIPAL",
    });
    const input = ticked([...own, foreign]);
    const error = expectRefused(await runOrdersAction(move("APPROVE"), principal.id, input));
    expect(error).toMatchObject({
      code: "not_found",
      orders: [{ orderId: foreign.id, code: "not_found" }],
    });
    const state = await stateOf([...own, foreign]);
    for (const order of [...own, foreign])
      expect(state.get(order.id)?.status).toBe("PENDING_PRINCIPAL");
  });

  it("a colleague's Draft is not_found for a Manager; the Manager's own order beside it is not named", async () => {
    const [own] = await placed(1);
    const draft = await insertOrder({ branchId, ownerId: colleague.id, status: "DRAFT" });
    const input = { ...ticked([own!, draft]), reason: "Endi kerak emas" };
    const error = expectRefused(await runOrdersAction(move("CANCEL"), manager.id, input));
    expect(error).toMatchObject({
      code: "not_found",
      orders: [{ orderId: draft.id, code: "not_found" }],
    });
  });

  it("forged facts in the input change nothing: the state comes from the locked rows (rule 13)", async () => {
    const [waiting] = await placed(1);
    const forged = {
      clientKey: randomUUID(),
      orders: [
        {
          id: waiting!.id,
          version: 1,
          status: "PENDING_PRINCIPAL",
          branchId: otherBranchId,
          ownerId: head.id,
          createdByHead: true,
        },
      ],
      status: "PENDING_PRINCIPAL",
    };
    // A Manager is no approver whatever the input says.
    const refused = expectRefused(await runOrdersAction(move("APPROVE"), manager.id, forged));
    expect(refused).toMatchObject({
      code: "forbidden",
      orders: [{ orderId: waiting!.id, code: "forbidden" }],
    });

    // A taken-back Draft of a Manager submitted with a forged createdByHead goes to the Head.
    const draft = await insertOrder({
      branchId,
      ownerId: manager.id,
      status: "DRAFT",
      number: inventedNumber(),
    });
    await db.execute(
      sql`update orders set submitted_at = '2031-04-11T05:00:00Z' where id = ${draft.id}`,
    );
    const submitted = expectOk(
      await runOrdersAction(move("SUBMIT"), manager.id, {
        ...ticked([draft]),
        orders: [{ id: draft.id, version: 1, createdByHead: true }],
      }),
    );
    expect(submitted.orders).toEqual([{ id: draft.id, status: "PENDING_HEAD" }]);
  });
});

describe("the state machine answers on the server (developer-rules rule 2; plan decision 1)", () => {
  it("wrong_status, forbidden and not_ready each name the order", async () => {
    const open = await insertOrder({ branchId, ownerId: manager.id, status: "PURCHASING" });
    expect(
      expectRefused(await runOrdersAction(move("APPROVE"), head.id, ticked([open]))),
    ).toMatchObject({
      code: "wrong_status",
      orders: [{ orderId: open.id, code: "wrong_status" }],
    });
    const [waiting] = await placed(1);
    expect(
      expectRefused(await runOrdersAction(move("APPROVE"), finance.id, ticked([waiting!]))),
    ).toMatchObject({ code: "forbidden", orders: [{ orderId: waiting!.id, code: "forbidden" }] });
    // An exact match is a fact of phase 4: until then Close exact match is not ready.
    expect(
      expectRefused(await runOrdersAction(move("CLOSE_EXACT"), head.id, ticked([open]))),
    ).toMatchObject({ code: "not_ready", orders: [{ orderId: open.id, code: "not_ready" }] });
  });

  it("a reason of 4 characters is invalid_input on the field reason; 5 pass (06 rule 3)", async () => {
    const [waiting] = await placed(1);
    const short = { ...ticked([waiting!]), reason: " abcd " };
    expect(expectRefused(await runOrdersAction(move("REJECT"), head.id, short))).toMatchObject({
      code: "invalid_input",
      fields: { reason: "errors.field.tooShort" },
    });
    const enough = { ...ticked([waiting!]), reason: " abcde " };
    expectOk(await runOrdersAction(move("REJECT"), head.id, enough));
    const [event] = await historyOf([waiting!]);
    expect(event).toMatchObject({ toStatus: "REJECTED", comment: "abcde" });
    const [action] = await actionsWith(enough.clientKey);
    expect(action?.reason).toBe("abcde");
  });

  // Changed in 2.11 (permission review of 2.11, Must fix 1, Look first): only a first Submit of
  // the Head's order skips the Head step. The generic move here writes no number, so its numbered
  // Draft is a taken-back one, which goes to the Head; the skip itself is proved with a real first
  // Submit in src/features/orders/actions/submit.db.test.ts ("Created by Head").
  it("Submit again raises the revision; a taken-back Draft of the Head's order goes to the Head", async () => {
    const returned = await insertOrder({ branchId, ownerId: manager.id, status: "RETURNED" });
    expectOk(await runOrdersAction(move("SUBMIT_AGAIN"), manager.id, ticked([returned])));
    expect((await stateOf([returned])).get(returned.id)).toMatchObject({
      status: "PENDING_HEAD",
      revision: 2,
    });

    const byHead = await insertOrder({
      branchId,
      ownerId: head.id,
      status: "DRAFT",
      number: inventedNumber(),
    });
    await db.execute(
      sql`update orders set submitted_at = '2031-04-11T05:00:00Z' where id = ${byHead.id}`,
    );
    const result = expectOk(await runOrdersAction(move("SUBMIT"), head.id, ticked([byHead])));
    expect(result.orders).toEqual([{ id: byHead.id, status: "PENDING_HEAD" }]);
    const [event] = await historyOf([byHead]);
    expect(event).toMatchObject({ toStatus: "PENDING_HEAD", payload: null });
    expect((await stateOf([byHead])).get(byHead.id)?.revision).toBe(1);
  });
});

describe("the same client_key twice returns the first result (developer-rules rule 8)", () => {
  it("a repeat after the orders moved on returns the first result and writes nothing", async () => {
    const two = await placed(2);
    const input = ticked(two);
    const first = expectOk(await runOrdersAction(move("APPROVE"), head.id, input));
    // The orders now wait for the Principal; the Head's Approve row no longer fits them.
    const again = expectOk(await runOrdersAction(move("APPROVE"), head.id, input));
    expect(again).toEqual(first);
    expect(await actionsWith(input.clientKey)).toHaveLength(1);
    expect(await historyOf(two)).toHaveLength(2);
    const state = await stateOf(two);
    for (const order of two) expect(state.get(order.id)?.version).toBe(2);
  });

  it("the same key from another user is not_found", async () => {
    const [one] = await placed(1);
    const input = ticked([one!]);
    expectOk(await runOrdersAction(move("APPROVE"), head.id, input));
    const otherHead = await insertUser("HEAD");
    expect(expectRefused(await runOrdersAction(move("APPROVE"), otherHead.id, input)).code).toBe(
      "not_found",
    );
  });

  it("the same key of the same user through another action is not_found (permission review)", async () => {
    const [one] = await placed(1);
    const input = { ...ticked([one!]), reason: "Endi kerak emas" };
    expectOk(await runOrdersAction(move("REJECT"), head.id, input));
    expect(expectRefused(await runOrdersAction(move("CANCEL"), head.id, input)).code).toBe(
      "not_found",
    );
    expect(await actionsWith(input.clientKey)).toHaveLength(1);
  });

  it("a repeat after the Manager's right was switched off is forbidden (decisions 0.8 no. 3)", async () => {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const [one] = await placed(1, { ownerId: owner.id });
    const input = { ...ticked([one!]), reason: "Endi kerak emas" };
    expectOk(await runOrdersAction(move("CANCEL"), owner.id, input));
    await setManagerRight(owner.id, "CREATE_REQUESTS", false);
    expect(expectRefused(await runOrdersAction(move("CANCEL"), owner.id, input))).toMatchObject({
      code: "forbidden",
      orders: [{ orderId: one!.id, code: "forbidden" }],
    });
  });

  it("a repeat after the branch was taken away is not_found", async () => {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const [one] = await placed(1, { ownerId: owner.id });
    const input = { ...ticked([one!]), reason: "Endi kerak emas" };
    expectOk(await runOrdersAction(move("CANCEL"), owner.id, input));
    await db.execute(sql`delete from user_branches where user_id = ${owner.id}`);
    expect(expectRefused(await runOrdersAction(move("CANCEL"), owner.id, input)).code).toBe(
      "not_found",
    );
  });
});

describe("two actions at once (06 rule 7; the fixed lock order)", () => {
  it("two Heads approve overlapping orders together: one wins, the other is stale, nothing half-saved", async () => {
    const [a, b, c] = await placed(3);
    const secondHead = await insertUser("HEAD");
    const outcomes = await runTogether([
      () => runOrdersAction(move("APPROVE"), head.id, ticked([a!, b!])),
      () => runOrdersAction(move("APPROVE"), secondHead.id, ticked([c!, b!])),
    ]);
    const results = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return (outcome as PromiseFulfilledResult<ActionResult<OrdersResult>>).value;
    });
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok)!;
    expect(refused).toMatchObject({ ok: false, error: { code: "stale_version" } });

    const state = await stateOf([a!, b!, c!]);
    const moved = [a!, b!, c!].filter(
      (order) => state.get(order.id)?.status === "PENDING_PRINCIPAL",
    );
    expect(moved).toHaveLength(2);
    expect(state.get(b!.id)).toMatchObject({ status: "PENDING_PRINCIPAL", version: 2 });
    expect(await historyOf([a!, b!, c!])).toHaveLength(2);
  });
});

describe("the facts step: read under the lock, before the check (plan of 4.4, decided item 3)", () => {
  it("fills a fact the check and the write see, on the orders behind no wall only", async () => {
    const there = await insertUser("MANAGER", { branches: [otherBranchId] });
    const finished = { status: "PURCHASING", progress: "DONE" } as const;
    const [own] = await placed(1, finished);
    const [theirs] = await placed(1, { ...finished, branchId: otherBranchId, ownerId: there.id });
    const reached: string[][] = [];
    const closing = orderMoveAction({
      name: "test CLOSE_EXACT with facts",
      action: "CLOSE_EXACT",
      input: withReason,
      async facts(context) {
        reached.push(context.orders.map((order) => order.id));
        return context.orders.map((order) => ({ ...order, exactMatch: true }));
      },
    });

    // Without the step the machine reads no exact match (08 Exact match): not ready.
    const plain = expectRefused(
      await runOrdersAction(move("CLOSE_EXACT"), manager.id, ticked([own!])),
    );
    expect(plain.orders).toEqual([{ orderId: own!.id, code: "not_ready" }]);

    // Another branch's order is "Not found" and never reaches the step (03 rule 1).
    const walled = expectRefused(
      await runOrdersAction(closing, manager.id, ticked([own!, theirs!])),
    );
    expect(walled.orders).toEqual([{ orderId: theirs!.id, code: "not_found" }]);
    expect(reached).toEqual([[own!.id]]);

    const result = expectOk(await runOrdersAction(closing, manager.id, ticked([own!])));
    expect(result.orders).toEqual([{ id: own!.id, status: "CLOSED" }]);
    expect((await stateOf([own!])).get(own!.id)).toMatchObject({ status: "CLOSED" });
  });
});
