import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_TYPES } from "@/domain/notifications";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";

import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// The guards of `notifications` (14-data-model.md, System; build-plan 0.11), each reached by a
// direct write with nothing in front of it (developer-rules.md rule 5; D39). Plan of 0.11:
// decision 3 (Look first: never deleted, read_at set once), the link CHECK (review of the plan,
// Should fix 6), decision 9 (params an object).

const CREATED = new Date("2026-10-14T09:00:00Z");
const LATER = new Date("2026-10-14T10:00:00Z");

async function insertOne(overrides: Partial<typeof notifications.$inferInsert> = {}) {
  const user = await insertUser("HEAD");
  const [row] = await db
    .insert(notifications)
    .values({
      userId: user.id,
      type: "BRANCH_ROLE_VACANT",
      params: { branch: "DEMO", role: "PRINCIPAL" },
      link: "/",
      createdAt: CREATED,
      ...overrides,
    })
    .returning();
  return row!;
}

async function rowOf(id: string) {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
  return row;
}

describe("notifications table (14-data-model.md, System: user_id, type, params, link, read_at)", () => {
  it("writes a row and reads it back, unread", async () => {
    const row = await insertOne();
    expect(await rowOf(row.id)).toMatchObject({
      type: "BRANCH_ROLE_VACANT",
      params: { branch: "DEMO", role: "PRINCIPAL" },
      link: "/",
      readAt: null,
      createdAt: CREATED,
    });
  });

  it.each(["/", "/requests/1", "/notifications?page=2", "/a/b"])(
    "accepts the address inside the app %j (Should fix 6)",
    async (link) => {
      const row = await insertOne({ link });
      expect((await rowOf(row.id))?.link).toBe(link);
    },
  );

  it.each([
    "https://x.example",
    "//x.example",
    "x",
    "",
    "/\\x.example",
    "/\t/x.example",
    "/\n/x.example",
    "/\r/x.example",
    "/ /x.example",
    "/a\u007fb",
  ])("refuses the link %j: notifications_link_check (Should fix 6)", async (link) => {
    const user = await insertUser("MANAGER");
    const refusal = await refusalOf(
      db.insert(notifications).values({
        userId: user.id,
        type: "BRANCH_ROLE_VACANT",
        link,
        createdAt: CREATED,
      }),
    );
    expect(refusal).toMatchObject({ code: "23514", constraint: "notifications_link_check" });
  });

  it.each([
    ["an array", "[]"],
    ["a text", '"x"'],
    ["a number", "1"],
    ["null JSON", "null"],
  ])("refuses params that are %s: notifications_params_check (decision 9)", async (_name, json) => {
    const user = await insertUser("FINANCE");
    const refusal = await refusalOf(
      db.execute(sql`insert into notifications (user_id, type, params, link, created_at)
        values (${user.id}, 'BRANCH_ROLE_VACANT', ${json}::jsonb, '/', ${CREATED.toISOString()})`),
    );
    expect(refusal).toMatchObject({ code: "23514", constraint: "notifications_params_check" });
  });

  it("refuses read_at before created_at: notifications_read_at_check", async () => {
    const user = await insertUser("PRINCIPAL");
    const refusal = await refusalOf(
      db.insert(notifications).values({
        userId: user.id,
        type: "BRANCH_ROLE_VACANT",
        link: "/",
        createdAt: LATER,
        readAt: CREATED,
      }),
    );
    expect(refusal).toMatchObject({ code: "23514", constraint: "notifications_read_at_check" });
  });

  it("refuses a type that is not one of the enum (14-data-model.md: types are enums)", async () => {
    const user = await insertUser("HEAD");
    const refusal = await refusalOf(
      db.execute(sql`insert into notifications (user_id, type, link, created_at)
        values (${user.id}, 'INVENTED_TYPE', '/', ${CREATED.toISOString()})`),
    );
    expect(refusal).toMatchObject({ code: "22P02" });
  });

  it("refuses an unknown user: the foreign key (developer-rules.md rule 5)", async () => {
    const refusal = await refusalOf(
      db.insert(notifications).values({
        userId: "00000000-0000-4000-8000-000000000000",
        type: "BRANCH_ROLE_VACANT",
        link: "/",
        createdAt: CREATED,
      }),
    );
    expect(refusal).toMatchObject({
      code: "23503",
      constraint: "notifications_user_id_users_id_fk",
    });
  });

  it("refuses a row without created_at: no database time (CLAUDE.md rule 10)", async () => {
    const user = await insertUser("HEAD");
    const refusal = await refusalOf(
      db.execute(sql`insert into notifications (user_id, type, link)
        values (${user.id}, 'BRANCH_ROLE_VACANT', '/')`),
    );
    expect(refusal).toMatchObject({ code: "23502", column: "created_at" });
  });
});

describe("notifications_guard (plan of 0.11, decision 3, Look first; CLAUDE.md rule 11)", () => {
  it("allows read_at from NULL to a moment, once", async () => {
    const row = await insertOne();
    await db.update(notifications).set({ readAt: LATER }).where(eq(notifications.id, row.id));
    expect((await rowOf(row.id))?.readAt).toEqual(LATER);
  });

  it("refuses DELETE", async () => {
    const row = await insertOne();
    const refusal = await refusalOf(db.delete(notifications).where(eq(notifications.id, row.id)));
    expect(refusal).toMatchObject({ code: "23514", constraint: "notifications_guard" });
    expect(await rowOf(row.id)).toBeDefined();
  });

  it("refuses TRUNCATE", async () => {
    const row = await insertOne();
    const refusal = await refusalOf(db.execute(sql`truncate notifications`));
    expect(refusal).toMatchObject({ code: "23514", constraint: "notifications_guard" });
    expect(await rowOf(row.id)).toBeDefined();
  });

  it("refuses read_at back to NULL, and from one moment to another", async () => {
    const row = await insertOne({ readAt: CREATED });
    for (const readAt of [null, LATER]) {
      const refusal = await refusalOf(
        db.update(notifications).set({ readAt }).where(eq(notifications.id, row.id)),
      );
      expect(refusal).toMatchObject({ code: "23514", constraint: "notifications_guard" });
    }
    expect((await rowOf(row.id))?.readAt).toEqual(CREATED);
  });

  it("refuses a change of any other column, also together with marking read", async () => {
    const other = await insertUser("MANAGER");
    const changes: Partial<typeof notifications.$inferInsert>[] = [
      { type: "TRANSFER_SENT" },
      { params: { branch: "OTHR", role: "FINANCE" } },
      { link: "/profile" },
      { userId: other.id },
      { createdAt: LATER },
      { link: "/profile", readAt: LATER },
    ];
    for (const change of changes) {
      const row = await insertOne();
      const refusal = await refusalOf(
        db.update(notifications).set(change).where(eq(notifications.id, row.id)),
      );
      expect(refusal).toMatchObject({ code: "23514", constraint: "notifications_guard" });
      expect(await rowOf(row.id)).toMatchObject({ link: "/", readAt: null, createdAt: CREATED });
    }
  });
});

describe("notification_type (plan of 0.11, decision 1, Look first)", () => {
  it("holds exactly NOTIFICATION_TYPES of src/domain/notifications.ts, in its order", async () => {
    const found = await db.execute<{ value: string }>(sql`
      select e.enumlabel as value from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'notification_type'
      order by e.enumsortorder`);
    expect(found.rows.map((row) => row.value)).toEqual([...NOTIFICATION_TYPES]);
  });
});
