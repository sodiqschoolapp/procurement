import { type SQL, sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { NOTIFICATION_TYPES } from "@/domain/notifications";
import { ASK_CHOICES, ORDER_FIELDS, PLACES } from "@/domain/order-fields";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import {
  GUARD_OFF,
  HOURS_MAX,
  HOURS_MIN,
  PERCENT_MAX,
  PERCENT_MIN,
  SCHOOL_NAME_MAX,
  STORED_AMOUNT,
} from "@/domain/settings";

import { branches } from "./organisation";
import { users } from "./users";

// The "System" group of docs/spec/14-data-model.md. The other tables of the group arrive with
// the tasks that first need them.

// settings: `key KEY, value JSONB`. `key` is the key, so the table has no `id`; it still has
// `created_at` (docs/decisions.md, 0.2, constraint style 2 and 3). The allowed keys and their
// defaults are the typed accessor of task 1.1 (src/domain/settings.ts), not a database list: an
// unknown key is allowed and ignored. Each known key's value has its shape checked here (plan of
// 1.1, decision 3, Look first; CLAUDE.md rule 5), with the limits of src/domain/settings.ts.
// Every CHECK is a CASE that tests the JSON type before any cast, so it is never NULL (a NULL
// CHECK passes) and a wrong type is a check violation, not a cast error (review of the plan,
// Must fix 2).

/** A number literal in a CHECK: DDL takes no bound parameter. */
const n = (value: number) => sql.raw(String(value));

/** The jsonb value as a whole number between min and max, or false; never NULL. */
function wholeBetween(json: SQL, min: number, max: number): SQL {
  return sql`CASE WHEN jsonb_typeof(${json}) IS DISTINCT FROM 'number' THEN false WHEN (${json})::numeric <> trunc((${json})::numeric) THEN false ELSE (${json})::numeric BETWEEN ${n(min)} AND ${n(max)} END`;
}

function forKey(key: string, rule: SQL): SQL {
  return sql`key <> ${sql.raw(`'${key}'`)} OR (${rule})`;
}

const VALUE = sql.raw("value");

function textArray(values: readonly string[]): SQL {
  return sql.raw(`ARRAY[${values.map((value) => `'${value}'`).join(", ")}]::text[]`);
}

/**
 * A JSON object holding exactly `keys`: all of them (`?&`), and nothing once they are taken away. A
 * CHECK takes no subquery, so the keys are not counted (plan of 2.5d, decided item 3).
 */
function exactObject(json: SQL, keys: readonly string[], rule: SQL): SQL {
  return sql`CASE WHEN jsonb_typeof(${json}) IS DISTINCT FROM 'object' THEN false ELSE (${json}) ?& ${textArray(keys)} AND (${json}) - ${textArray(keys)} = '{}'::jsonb AND (${rule}) END`;
}

/** The shape of `order_fields` (src/domain/order-fields.ts, isOrderFields). */
function orderFieldsShape(json: SQL): SQL {
  const fields = ORDER_FIELDS.map((field) => {
    const rule = sql`(${json} -> ${sql.raw(`'${field}'`)})`;
    return exactObject(
      rule,
      ["ask", "place"],
      sql`jsonb_typeof(${rule} -> 'ask') = 'string' AND jsonb_typeof(${rule} -> 'place') = 'string' AND (${rule} ->> 'ask') = ANY (${textArray(ASK_CHOICES[field])}) AND (${rule} ->> 'place') = ANY (${textArray(PLACES)})`,
    );
  });
  return exactObject(json, ORDER_FIELDS, sql.join(fields, sql` AND `));
}

export const settings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  () => [
    check(
      "settings_default_payment_type_check",
      forKey(
        "default_payment_type",
        sql`${VALUE} IN (${sql.raw(PAYMENT_TYPES.map((type) => `'"${type}"'::jsonb`).join(", "))})`,
      ),
    ),
    check(
      "settings_price_hint_percent_check",
      forKey("price_hint_percent", wholeBetween(VALUE, PERCENT_MIN, PERCENT_MAX)),
    ),
    check(
      "settings_overspend_guard_percent_check",
      forKey(
        "overspend_guard_percent",
        sql`CASE WHEN jsonb_typeof(${VALUE}) = 'string' THEN ${VALUE} = ${sql.raw(`'"${GUARD_OFF}"'::jsonb`)} ELSE ${wholeBetween(VALUE, PERCENT_MIN, PERCENT_MAX)} END`,
      ),
    ),
    check(
      "settings_reminder_hours_check",
      forKey("reminder_hours", wholeBetween(VALUE, HOURS_MIN, HOURS_MAX)),
    ),
    check(
      "settings_escalation_hours_check",
      forKey("escalation_hours", wholeBetween(VALUE, HOURS_MIN, HOURS_MAX)),
    ),
    check(
      "settings_receipt_required_for_cash_check",
      forKey("receipt_required_for_cash", sql`jsonb_typeof(${VALUE}) = 'boolean'`),
    ),
    // 06-approval-workflow.md, Finance step switched off; 14 Notes for the build: `finance_step`
    // (true: on) is a boolean (plan of 4.10c).
    check(
      "settings_finance_step_check",
      forKey("finance_step", sql`jsonb_typeof(${VALUE}) = 'boolean'`),
    ),
    // 05-order-request-form.md, Fields the Head sets; 14 Notes for the build: `order_fields` holds
    // exactly the ten fields, each exactly `ask` and `place`, with its field's choices
    // (src/domain/order-fields.ts, isOrderFields; plan of 2.5d, decided item 3).
    check("settings_order_fields_check", forKey("order_fields", orderFieldsShape(VALUE))),
    // Whole so'm as a JSON text of digits, 0 to 15 digits with no leading zero, never a JSON
    // number (plan of 2.1, decision 1, Look first; CLAUDE.md rule 6).
    check(
      "settings_overspend_guard_min_amount_check",
      forKey(
        "overspend_guard_min_amount",
        sql`CASE WHEN jsonb_typeof(${VALUE}) IS DISTINCT FROM 'string' THEN false ELSE (${VALUE} #>> '{}') ~ ${sql.raw(`'${STORED_AMOUNT.source}'`)} END`,
      ),
    ),
    // Trimmed: no white space at either end; counted by code point (decision 10).
    check(
      "settings_school_name_check",
      forKey(
        "school_name",
        sql`CASE WHEN jsonb_typeof(${VALUE}) IS DISTINCT FROM 'string' THEN false WHEN (${VALUE} #>> '{}') ~ '^[[:space:]]|[[:space:]]$' THEN false ELSE char_length(${VALUE} #>> '{}') BETWEEN 1 AND ${n(SCHOOL_NAME_MAX)} END`,
      ),
    ),
    // Exactly `month` and `day`, whole, a day that exists in that month every year: February
    // has 28 (decision 9).
    check(
      "settings_school_year_start_check",
      forKey(
        "school_year_start",
        sql`CASE WHEN jsonb_typeof(${VALUE}) IS DISTINCT FROM 'object' THEN false WHEN ${VALUE} - 'month' - 'day' <> '{}'::jsonb THEN false WHEN NOT ${wholeBetween(sql`${VALUE} -> 'month'`, 1, 12)} THEN false WHEN NOT ${wholeBetween(sql`${VALUE} -> 'day'`, 1, 31)} THEN false ELSE (${VALUE} ->> 'day')::int <= CASE (${VALUE} ->> 'month')::int WHEN 2 THEN 28 WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END END`,
      ),
    ),
  ],
);

// audit_log: "actor_id, action, entity, entity_id, before JSONB, after JSONB" (14-data-model.md,
// System; developer-rules.md rule 13). Task 0.9. One log serves every audited table, so
// `entity_id` names a row of the table in `entity` and has no foreign key (plan of 0.9, decision
// 1, Look first); it is text, as one log serves tables keyed by uuid and the settings, whose
// changes are one record named `settings` (plan of 1.1, decision 8). `action` and `entity`
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

// notifications: "user_id, type, params JSONB, link, read_at" (14-data-model.md, System;
// 10-notifications-analytics-reports.md, Notifications). Task 0.11. `type` is an enum with one
// value per event of the spec's table (plan of 0.11, decision 1, Look first); its list lives in
// src/domain/notifications.ts and a unit test keeps the two equal. `link` is an address inside the
// app: the CHECK refuses another host, and allows printable ASCII only, so no white space or
// control character that a browser strips into another host (review of the plan, Should fix 6;
// PostgreSQL and JavaScript name different Unicode characters "space", so neither list is used). Rows are never deleted and change only once,
// `read_at` from NULL to a moment: the trigger notifications_guard of migration 0004, written by
// hand (decision 3, Look first; CLAUDE.md rule 11). `branch_id` (14: "empty for a notice of no
// branch"; build-plan 2.3b): the bell shows a row only to a reader who has its branch now, and a
// row from before migration 0051 has none and always shows (plan of 2.3b, decided item 7).
export const notificationType = pgEnum("notification_type", NOTIFICATION_TYPES);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: notificationType("type").notNull(),
    branchId: uuid("branch_id").references(() => branches.id),
    params: jsonb("params").notNull().default({}),
    link: text("link").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("notifications_params_check", sql`jsonb_typeof(${table.params}) = 'object'`),
    check(
      "notifications_link_check",
      sql`${table.link} ~ '^/([^/\\\\]|$)' AND ${table.link} ~ '^[!-~]+$'`,
    ),
    check(
      "notifications_read_at_check",
      sql`${table.readAt} IS NULL OR ${table.readAt} >= ${table.createdAt}`,
    ),
    index("notifications_user_id_created_at_idx").on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("notifications_branch_id_idx").on(table.branchId),
    index("notifications_user_id_unread_idx")
      .on(table.userId)
      .where(sql`${table.readAt} IS NULL`),
  ],
);
