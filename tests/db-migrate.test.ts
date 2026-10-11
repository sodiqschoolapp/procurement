import { describe, expect, it } from "vitest";

import { describeDatabase } from "../scripts/apply-migrations.mjs";

// No spec rule covers this. The test guards build-plan 0.2 (`npm run db:migrate`) and the
// CLAUDE.md convention "Secrets live in provider dashboards and the local `.env` only":
// what the script prints must never hold a password. The address and its password are invented.

describe("the line db:migrate prints for an address (build-plan 0.2; CLAUDE.md, secrets convention)", () => {
  it("shows the host, the port and the database name, and never the user or the password", () => {
    const line = describeDatabase(
      "postgres://invented_user:not-a-real-password@db.invented.example:25060/procurement?sslmode=require",
    );

    expect(line).toBe('database "procurement" at db.invented.example:25060');
    expect(line).not.toContain("not-a-real-password");
    expect(line).not.toContain("invented_user");
  });

  it("shows the standard port when the address names none", () => {
    expect(describeDatabase("postgres://invented_user@127.0.0.1/procurement")).toBe(
      'database "procurement" at 127.0.0.1:5432',
    );
  });

  it("refuses a broken address without repeating it", () => {
    const broken = "not-a-real-password is not an address";

    expect(() => describeDatabase(broken)).toThrow("DATABASE_URL is not a valid database address.");
    expect(() => describeDatabase(broken)).not.toThrow(/not-a-real-password/);
  });
});
