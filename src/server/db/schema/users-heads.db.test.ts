import { sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { refusalOf } from "../../../../tests/helpers/database-error";
import { runTogether } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0009_users (developer-rules.md rule 5; D39: each write is plain
// SQL with nothing in front of it). 03-roles-and-permissions.md rule 4: "At least one active Head
// must always exist. The last one cannot be deactivated" (plan of 1.3, Look first 4; review of the
// plan, Must fix 1). The file has a database of its own, so it decides which Heads are active.

const REFUSED = {
  code: "23514",
  constraint: "users_keep_one_active_head",
  table: "users",
};

/** Leaves `keep` as the only active Heads: every other Head of this file's database goes inactive. */
async function onlyActiveHeads(keep: readonly string[]): Promise<void> {
  await db.execute(sql`
    update users set is_active = false
     where role = 'HEAD' and is_active and not (id = any(${`{${keep.join(",")}}`}::uuid[]))`);
}

async function activeHeadCount(): Promise<number> {
  const found = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from users where role = 'HEAD' and is_active`,
  );
  return found.rows[0]!.count;
}

async function inTransaction(client: PoolClient, text: string, values: unknown[]) {
  await client.query("begin");
  await client.query(text, values);
}

describe("users_keep_one_active_head (03 rule 4)", () => {
  it("refuses deactivating the last active Head, and changing its role", async () => {
    const head = await insertUser("HEAD");
    await onlyActiveHeads([head.id]);
    expect(await activeHeadCount()).toBe(1);

    expect(
      await refusalOf(db.execute(sql`update users set is_active = false where id = ${head.id}`)),
    ).toEqual(REFUSED);
    expect(
      await refusalOf(db.execute(sql`update users set role = 'FINANCE' where id = ${head.id}`)),
    ).toEqual(REFUSED);
    expect(await activeHeadCount()).toBe(1);
  });

  it("lets one of two active Heads go, and a change that keeps the Head active", async () => {
    const [first, second] = [await insertUser("HEAD"), await insertUser("HEAD")];
    await onlyActiveHeads([first.id, second.id]);
    await db.execute(sql`update users set full_name = 'Renamed Head' where id = ${first.id}`);
    await db.execute(sql`update users set is_active = false where id = ${second.id}`);
    expect(await activeHeadCount()).toBe(1);
    // Inside one transaction a new Head may come before the old one goes: checked at commit.
    const third = await insertUser("HEAD", { isActive: false });
    await db.transaction(async (tx) => {
      await tx.execute(sql`update users set is_active = false where id = ${first.id}`);
      await tx.execute(sql`update users set is_active = true where id = ${third.id}`);
    });
    expect(await activeHeadCount()).toBe(1);
  });

  it("two transactions each deactivating the other Head at once: exactly one commits", async () => {
    const [first, second] = [await insertUser("HEAD"), await insertUser("HEAD")];
    await onlyActiveHeads([first.id, second.id]);
    const clients = [await db.$client.connect(), await db.$client.connect()];
    try {
      const outcomes = await runTogether(
        [first.id, second.id].map((id, index) => async (meet) => {
          const client = clients[index]!;
          await inTransaction(client, "update users set is_active = false where id = $1", [id]);
          // Both rows are changed before either commits: each sees the other Head still active.
          await meet();
          try {
            await client.query("commit");
          } catch (error) {
            await client.query("rollback");
            throw error;
          }
        }),
      );
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
      const refused = outcomes.find((outcome) => outcome.status === "rejected");
      expect((refused as PromiseRejectedResult).reason).toMatchObject(REFUSED);
    } finally {
      for (const client of clients) client.release();
    }
    expect(await activeHeadCount()).toBe(1);
  });
});

describe("users_client_key_key (developer-rules.md rule 8)", () => {
  it("refuses one client key on two users; many users have none", async () => {
    const [first, second, third] = [
      await insertUser("MANAGER"),
      await insertUser("MANAGER"),
      await insertUser("MANAGER"),
    ];
    const key = "6f9619ff-8b86-4011-b42d-00cf4fc964ff";
    await db.execute(sql`update users set client_key = ${key} where id = ${first.id}`);
    expect(
      await refusalOf(
        db.execute(sql`update users set client_key = ${key} where id = ${second.id}`),
      ),
    ).toMatchObject({ code: "23505", constraint: "users_client_key_key" });
    const empty = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from users where client_key is null and id in (${second.id}, ${third.id})`,
    );
    expect(empty.rows[0]!.count).toBe(2);
  });
});
