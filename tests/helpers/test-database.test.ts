import { describe, expect, it } from "vitest";

import {
  COMPOSE_CLUSTER_NAME,
  TEMPLATE_DATABASE,
  addressOf,
  assertServerAnswers,
  isTestDatabaseName,
  refuseUnlessComposeServer,
} from "./test-database";

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

  // A good name on a wrong server is still refused: the helper drops databases only on the
  // server of docker-compose.yml. Any other PostgreSQL has an empty or a different cluster name.
  it("accepts the server of docker-compose.yml and refuses every other server", () => {
    expect(() => refuseUnlessComposeServer(COMPOSE_CLUSTER_NAME)).not.toThrow();
    expect(() => refuseUnlessComposeServer("")).toThrow(
      "Refused: this PostgreSQL server is not the one docker-compose.yml starts",
    );
    expect(() => refuseUnlessComposeServer("17/main")).toThrow(
      "Refused: this PostgreSQL server is not the one docker-compose.yml starts",
    );
  });

  // build-plan 0.2, plan item 8: database tests are never skipped quietly. Port 1 of this
  // machine is one nothing listens on.
  it("says how to start PostgreSQL when nothing answers at the address", async () => {
    await expect(
      assertServerAnswers("postgres://invented_user@127.0.0.1:1/procurement"),
    ).rejects.toThrow(
      "PostgreSQL does not answer at 127.0.0.1:1. Start it with: docker compose up -d",
    );
  });

  it("refuses a broken address without repeating it", () => {
    const broken = "not-a-real-password is not an address";

    expect(() => addressOf(broken, "postgres")).toThrow(
      "DATABASE_URL is not a valid database address.",
    );
    expect(() => addressOf(broken, "postgres")).not.toThrow(/not-a-real-password/);
  });

  it("builds the address of another database on the same server", () => {
    expect(addressOf("postgres://invented_user@127.0.0.1:5433/procurement", "postgres")).toBe(
      "postgres://invented_user@127.0.0.1:5433/postgres",
    );
  });
});
