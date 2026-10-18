import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { decided, spendingScene } from "../../../../tests/helpers/analytics";
import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraint of migration 0042_analytics_manager (build-plan 6.5b; plan of 6.5b, Database
// changes; decided item 1, Look first): the first entry into Open of analytics_orders, its
// Tashkent date and its seconds are all null or all set, the seconds 0 or more. Each forbidden
// write goes straight to the table beside the rows the guard lets through (D39, D40).
// developer-rules.md rule 5.

const CHECK = "23514";
const OPENED = {
  opened_at: "'2031-10-04T05:00:00Z'",
  opened_on: "'2031-10-04'",
  approval_seconds: "259200",
};
type Opened = Partial<Record<keyof typeof OPENED, string>>;

let order: { id: string; branch: string; category: string; department: string; owner: string };

beforeAll(async () => {
  const scene = await spendingScene();
  const placed = await decided(scene, "PURCHASING", []);
  order = {
    id: placed.id,
    branch: scene.branch.id,
    category: scene.category.id,
    department: scene.department.id,
    owner: scene.manager.id,
  };
});

const insert = (opened: Opened) => {
  const value = (column: keyof typeof OPENED) => sql.raw(opened[column] ?? "null");
  return db.execute(sql`
    insert into analytics_orders (order_id, branch_id, status, progress, submitted_on, needed_by,
      category_id, department_id, owner_id, opened_at, opened_on, approval_seconds)
    values (${order.id}, ${order.branch}, 'PURCHASING', 'OPEN', '2031-10-01', '2031-10-20',
      ${order.category}, ${order.department}, ${order.owner}, ${value("opened_at")},
      ${value("opened_on")}, ${value("approval_seconds")})`);
};
const clear = () => db.execute(sql`delete from analytics_orders where order_id = ${order.id}`);

describe("analytics_orders_opened_check", () => {
  it("takes an order not yet Open (all null) and an Open one (all set, 0 seconds included)", async () => {
    for (const opened of [{}, OPENED, { ...OPENED, approval_seconds: "0" }]) {
      await insert(opened);
      await clear();
    }
  });

  it.each(Object.keys(OPENED) as (keyof typeof OPENED)[])(
    "refuses %s alone or missing, on insert and on update",
    async (column) => {
      const only: Opened = { [column]: OPENED[column] };
      const without: Opened = { ...OPENED, [column]: undefined };
      for (const opened of [only, without]) {
        expect(await refusalOf(insert(opened))).toMatchObject({
          code: CHECK,
          constraint: "analytics_orders_opened_check",
        });
      }
      // From a valid Open row, one column cleared; from a valid row not yet Open, one column set.
      for (const [start, set] of [
        [OPENED, `${column} = null`],
        [{}, `${column} = ${OPENED[column]}`],
      ] as const) {
        await insert(start);
        try {
          expect(
            await refusalOf(
              db.execute(
                sql`update analytics_orders set ${sql.raw(set)} where order_id = ${order.id}`,
              ),
            ),
          ).toMatchObject({ code: CHECK, constraint: "analytics_orders_opened_check" });
        } finally {
          await clear();
        }
      }
    },
  );

  it("refuses seconds below 0, on insert and on update", async () => {
    expect(await refusalOf(insert({ ...OPENED, approval_seconds: "-1" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_orders_opened_check",
    });
    await insert(OPENED);
    try {
      expect(
        await refusalOf(
          db.execute(
            sql`update analytics_orders set approval_seconds = -1 where order_id = ${order.id}`,
          ),
        ),
      ).toMatchObject({ code: CHECK, constraint: "analytics_orders_opened_check" });
    } finally {
      await clear();
    }
  });
});
