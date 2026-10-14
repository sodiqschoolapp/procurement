import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { FILE_MIMES, MAX_FILE_BYTES } from "@/domain/files";

import { users } from "./users";

// files: "storage_key, original_name, mime, size_bytes, uploaded_by" (14-data-model.md,
// Organisation and catalogs). Task 0.12.
// - `storage_key` is the prefix of the file's objects in the bucket: `<key>/small.jpg` and
//   `<key>/large.jpg` for an image, `<key>/original` for a PDF (plan of 0.12, decision 8). The
//   download route reads it from this row only, so an object without a row is reachable by no
//   address (decision 15).
// - `mime` and `size_bytes` are the type and the size of what was uploaded, not of the stored
//   versions (review of the plan, correction 4). The original of a photo is not kept (decision 8).
// - `client_key` makes a repeated upload safe (developer-rules.md rule 8; decision 9).
// - `created_at` comes from the injected clock: no database default (decisions 0.2, style 3).
// A row never changes and is never deleted: the trigger files_guard of migration 0005, written by
// hand (CLAUDE.md rule 11).
export const fileMime = pgEnum("file_mime", FILE_MIMES);

export const files = pgTable(
  "files",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    mime: fileMime("mime").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    clientKey: uuid("client_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("files_storage_key_key").on(table.storageKey),
    unique("files_client_key_key").on(table.clientKey),
    check(
      "files_original_name_check",
      sql`char_length(${table.originalName}) BETWEEN 1 AND 255`,
    ),
    check(
      "files_size_bytes_check",
      sql`${table.sizeBytes} > 0 AND ${table.sizeBytes} <= ${sql.raw(String(MAX_FILE_BYTES))}`,
    ),
    index("files_uploaded_by_idx").on(table.uploadedBy),
  ],
);
