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

import { users } from "./users";

// The Excel imports of catalogs (04-catalogs.md rule 7; build-plan 1.10). Not a table of
// 14-data-model.md: it holds the client key that makes a repeated Save return the first result
// (developer-rules.md rule 8), and who imported which file (plan of 1.10, decision 13). Each entry
// an import creates keeps its own `*.create` audit row; the entries themselves have no client key.

/** What was imported (1.11 adds PRICES; phase 5 existing stock). */
export const importKind = pgEnum("import_kind", ["PRODUCTS", "DEPARTMENTS"]);

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("catalog_imports_client_key_key").on(table.clientKey),
    check("catalog_imports_row_count_check", sql`${table.rowCount} > 0`),
    check(
      "catalog_imports_file_name_check",
      sql`btrim(${table.fileName}) <> '' AND char_length(${table.fileName}) <= 255`,
    ),
    index("catalog_imports_created_by_idx").on(table.createdBy),
  ],
);
