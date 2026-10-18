import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { branches } from "./organisation";
import { users } from "./users";

// The Excel imports of catalogs (04-catalogs.md rule 7; build-plan 1.10). Not a table of
// 14-data-model.md: it holds the client key that makes a repeated Save return the first result
// (developer-rules.md rule 8), and who imported which file (plan of 1.10, decision 13). Each entry
// an import creates keeps its own `*.create` audit row; the entries themselves have no client key.
// An import of existing stock (build-plan 5.9) is one branch's: its `branch_id` lets the repeat
// answer only in that branch, and its direct-entry documents point to it by `import_id` (plan of
// 5.9, review must fixes 1 and 2).

/** What was imported. */
export const importKind = pgEnum("import_kind", ["PRODUCTS", "DEPARTMENTS", "PRICES", "STOCK"]);

export const catalogImports = pgTable(
  "catalog_imports",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    kind: importKind("kind").notNull(),
    fileName: text("file_name").notNull(),
    rowCount: integer("row_count").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    clientKey: uuid("client_key").notNull(),
    // The branch of a stock import; empty for the catalog kinds.
    branchId: uuid("branch_id").references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("catalog_imports_client_key_key").on(table.clientKey),
    check("catalog_imports_row_count_check", sql`${table.rowCount} > 0`),
    check(
      "catalog_imports_file_name_check",
      sql`btrim(${table.fileName}) <> '' AND char_length(${table.fileName}) <= 255`,
    ),
    // The kind as text: the migration that adds STOCK applies in the same transaction as this
    // CHECK, and PostgreSQL refuses a new enum value there ("unsafe use of new value").
    check(
      "catalog_imports_branch_check",
      sql`(${table.kind}::text = 'STOCK') = (${table.branchId} IS NOT NULL)`,
    ),
    index("catalog_imports_created_by_idx").on(table.createdBy),
    index("catalog_imports_branch_id_idx").on(table.branchId),
  ],
);
