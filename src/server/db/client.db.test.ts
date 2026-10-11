import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

describe("the database client", () => {
  // developer-rules.md rule 10 ("Timestamps are stored in UTC").
  // `source` says who set the value: "client" is this connection's own option, so the test
  // does not pass by the luck of a server whose default is UTC too. Twelve queries at the same
  // moment make the pool open all of its ten connections.
  it("sets UTC itself on every connection of the pool", async () => {
    const atOnce = Array.from({ length: 12 }, () =>
      db.execute<{ pid: number; setting: string; source: string }>(
        sql`select pg_backend_pid() as pid, setting, source, pg_sleep(0.2) from pg_settings where name = 'TimeZone'`,
      ),
    );
    const rows = (await Promise.all(atOnce)).flatMap((result) => result.rows);

    expect(new Set(rows.map((row) => row.pid)).size).toBe(10);
    expect(new Set(rows.map((row) => `${row.setting} by ${row.source}`))).toEqual(
      new Set(["UTC by client"]),
    );
  });

  // developer-rules.md rule 6 ("JavaScript floating-point numbers never touch money").
  // 9007199254740993 is the first whole number a JavaScript float cannot hold: as a float it
  // would come back as ...992.
  it("returns a bigint as exact digits, never as a float", async () => {
    const result = await db.execute<{ amount: unknown }>(
      sql`select 9007199254740993::bigint as amount`,
    );
    const amount = result.rows[0]?.amount;

    expect(typeof amount).toBe("string");
    expect(BigInt(amount as string)).toBe(9007199254740993n);
  });

  // developer-rules.md rule 6 ("Quantities are `numeric(14,3)`").
  it("returns a numeric(14,3) as text with its three decimals", async () => {
    const result = await db.execute<{ quantity: unknown }>(
      sql`select 1.250::numeric(14,3) as quantity`,
    );

    expect(result.rows).toEqual([{ quantity: "1.250" }]);
  });

  // 13-technology.md, Stack ("PostgreSQL 17 or newer"); build-plan 0.2.
  it("talks to PostgreSQL 17 or newer", async () => {
    const shown = await db.execute<{ server_version_num: string }>(sql`show server_version_num`);

    expect(Number(shown.rows[0]?.server_version_num)).toBeGreaterThanOrEqual(170000);
  });

  // build-plan 0.2 (`docker-compose.yml` with PostgreSQL 17). Another PostgreSQL may run on the
  // same machine; only the service of docker-compose.yml carries this cluster name.
  it("talks to the server that docker-compose.yml starts, not to another one", async () => {
    const shown = await db.execute<{ cluster_name: string }>(sql`show cluster_name`);

    expect(shown.rows).toEqual([{ cluster_name: "procurement-compose" }]);
  });
});
