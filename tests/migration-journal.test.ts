import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MIGRATIONS_FOLDER } from "../scripts/apply-migrations.mjs";

// docs/decisions.md, "Decided ahead: task 0.3", item 6 (guard 1): Drizzle's migrator skips in
// silence a migration whose time stamp is older than the newest one already applied.
// developer-rules.md rule 5 ("Constraints in SQL migrations"): every migration must really run.

type JournalEntry = { idx: number; when: number; tag: string };

const journal: { entries: JournalEntry[] } = JSON.parse(
  readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
);

describe("the migration journal (Decided ahead 0.3, item 6; developer-rules.md rule 5)", () => {
  it("has at least one entry", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("has time stamps that strictly ascend", () => {
    const stamps = journal.entries.map((entry) => entry.when);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i], `entry ${journal.entries[i]?.tag}`).toBeGreaterThan(stamps[i - 1]!);
    }
  });

  it("numbers its entries 0, 1, 2 … in order", () => {
    expect(journal.entries.map((entry) => entry.idx)).toEqual(journal.entries.map((_, i) => i));
  });

  it("has one .sql file for every entry, and one entry for every .sql file", () => {
    const files = readdirSync(MIGRATIONS_FOLDER)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.replace(/\.sql$/, ""))
      .sort();
    expect(journal.entries.map((entry) => entry.tag).sort()).toEqual(files);
  });
});
