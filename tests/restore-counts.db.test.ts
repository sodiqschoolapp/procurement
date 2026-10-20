import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";

import { countAt, readCounts } from "../scripts/restore-counts.mjs";
import { seed } from "../scripts/seed.mjs";
import { createTestDatabase, dropTestDatabase } from "./helpers/test-database";

// The counts of the restore drill (build-plan 9.6, Done when: "The restored database holds
// yesterday's demo orders, users and stock lines, counted against the live one"; 16-build-order.md
// phase 8 row; 18-hosting-and-costs.md row 2; plan of 9.6, decided item 3, Look first): both sides
// are counted as of one moment, and rows written after it change nothing. The data is the seed's
// invented demo data.

const MOMENT = new Date("2031-06-20T03:00:00Z");
const LATER = new Date("2031-06-21T03:00:00Z");
const ENV = {
  SEED_HEAD_PASSWORD: "invented-seed-head",
  SEED_MANAGER_PASSWORD: "invented-seed-manager",
  SEED_PRINCIPAL_PASSWORD: "invented-seed-principal",
  SEED_FINANCE_PASSWORD: "invented-seed-finance",
};

const serverUrl = inject("databaseServerUrl");
const made: string[] = [];
const clients: pg.Client[] = [];

afterAll(async () => {
  for (const client of clients.splice(0)) await client.end();
  for (const name of made) await dropTestDatabase(serverUrl, name);
}, 60_000);

/** A database with the demo data of the seed, as the live app holds it during the trial. */
async function withDemoData(): Promise<{ url: string; client: pg.Client }> {
  const database = await createTestDatabase(serverUrl, { fromTemplate: true });
  made.push(database.name);
  const client = new pg.Client({ connectionString: database.url, options: "-c timezone=UTC" });
  await client.connect();
  clients.push(client);
  await seed(client, ENV, MOMENT);
  return { url: database.url, client };
}

const one = async (client: pg.Client, text: string): Promise<number> =>
  (await client.query<{ n: number }>(text)).rows[0]!.n;

describe("countAt (build-plan 9.6, Done when; plan of 9.6, decided item 3)", () => {
  it("counts every order, user and stock line of the database when no moment is given", async () => {
    const { url, client } = await withDemoData();
    const query = (text: string, values?: unknown[]) => client.query(text, values);

    const counts = await countAt(query, null);

    // The scene asserts itself (D38): the demo data is there.
    expect(counts.orders).toBeGreaterThan(0);
    expect(counts.stockLines).toBeGreaterThan(0);
    expect(counts.orders).toBe(await one(client, "select count(*)::int as n from orders"));
    expect(counts.users).toBe(await one(client, "select count(*)::int as n from users"));
    expect(counts.movements).toBe(
      await one(client, "select count(*)::int as n from stock_movements"),
    );
    // On a database at rest the stock rebuilt from the movements is the stored one (09).
    expect(counts.stockLines).toBe(
      await one(client, "select count(*)::int as n from stock_balances where qty > 0"),
    );
    const qty = await client.query<{ q: string }>(
      "select coalesce(sum(qty), 0)::numeric(20, 3)::text as q from stock_balances",
    );
    expect(counts.stockQty).toBe(qty.rows[0]!.q);
    expect(counts.newest).toBeInstanceOf(Date);
    expect(counts.newest!.getTime()).toBeLessThanOrEqual(MOMENT.getTime());

    // The same through the read-only snapshot the scripts use (decided item 9).
    expect(await readCounts({ connectionString: url }, null)).toEqual(counts);
  });

  it("counts nothing up to a moment before every row", async () => {
    const { client } = await withDemoData();
    const counts = await countAt((text, values) => client.query(text, values), new Date(0));
    expect(counts).toEqual({
      orders: 0,
      users: 0,
      stockLines: 0,
      stockQty: "0.000",
      movements: 0,
      newest: null,
    });
  });

  it("the live side counted up to the copy's newest row equals the copy, whatever was written after", async () => {
    const { client } = await withDemoData();
    const query = (text: string, values?: unknown[]) => client.query(text, values);
    // The copy: what the database held at the moment of the copy.
    const copy = await countAt(query, null);

    // After the copy the live app goes on: one item is written off to 0 and another gains stock.
    const [emptied, added] = (
      await client.query<{
        branch_id: string;
        variant_id: string;
        balance_after: string;
        created_by: string;
      }>(
        `select distinct on (branch_id, variant_id) branch_id, variant_id, balance_after, created_by
         from stock_movements order by branch_id, variant_id, seq desc`,
      )
    ).rows.filter((row) => Number(row.balance_after) > 0);
    expect(added).toBeDefined();
    await client.query(
      `insert into stock_movements
         (branch_id, variant_id, type, qty_delta, unit_cost, balance_after, created_by, created_at)
       values ($1, $2, 'WRITE_OFF', -$3::numeric, 0, 0, $4, $5),
              ($6, $7, 'DIRECT_ENTRY', 5, 0, $8::numeric + 5, $9, $5)`,
      [
        emptied!.branch_id,
        emptied!.variant_id,
        emptied!.balance_after,
        emptied!.created_by,
        LATER,
        added!.branch_id,
        added!.variant_id,
        added!.balance_after,
        added!.created_by,
      ],
    );
    const live = await countAt(query, null);
    expect(live.movements).toBe(copy.movements + 2);
    expect(live.stockLines).toBe(copy.stockLines - 1);

    expect(await countAt(query, copy.newest)).toEqual(copy);
  });

  it("a never-submitted draft deleted on the live side after the copy lowers its orders by one, nothing else (review of the plan, correction 1)", async () => {
    const { client } = await withDemoData();
    const query = (text: string, values?: unknown[]) => client.query(text, values);
    const draft = await client.query<{ id: string }>(
      "select id from orders where status = 'DRAFT' and number is null limit 1",
    );
    expect(draft.rows).toHaveLength(1);
    const copy = await countAt(query, null);

    // CLAUDE.md rule 11: the one deletion allowed (04-catalogs.md rule 2).
    await client.query("delete from orders where id = $1", [draft.rows[0]!.id]);

    expect(await countAt(query, copy.newest)).toEqual({ ...copy, orders: copy.orders - 1 });
  });
});
