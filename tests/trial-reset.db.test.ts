import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";

import { seed } from "../scripts/seed.mjs";
import { endTrial } from "../scripts/trial-end.mjs";
import { FIRST_HEAD_LOCK } from "../scripts/first-head.mjs";
import { refusalOf } from "./helpers/database-error";
import { createTestDatabase, dropTestDatabase } from "./helpers/test-database";

// build-plan 9.4, Done when: "a database test shows that the reset empties a database with demo
// data, and refuses a second run and a wrong confirmation"; Build: "it runs only when the
// database's name is typed as the confirmation, and refuses, writing nothing, once that record
// exists, so it can never run over the real data"; D52. Plan of 9.4, decided items 3, 5 and 7.
// Every case runs on a database of its own, copied from the template, because the reset drops
// the schemas of the database it works on.

const MOMENT = new Date("2031-06-20T03:00:00Z");
const LATER = new Date("2031-06-21T03:00:00Z");
const ENV = {
  SEED_HEAD_PASSWORD: "invented-seed-head",
  SEED_MANAGER_PASSWORD: "invented-seed-manager",
  SEED_PRINCIPAL_PASSWORD: "invented-seed-principal",
  SEED_FINANCE_PASSWORD: "invented-seed-finance",
};
const ENDED = /^Refused: the trial of database "procurement_test_[a-z0-9]+" has already ended/;
const WRONG = /^Refused: the confirmation is not the database's name/;
const SEED_REFUSED = /^Refused: the trial of this database has ended \(npm run trial:reset\)/;

const serverUrl = inject("databaseServerUrl");
const made: string[] = [];
const clients: pg.Client[] = [];

afterAll(async () => {
  for (const client of clients.splice(0)) await client.end();
  for (const name of made) await dropTestDatabase(serverUrl, name);
}, 60_000);

async function freshDatabase(): Promise<{ name: string; url: string }> {
  const database = await createTestDatabase(serverUrl, { fromTemplate: true });
  made.push(database.name);
  return database;
}

async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, options: "-c timezone=UTC" });
  await client.connect();
  clients.push(client);
  return client;
}

/** The row count of every table of `public` and of Drizzle's bookkeeping. */
async function counts(client: pg.Client): Promise<Record<string, number>> {
  const tables = await client.query<{ name: string }>(
    `select format('%I.%I', table_schema, table_name) as name from information_schema.tables
     where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE' order by 1`,
  );
  const result: Record<string, number> = {};
  for (const { name } of tables.rows) {
    const rows = await client.query<{ count: number }>(
      `select count(*)::int as count from ${name}`,
    );
    result[name] = rows.rows[0]!.count;
  }
  return result;
}

/** A database with the demo data of the seed, as the live app holds it during the trial. */
async function withDemoData(): Promise<{ name: string; url: string; client: pg.Client }> {
  const database = await freshDatabase();
  const client = await connect(database.url);
  await seed(client, ENV, MOMENT);
  const users = await client.query<{ count: number }>("select count(*)::int as count from users");
  const orders = await client.query<{ count: number }>("select count(*)::int as count from orders");
  // The scene asserts itself (D38): the demo data is there.
  expect(users.rows[0]!.count).toBeGreaterThan(0);
  expect(orders.rows[0]!.count).toBeGreaterThan(0);
  return { ...database, client };
}

describe("npm run trial:reset (build-plan 9.4; D52)", () => {
  it("empties a database with demo data, migrates it from zero and records the end of the trial", async () => {
    const { name, url, client } = await withDemoData();
    // What the migrations alone write into an empty database: the template, untouched.
    const empty = await counts(await connect((await freshDatabase()).url));

    const ended = await endTrial(url, name, MOMENT);

    expect(ended).toEqual({ database: name, migrations: empty["drizzle.__drizzle_migrations"] });
    const after = await counts(client);
    for (const table of ["users", "orders", "stock_movements", "money_actions", "audit_log"]) {
      expect(after[`public.${table}`], table).toBe(0);
    }
    expect({ ...after, "public.trial_end": 0 }).toEqual(empty);
    const record = await client.query<{ ended_at: Date }>("select ended_at from trial_end");
    expect(record.rows.map((row) => row.ended_at.toISOString())).toEqual([MOMENT.toISOString()]);
  });

  it("refuses a second run, writing nothing, once the end of the trial is recorded", async () => {
    const { name, url, client } = await withDemoData();
    await endTrial(url, name, MOMENT);
    // What the real data would be: a branch made after the trial ended.
    await client.query(
      `insert into branches (name, code, address, created_at)
       values ('Invented branch', 'INV', 'Invented street 1', $1)`,
      [LATER],
    );
    const before = await counts(client);

    await expect(endTrial(url, name, LATER)).rejects.toThrow(ENDED);

    expect(await counts(client)).toEqual(before);
    const record = await client.query<{ ended_at: Date }>("select ended_at from trial_end");
    expect(record.rows.map((row) => row.ended_at.toISOString())).toEqual([MOMENT.toISOString()]);
  });

  it("refuses a wrong confirmation, writing nothing (plan of 9.4, decided item 7)", async () => {
    const { name, url, client } = await withDemoData();
    const before = await counts(client);

    for (const typed of ["", "defaultdb", `${name}x`, name.toUpperCase(), name.slice(0, -1)]) {
      await expect(endTrial(url, typed, MOMENT), JSON.stringify(typed)).rejects.toThrow(WRONG);
    }

    expect(await counts(client)).toEqual(before);
    expect(before["public.trial_end"]).toBe(0);
  });

  it("takes the name with white space around it, as a typed line comes (plan of 9.4, decided item 7)", async () => {
    const { name, url, client } = await withDemoData();

    await endTrial(url, `  ${name}\t\n`, MOMENT);

    const users = await client.query<{ count: number }>("select count(*)::int as count from users");
    expect(users.rows[0]!.count).toBe(0);
  });
});

describe("the seed after the end of the trial (plan of 9.4, decided item 3)", () => {
  it("refuses, writing nothing, on a database whose trial has ended", async () => {
    const { name, url, client } = await withDemoData();
    await endTrial(url, name, MOMENT);
    const before = await counts(client);

    await expect(seed(client, ENV, LATER)).rejects.toThrow(SEED_REFUSED);

    expect(await counts(client)).toEqual(before);
    expect(before["public.users"]).toBe(0);
  });

  it("seeds as before on a database that records no end (the trial)", async () => {
    const database = await freshDatabase();
    const client = await connect(database.url);

    const { lines } = await seed(client, ENV, MOMENT);

    expect(lines).toContain("created user seed_head");
  });

  // Review of the plan of 9.4, Must fix 1: a container start's seed that comes while the reset
  // runs waits on the reset's lock, and once the record is written it is refused. A third session
  // holds the lock first, so the reset and then the seed queue behind it in that order.
  it("makes a seed started during the reset wait for it, then refuses it", async () => {
    const { name, url } = await withDemoData();
    const holder = await connect(url);
    const watcher = await connect(url);
    const seeder = await connect(url);
    await holder.query("select pg_advisory_lock($1, 0)", [FIRST_HEAD_LOCK]);
    const waiting = async (count: number) => {
      for (let tries = 0; tries < 500; tries += 1) {
        const found = await watcher.query<{ count: number }>(
          `select count(*)::int as count from pg_locks
           where locktype = 'advisory' and classid = $1 and objid = 0 and not granted`,
          [FIRST_HEAD_LOCK],
        );
        if (found.rows[0]!.count === count) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`never ${count} waiting`);
    };

    const reset = endTrial(url, name, MOMENT);
    await waiting(1);
    const seeding = seed(seeder, ENV, LATER).then(
      () => "seeded",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    await waiting(2);
    await holder.query("select pg_advisory_unlock($1, 0)", [FIRST_HEAD_LOCK]);

    await expect(reset).resolves.toMatchObject({ database: name });
    expect(await seeding).toMatch(SEED_REFUSED);
    const users = await watcher.query<{ count: number }>(
      "select count(*)::int as count from users",
    );
    expect(users.rows[0]!.count).toBe(0);
  });
});

// Plan of 9.4, decided item 2 (Look first): the end of the trial is one row at most. The primary
// key on `id` and `trial_end_one_row_check` keep it so; each case tries the forbidden write
// directly on a migrated database and writes nothing (.claude/rules/database.md; CLAUDE.md rule 5).
describe("the trial_end record holds one row at most (plan of 9.4, decided item 2)", () => {
  const rows = async (client: pg.Client) =>
    (await client.query<{ count: number }>("select count(*)::int as count from trial_end")).rows[0]!
      .count;

  it("refuses a row whose id is false (trial_end_one_row_check)", async () => {
    const client = await connect((await freshDatabase()).url);

    const refusal = await refusalOf(
      client.query("insert into trial_end (id, ended_at) values (false, $1)", [MOMENT]),
    );

    expect(refusal).toMatchObject({
      code: "23514",
      constraint: "trial_end_one_row_check",
      table: "trial_end",
    });
    expect(await rows(client)).toBe(0);
  });

  it("refuses a second row with the default id (trial_end_pkey)", async () => {
    const client = await connect((await freshDatabase()).url);
    await client.query("insert into trial_end (ended_at) values ($1)", [MOMENT]);

    const refusal = await refusalOf(
      client.query("insert into trial_end (id, ended_at) values (true, $1)", [LATER]),
    );

    expect(refusal).toMatchObject({ code: "23505", constraint: "trial_end_pkey" });
    const record = await client.query<{ ended_at: Date }>("select ended_at from trial_end");
    expect(record.rows.map((row) => row.ended_at.toISOString())).toEqual([MOMENT.toISOString()]);
  });
});
