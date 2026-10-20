import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { seedTargetAllowed } from "../scripts/seed.mjs";

// build-plan 0.15 (the seed users on the test copy); developer-rules.md rule 14 (demo data); the
// 0.14 permission review, Should fix 1 (no guard for hosted databases), closed by the plan of
// 0.15, decision 3 (Look first): the seed writes to a database not on this machine only with
// SEED_DEMO_DATA exactly "yes", which production never sets.

const HOSTED = "postgres://invented_user:invented-pw@db.example.invalid:25060/demo";
const PASSWORDS = {
  SEED_HEAD_PASSWORD: "invented-seed-head",
  SEED_MANAGER_PASSWORD: "invented-seed-manager",
  SEED_PRINCIPAL_PASSWORD: "invented-seed-principal",
  SEED_FINANCE_PASSWORD: "invented-seed-finance",
};
const REFUSAL =
  "Refused: the database of DATABASE_URL is not on this machine, and SEED_DEMO_DATA is not yes. " +
  "The demo users are written to a hosted database only while the live app is in trial (docs/deploy.md). Nothing was written.";

describe("the seed writes to a hosted database only while the live app is in trial (build-plan 0.15; rule 14; 0.14 review, Should fix 1)", () => {
  it("allows a database on this machine without the switch", () => {
    for (const address of [
      "postgres://procurement@127.0.0.1:5433/procurement",
      "postgres://procurement@localhost:5433/procurement",
      "postgres://procurement@[::1]:5433/procurement",
    ]) {
      expect(seedTargetAllowed(address, {})).toEqual({ allowed: true });
    }
  });

  it("refuses a hosted database without the switch, and allows the same one with SEED_DEMO_DATA=yes", () => {
    expect(seedTargetAllowed(HOSTED, {})).toEqual({ allowed: false, reason: REFUSAL });
    expect(seedTargetAllowed(HOSTED, { SEED_DEMO_DATA: "yes" })).toEqual({ allowed: true });
  });

  it("opens only with the exact word yes", () => {
    for (const value of ["", "true", "1", "YES", "yes ", " yes", "on"]) {
      expect(seedTargetAllowed(HOSTED, { SEED_DEMO_DATA: value }).allowed).toBe(false);
    }
  });

  it("reads the host as pg does: a ?host= elsewhere and an address with no host are not local", () => {
    expect(
      seedTargetAllowed(
        "postgres://procurement@localhost:5433/procurement?host=db.example.invalid",
        {},
      ).allowed,
    ).toBe(false);
    expect(seedTargetAllowed("postgres:///procurement", {}).allowed).toBe(false);
    expect(seedTargetAllowed("not an address", {}).allowed).toBe(false);
  });

  it("names neither the host nor the password in its refusal", () => {
    const result = seedTargetAllowed(HOSTED, {});
    expect(result.allowed).toBe(false);
    const reason = result.allowed ? "" : result.reason;
    expect(reason).not.toContain("db.example.invalid");
    expect(reason).not.toContain("invented-pw");
    expect(reason).not.toContain("invented_user");
  });

  it("npm run db:seed refuses before it connects, with every password set (the guard refuses, not the password check)", () => {
    const run = spawnSync(process.execPath, ["scripts/db-seed.mjs"], {
      env: { NODE_ENV: "test", PATH: process.env.PATH, DATABASE_URL: HOSTED, ...PASSWORDS },
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr.trim()).toBe(REFUSAL);
    expect(run.stderr).not.toContain("db.example.invalid");
    expect(run.stderr).not.toContain("invented-pw");
  });

  it("with the switch, a database it cannot reach is named by the kind of error only, never its host (permission review of 0.15)", () => {
    const run = spawnSync(process.execPath, ["scripts/db-seed.mjs"], {
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        DATABASE_URL:
          "postgres://invented_user:invented-pw@db.example.invalid:25060/demo?connect_timeout=5",
        SEED_DEMO_DATA: "yes",
        ...PASSWORDS,
      },
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr.trim()).toMatch(
      /^Refused: the database of DATABASE_URL could not be reached \([A-Za-z_]+\)\. Nothing was written\.$/,
    );
    expect(run.stderr).not.toContain("db.example.invalid");
    expect(run.stderr).not.toContain("invented-pw");
  });
});
