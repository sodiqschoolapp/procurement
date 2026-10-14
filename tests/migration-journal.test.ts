import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MIGRATIONS_FOLDER } from "../scripts/apply-migrations.mjs";

// docs/decisions.md, "Decided ahead: task 0.3", item 6 (guard 1): Drizzle's migrator skips in
// silence a migration whose time stamp is older than the newest one already applied.
// developer-rules.md rule 5 ("Constraints in SQL migrations"): every migration must really run.

type JournalEntry = { idx: number; when: number; tag: string };

/** Everything wrong with a journal and the .sql files beside it; empty when it is sound. */
function journalProblems(entries: JournalEntry[], sqlFiles: string[]): string[] {
  const problems: string[] = [];
  if (entries.length === 0) problems.push("the journal has no entry");
  entries.forEach((entry, i) => {
    if (entry.idx !== i) problems.push(`${entry.tag}: idx ${entry.idx}, expected ${i}`);
    const previous = entries[i - 1];
    if (previous && entry.when <= previous.when) {
      problems.push(`${entry.tag}: time stamp not later than ${previous.tag}`);
    }
  });
  const tags = new Set(entries.map((entry) => entry.tag));
  const files = new Set(sqlFiles.map((file) => file.replace(/\.sql$/, "")));
  for (const tag of tags) if (!files.has(tag)) problems.push(`${tag}: no .sql file`);
  for (const file of files) if (!tags.has(file)) problems.push(`${file}.sql: no journal entry`);
  return problems;
}

describe("the migration journal (Decided ahead 0.3, item 6; developer-rules.md rule 5)", () => {
  it("of drizzle/ ascends, is numbered in order, and matches its .sql files one to one", () => {
    const journal: { entries: JournalEntry[] } = JSON.parse(
      readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
    );
    const sqlFiles = readdirSync(MIGRATIONS_FOLDER).filter((file) => file.endsWith(".sql"));

    expect(journalProblems(journal.entries, sqlFiles)).toEqual([]);
  });

  // Invented journals, so each check is shown to fail on the case it exists for.
  const first = { idx: 0, when: 1791700000000, tag: "0000_first" };
  const second = { idx: 1, when: 1791800000000, tag: "0001_second" };
  const files = ["0000_first.sql", "0001_second.sql"];

  it("accepts a sound invented journal", () => {
    expect(journalProblems([first, second], files)).toEqual([]);
  });

  it("refuses a time stamp older than the one before it", () => {
    expect(journalProblems([first, { ...second, when: first.when - 1 }], files)).toEqual([
      "0001_second: time stamp not later than 0000_first",
    ]);
  });

  it("refuses a time stamp equal to the one before it", () => {
    expect(journalProblems([first, { ...second, when: first.when }], files)).toEqual([
      "0001_second: time stamp not later than 0000_first",
    ]);
  });

  it("refuses a gap in the numbering", () => {
    expect(journalProblems([first, { ...second, idx: 2 }], files)).toEqual([
      "0001_second: idx 2, expected 1",
    ]);
  });

  it("refuses an entry without its .sql file, and a .sql file without its entry", () => {
    expect(journalProblems([first, second], ["0000_first.sql", "0002_orphan.sql"])).toEqual([
      "0001_second: no .sql file",
      "0002_orphan.sql: no journal entry",
    ]);
  });

  it("refuses an empty journal", () => {
    expect(journalProblems([], [])).toEqual(["the journal has no entry"]);
  });
});
