import { describe, expect, it } from "vitest";

import { businessDate } from "@/domain/business-date";

import { PG_DUMP_ARGS, copyKeyOf, pgDumpEnv } from "../scripts/db-copy.mjs";

// The weekly copy (build-plan 8.2; 13-technology.md, Running it: "A weekly copy is also saved to
// R2"; plan of 8.2, decided items 3, 4 and 10): how pg_dump is called and how the file is named.
// The address and passwords here are invented.

const ADDRESS = "postgres://invented_user:inv%40nted-pass@db.invented.example:25060/defaultdb";

describe("pgDumpEnv (plan of 8.2, decided item 10; review of the plan, nit 4)", () => {
  it("gives the address as PG* variables, the password decoded, never as an argument", () => {
    const env = pgDumpEnv({ DATABASE_URL: ADDRESS, PATH: "/usr/bin" }, null);
    expect(env).toEqual({
      PATH: "/usr/bin",
      PGHOST: "db.invented.example",
      PGPORT: "25060",
      PGUSER: "invented_user",
      PGPASSWORD: "inv@nted-pass",
      PGDATABASE: "defaultdb",
    });
    expect(PG_DUMP_ARGS.join(" ")).not.toContain("invented");
    expect(PG_DUMP_ARGS).toEqual(["--format=custom", "--no-password"]);
  });

  it("without a CA certificate keeps the address's own sslmode, and the local address has none", () => {
    expect(pgDumpEnv({ DATABASE_URL: `${ADDRESS}?sslmode=require` }, null).PGSSLMODE).toBe(
      "require",
    );
    const local = pgDumpEnv(
      { DATABASE_URL: "postgres://procurement@127.0.0.1:5433/procurement" },
      null,
    );
    expect(local).toMatchObject({ PGHOST: "127.0.0.1", PGPORT: "5433", PGUSER: "procurement" });
    expect(local).not.toHaveProperty("PGSSLMODE");
    expect(local).not.toHaveProperty("PGPASSWORD");
  });

  it("with a CA certificate verifies the server against it, whatever the address says (0.16: never off)", () => {
    const env = pgDumpEnv({ DATABASE_URL: `${ADDRESS}?sslmode=disable` }, "/tmp/invented/ca.crt");
    expect(env.PGSSLMODE).toBe("verify-full");
    expect(env.PGSSLROOTCERT).toBe("/tmp/invented/ca.crt");
  });

  it("refuses a missing or broken address without repeating it", () => {
    expect(() => pgDumpEnv({}, null)).toThrow("DATABASE_URL is not set.");
    expect(() => pgDumpEnv({ DATABASE_URL: "not an address inv@nted-pass" }, null)).toThrow(
      "DATABASE_URL is not a valid database address.",
    );
  });
});

describe("copyKeyOf (developer-rules.md rule 10: business dates are in Tashkent)", () => {
  it("names the file by the day in Tashkent: the Sunday 04:00 tick is 23:00 UTC on Saturday", () => {
    const tick = new Date("2026-10-17T23:00:00Z");
    expect(copyKeyOf(tick)).toBe("backups/database-2026-10-18.dump");
    expect(copyKeyOf(tick)).toBe(`backups/database-${businessDate(tick)}.dump`);
  });

  it("agrees with businessDate() across midnight and the year end in Tashkent", () => {
    for (const text of ["2026-12-31T18:59:59Z", "2026-12-31T19:00:00Z", "2027-01-01T12:00:00Z"]) {
      const moment = new Date(text);
      expect(copyKeyOf(moment), text).toBe(`backups/database-${businessDate(moment)}.dump`);
    }
  });
});
