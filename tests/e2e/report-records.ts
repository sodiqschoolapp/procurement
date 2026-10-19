import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import * as schema from "../../src/server/db/schema";
import { refreshAnalytics } from "../../src/server/jobs/analytics-refresh";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Purchase records for the Reports browser tests (build-plan 6.8), written straight into the
// tables under a category of their own, in June 2019, a month no other spec buys in; the summary
// is rebuilt by the job's own refresh, at once rather than at the next 5-minute tick.

export async function withDatabase<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(
    connectionOptions(e2eDatabaseUrl(serverDatabaseUrl()), process.env.DATABASE_CA_CERT),
  );
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export const REPORT_MONTH = { from: "2019-06-01", to: "2019-06-30" };

/** One record per entry, each on its own order of the branch's code, bought on its day. */
export async function seedReportRecords(
  records: readonly { code: "EA" | "EB"; day: string; qty: string; price: number }[],
) {
  const tag = randomUUID().slice(0, 8);
  const category = `Hisobot ${tag}`;
  return withDatabase(async (client) => {
    await client.query("begin");
    let seeded;
    try {
      const head = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.HEAD.username,
      ]);
      const headId = head.rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, true, true, now()) returning id`,
        [`O'lchov ${tag}`, `r${tag}`],
      );
      const categoryRow = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [category],
      );
      const numbers: string[] = [];
      for (const [at, record] of records.entries()) {
        const department = await client.query<{ id: string }>(
          `insert into departments (branch_id, name, is_active, created_at)
           select id, $1, true, now() from branches where code = $2 returning id`,
          [`Bo'lim ${tag} ${at}`, record.code],
        );
        const product = await client.query<{ id: string }>(
          `insert into products (name, type, category_id, unit_id, is_active, has_variants,
                                 created_at)
           values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
          [`Qog'oz ${tag} ${at}`, categoryRow.rows[0]!.id, unit.rows[0]!.id],
        );
        const variant = await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, is_active, created_at)
           values ($1, 'default', true, true, now()) returning id`,
          [product.rows[0]!.id],
        );
        // A number far above any the run's own submits reach (05 Order number 2).
        const number = `${record.code}-19-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
        numbers.push(number);
        const order = await client.query<{ id: string; branch_id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, submitted_at, created_at, updated_at)
           select $1, b.id, $2, $2, 'PURCHASING', $3, $4, '2019-07-01', 1, 10000, 10000, 'CASH',
                  now(), now(), now()
             from branches b where b.code = $5
           returning id, branch_id`,
          [number, headId, variant.rows[0]!.id, department.rows[0]!.id, record.code],
        );
        const { id: orderId, branch_id: branchId } = order.rows[0]!;
        const trip = await client.query<{ id: string }>(
          `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                       created_by, created_at)
           values ($1, $2, $3, 'CASH', $4, now()) returning id`,
          [randomUUID(), branchId, record.day, headId],
        );
        await client.query(
          `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                  created_by, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, now())`,
          [
            trip.rows[0]!.id,
            orderId,
            branchId,
            variant.rows[0]!.id,
            record.qty,
            record.price,
            headId,
          ],
        );
      }
      const eb = await client.query<{ id: string }>("select id from branches where code = 'EB'");
      await client.query("commit");
      seeded = { category, categoryId: categoryRow.rows[0]!.id, numbers, ebId: eb.rows[0]!.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
    return seeded;
  });
}
