import { randomUUID } from "node:crypto";

import { test } from "@playwright/test";
import { drizzle } from "drizzle-orm/node-postgres";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import * as schema from "../../src/server/db/schema";
import { refreshAnalytics } from "../../src/server/jobs/analytics-refresh";
import {
  type Scene,
  as,
  expect,
  inTransaction,
  newProduct,
  newScene,
  scrollsSideways,
  tag,
  withDatabase,
} from "./acceptance-fixtures";

// Build plan 2.5d-c in the browser, at 375 px and 1440 px (Done when: "a Playwright test at 375
// px and 1440 px"): the Head's Analytics page shows spending of an order without a department
// under "No department" and its line opens that order's records (D68; 10-notifications-analytics-
// reports.md, Analytics page per role, point 3); Plan vs actual counts the ended order without a
// planned price and the count opens it (08 Numbers: "a sum that leaves orders out says how
// many"); the Order register's planned total says "1 without a price". The orders are written
// straight into the tables of a branch of their own, in March 2019, a period no other spec buys in;
// the summary is rebuilt by the job's own refresh.

const FROM = "2019-03-01";
const TO = "2019-03-31";

/** One Open order without a department (3 000) and one Done without a planned price (45 000). */
async function seed(scene: Scene): Promise<{ bare: string; unpriced: string }> {
  const bareVariant = await newProduct(`Papka ${tag()}`, 1000);
  const unpricedVariant = await newProduct(`Qog'oz ${tag()}`, null);
  return withDatabase(async (client) => {
    const ids = await inTransaction(client, async () => {
      const order = async (
        variantId: string,
        row: { department: string | null; price: number | null; progress: string; day: string },
      ) => {
        const number = `${scene.branch.code}-19-${String(Math.floor(Math.random() * 90_000) + 10_000)}`;
        const made = await client.query<{ id: string; number: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, progress,
                               variant_id, department_id, planned_qty, planned_price,
                               planned_total, payment_type, submitted_at, approved_at,
                               skipped_finance, created_at, updated_at)
           values ($1, $2, $3, $3, 'PURCHASING', $4, $5, $6, 10, $7::bigint, $7::bigint * 10,
                   'CASH', $8, $8, true, $8, $8)
           returning id, number`,
          [
            number,
            scene.branch.id,
            scene.manager.id,
            row.progress,
            variantId,
            row.department,
            row.price,
            `${row.day}T05:00:00Z`,
          ],
        );
        const orderId = made.rows[0]!.id;
        const trip = await client.query<{ id: string }>(
          `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                       created_by, created_at)
           values ($1, $2, $3, 'CASH', $4, $5) returning id`,
          [randomUUID(), scene.branch.id, row.day, scene.manager.id, `${row.day}T05:00:00Z`],
        );
        await client.query(
          `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                  created_by, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            trip.rows[0]!.id,
            orderId,
            scene.branch.id,
            variantId,
            row.progress === "DONE" ? "10.000" : "3.000",
            row.progress === "DONE" ? 4500 : 1000,
            scene.manager.id,
            `${row.day}T05:00:00Z`,
          ],
        );
        // The buying event its outcome falls on (plan of 6.4, decided item 5).
        const action = await client.query<{ id: string }>(
          `insert into order_actions (client_key, type, actor_id, order_count, created_at)
           values ($1, 'RECORD_PURCHASE', $2, 1, $3) returning id`,
          [randomUUID(), scene.manager.id, `${row.day}T05:00:00Z`],
        );
        await client.query(
          `insert into order_events (order_id, action_id, type, from_status, to_status, actor_id,
                                     created_at)
           values ($1, $2, 'RECORD_PURCHASE', 'PURCHASING', 'PURCHASING', $3, $4)`,
          [orderId, action.rows[0]!.id, scene.manager.id, `${row.day}T05:00:00Z`],
        );
        return made.rows[0]!.number;
      };
      return {
        bare: await order(bareVariant, {
          department: null,
          price: 1000,
          progress: "OPEN",
          day: "2019-03-10",
        }),
        unpriced: await order(unpricedVariant, {
          department: scene.department,
          price: null,
          progress: "DONE",
          day: "2019-03-12",
        }),
      };
    });
    // The job's refresh, at once rather than at the next 5-minute tick.
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
    return ids;
  });
}

// The projects phone-375 and desktop-1440 run it at both widths (playwright.config.ts).
test("No department in Spending by department opens its records; Plan vs actual and the Order register say 1 without a price (D68; 08 Numbers)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const scene = await newScene();
  const { bare, unpriced } = await seed(scene);
  await as(page, scene.head);
  const period = `period=custom&from=${FROM}&to=${TO}&branch=${scene.branch.id}`;
  await page.goto(`/analytics?${period}`);

  const departments = page.locator('[data-chart-card="spending-departments"]');
  const line = departments.locator(`[data-chart-row="${en.analytics.noDepartment}"]`);
  await expect(line).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await line.getByRole("link").click();
  await expect(page).toHaveURL(/\/analytics\/records\?.*department=none/);
  await expect(page.locator("[data-records-summary]")).toContainText(/3\s000/);
  await expect(page.locator("[data-record-row]")).toHaveCount(1);
  await expect(page.getByText(bare).first()).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  await page.goto(`/analytics?${period}`);
  const tile = page.locator('[data-plan-tile="unpriced"]');
  await expect(tile).toContainText(en.analytics.plan.unpriced);
  await expect(tile.locator("[data-plan-number]")).toHaveText("1");
  await tile.locator("[data-plan-number]").click();
  await expect(page).toHaveURL(/\/analytics\/orders\?.*key=unpriced/);
  await expect(page.locator("[data-order-row]")).toHaveCount(1);
  await expect(page.getByRole("link", { name: unpriced })).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  await page.goto(`/reports?report=orders&from=${FROM}&to=${TO}&branch=${scene.branch.id}`);
  await expect(page.locator("[data-report-summary]")).toContainText(
    en.orders.unpriced.count.replace(/\{count, plural, one \{# (.*?)\} other.*$/, "1 $1"),
  );
  expect(await scrollsSideways(page)).toBe(false);
});
