import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

import { setClock } from "./clock";
import { refusalOf } from "./database-error";
import { runTogether } from "./together";

// 15-quality-and-acceptance.md, Test layers (Database): "Actions run two at a time to prove the
// locks work". This proves the helper really holds two transactions open at the same moment on
// two connections of the real database: both pass meet() inside their transaction, then both
// write the same key; the unique key lets one through and refuses the other.
describe("runTogether against PostgreSQL (15-quality-and-acceptance.md, Test layers)", () => {
  it("runs two transactions at the same moment: one write goes through, the other is refused", async () => {
    const createdAt = setClock("2026-10-08T07:00:00Z");

    const writeTheSameKey = (value: number) => async (meet: () => Promise<void>) =>
      db.transaction(async (tx) => {
        // Both transactions are open here before either writes (meet, then insert: never after).
        // Run one after the other, the first would wait at meet() for ever and fail with the
        // helper's message, not with 23505.
        await tx.execute(sql`select 1`);
        await meet();
        await tx.insert(settings).values({ key: "invented_together", value, createdAt });
        return value;
      });

    const results = await runTogether([writeTheSameKey(1), writeTheSameKey(2)]);

    const through = results.filter((result) => result.status === "fulfilled");
    const refused = results.filter((result) => result.status === "rejected");
    expect(through).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(await refusalOf(Promise.reject(refused[0]?.reason))).toMatchObject({ code: "23505" });

    const stored = await db
      .select()
      .from(settings)
      .where(sql`${settings.key} = 'invented_together'`);
    expect(stored).toEqual([
      {
        key: "invented_together",
        value: through[0]?.value,
        createdAt: new Date("2026-10-08T07:00:00Z"),
      },
    ]);
  });
});
