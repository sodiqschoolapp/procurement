import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { issueStock } from "./issue";
import { setStockMinimum } from "./minimum";

// Minimums at the same moment (plan of 5.10, Tests; review of the plan, must fix 1 and should
// fix 4). 10-notifications-analytics-reports.md, Notifications: "once per item until restocked";
// 15-quality-and-acceptance.md, Test layers: "Actions run two at a time to prove the locks work".
// The real actions are started in a fixed order while a third transaction holds the row the
// first waits on (.claude/rules/tests.md); the waits are read from pg_stat_activity, never timed.

const DAY = "2031-05-05";

async function scene() {
  setClock(`${DAY}T07:00:00Z`);
  const branch = await insertBranch();
  const first = await insertUser("MANAGER", { branches: [branch.id] });
  const second = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id, { responsibleName: "Sinov Mas'ul" });
  const variantId = (await insertItem()).variantId;
  const posted = await db.transaction((tx) =>
    postMovement(tx, {
      branchId: branch.id,
      variantId,
      type: "RECEIPT",
      qtyDelta: "10",
      unitCost: 5_000n,
      createdBy: first.id,
    }),
  );
  expect(posted.qty).toBe("10");
  return { branch, first, second, department, variantId };
}

type Scene = Awaited<ReturnType<typeof scene>>;

function issue(s: Scene, userId: string, qty: string) {
  return () =>
    runAction(issueStock, userId, {
      clientKey: randomUUID(),
      branchId: s.branch.id,
      docDate: DAY,
      departmentId: s.department.id,
      receivedByName: "Sinov Mas'ul",
      comment: null,
      lines: [{ variantId: s.variantId, qty }],
    });
}

async function noticesOf(s: Scene): Promise<Record<string, number>> {
  const found = await db.execute<{ user_id: string; n: number }>(sql`
    select user_id, count(*)::int as n from notifications
    where type = 'MINIMUM_STOCK_REACHED' and link like ${`/warehouse/items/${s.variantId}?%`}
    group by user_id`);
  return Object.fromEntries(found.rows.map((row) => [row.user_id, row.n]));
}

const HOLD_BALANCE =
  "select 1 from stock_balances where branch_id = $1 and variant_id = $2 for update";

describe("two writes of one item at the same moment (10 Notifications: once per item)", () => {
  it("two issues that both leave the item at or below its minimum send one notice per Manager", async () => {
    const s = await scene();
    expect(
      await runAction(setStockMinimum, s.first.id, {
        branchId: s.branch.id,
        variantId: s.variantId,
        minQty: "6",
      }),
    ).toEqual({ ok: true, data: { minimum: "6", low: false } });

    const [first, second] = await heldWhile(
      HOLD_BALANCE,
      [s.branch.id, s.variantId],
      [issue(s, s.first.id, "4"), issue(s, s.second.id, "1")],
    );
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect(await noticesOf(s)).toEqual({ [s.first.id]: 1, [s.second.id]: 1 });
  });

  it("a minimum waits on the balance an issue holds, and reads the stock the issue left", async () => {
    // The held side does what an issue does to the balance (10 → 4) and commits; the minimum then
    // reads 4, so 5 is Low and the notice goes out. Without the balance lock of setStockMinimum
    // (holdBalance()) it reads 10 under the hold, is not Low, and sends nothing: heldWhile would
    // not even see it wait.
    const s = await scene();
    const client = await db.$client.connect();
    try {
      await client.query("begin");
      await client.query(HOLD_BALANCE, [s.branch.id, s.variantId]);
      await client.query(
        "update stock_balances set qty = 4 where branch_id = $1 and variant_id = $2",
        [s.branch.id, s.variantId],
      );
      const running = runAction(setStockMinimum, s.first.id, {
        branchId: s.branch.id,
        variantId: s.variantId,
        minQty: "5",
      });
      running.catch(() => undefined);
      for (let tries = 0; ; tries += 1) {
        await client.query("select pg_stat_clear_snapshot()");
        const found = await client.query<{ n: number }>(
          `select count(*)::int as n from pg_stat_activity
           where datname = current_database() and wait_event_type = 'Lock'
             and pid <> pg_backend_pid()`,
        );
        if (found.rows[0]!.n >= 1) break;
        if (tries > 5_000) throw new Error("setStockMinimum did not wait on the balance.");
      }
      await client.query("commit");
      expect(await running).toEqual({ ok: true, data: { minimum: "5", low: true } });
    } finally {
      client.release();
    }
    expect(await noticesOf(s)).toEqual({ [s.first.id]: 1, [s.second.id]: 1 });
  });
});
