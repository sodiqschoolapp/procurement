import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { isTestClockSet } from "@/server/clock";
import { db } from "@/server/db/client";
import {
  branches,
  departments,
  extraCostTypes,
  notifications,
  numberCounters,
  orderActions,
  orderEvents,
  orderRevisions,
  orders,
  productVariants,
  products,
  stockBalances,
} from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { refusalOf } from "../../../../tests/helpers/database-error";
import {
  insertDepartment,
  insertExtraCostType,
  insertItem,
  insertOrder,
  insertOrderExtra,
  inventedNumber,
  orderRow,
} from "../../../../tests/helpers/orders";
import { commitWhileWaiting } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { updateBranch } from "../../catalog/actions/branches";
import { numbersOfOrders, submitDrafts } from "./submit";

// Submit and the order numbers, build plan 2.7 (Done when: S14; 201 ticked drafts refused; one
// past needed-by date among five stops all five; the counter restarts on 1 January; a double
// click submits once) and the plan's Tests: 05-order-request-form.md (Drafts 4; Order number 1,
// 2, 3, 5; Checks at submit; fields 4, 16), 06-approval-workflow.md (Allowed moves: Draft; rules
// 8, 11), 03-roles-and-permissions.md rule 6, 04-catalogs.md (Branches),
// 10-notifications-analytics-reports.md (Notifications), edge-cases/requests-and-approval.md
// ("Submit is clicked twice", "A product is deactivated while it sits in a draft", "The year
// changes"), developer-rules.md rules 7, 8, 9. Every passing case has the refused data beside it
// (D40). The permission rows are drafts-matrix.db.test.ts.

type Ticked = { id: string; version: number };

const ticked = (drafts: readonly Ticked[], clientKey: string = randomUUID()) => ({
  clientKey,
  orders: drafts.map(({ id, version }) => ({ id, version })),
});

function submit(userId: string, input: unknown) {
  return runOrdersAction(submitDrafts, userId, input);
}

function okOf<T>(result: { ok: boolean }): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

/** A branch with a Manager, a Principal and a Head; drafts of the Manager made one after another. */
async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, manager, principal, head };
}

/** `count` drafts of an owner, each a second after the last (05 Order number 5). */
async function drafts(branchId: string, ownerId: string, count: number, createdBy?: string) {
  // A frozen clock unless the test set one: created_at then differ by a second each.
  if (!isTestClockSet()) setClock("2026-10-16T05:00:00Z");
  const made = [];
  for (let at = 0; at < count; at += 1) {
    made.push(await insertOrder({ branchId, ownerId, createdBy }));
    advanceClock({ seconds: 1 });
  }
  return made;
}

async function stateOf(ids: readonly string[]) {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      version: orders.version,
      revision: orders.revision,
      submittedAt: orders.submittedAt,
    })
    .from(orders)
    .where(inArray(orders.id, [...ids]))
    .orderBy(asc(orders.createdAt));
}

async function counterOf(branchId: string, year: number) {
  const [row] = await db
    .select({ lastValue: numberCounters.lastValue })
    .from(numberCounters)
    .where(and(eq(numberCounters.branchId, branchId), eq(numberCounters.year, year)));
  return row?.lastValue ?? null;
}

describe("S14: two Managers submit at the same moment (15 S14; 05 Order number 5)", () => {
  it("numbers CODE-27-0001 to 0004, no duplicate and no gap; the second waits on the counter row", async () => {
    setClock("2027-01-04T05:00:00Z");
    const { branch } = await scene();
    const other = await insertBranch();
    const first = await insertUser("MANAGER", { branches: [branch.id] });
    const second = await insertUser("MANAGER", { branches: [branch.id] });
    const mine = await drafts(branch.id, first.id, 2);
    const yours = await drafts(branch.id, second.id, 2);
    // Another branch's counter of 2027, beside it (D40): it must not move.
    const elsewhere = await drafts(
      other.id,
      (await insertUser("MANAGER", { branches: [other.id] })).id,
      1,
    );
    await db.insert(numberCounters).values({
      scope: "ORD",
      branchId: other.id,
      year: 2027,
      lastValue: 41,
      createdAt: new Date("2027-01-01T00:00:00Z"),
    });

    // The counter row of CHL 2027 is made and held uncommitted on its own connection; both
    // submits start at once and must wait for it (15 Test layers: "prove the locks work").
    const results = await commitWhileWaiting(
      async (query) => {
        await query(
          `insert into number_counters (scope, branch_id, year, last_value, created_at)
           values ('ORD', $1, 2027, 0, $2)`,
          [branch.id, new Date("2027-01-01T00:00:00Z")],
        );
      },
      () => Promise.all([submit(first.id, ticked(mine)), submit(second.id, ticked(yours))]),
    );
    for (const result of results) expect(result).toMatchObject({ ok: true });

    const numbers = (await stateOf([...mine, ...yours].map((order) => order.id))).map(
      (row) => row.number,
    );
    expect(new Set(numbers).size).toBe(4);
    expect([...numbers].sort()).toEqual([1, 2, 3, 4].map((at) => `${branch.code}-27-000${at}`));
    // Each submit numbers its own drafts in the order they were created.
    const [a, b] = await stateOf(mine.map((order) => order.id));
    const [c, d] = await stateOf(yours.map((order) => order.id));
    expect(a!.number! < b!.number!).toBe(true);
    expect(c!.number! < d!.number!).toBe(true);
    expect(await counterOf(branch.id, 2027)).toBe(4);
    expect(await counterOf(other.id, 2027)).toBe(41);
    expect((await orderRow(elsewhere[0]!.id))!.number).toBeNull();
  });
});

describe("Checks at submit, all or nothing (05 Checks at submit; 06 rule 8)", () => {
  it("201 ticked drafts are refused before anything is read; 200 is the limit", async () => {
    const { manager } = await scene();
    const input = {
      clientKey: randomUUID(),
      orders: Array.from({ length: 201 }, () => ({ id: randomUUID(), version: 1 })),
    };
    expect(await submit(manager.id, input)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(
      await db.select().from(orderActions).where(eq(orderActions.clientKey, input.clientKey)),
    ).toEqual([]);
  });

  it("one draft with a past needed-by date among five stops all five, and names its cell", async () => {
    setClock("2026-10-16T05:00:00Z");
    const { branch, manager } = await scene();
    const five = await drafts(branch.id, manager.id, 5);
    // Yesterday in Tashkent; the four others are due in 2031, and today would pass (decided item 2).
    await db.update(orders).set({ neededBy: "2026-10-15" }).where(eq(orders.id, five[2]!.id));
    await db.update(orders).set({ neededBy: "2026-10-16" }).where(eq(orders.id, five[3]!.id));

    const refused = await submit(manager.id, ticked(five));
    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: five[2]!.id, code: "not_ready", fields: { neededBy: "errors.field.inPast" } },
        ],
      },
    });
    for (const row of await stateOf(five.map((order) => order.id))) {
      expect(row).toMatchObject({ status: "DRAFT", number: null, version: 1 });
    }
    expect(await counterOf(branch.id, 2026)).toBeNull();
    expect(
      await db
        .select()
        .from(orderRevisions)
        .where(
          inArray(
            orderRevisions.orderId,
            five.map((o) => o.id),
          ),
        ),
    ).toEqual([]);

    // The same five with the date fixed go through.
    await db.update(orders).set({ neededBy: "2026-10-16" }).where(eq(orders.id, five[2]!.id));
    okOf(await submit(manager.id, ticked(five)));
    expect(await counterOf(branch.id, 2026)).toBe(5);
  });

  it("a deactivated entry in one draft among three stops all three, its cell named (edge case)", async () => {
    const { branch, manager } = await scene();
    const checks: [string, (order: Awaited<ReturnType<typeof insertOrder>>) => Promise<void>][] = [
      [
        "variantId",
        async (order) => {
          const [variant] = await db
            .select({ productId: productVariants.productId })
            .from(productVariants)
            .where(eq(productVariants.id, order.variantId));
          await db
            .update(products)
            .set({ isActive: false })
            .where(eq(products.id, variant!.productId));
        },
      ],
      [
        "variantId",
        async (order) => {
          await db
            .update(productVariants)
            .set({ isActive: false })
            .where(eq(productVariants.id, order.variantId));
        },
      ],
      [
        "departmentId",
        async (order) => {
          await db
            .update(departments)
            .set({ isActive: false })
            .where(eq(departments.id, order.departmentId));
        },
      ],
      [
        "companyId",
        async (order) => {
          const company = await insertCompany({ isActive: false });
          await db.update(orders).set({ companyId: company.id }).where(eq(orders.id, order.id));
        },
      ],
      [
        "extras.1.extraCostTypeId",
        async (order) => {
          await insertOrderExtra(order.id, 1_000n);
          advanceClock({ seconds: 1 });
          const extra = await insertOrderExtra(order.id, 2_000n);
          const [row] = await db
            .execute<{ extra_cost_type_id: string }>(
              sql`select extra_cost_type_id from order_extras where id = ${extra.id}`,
            )
            .then((r) => r.rows);
          await db
            .update(extraCostTypes)
            .set({ isActive: false })
            .where(eq(extraCostTypes.id, row!.extra_cost_type_id));
        },
      ],
    ];
    for (const [cell, deactivate] of checks) {
      const three = await drafts(branch.id, manager.id, 3);
      await deactivate(three[1]!);
      const refused = await submit(manager.id, ticked(three));
      expect(refused).toMatchObject({
        ok: false,
        error: {
          code: "not_ready",
          orders: [{ orderId: three[1]!.id, fields: { [cell]: "errors.field.inactive" } }],
        },
      });
      for (const row of await stateOf(three.map((order) => order.id))) {
        expect(row).toMatchObject({ status: "DRAFT", number: null });
      }
    }
  });

  it("a deactivated branch stops its drafts (05 Checks at submit; decided item 1)", async () => {
    const { branch, manager } = await scene();
    const two = await drafts(branch.id, manager.id, 2);
    await db.update(branches).set({ isActive: false }).where(eq(branches.id, branch.id));
    expect(await submit(manager.id, ticked(two))).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { fields: { branchId: "errors.field.inactive" } },
          { fields: { branchId: "errors.field.inactive" } },
        ],
      },
    });
  });

  it("missing required fields are named on their cells; a whole-only measure refuses 2.5 (05 fields 7, 10, 11, 14)", async () => {
    const { branch, manager } = await scene();
    const [empty, urgent, half] = await drafts(branch.id, manager.id, 3);
    await db
      .update(orders)
      .set({ plannedQty: null, plannedPrice: null, neededBy: null })
      .where(eq(orders.id, empty!.id));
    await db
      .update(orders)
      .set({ priority: "URGENT", urgentReason: null })
      .where(eq(orders.id, urgent!.id));
    await db.update(orders).set({ plannedQty: "2.500" }).where(eq(orders.id, half!.id));
    expect(await submit(manager.id, ticked([empty!, urgent!, half!]))).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          {
            orderId: empty!.id,
            fields: {
              quantity: "errors.field.required",
              price: "errors.field.required",
              neededBy: "errors.field.required",
            },
          },
          { orderId: urgent!.id, fields: { urgentReason: "errors.field.required" } },
          { orderId: half!.id, fields: { quantity: "errors.field.wholeOnly" } },
        ],
      },
    });
  });

  it("a Draft that already has a number is refused until 2.11, with the draft beside it (decided item 3)", async () => {
    const { branch, manager } = await scene();
    const [fresh] = await drafts(branch.id, manager.id, 1);
    const taken = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      number: inventedNumber(),
    });
    expect(await submit(manager.id, ticked([fresh!, taken]))).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [{ orderId: taken.id, code: "not_ready" }] },
    });
    expect(await orderRow(fresh!.id)).toMatchObject({ status: "DRAFT", number: null });
  });
});

describe("The order number (05 Order number)", () => {
  it("follows the order the drafts were created in, not the order ticked (05 Order number 5)", async () => {
    setClock("2026-10-16T05:00:00Z");
    const { branch, manager } = await scene();
    const three = await drafts(branch.id, manager.id, 3);
    okOf(await submit(manager.id, ticked([three[2]!, three[0]!, three[1]!])));
    expect((await stateOf(three.map((order) => order.id))).map((row) => row.number)).toEqual(
      [1, 2, 3].map((at) => `${branch.code}-26-000${at}`),
    );
  });

  it("restarts at 0001 on 1 January in Tashkent, and not a second before (edge case: the year changes; D40)", async () => {
    setClock("2026-12-31T18:59:58Z");
    const { branch, manager } = await scene();
    const [late, early] = await drafts(branch.id, manager.id, 2);
    // 23:59:59 on 31 December in Tashkent: still 2026.
    setClock("2026-12-31T18:59:59Z");
    okOf(await submit(manager.id, ticked([late!])));
    expect((await orderRow(late!.id))!.number).toBe(`${branch.code}-26-0001`);
    // 00:00 on 1 January in Tashkent, 19:00 UTC: the 2027 counter starts at 0001.
    setClock("2026-12-31T19:00:00Z");
    okOf(await submit(manager.id, ticked([early!])));
    expect((await orderRow(early!.id))!.number).toBe(`${branch.code}-27-0001`);
    expect(await counterOf(branch.id, 2026)).toBe(1);
    expect(await counterOf(branch.id, 2027)).toBe(1);
  });

  it("grows past 9999 to five digits (05 Order number 2)", async () => {
    setClock("2026-10-16T05:00:00Z");
    const { branch, manager } = await scene();
    await db.insert(numberCounters).values({
      scope: "ORD",
      branchId: branch.id,
      year: 2026,
      lastValue: 9998,
      createdAt: new Date(),
    });
    const two = await drafts(branch.id, manager.id, 2);
    okOf(await submit(manager.id, ticked(two)));
    expect((await stateOf(two.map((order) => order.id))).map((row) => row.number)).toEqual([
      `${branch.code}-26-9999`,
      `${branch.code}-26-10000`,
    ]);
  });
});

describe("Submit is clicked twice (edge case; developer-rules rules 8 and 9)", () => {
  it("the same client key returns the first result and the same numbers; an old version moves nothing", async () => {
    const { branch, manager } = await scene();
    const two = await drafts(branch.id, manager.id, 2);
    const input = ticked(two);
    const first = okOf<{ orders: { id: string }[] }>(await submit(manager.id, input));
    const numbers = await numbersOfOrders(
      db,
      two.map((order) => order.id),
    );
    const again = okOf(await submit(manager.id, input));
    expect(again).toEqual(first);
    expect(
      await numbersOfOrders(
        db,
        two.map((order) => order.id),
      ),
    ).toEqual(numbers);
    expect(
      await db.select().from(orderActions).where(eq(orderActions.clientKey, input.clientKey)),
    ).toHaveLength(1);
    expect(
      await counterOf(branch.id, (await orderRow(two[0]!.id))!.submittedAt!.getUTCFullYear()),
    ).toBe(2);

    // A second click with a new key and the versions it saw: refused, nothing moves.
    expect(await submit(manager.id, ticked(two))).toMatchObject({
      ok: false,
      error: { code: "stale_version" },
    });
    expect(
      await db
        .select()
        .from(orderEvents)
        .where(
          inArray(
            orderEvents.orderId,
            two.map((o) => o.id),
          ),
        ),
    ).toHaveLength(2);
  });
});

describe("What a submitted order holds (05 fields 4, 16; 14-data-model.md; 06 rule 11)", () => {
  it("planned_total, stock_at_submit as numeric, submitted_at, one revision and one event each", async () => {
    const at = setClock("2026-10-16T05:00:00Z");
    const { branch, manager } = await scene();
    const kg = await insertItem({ allowDecimal: true });
    const service = await insertItem({ type: "SERVICE" });
    const department = await insertDepartment(branch.id);
    const goods = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      variantId: kg.variantId,
      departmentId: department.id,
    });
    // 3 × 12 500 + 4 000 = 41 500 (review of the plan, decision 4).
    await db
      .update(orders)
      .set({ plannedQty: "3", plannedPrice: 12_500n, plannedTotal: null })
      .where(eq(orders.id, goods.id));
    await insertOrderExtra(goods.id, 4_000n);
    await db.insert(stockBalances).values({
      branchId: branch.id,
      variantId: kg.variantId,
      qty: "7.5",
      createdAt: at,
      updatedAt: at,
    });
    // Stock of the same subtype in another branch (D40): not this order's.
    const other = await insertBranch();
    await db.insert(stockBalances).values({
      branchId: other.id,
      variantId: kg.variantId,
      qty: "99",
      createdAt: at,
      updatedAt: at,
    });
    const none = await insertOrder({ branchId: branch.id, ownerId: manager.id });
    const work = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      variantId: service.variantId,
    });

    const done = okOf<{ actionId: string }>(await submit(manager.id, ticked([goods, none, work])));
    expect(await orderRow(goods.id)).toMatchObject({
      status: "PENDING_HEAD",
      plannedTotal: 41_500n,
      stockAtSubmit: "7.500",
      submittedAt: at,
      version: 2,
      revision: 1,
    });
    expect((await orderRow(none.id))!.stockAtSubmit).toBe("0.000");
    expect((await orderRow(work.id))!.stockAtSubmit).toBeNull();

    const revisions = await db
      .select()
      .from(orderRevisions)
      .where(inArray(orderRevisions.orderId, [goods.id, none.id, work.id]));
    expect(revisions).toHaveLength(3);
    const snapshot = revisions.find((row) => row.orderId === goods.id)!;
    expect(snapshot).toMatchObject({ revision: 1, createdAt: at });
    expect(snapshot.snapshot).toMatchObject({
      number: (await orderRow(goods.id))!.number,
      variantId: kg.variantId,
      departmentId: department.id,
      quantity: "3.000",
      price: "12500",
      plannedTotal: "41500",
      stockAtSubmit: "7.500",
      extras: [{ amount: "4000" }],
    });

    const events = await db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.actionId, done.actionId));
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event).toMatchObject({
        type: "SUBMIT",
        fromStatus: "DRAFT",
        toStatus: "PENDING_HEAD",
        actorId: manager.id,
      });
    }
    const [action] = await db.select().from(orderActions).where(eq(orderActions.id, done.actionId));
    expect(action).toMatchObject({ type: "SUBMIT", orderCount: 3 });
  });
});

describe("An order the Head created (03 rule 6; 06 Allowed moves; 10 Notifications)", () => {
  it("goes to Waiting for Principal, logged Created by Head; a Manager's draft submitted by the Head goes to the Head", async () => {
    const { branch, manager, principal, head } = await scene();
    const [own] = await drafts(branch.id, head.id, 1);
    const [managers] = await drafts(branch.id, manager.id, 1);
    const done = okOf<{ actionId: string; orders: { id: string; status: string }[] }>(
      await submit(head.id, ticked([own!, managers!])),
    );
    expect(new Map(done.orders.map((order) => [order.id, order.status]))).toEqual(
      new Map([
        [own!.id, "PENDING_PRINCIPAL"],
        [managers!.id, "PENDING_HEAD"],
      ]),
    );
    const events = await db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.actionId, done.actionId));
    expect(events.find((event) => event.orderId === own!.id)?.payload).toEqual({
      headStepAuto: true,
    });
    expect(events.find((event) => event.orderId === managers!.id)?.payload).toBeNull();

    // The Principal is told "Head approved" for the one order that skipped the Head step.
    const told = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, principal.id));
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      type: "REQUEST_HEAD_APPROVED",
      params: { actor: head.fullName, count: 1, branch: branch.code },
      link: `/orders?branch=${branch.id}&action=${done.actionId}`,
    });
  });
});

describe("One grouped notification to the Head (10 Notifications; 03 rule 1)", () => {
  it("every active Head but the actor, one per branch with its own count", async () => {
    const { branch, manager, head } = await scene();
    const second = await insertBranch();
    await db.execute(
      sql`insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at) values (${manager.id}, ${second.id}, 'MANAGER', true, now())`,
    );
    const otherHead = await insertUser("HEAD");
    const gone = await insertUser("HEAD", { isActive: false });
    const here = await drafts(branch.id, manager.id, 3);
    const there = await drafts(second.id, manager.id, 2);

    const done = okOf<{ actionId: string }>(await submit(manager.id, ticked([...here, ...there])));
    for (const user of [head, otherHead]) {
      const told = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.type, "REQUEST_SUBMITTED")));
      expect(
        told
          .map((row) => row.params)
          .sort((a, b) =>
            String((a as { branch: string }).branch).localeCompare(
              String((b as { branch: string }).branch),
            ),
          ),
      ).toEqual(
        [
          { actor: manager.fullName, count: 3, branch: branch.code },
          { actor: manager.fullName, count: 2, branch: second.code },
        ].sort((a, b) => a.branch.localeCompare(b.branch)),
      );
      expect(
        told.find((row) => (row.params as { branch: string }).branch === branch.code)?.link,
      ).toBe(`/orders?branch=${branch.id}&action=${done.actionId}`);
    }
    expect(await db.select().from(notifications).where(eq(notifications.userId, gone.id))).toEqual(
      [],
    );
    // Nobody is told of their own act.
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, manager.id)),
    ).toEqual([]);
  });
});

describe("The branch code locks after the first order (04, Branches; decided item 8)", () => {
  it("updateBranch refuses a new code once a numbered order exists, and allows it before", async () => {
    const { branch, manager, head } = await scene();
    // A numbered order in another branch and a draft in this one, beside it (D40).
    const other = await insertBranch();
    await insertOrder({
      branchId: other.id,
      ownerId: (await insertUser("MANAGER", { branches: [other.id] })).id,
      status: "PENDING_HEAD",
    });
    const [draft] = await drafts(branch.id, manager.id, 1);
    // Four letters: no invented branch code has four (tests/helpers/invented.ts).
    expect(await runAction(updateBranch, head.id, { id: branch.id, code: "SUBA" })).toMatchObject({
      ok: true,
    });

    okOf(await submit(manager.id, ticked([draft!])));
    expect(await runAction(updateBranch, head.id, { id: branch.id, code: "ZZZZ" })).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { code: "errors.field.locked" } },
    });
    // The name still changes.
    expect(
      await runAction(updateBranch, head.id, {
        id: branch.id,
        name: `Filial ${randomUUID().slice(0, 8)}`,
      }),
    ).toMatchObject({ ok: true });
  });

  it("the trigger refuses UPDATE branches SET code with a numbered order, with nothing in front of it (D39)", async () => {
    const locked = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [locked.id] });
    await insertOrder({ branchId: locked.id, ownerId: owner.id, status: "PENDING_HEAD" });
    expect(
      await refusalOf(db.execute(sql`update branches set code = 'SUBB' where id = ${locked.id}`)),
    ).toMatchObject({
      code: "23514",
      constraint: "branches_code_locked",
      table: "branches",
    });

    // A branch with only a draft, beside a numbered order elsewhere: allowed (D40).
    const open = await insertBranch();
    await insertOrder({
      branchId: open.id,
      ownerId: (await insertUser("MANAGER", { branches: [open.id] })).id,
    });
    await db.execute(sql`update branches set code = 'SUBC' where id = ${open.id}`);
    const [row] = await db
      .select({ code: branches.code })
      .from(branches)
      .where(eq(branches.id, open.id));
    expect(row!.code).toBe("SUBC");
    // The name of the locked branch still changes.
    await db.execute(
      sql`update branches set name = ${`Filial ${randomUUID().slice(0, 8)}`} where id = ${locked.id}`,
    );
  });
});
