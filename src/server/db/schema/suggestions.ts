import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { SUGGESTION_STATUSES } from "@/domain/suggestions";

import { products } from "./catalogs";
import { files } from "./files";
import { branches } from "./organisation";
import { users } from "./users";

// Product suggestions (14-data-model.md, catalog_suggestions; 04-catalogs.md rule 8; build-plan
// 1.12). A Manager (or the Head) asks for an item the catalog lacks; the Head adds it as a new
// product or declines it with a reason. Beside the columns of 14: `client_key` for a safe repeat
// (developer-rules.md rule 8) and `decided_at` from the injected clock (plan of 1.12, decision 6).
// The shape CHECK ties the decision columns to the status. Migration 0017 adds by hand what
// Drizzle cannot express: the guard trigger (no delete; only PENDING → ADDED or DECLINED, the
// decision columns only; a decided row never changes again).
//
// The photo is unique: one suggestion holds it. When the Head keeps it at the add, the new
// product holds the same file (plan of 1.12, decision 3, Look first; src/server/files/owners.ts).

/** PENDING, ADDED or DECLINED (14-data-model.md, catalog_suggestions.status). */
export const suggestionStatus = pgEnum("suggestion_status", SUGGESTION_STATUSES);

export const catalogSuggestions = pgTable(
  "catalog_suggestions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    suggestedBy: uuid("suggested_by")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    unitText: text("unit_text").notNull(),
    photoFileId: uuid("photo_file_id").references(() => files.id),
    note: text("note"),
    status: suggestionStatus("status").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    productId: uuid("product_id").references(() => products.id),
    clientKey: uuid("client_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("catalog_suggestions_client_key_key").on(table.clientKey),
    unique("catalog_suggestions_photo_file_id_key").on(table.photoFileId),
    unique("catalog_suggestions_product_id_key").on(table.productId),
    // Not blank, and within the limits of src/domain/ (catalog name 120, measure text 30, note and
    // reason 500; plan of 1.12, decision 5).
    check(
      "catalog_suggestions_name_check",
      sql`btrim(${table.name}) <> '' AND char_length(${table.name}) <= 120`,
    ),
    check(
      "catalog_suggestions_unit_text_check",
      sql`btrim(${table.unitText}) <> '' AND char_length(${table.unitText}) <= 30`,
    ),
    check(
      "catalog_suggestions_note_check",
      sql`${table.note} IS NULL OR (btrim(${table.note}) <> '' AND char_length(${table.note}) <= 500)`,
    ),
    check(
      "catalog_suggestions_decision_note_check",
      sql`${table.decisionNote} IS NULL OR (btrim(${table.decisionNote}) <> '' AND char_length(${table.decisionNote}) <= 500)`,
    ),
    // PENDING: nothing decided. ADDED: who, when and the product. DECLINED: who, when and the
    // reason, no product (04 rule 8; plan of 1.12, "Database changes").
    check(
      "catalog_suggestions_decision_check",
      sql`CASE ${table.status}
        WHEN 'PENDING' THEN ${table.decidedBy} IS NULL AND ${table.decidedAt} IS NULL
          AND ${table.decisionNote} IS NULL AND ${table.productId} IS NULL
        WHEN 'ADDED' THEN ${table.decidedBy} IS NOT NULL AND ${table.decidedAt} IS NOT NULL
          AND ${table.productId} IS NOT NULL
        ELSE ${table.decidedBy} IS NOT NULL AND ${table.decidedAt} IS NOT NULL
          AND ${table.decisionNote} IS NOT NULL AND ${table.productId} IS NULL
      END`,
    ),
    index("catalog_suggestions_branch_status_idx").on(
      table.branchId,
      table.status,
      table.createdAt,
    ),
    index("catalog_suggestions_status_idx").on(table.status),
    index("catalog_suggestions_suggested_by_idx").on(table.suggestedBy),
    index("catalog_suggestions_decided_by_idx").on(table.decidedBy),
  ],
);
