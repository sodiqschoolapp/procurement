import { describe, expect, it } from "vitest";

import { describeDatabase, failureReason } from "../scripts/apply-migrations.mjs";

// No spec rule covers this. The test guards build-plan 0.2 (`npm run db:migrate`) and the
// CLAUDE.md convention "Secrets live in provider dashboards and the local `.env` only":
// what the script prints must never hold a password. The address and its password are invented.

describe("the line db:migrate prints for an address (build-plan 0.2; CLAUDE.md, secrets convention)", () => {
  it("shows the host, the port and the database name, and never the user or the password", () => {
    const line = describeDatabase(
      "postgres://invented_user:not-a-real-password@db.invented.example:25060/procurement",
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

  // An address can name its host a second time, after a question mark, and the driver follows
  // that one. The line must name the server that is really reached.
  it("shows the host and port the driver really connects to", () => {
    expect(
      describeDatabase(
        "postgres://invented_user@127.0.0.1:5433/procurement?host=db.invented.example&port=25060",
      ),
    ).toBe('database "procurement" at db.invented.example:25060');
  });

  it("refuses a broken address without repeating it", () => {
    const broken = "not-a-real-password is not an address";

    expect(() => describeDatabase(broken)).toThrow("DATABASE_URL is not a valid database address.");
    expect(() => describeDatabase(broken)).not.toThrow(/not-a-real-password/);
  });
});

// build-plan 0.2 (`npm run db:migrate`): a failed run must say why, in words a person can act on.
describe("the reason db:migrate prints when it fails (build-plan 0.2)", () => {
  it("gives the message of a plain error", () => {
    expect(failureReason(new Error("connect ECONNREFUSED 127.0.0.1:5433"))).toBe(
      "connect ECONNREFUSED 127.0.0.1:5433",
    );
  });

  it("gives the first error of a refused connection, whose own message is empty", () => {
    const refused = new AggregateError([new Error("connect ECONNREFUSED ::1:5433")], "");

    expect(failureReason(refused)).toBe("connect ECONNREFUSED ::1:5433");
  });

  it("gives PostgreSQL's own reason first when Drizzle wrapped a failed statement", () => {
    const wrapped = new Error("Failed query: select 1/0", { cause: new Error("division by zero") });

    expect(failureReason(wrapped)).toBe("division by zero\nFailed query: select 1/0");
  });
});
