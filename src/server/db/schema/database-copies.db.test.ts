import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { databaseCopies } from "@/server/db/schema";

import { refusalOf } from "../../../../tests/helpers/database-error";

// The guards of `database_copies` (build-plan 8.2b; plan of 8.2b, Database changes), each reached
// by a direct write with nothing in front of it, on insert and on update (developer-rules.md rule
// 5; D39): a good attempt holds its file's key and a size above 0, a failed one neither; one row
// per tick.

const CREATED = new Date("2031-06-08T00:00:00Z");
let next = Date.UTC(2032, 0, 1);

/** A tick no other test of this file uses. */
function freshTick(): Date {
  next += 86_400_000;
  return new Date(next);
}

const GOOD = { succeeded: true, fileKey: "backups/database-invented.dump", sizeBytes: 10n };
const FAILED = { succeeded: false, fileKey: null, sizeBytes: null };

const CHECK = { code: "23514", constraint: "database_copies_outcome_check" };

describe("database_copies_outcome_check (plan of 8.2b; D39)", () => {
  it("takes a good attempt with its key and size, and a failed one with neither", async () => {
    for (const outcome of [GOOD, FAILED]) {
      const [row] = await db
        .insert(databaseCopies)
        .values({ tick: freshTick(), createdAt: CREATED, ...outcome })
        .returning();
      expect(row).toMatchObject(outcome);
    }
  });

  it.each([
    ["a good attempt without a key", { ...GOOD, fileKey: null }],
    ["a good attempt with a key and no size", { ...GOOD, sizeBytes: null }],
    ["a good attempt of size 0", { ...GOOD, sizeBytes: 0n }],
    ["a failed attempt with a key", { ...FAILED, fileKey: "backups/x.dump" }],
    ["a failed attempt with a size and no key", { ...FAILED, sizeBytes: 10n }],
  ])("refuses on insert %s", async (_, values) => {
    const refusal = await refusalOf(
      db.insert(databaseCopies).values({ tick: freshTick(), createdAt: CREATED, ...values }),
    );
    expect(refusal).toMatchObject(CHECK);
  });

  it.each([
    ["a good attempt's key taken away", GOOD, { fileKey: null }],
    ["a good attempt's size taken away", GOOD, { sizeBytes: null }],
    ["a good attempt's size set to 0", GOOD, { sizeBytes: 0n }],
    ["a failed attempt given a key", FAILED, { fileKey: "backups/x.dump" }],
    ["a failed attempt given a size", FAILED, { sizeBytes: 10n }],
    ["a good attempt turned failed with its file", GOOD, { succeeded: false }],
  ] as const)("refuses on update %s", async (_, start, change) => {
    const [row] = await db
      .insert(databaseCopies)
      .values({ tick: freshTick(), createdAt: CREATED, ...start })
      .returning({ id: databaseCopies.id });
    const refusal = await refusalOf(
      db.update(databaseCopies).set(change).where(eq(databaseCopies.id, row!.id)),
    );
    expect(refusal).toMatchObject(CHECK);
  });
});

describe("database_copies_tick_key: one row per tick (plan of 8.2b)", () => {
  it("refuses a second row of the same tick, on insert and on update", async () => {
    const tick = freshTick();
    await db.insert(databaseCopies).values({ tick, createdAt: CREATED, ...FAILED });
    expect(
      await refusalOf(db.insert(databaseCopies).values({ tick, createdAt: CREATED, ...GOOD })),
    ).toMatchObject({ code: "23505", constraint: "database_copies_tick_key" });
    const [other] = await db
      .insert(databaseCopies)
      .values({ tick: freshTick(), createdAt: CREATED, ...GOOD })
      .returning({ id: databaseCopies.id });
    expect(
      await refusalOf(
        db.update(databaseCopies).set({ tick }).where(eq(databaseCopies.id, other!.id)),
      ),
    ).toMatchObject({ code: "23505", constraint: "database_copies_tick_key" });
    const count = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from database_copies where tick = ${tick}`,
    );
    expect(count.rows[0]!.n).toBe(1);
  });
});
