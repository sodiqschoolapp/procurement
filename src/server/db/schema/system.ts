import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

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

// audit_log: "actor_id, action, entity, entity_id, before JSONB, after JSONB" (14-data-model.md,
// System; developer-rules.md rule 13). Task 0.9. One log serves every audited table, so
// `entity_id` names a row of the table in `entity` and has no foreign key (plan of 0.9, decision
// 1, Look first); it is text because a settings row is named by its key. `action` and `entity`
// are names each later task adds, so they are text with a format CHECK, not enums (decision 5).
// Append-only: the trigger audit_log_append_only of migration 0003, written by hand, refuses
// UPDATE, DELETE and TRUNCATE (decision 2, Look first).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("audit_log_action_check", sql`${table.action} ~ '^[a-z][a-z_]*\\.[a-z][a-z_]*$'`),
    check("audit_log_entity_check", sql`${table.entity} ~ '^[a-z][a-z_]*$'`),
    check("audit_log_entity_id_check", sql`btrim(${table.entityId}) <> ''`),
    check(
      "audit_log_before_check",
      sql`${table.before} IS NULL OR jsonb_typeof(${table.before}) = 'object'`,
    ),
    check(
      "audit_log_after_check",
      sql`${table.after} IS NULL OR jsonb_typeof(${table.after}) = 'object'`,
    ),
    check(
      "audit_log_before_or_after_check",
      sql`${table.before} IS NOT NULL OR ${table.after} IS NOT NULL`,
    ),
    index("audit_log_entity_entity_id_created_at_idx").on(
      table.entity,
      table.entityId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("audit_log_actor_id_idx").on(table.actorId),
  ],
);
