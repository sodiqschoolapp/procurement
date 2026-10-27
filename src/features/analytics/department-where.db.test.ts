import { type SQL, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Actor } from "@/domain/permissions";
import { authorizeList } from "@/server/authorize";
import { db } from "@/server/db/client";

import {
  type SpendingScene,
  bought,
  buyingEvent,
  decided,
  moneyOn,
  refreshNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../tests/helpers/analytics";
import { setClock } from "../../../tests/helpers/clock";
import { insertUser } from "../../../tests/helpers/users";

import { cancelledWhere } from "./cancelled-where";
import { cashWhere } from "./cash-where";
import { moneyWhere } from "./money-where";
import { movesWhere } from "./moves-where";
import { neededWhere } from "./needed-where";
import { ordersWhere } from "./orders-where";
import { outcomesWhere } from "./outcomes-where";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, NO_DEPARTMENT } from "./period-params";
import { settlementsWhere } from "./settlements-where";
import { spendingWhere } from "./spending-where";
import { stepsWhere } from "./steps-where";

// The department filter's "no department" value is read by every analytics filter (build plan
// 2.5d-c, Build 1; 10-notifications-analytics-reports.md, Analytics page per role, points 2 and 3;
// D68; .claude/rules/tests.md: a value read in a new way is tested at every reader). Each summary
// table gets the same rows for two twin orders, one of the scene's department and one without a
// department, and every other value equal, so only the department filter can tell them apart:
// `none` keeps the twin without a department alone, the department's id the other alone.

const OCTOBER = { first: "2031-10-01", last: "2031-10-31" };

/** The twin orders of one department (or none) behind every summary table. */
async function twins(scene: SpendingScene, departmentId: string | null, finance: string) {
  const ended = await bought(scene, {
    purchasedOn: "2031-10-03",
    progress: "DONE",
    departmentId,
  });
  await buyingEvent(ended.orderId, scene.manager.id, "FINISH_ORDER", "2031-10-03T05:00:00Z");
  const cancelled = await bought(scene, {
    purchasedOn: "2031-10-04",
    cancelled: true,
    cancelledAt: "2031-10-04T05:00:00Z",
    departmentId,
  });
  const open = await bought(scene, { purchasedOn: "2031-10-05", departmentId });
  await moneyOn(open, finance, { amount: 50_000n, occurredOn: "2031-10-05" });
  const waiting = await decided(
    scene,
    "PENDING_PRINCIPAL",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-06T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-10-07T05:00:00Z",
      },
    ],
    { departmentId, submittedAt: "2031-10-06T05:00:00Z" },
  );
  const settled = await decided(
    scene,
    "CLOSED",
    [
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        at: "2031-10-08T05:00:00Z",
      },
      { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: "2031-10-09T05:00:00Z" },
    ],
    { departmentId, submittedAt: "2031-10-01T05:00:00Z" },
  );
  return [ended.orderId, cancelled.orderId, open.orderId, waiting.id, settled.id];
}

async function scene() {
  setClock("2031-10-15T05:00:00Z");
  const scene = await spendingScene();
  const head = await insertUser("HEAD");
  const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
  const withDepartment = await twins(scene, scene.department.id, finance.id);
  const without = await twins(scene, null, finance.id);
  const variant = await stocked(scene, { qty: "10", unitCost: 1_000n });
  await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-10-10",
    lines: [{ variantId: variant, qty: "2" }],
  });
  await refreshNow();
  const actor = await authorizeList(head.id, "data.view");
  return { scene, actor, withDepartment, without };
}

/** The orders a condition keeps in a summary table. */
async function ordersOf(table: string, where: SQL): Promise<string[]> {
  const found = await db.execute<{ order_id: string }>(
    sql`select distinct order_id from ${sql.identifier(table)} where ${where}`,
  );
  return found.rows.map((row) => row.order_id).sort();
}

type Reader = { table: string; where: (actor: Actor, filters: AnalyticsFilters) => SQL };

const READERS: Reader[] = [
  { table: "analytics_spending", where: (a, f) => spendingWhere(a, OCTOBER, f) },
  { table: "analytics_outcomes", where: (a, f) => outcomesWhere(a, OCTOBER, f) ?? sql`true` },
  { table: "analytics_orders", where: (a, f) => ordersWhere(a, OCTOBER, f) },
  { table: "analytics_orders", where: (a, f) => neededWhere(a, f, "all") },
  { table: "analytics_steps", where: (a, f) => stepsWhere(a, OCTOBER, f) },
  { table: "analytics_cancelled", where: (a, f) => cancelledWhere(a, OCTOBER, f) },
  { table: "analytics_cash", where: (a, f) => cashWhere(a, f) },
  { table: "analytics_money", where: (a, f) => moneyWhere(a, OCTOBER, f) },
  { table: "analytics_settlements", where: (a, f) => settlementsWhere(a, OCTOBER, f) },
];

describe("department=none at every analytics condition (10 Analytics points 2 and 3; D68)", () => {
  it("keeps the orders without a department alone, and a department's id the others alone", async () => {
    const { scene: s, actor, withDepartment, without } = await scene();
    const branch = { ...NO_ANALYTICS_FILTERS, branch: s.branch.id };
    for (const reader of READERS) {
      const all = await ordersOf(reader.table, reader.where(actor, branch));
      const none = await ordersOf(
        reader.table,
        reader.where(actor, { ...branch, department: NO_DEPARTMENT }),
      );
      const own = await ordersOf(
        reader.table,
        reader.where(actor, { ...branch, department: s.department.id }),
      );
      // Each table holds a twin of each side, so neither condition passes for want of rows.
      expect(none.length, reader.table).toBeGreaterThan(0);
      expect(own.length, reader.table).toBeGreaterThan(0);
      expect(
        none.every((id) => without.includes(id)),
        reader.table,
      ).toBe(true);
      expect(
        own.every((id) => withDepartment.includes(id)),
        reader.table,
      ).toBe(true);
      expect([...none, ...own].sort(), reader.table).toEqual(all);
    }
  });

  it("use by department has no movement without a department: none keeps no use (plan of 2.5d-c, decided item 9)", async () => {
    const { scene: s, actor } = await scene();
    const branch = { ...NO_ANALYTICS_FILTERS, branch: s.branch.id };
    const count = async (filters: AnalyticsFilters) =>
      (
        await db.execute<{ count: number }>(
          sql`select count(*)::int as count from analytics_stock_moves
              where ${movesWhere(actor, OCTOBER, filters, "use")}`,
        )
      ).rows[0]!.count;
    expect(await count({ ...branch, department: s.department.id })).toBe(1);
    expect(await count({ ...branch, department: NO_DEPARTMENT })).toBe(0);
  });
});
