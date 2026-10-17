import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { MONEY_ROW_KINDS } from "@/domain/money-ledger";

import { companies } from "./catalogs";
import { files } from "./files";
import { orderActions, orders } from "./orders";
import { users } from "./users";

// The money part of "Purchasing and money" of docs/spec/14-data-model.md: money_actions,
// money_rows, order_settlements. Task 4.1; 4.2, 4.3 and 4.5 write them. Money is whole so'm in
// bigint (developer-rules.md rule 6). Migration 0028 adds by hand the guards Drizzle cannot
// express: an action changes only by its one cancel (Decided ahead, question 3), its rows are
// append-only (developer-rules.md rule 7), and a row's order belongs to the action's Manager
// (08-money-and-settlement.md, Money ledger 1; plan of 4.1, decided item 4, Look first).

const moment = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: "bigint" });

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

export const moneyRowKind = pgEnum("money_row_kind", MONEY_ROW_KINDS);

// One Finance action (08 Money ledger): one date, an optional document number, an optional file and
// a comment, for one Manager. The comment may be empty only on the cash action saved with the
// approval (plan of 4.1, decided item 9, Look first). One browser id saves one action per Manager
// (14). `order_action_id` is the approval or settlement it was saved with; empty on the Money tab.
export const moneyActions = pgTable(
  "money_actions",
  {
    id: id(),
    clientKey: uuid("client_key").notNull(),
    orderActionId: uuid("order_action_id").references(() => orderActions.id),
    managerId: uuid("manager_id")
      .notNull()
      .references(() => users.id),
    occurredOn: date("occurred_on").notNull(),
    supplierId: uuid("supplier_id").references(() => companies.id),
    documentNo: text("document_no"),
    fileId: uuid("file_id").references(() => files.id),
    comment: text("comment"),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    cancelReason: text("cancel_reason"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelledAt: moment("cancelled_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("money_actions_client_key_manager_key").on(table.clientKey, table.managerId),
    // A file has one holder (the file contract of src/server/files/owners.ts).
    unique("money_actions_file_id_key").on(table.fileId),
    check("money_actions_document_no_check", sql`char_length(${table.documentNo}) <= 100`),
    check("money_actions_comment_check", sql`char_length(${table.comment}) <= 1000`),
    check(
      "money_actions_cancel_check",
      sql`CASE WHEN ${table.isCancelled}
        THEN btrim(coalesce(${table.cancelReason}, '')) <> '' AND ${table.cancelledBy} IS NOT NULL AND ${table.cancelledAt} IS NOT NULL
        ELSE ${table.cancelReason} IS NULL AND ${table.cancelledBy} IS NULL AND ${table.cancelledAt} IS NULL
      END`,
    ),
    index("money_actions_order_action_id_idx").on(table.orderActionId),
    index("money_actions_manager_id_idx").on(table.managerId),
    index("money_actions_supplier_id_idx").on(table.supplierId),
    index("money_actions_created_by_idx").on(table.createdBy),
    index("money_actions_cancelled_by_idx").on(table.cancelledBy),
  ],
);

// One order's part of an action (08 Money ledger): its kind and an amount above 0, one row per
// order (plan of 4.1, decided item 3, Look first).
export const moneyRows = pgTable(
  "money_rows",
  {
    id: id(),
    moneyActionId: uuid("money_action_id")
      .notNull()
      .references(() => moneyActions.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    kind: moneyRowKind("kind").notNull(),
    amount: money("amount").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("money_rows_action_order_key").on(table.moneyActionId, table.orderId),
    check("money_rows_amount_check", sql`${table.amount} > 0`),
    index("money_rows_order_id_idx").on(table.orderId),
  ],
);

// Finance's confirmations and the Head's acknowledgment of one order (08 Closing 2; Overspend
// guard). Updated, not appended: a reopen clears them (08 Overspend guard, last sentence; 4.8).
export const orderSettlements = pgTable(
  "order_settlements",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id),
    transferConfirmedBy: uuid("transfer_confirmed_by").references(() => users.id),
    transferConfirmedAt: moment("transfer_confirmed_at"),
    transferNote: text("transfer_note"),
    cardConfirmedBy: uuid("card_confirmed_by").references(() => users.id),
    cardConfirmedAt: moment("card_confirmed_at"),
    overspendAckBy: uuid("overspend_ack_by").references(() => users.id),
    overspendAckAt: moment("overspend_ack_at"),
    overspendAckComment: text("overspend_ack_comment"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    check(
      "order_settlements_transfer_check",
      sql`(${table.transferConfirmedBy} IS NULL) = (${table.transferConfirmedAt} IS NULL)`,
    ),
    check(
      "order_settlements_card_check",
      sql`(${table.cardConfirmedBy} IS NULL) = (${table.cardConfirmedAt} IS NULL)`,
    ),
    check(
      "order_settlements_ack_check",
      sql`CASE WHEN ${table.overspendAckBy} IS NOT NULL
        THEN ${table.overspendAckAt} IS NOT NULL AND btrim(coalesce(${table.overspendAckComment}, '')) <> ''
        ELSE ${table.overspendAckAt} IS NULL AND ${table.overspendAckComment} IS NULL
      END`,
    ),
    check("order_settlements_transfer_note_check", sql`char_length(${table.transferNote}) <= 1000`),
    check(
      "order_settlements_ack_comment_check",
      sql`char_length(${table.overspendAckComment}) <= 1000`,
    ),
    index("order_settlements_transfer_confirmed_by_idx").on(table.transferConfirmedBy),
    index("order_settlements_card_confirmed_by_idx").on(table.cardConfirmedBy),
    index("order_settlements_overspend_ack_by_idx").on(table.overspendAckBy),
  ],
);
