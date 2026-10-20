import { and, eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { runAction } from "@/server/action";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { type PostedMovementInput, postMovement } from "@/server/stock-ledger";
import { reverseStockDocument } from "@/features/warehouse/actions/reverse";

import { seed } from "../../../scripts/seed.mjs";
import { catchErrorReports, eventOf } from "../../../tests/helpers/error-reports";
import { insertBranch } from "../../../tests/helpers/branches";
import { setClock } from "../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../tests/helpers/orders";
import { postDocument, receive } from "../../../tests/helpers/stock-documents";
import { insertUser } from "../../../tests/helpers/users";
import { JOBS } from "./registry";
import { runDueJobs } from "./run-due";
import { stockCheck } from "./stock-check";

// The nightly stock check (build-plan 8.2, Done when: "a balance changed directly in the database
// is reported"). Spec: 14-data-model.md, Notes for the build, first bullet ("A nightly job
// recomputes it from the movements and reports any mismatch"); 09-warehouse.md, Stock value;
// open question 17 as the plan of 8.2 answers it (decided items 1 and 2, Look first): one bell
// notification to every active Head with the number of items, nothing corrected. The ledger is
// written by the real writers (postMovement(), the document helpers, the reverse action and the
// seed), and holds every case the replay could get wrong (review of the plan, Should fix 2, and
// corrections 2 and 3; D40). Every fixture is asserted (D38).

afterEach(() => {
  vi.restoreAllMocks();
});

let branchA: string;
let branchB: string;
let manager: string;
let principal: string;
let finance: string;
let head: string;
let inactiveHead: string;
let seedHead: string;

/** The items whose ledger the clean case holds; a mismatch test changes one and restores it. */
const items = {} as Record<
  "reversed" | "returned" | "clamped" | "decimal" | "moved" | "empty",
  string
>;

function post(input: Omit<PostedMovementInput, "createdBy">) {
  return db.transaction((tx) => postMovement(tx, { ...input, createdBy: manager }));
}

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0] ?? null;
}

/** Runs the check at the clock's moment, in a transaction as the scheduler gives it. */
async function check() {
  await db.transaction((tx) => stockCheck.run({ tx, tick: now() }));
}

/** The STOCK_CHECK_MISMATCH notices a user got at the clock's moment. */
async function noticesOf(userId: string) {
  return db
    .select({
      params: notifications.params,
      link: notifications.link,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "STOCK_CHECK_MISMATCH"),
        eq(notifications.createdAt, now()),
      ),
    );
}

/** Changes a stored balance directly, runs `work`, and puts the balance back. */
async function withChanged(
  branchId: string,
  variantId: string,
  change: ReturnType<typeof sql>,
  work: () => Promise<void>,
) {
  const before = await balanceOf(branchId, variantId);
  expect(before).not.toBeNull();
  await db.execute(sql`update stock_balances set ${change}
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  try {
    await work();
  } finally {
    await db.execute(sql`update stock_balances
      set qty = ${before!.qty}::numeric, avg_cost = ${before!.avg_cost}::bigint
      where branch_id = ${branchId} and variant_id = ${variantId}`);
  }
}

beforeAll(async () => {
  setClock("2031-05-03T06:00:00Z");
  // The seed is a second writer of stock_movements and stock_balances (review of the plan, Should
  // fix 2): its demo stock must pass the check as it is.
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    options: "-c timezone=UTC",
  });
  await client.connect();
  try {
    await seed(
      client,
      {
        SEED_HEAD_PASSWORD: "invented-seed-head",
        SEED_MANAGER_PASSWORD: "invented-seed-manager",
        SEED_PRINCIPAL_PASSWORD: "invented-seed-principal",
        SEED_FINANCE_PASSWORD: "invented-seed-finance",
      },
      now(),
    );
    const found = await client.query<{ id: string }>(
      "select id from users where username = 'seed_head'",
    );
    seedHead = found.rows[0]!.id;
  } finally {
    await client.end();
  }
  const seeded = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from stock_movements`,
  );
  expect(seeded.rows[0]!.count).toBeGreaterThan(0);

  branchA = (await insertBranch()).id;
  branchB = (await insertBranch()).id;
  manager = (await insertUser("MANAGER", { branches: [branchA, branchB] })).id;
  principal = (await insertUser("PRINCIPAL", { branches: [branchA] })).id;
  finance = (await insertUser("FINANCE", { branches: [branchA, branchB] })).id;
  head = (await insertUser("HEAD")).id;
  inactiveHead = (await insertUser("HEAD", { isActive: false })).id;
  const department = (await insertDepartment(branchA)).id;

  // A document's reversal: an issue reversed by the Head through the action, priced at the
  // average the issue moved at (review of the plan, correction 2).
  items.reversed = (await insertItem()).variantId;
  await receive(branchA, items.reversed, "10", 1000n, manager);
  await receive(branchA, items.reversed, "10", 1600n, manager);
  const wrong = await postDocument({
    type: "ISSUE",
    branchId: branchA,
    departmentId: department,
    createdBy: manager,
    lines: [{ variantId: items.reversed, qty: "4" }],
  });
  expect(
    await runAction(reverseStockDocument, head, {
      documentId: wrong.documentId,
      reason: "Noto'g'ri bo'limga berilgan",
    }),
  ).toMatchObject({ ok: true });
  expect(await balanceOf(branchA, items.reversed)).toEqual({ qty: "20.000", avg_cost: "1300" });

  // A return into a stock of 0 at its own cost, then a refill at a new price.
  items.returned = (await insertItem()).variantId;
  await receive(branchA, items.returned, "2", 500n, manager);
  await postDocument({
    type: "ISSUE",
    branchId: branchA,
    departmentId: department,
    createdBy: manager,
    lines: [{ variantId: items.returned, qty: "2" }],
  });
  await postDocument({
    type: "RETURN",
    branchId: branchA,
    departmentId: department,
    createdBy: manager,
    lines: [{ variantId: items.returned, qty: "1" }],
  });
  await receive(branchA, items.returned, "3", 3000n, manager);
  expect(await balanceOf(branchA, items.returned)).toEqual({ qty: "4.000", avg_cost: "2500" });

  // A cancelled purchase's reversal at its own price, clamped at average 0.
  items.clamped = (await insertItem()).variantId;
  await receive(branchA, items.clamped, "5", 100n, manager);
  await receive(branchA, items.clamped, "5", 5000n, manager);
  await post({
    branchId: branchA,
    variantId: items.clamped,
    type: "REVERSAL",
    qtyDelta: "-5",
    unitCost: 9000n,
  });
  expect(await balanceOf(branchA, items.clamped)).toEqual({ qty: "5.000", avg_cost: "0" });

  // Count corrections up and down, on decimal quantities, and stock taken to 0 and refilled.
  items.decimal = (await insertItem({ allowDecimal: true })).variantId;
  await receive(branchA, items.decimal, "2.5", 4000n, manager);
  await post({
    branchId: branchA,
    variantId: items.decimal,
    type: "CORRECTION",
    qtyDelta: "-2.5",
    unitCost: null,
  });
  await receive(branchA, items.decimal, "10.25", 1500n, manager);
  await post({
    branchId: branchA,
    variantId: items.decimal,
    type: "CORRECTION",
    qtyDelta: "1.125",
    unitCost: null,
  });
  expect(await balanceOf(branchA, items.decimal)).toEqual({ qty: "11.375", avg_cost: "1500" });

  // A transfer: out of A at its average, into B where the same subtype is already held
  // (correction 3: the same subtype in two branches).
  items.moved = (await insertItem()).variantId;
  await receive(branchA, items.moved, "6", 800n, manager);
  await receive(branchB, items.moved, "2", 1200n, manager);
  await post({
    branchId: branchA,
    variantId: items.moved,
    type: "TRANSFER_OUT",
    qtyDelta: "-2",
    unitCost: null,
  });
  await post({
    branchId: branchB,
    variantId: items.moved,
    type: "TRANSFER_IN",
    qtyDelta: "2",
    unitCost: 800n,
  });
  expect(await balanceOf(branchA, items.moved)).toEqual({ qty: "4.000", avg_cost: "800" });
  expect(await balanceOf(branchB, items.moved)).toEqual({ qty: "4.000", avg_cost: "1000" });

  // A balance row with no movements, at 0 and 0, as a stock minimum makes it.
  items.empty = (await insertItem()).variantId;
  await db.execute(sql`insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
    values (${branchB}, ${items.empty}, 0, 0, ${now()}, ${now()})`);
});

describe("stock_check (14-data-model.md, Notes for the build; open question 17, plan of 8.2)", () => {
  it("is a job of the registry, daily at 03:00 in Tashkent (decided item 5)", () => {
    expect(JOBS).toContain(stockCheck);
    expect(stockCheck.schedule).toEqual({ dailyAt: "03:00" });
  });

  it("a clean ledger, the seeded stock with it, sends nothing", async () => {
    setClock("2031-05-04T06:00:00Z");
    await check();
    for (const user of [head, seedHead]) expect(await noticesOf(user)).toEqual([]);
  });

  it("Done when: a quantity changed directly in the database is reported to every active Head, and to nobody else", async () => {
    setClock("2031-05-05T06:00:00Z");
    await withChanged(branchA, items.reversed, sql`qty = qty + 1`, async () => {
      await check();
      const notice = { params: { count: 1 }, link: "/warehouse/stock" };
      expect(await noticesOf(head)).toEqual([notice]);
      expect(await noticesOf(seedHead)).toEqual([notice]);
      for (const user of [inactiveHead, manager, principal, finance]) {
        expect(await noticesOf(user)).toEqual([]);
      }
    });
  });

  it("an average changed directly in the database is reported", async () => {
    setClock("2031-05-06T06:00:00Z");
    await withChanged(branchA, items.returned, sql`avg_cost = avg_cost + 1`, async () => {
      await check();
      expect(await noticesOf(head)).toEqual([{ params: { count: 1 }, link: "/warehouse/stock" }]);
    });
  });

  it("the check is per branch and subtype: one subtype wrong in one branch is 1, wrong in both is 2 (correction 3)", async () => {
    setClock("2031-05-07T06:00:00Z");
    await withChanged(branchB, items.moved, sql`qty = qty - 0.001`, async () => {
      await check();
      expect(await noticesOf(head)).toEqual([{ params: { count: 1 }, link: "/warehouse/stock" }]);
      setClock("2031-05-08T06:00:00Z");
      await withChanged(branchA, items.moved, sql`avg_cost = 0, qty = qty`, async () => {
        await check();
        expect(await noticesOf(head)).toEqual([{ params: { count: 2 }, link: "/warehouse/stock" }]);
      });
    });
  });

  it("a row of 0 with no movements that is changed to 1 is reported", async () => {
    setClock("2031-05-09T06:00:00Z");
    await withChanged(branchB, items.empty, sql`qty = 1`, async () => {
      await check();
      expect(await noticesOf(head)).toEqual([{ params: { count: 1 }, link: "/warehouse/stock" }]);
    });
  });

  it("a mismatch is also handed to the error reporter, ids and numbers only; a clean ledger sends nothing (build-plan 9.3, plan decision 7)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reports = catchErrorReports();
    setClock("2031-05-09T07:00:00Z");
    await check();
    expect(reports).toEqual([]);
    setClock("2031-05-09T08:00:00Z");
    await withChanged(branchB, items.empty, sql`qty = 1`, async () => {
      await check();
    });
    expect(reports).toHaveLength(1);
    const event = eventOf(reports[0]!);
    expect(event.transaction).toBe("job stock_check");
    expect(event.exception.values[0]!.type).toBe("StockCheckMismatch");
    expect(event.exception.values[0]!.value).toContain(`branch ${branchB}, subtype ${items.empty}`);
  });

  it("corrects nothing: the changed balance stays as it was found (decided item 1)", async () => {
    setClock("2031-05-10T06:00:00Z");
    await withChanged(branchA, items.decimal, sql`qty = 99`, async () => {
      await check();
      expect(await balanceOf(branchA, items.decimal)).toEqual({ qty: "99.000", avg_cost: "1500" });
    });
  });

  it("runs once per 03:00 tick through the scheduler (13-technology.md, Scheduled jobs)", async () => {
    setClock("2031-05-10T22:00:00Z");
    expect(await runDueJobs([stockCheck])).toEqual({ stock_check: "ran" });
    setClock("2031-05-11T21:59:00Z");
    expect(await runDueJobs([stockCheck])).toEqual({ stock_check: "not_due" });
    setClock("2031-05-11T22:00:00Z");
    expect(await runDueJobs([stockCheck])).toEqual({ stock_check: "ran" });
  });
});
