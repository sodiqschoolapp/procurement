import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { describe, expect, inject, it } from "vitest";

import { MIGRATIONS_FOLDER, applyMigrations } from "../../../../scripts/apply-migrations.mjs";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { createTestDatabase, dropTestDatabase } from "../../../../tests/helpers/test-database";

// Build plan 2.11b (review of #61, finding 1): migration 0022 changes how order_revisions rows are
// written (14-data-model.md, order_revisions; plan of 2.11, decided item 2, Look first), so it is
// run over rows written the way the code before it wrote them (.claude/rules/database.md): one
// copy per (order, revision), no `submission`: revision 1 by the 2.7 Submit, revision 2 by the
// 2.11 Submit again. Its own fresh database, so the old schema never touches the shared template.

const AT = "2026-10-16T05:00:00Z";

/** drizzle/ cut after the migration with this tag: the SQL files and the journal up to it. */
function migrationsUpTo(tag: string): string {
  const cut = mkdtempSync(join(tmpdir(), `migrations-${tag.slice(0, 4)}-`));
  cpSync(MIGRATIONS_FOLDER, cut, { recursive: true });
  const journalPath = join(cut, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const index = journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag);
  expect(index).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, index + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return cut;
}

describe("migration 0022: copies written before it are each their revision's first submission", () => {
  it("rows of revisions 1 and 2 get submission 1; the new key refuses a second (order, revision, 1) and takes (order, revision, 2)", async () => {
    const serverUrl = inject("databaseServerUrl");
    const before = migrationsUpTo("0021_branch_code_lock");
    const upTo = migrationsUpTo("0022_order_revision_submissions");
    const database = await createTestDatabase(serverUrl, { fromTemplate: false });
    const client = new pg.Client({ connectionString: database.url });
    try {
      await applyMigrations(database.url, before);
      await client.connect();
      const branch = await client.query(
        `insert into branches (name, code, address, created_at)
          values ('Invented branch', 'INV', 'Invented street 1', $1) returning id`,
        [AT],
      );
      const user = await client.query(
        `insert into users (id, full_name, username, email, phone, role, created_at, updated_at)
          values ($1, 'Invented Head', 'invented.head', 'invented.head@example.invalid',
            '+998900000001', 'HEAD', $2, $2) returning id`,
        [randomUUID(), AT],
      );
      const order = await client.query(
        `insert into orders (branch_id, owner_id, created_by, payment_type, created_at, updated_at)
          values ($1, $2, $2, 'CASH', $3, $3) returning id`,
        [branch.rows[0].id, user.rows[0].id, AT],
      );
      const orderId: string = order.rows[0].id;
      // As the 2.7 Submit and the 2.11 Submit again wrote them: no submission column yet.
      for (const revision of [1, 2]) {
        await client.query(
          `insert into order_revisions (order_id, revision, snapshot, created_at)
            values ($1, $2, '{}'::jsonb, $3)`,
          [orderId, revision, AT],
        );
      }

      await applyMigrations(database.url, upTo);
      const rows = await client.query(
        `select revision, submission from order_revisions where order_id = $1 order by revision`,
        [orderId],
      );
      expect(rows.rows).toEqual([
        { revision: 1, submission: 1 },
        { revision: 2, submission: 1 },
      ]);

      const insert = (revision: number, submission: number) =>
        client.query(
          `insert into order_revisions (order_id, revision, submission, snapshot, created_at)
            values ($1, $2, $3, '{}'::jsonb, $4)`,
          [orderId, revision, submission, AT],
        );
      expect(await refusalOf(insert(1, 1))).toMatchObject({
        code: "23505",
        constraint: "order_revisions_order_id_revision_submission_key",
      });
      await insert(1, 2);
      // The default is dropped: every insert names its submission (0022's header).
      expect(
        await refusalOf(
          client.query(
            `insert into order_revisions (order_id, revision, snapshot, created_at)
              values ($1, 3, '{}'::jsonb, $2)`,
            [orderId, AT],
          ),
        ),
      ).toMatchObject({ code: "23502" });
    } finally {
      await client.end();
      await dropTestDatabase(serverUrl, database.name);
      rmSync(before, { recursive: true, force: true });
      rmSync(upTo, { recursive: true, force: true });
    }
  });
});
