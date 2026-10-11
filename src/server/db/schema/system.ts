import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The "System" group of docs/spec/14-data-model.md. The other tables of the group arrive with
// the tasks that first need them.

// settings: `key KEY, value JSONB`. `key` is the key, so the table has no `id`; it still has
// `created_at` (docs/decisions.md, 0.2, constraint style 2 and 3). The allowed keys and their
// defaults are the typed accessor of task 1.1, not a database list.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
