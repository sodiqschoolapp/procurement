import { describe, expect, it } from "vitest";

import { TEMPLATE_DATABASE, addressOf, isTestDatabaseName } from "./test-database";

// No spec rule covers this. The test guards build-plan 0.2 (the test-database helper) and
// CLAUDE.md, "Money and stock are always correct": the helper drops databases, so the check of
// the name is the wall between a test run and real data.

describe("the name check of the test-database helper (build-plan 0.2; CLAUDE.md, what matters most 1)", () => {
  it("accepts a test database name and the template", () => {
    expect(isTestDatabaseName("procurement_test_ab12cd34")).toBe(true);
    expect(isTestDatabaseName(TEMPLATE_DATABASE)).toBe(true);
  });

  it.each([
    ["the developer's database", "procurement"],
    ["PostgreSQL's own database", "postgres"],
    ["an empty name", ""],
    ["the prefix alone", "procurement_test_"],
    ["capital letters", "procurement_test_AB12"],
    ["a quote", 'procurement_test_ab"; drop database procurement; --'],
    ["a space", "procurement_test_ab 12"],
    ["a line break after a good name", "procurement_test_ab12\n"],
    ["a good name inside another name", "x_procurement_test_ab12"],
  ])("refuses %s", (_what, name) => {
    expect(isTestDatabaseName(name)).toBe(false);
  });

  it("builds the address of another database on the same server", () => {
    expect(addressOf("postgres://invented_user@127.0.0.1:5433/procurement", "postgres")).toBe(
      "postgres://invented_user@127.0.0.1:5433/postgres",
    );
  });
});
