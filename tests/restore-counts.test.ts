import { describe, expect, it } from "vitest";

import {
  countTarget,
  countsLine,
  isDatabaseName,
  withDatabase,
} from "../scripts/restore-counts.mjs";

// Where the counts of the restore drill read (build-plan 9.6; plan of 9.6, decided item 8;
// src/server/db/connection-options.mjs: "Verification is never switched off"). The addresses and
// certificates here are invented.

const APP =
  "postgres://invented_user:invented-pass@db.invented.example:25060/defaultdb?sslmode=require";
const DRILL =
  "postgres://doadmin:invented-drill@drill.invented.example:25060/defaultdb?sslmode=disable";
const APP_CA = "-----BEGIN CERTIFICATE-----invented app-----END CERTIFICATE-----";
const OWN_CA = "-----BEGIN CERTIFICATE-----invented drill-----END CERTIFICATE-----";

describe("countTarget (decided item 8: always verified)", () => {
  it("a typed address is verified against the app's CA, whatever sslmode it says", () => {
    const options = countTarget(
      { DATABASE_URL: APP, DATABASE_CA_CERT: APP_CA },
      { address: DRILL },
    );
    expect(options.ssl).toEqual({ ca: APP_CA, rejectUnauthorized: true });
    expect(new URL(options.connectionString).searchParams.has("sslmode")).toBe(false);
    expect(new URL(options.connectionString).hostname).toBe("drill.invented.example");
  });

  it("a typed address with its own pasted CA is verified against that one", () => {
    const options = countTarget(
      { DATABASE_URL: APP, DATABASE_CA_CERT: APP_CA },
      { address: DRILL, ca: OWN_CA },
    );
    expect(options.ssl).toEqual({ ca: OWN_CA, rejectUnauthorized: true });
  });

  it("refuses a typed address when no CA can verify it (permission review of 9.6, nit 1)", () => {
    expect(() => countTarget({ DATABASE_URL: APP }, { address: DRILL })).toThrow(
      /^Refused: no CA certificate/,
    );
  });

  it("--database keeps the app's server, user and CA and replaces only the database name", () => {
    const options = countTarget(
      { DATABASE_URL: APP, DATABASE_CA_CERT: APP_CA },
      { database: "drill_20261019" },
    );
    const address = new URL(options.connectionString);
    expect(address.hostname).toBe("db.invented.example");
    expect(address.username).toBe("invented_user");
    expect(address.pathname).toBe("/drill_20261019");
    expect(options.ssl).toEqual({ ca: APP_CA, rejectUnauthorized: true });
  });

  it("refuses a database name that is not a plain identifier", () => {
    expect(() => countTarget({ DATABASE_URL: APP }, { database: "x/../defaultdb" })).toThrow(
      /^Refused:/,
    );
    expect(isDatabaseName("drill_20261019")).toBe(true);
    expect(isDatabaseName("Drill")).toBe(false);
  });

  it("with no target counts the app's own database", () => {
    expect(countTarget({ DATABASE_URL: APP, DATABASE_CA_CERT: APP_CA }).ssl).toEqual({
      ca: APP_CA,
      rejectUnauthorized: true,
    });
    expect(withDatabase(APP, "other")).toContain("/other?");
  });
});

describe("countsLine (docs/restore.md: the line compared between the two sides)", () => {
  it("names the counts and the newest row, and nothing of the address", () => {
    expect(
      countsLine({
        orders: 12,
        users: 6,
        stockLines: 30,
        stockQty: "1234.500",
        movements: 45,
        newest: new Date("2031-06-20T03:00:00Z"),
      }),
    ).toBe(
      "orders 12, users 6, stock lines 30 (quantity 1234.500), stock movements 45, newest row 2031-06-20T03:00:00.000Z",
    );
  });
});
