import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// Until the clock of task 0.4 exists, a test passes a fixed invented moment as created_at.
const INVENTED_MOMENT = new Date("2026-03-14T09:26:53.000Z");

describe("settings table (14-data-model.md, System: `settings key KEY, value JSONB`)", () => {
  // build-plan 0.2, Done when: "a database test writes and reads a settings row".
  it.each([
    ["a number", 3],
    ["a boolean", true],
    ["a text", "Asia/Tashkent"],
    ["an object", { month: 9, day: 2, tags: ["invented"] }],
  ])("writes a row and reads it back with the same key and value: %s", async (name, value) => {
    const key = `invented_key_for_${name.replace(/\W/g, "_")}`;

    await db.insert(settings).values({ key, value, createdAt: INVENTED_MOMENT });
    const rows = await db.select().from(settings).where(eq(settings.key, key));

    expect(rows).toEqual([{ key, value, createdAt: INVENTED_MOMENT }]);
  });

  // 14-data-model.md (`key KEY`); developer-rules.md rule 5 (database as last defence).
  it("refuses a second row with the same key", async () => {
    await db
      .insert(settings)
      .values({ key: "invented_twice", value: 1, createdAt: INVENTED_MOMENT });

    const refusal = await refusalOf(
      db.insert(settings).values({ key: "invented_twice", value: 2, createdAt: INVENTED_MOMENT }),
    );

    expect(refusal).toMatchObject({ code: "23505", constraint: "settings_pkey" });
    const rows = await db.select().from(settings).where(eq(settings.key, "invented_twice"));
    expect(rows.map((row) => row.value)).toEqual([1]);
  });

  // developer-rules.md rule 5; docs/decisions.md 0.2, constraint style 8 (NOT NULL).
  it("refuses a row without a value", async () => {
    const refusal = await refusalOf(
      db.execute(
        sql`insert into settings (key, created_at) values ('invented_no_value', ${INVENTED_MOMENT.toISOString()})`,
      ),
    );

    expect(refusal).toMatchObject({ code: "23502", table: "settings", column: "value" });
  });

  // developer-rules.md rule 10; docs/decisions.md 0.2, constraint style 3: created_at has no
  // database default, so a write that forgets it fails instead of taking the database's time.
  it("refuses a row without created_at", async () => {
    const refusal = await refusalOf(
      db.execute(sql`insert into settings (key, value) values ('invented_no_moment', '1'::jsonb)`),
    );

    expect(refusal).toMatchObject({ code: "23502", table: "settings", column: "created_at" });
  });

  // 14-data-model.md, first paragraph ("Every table also has `id` (UUID) and `created_at` unless
  // a different key is shown"): `key` takes the place of `id`, created_at stays.
  // developer-rules.md rule 10: a moment is stored with its time zone.
  it("has exactly the columns key, value and created_at, with their types", async () => {
    const columns = await db.execute<{ column_name: string; data_type: string }>(sql`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'settings'
      order by ordinal_position
    `);

    expect(columns.rows).toEqual([
      { column_name: "key", data_type: "text", is_nullable: "NO", column_default: null },
      { column_name: "value", data_type: "jsonb", is_nullable: "NO", column_default: null },
      {
        column_name: "created_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
        column_default: null,
      },
    ]);
  });

  // developer-rules.md rule 10 ("Timestamps are stored in UTC").
  it("keeps the moment: 01:30 +05:00 on 1 January is read back as 20:30 UTC on 31 December", async () => {
    const yearEnd = new Date("2026-12-31T20:30:00.000Z");

    await db.insert(settings).values({ key: "invented_utc", value: 1, createdAt: yearEnd });
    await db.execute(
      sql`insert into settings (key, value, created_at) values ('invented_tashkent', '1'::jsonb, '2027-01-01T01:30:00+05:00')`,
    );

    const rows = await db
      .select({ key: settings.key, createdAt: settings.createdAt })
      .from(settings)
      .where(sql`${settings.key} in ('invented_utc', 'invented_tashkent')`)
      .orderBy(settings.key);
    expect(rows).toEqual([
      { key: "invented_tashkent", createdAt: yearEnd },
      { key: "invented_utc", createdAt: yearEnd },
    ]);

    const asText = await db.execute<{ shown: string }>(
      sql`select created_at::text as shown from settings where key = 'invented_tashkent'`,
    );
    expect(asText.rows).toEqual([{ shown: "2026-12-31 20:30:00+00" }]);
  });
});

// audit_log (14-data-model.md, System: "actor_id, action, entity, entity_id, before JSONB, after
// JSONB"; plan of 0.9, Database changes). Each refusal is a direct write in which every other
// column is valid, so only the constraint named can refuse it (D39; review of the plan of 0.9,
// correction 4). The CHECKs cannot be reached by an UPDATE: the append-only trigger refuses it
// first.
describe("audit_log table (developer-rules.md rules 5 and 13)", () => {
  const AT = "2031-03-10T04:00:00.000Z";

  type Row = {
    actor_id: string;
    action: string;
    entity: string;
    entity_id: string;
    before: string | null;
    after: string | null;
  };

  async function validRow(): Promise<Row> {
    const head = await insertUser("HEAD");
    return {
      actor_id: head.id,
      action: "user.create",
      entity: "users",
      entity_id: head.id,
      before: null,
      after: '{"fullName":"Invented Person"}',
    };
  }

  function insertRow(row: Row) {
    return db.execute(sql`
      insert into audit_log (actor_id, action, entity, entity_id, before, after, created_at)
      values (${row.actor_id}, ${row.action}, ${row.entity}, ${row.entity_id},
              ${row.before}::jsonb, ${row.after}::jsonb, ${AT})`);
  }

  // The rows of one test: rows cannot be removed, so the tests of this file share them.
  async function count(row: Row): Promise<number> {
    const found = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from audit_log where actor_id = ${row.actor_id} or entity_id = ${row.entity_id}`,
    );
    return found.rows[0]!.count;
  }

  it("accepts a valid row: the base of every refusal below", async () => {
    const row = await validRow();
    await insertRow(row);
    expect(await count(row)).toBe(1);
  });

  it.each<[string, Partial<Row>, string]>([
    ["an action without a dot", { action: "create" }, "audit_log_action_check"],
    ["an action in capitals", { action: "User.Create" }, "audit_log_action_check"],
    ["an entity with a dot", { entity: "public.users" }, "audit_log_entity_check"],
    ["an empty entity id", { entity_id: "  " }, "audit_log_entity_id_check"],
    ["an array as before", { before: "[1]" }, "audit_log_before_check"],
    ["a text as after", { after: '"x"' }, "audit_log_after_check"],
    ["neither before nor after", { after: null }, "audit_log_before_or_after_check"],
  ])("refuses %s", async (_name, change, constraint) => {
    const row = { ...(await validRow()), ...change };
    const refusal = await refusalOf(insertRow(row));

    expect(refusal).toMatchObject({ code: "23514", constraint });
    expect(await count(row)).toBe(0);
  });

  it("refuses an actor who is not a user (the foreign key)", async () => {
    const row = await validRow();
    const refusal = await refusalOf(
      insertRow({ ...row, actor_id: "00000000-0000-4000-8000-00000000abcd" }),
    );

    expect(refusal).toMatchObject({ code: "23503", constraint: "audit_log_actor_id_users_id_fk" });
    expect(await count(row)).toBe(0);
  });

  it("refuses a row without created_at: it comes from the clock (developer-rules.md rule 10)", async () => {
    const row = await validRow();
    const refusal = await refusalOf(
      db.execute(sql`
        insert into audit_log (actor_id, action, entity, entity_id, after)
        values (${row.actor_id}, ${row.action}, ${row.entity}, ${row.entity_id}, ${row.after}::jsonb)`),
    );

    expect(refusal).toMatchObject({ code: "23502", column: "created_at" });
  });

  // Plan of 0.9, decision 2 (Look first): the log is append-only.
  it.each([
    ["an UPDATE", sql`update audit_log set entity_id = entity_id`],
    ["a DELETE", sql`delete from audit_log`],
    ["a TRUNCATE", sql`truncate audit_log`],
  ])("refuses %s, and the row stays", async (_name, statement) => {
    const row = await validRow();
    await insertRow(row);

    const refusal = await refusalOf(db.execute(statement));

    expect(refusal).toMatchObject({ code: "23514", constraint: "audit_log_append_only" });
    expect(await count(row)).toBe(1);
  });

  it("has the two indexes of the plan", async () => {
    const found = await db.execute<{ indexname: string }>(sql`
      select indexname from pg_indexes
      where tablename = 'audit_log' and indexname <> 'audit_log_pkey' order by indexname`);

    expect(found.rows.map((row) => row.indexname)).toEqual([
      "audit_log_actor_id_idx",
      "audit_log_entity_entity_id_created_at_idx",
    ]);
  });
});
