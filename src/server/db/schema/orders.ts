import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ORDER_ACTION_MAX, ORDER_EVENT_TYPES } from "@/domain/order-moves";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import { ORDER_PROGRESS } from "@/domain/purchases";
import { REQUEST_STATUSES } from "@/domain/request-status";

import { departments, companies, extraCostTypes, productVariants } from "./catalogs";
import { files } from "./files";
import { branches } from "./organisation";
import { users } from "./users";

// The "Orders" group of docs/spec/14-data-model.md: number_counters, orders, order_extras,
// order_revisions, order_actions, order_events. Task 2.4. Money is whole so'm in bigint,
// quantities numeric(14,3) (developer-rules.md rule 6). The enums are built from the domain lists,
// so each code lives once. Migration 0019 adds by hand what Drizzle cannot express: the guard of
// orders (a number never changes, the branch locks at the number, the plan is frozen outside
// DRAFT and RETURNED, only a never-submitted draft is deleted), the guard of order_extras, and the
// append-only triggers of order_revisions, order_actions and order_events (plan of 2.4).

const moment = (name: string) => timestamp(name, { withTimezone: true });
const quantity = (name: string) => numeric(name, { precision: 14, scale: 3 });
const money = (name: string) => bigint(name, { mode: "bigint" });

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/** The ten statuses of 06-approval-workflow.md; internal names keep "request" (D43). */
export const requestStatus = pgEnum("request_status", REQUEST_STATUSES);
/** CASH, TRANSFER, CARD (05-order-request-form.md, field 13). */
export const paymentType = pgEnum("payment_type", PAYMENT_TYPES);
/** NORMAL or URGENT (05, field 14). */
export const orderPriority = pgEnum("order_priority", ["NORMAL", "URGENT"]);
/** 07-purchasing.md, Order progress. */
export const orderProgress = pgEnum("order_progress", ORDER_PROGRESS);
/** The documents that are numbered per branch and year (14, number_counters). */
export const numberScope = pgEnum("number_scope", [
  "ORD",
  "ISS",
  "RET",
  "TRF",
  "WOF",
  "CNT",
  "ENT",
]);
/**
 * The type of a user action on ticked orders, and of its events: the twelve moves of the state
 * machine. A later task adds its own value with ALTER TYPE … ADD VALUE (plan of 2.4, decision 5,
 * Look first).
 */
export const orderActionType = pgEnum("order_action_type", ORDER_EVENT_TYPES);
export const orderEventType = pgEnum("order_event_type", ORDER_EVENT_TYPES);

// One counter per scope, branch and calendar year in Tashkent time (05 Order number 2). Written
// under a row lock inside the submit transaction by 2.7.
export const numberCounters = pgTable(
  "number_counters",
  {
    scope: numberScope("scope").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    year: smallint("year").notNull(),
    lastValue: integer("last_value").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    primaryKey({
      name: "number_counters_pkey",
      columns: [table.scope, table.branchId, table.year],
    }),
    check("number_counters_year_check", sql`${table.year} BETWEEN 2000 AND 9999`),
    check("number_counters_last_value_check", sql`${table.lastValue} >= 0`),
    index("number_counters_branch_id_idx").on(table.branchId),
  ],
);

// One order: one product or service for one department (05-order-request-form.md, Order). A
// draft may be half filled (05 Drafts 3, autosave); outside DRAFT the plan is complete (05 Checks
// at submit; plan of 2.4, decision 14). The number is empty only on a draft never submitted; a
// taken-back Draft keeps it (decisions 2.3 no. 1). `client_key` is the draft create's safe repeat
// (developer-rules.md rule 8; decision 12). The department belongs to the order's branch through
// the composite foreign key (A6; decision 3, Look first).
export const orders = pgTable(
  "orders",
  {
    id: id(),
    number: text("number"),
    revision: integer("revision").notNull().default(1),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    status: requestStatus("status").notNull().default("DRAFT"),
    priority: orderPriority("priority").notNull().default("NORMAL"),
    urgentReason: text("urgent_reason"),
    version: integer("version").notNull().default(1),
    variantId: uuid("variant_id").references(() => productVariants.id),
    companyId: uuid("company_id").references(() => companies.id),
    departmentId: uuid("department_id"),
    requesterName: text("requester_name"),
    neededBy: date("needed_by"),
    plannedQty: quantity("planned_qty"),
    plannedPrice: money("planned_price"),
    paymentType: paymentType("payment_type").notNull(),
    comment: text("comment"),
    referencePhotoFileId: uuid("reference_photo_file_id").references(() => files.id),
    stockAtSubmit: quantity("stock_at_submit"),
    progress: orderProgress("progress").notNull().default("OPEN"),
    finishReason: text("finish_reason"),
    plannedTotal: money("planned_total"),
    actualTotal: money("actual_total"),
    submittedAt: moment("submitted_at"),
    approvedAt: moment("approved_at"),
    closedAt: moment("closed_at"),
    /**
     * The Principal approved the order while the Finance step was switched off: it went straight
     * to Open, has no cash count and never goes to settlement (06-approval-workflow.md, Finance
     * step switched off 1 and 2; plan of 4.10c). Written once, by that approval.
     */
    skippedFinance: boolean("skipped_finance").notNull().default(false),
    /**
     * The Head approved the order, or submitted one the Head created, while the Principal step was
     * switched off: it went to the next step that is on (06-approval-workflow.md, Principal step
     * switched off 1). Set or cleared by every Head approval (rule 2; plan of 4.10d).
     */
    skippedPrincipal: boolean("skipped_principal").notNull().default(false),
    clientKey: uuid("client_key"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: moment("created_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
  },
  (table) => [
    unique("orders_number_key").on(table.number),
    unique("orders_client_key_key").on(table.clientKey),
    // The key a purchase record names, so its order is of its trip's branch (plan of 3.2, decided
    // item 1, Look first).
    unique("orders_id_branch_key").on(table.id, table.branchId),
    unique("orders_reference_photo_file_id_key").on(table.referencePhotoFileId),
    foreignKey({
      name: "orders_department_branch_fk",
      columns: [table.departmentId, table.branchId],
      foreignColumns: [departments.id, departments.branchId],
    }),
    check("orders_number_check", sql`${table.number} ~ '^[A-Z]{2,4}-[0-9]{2}-[0-9]{4,}$'`),
    check(
      "orders_number_status_check",
      sql`${table.number} IS NOT NULL OR ${table.status} = 'DRAFT'`,
    ),
    // 06 Finance step switched off 2: an order that skipped Finance never waits for Finance and
    // never goes to settlement (plan of 4.10c, decided item 7, Look first).
    check(
      "orders_skipped_finance_status_check",
      sql`NOT ${table.skippedFinance} OR ${table.status} NOT IN ('PENDING_FINANCE', 'SETTLEMENT')`,
    ),
    // 06 Principal step switched off 1 and 4: an order that skipped the Principal never waits for
    // the Principal (plan of 4.10d, decided item 6, Look first).
    check(
      "orders_skipped_principal_status_check",
      sql`NOT ${table.skippedPrincipal} OR ${table.status} <> 'PENDING_PRINCIPAL'`,
    ),
    check("orders_revision_check", sql`${table.revision} >= 1`),
    check("orders_version_check", sql`${table.version} >= 1`),
    check("orders_planned_qty_check", sql`${table.plannedQty} > 0`),
    check("orders_planned_price_check", sql`${table.plannedPrice} > 0`),
    // 0.001 × 400 so'm rounds to 0 (review of the plan of 2.4, correction 1).
    check("orders_planned_total_check", sql`${table.plannedTotal} >= 0`),
    check("orders_actual_total_check", sql`${table.actualTotal} >= 0`),
    check("orders_stock_at_submit_check", sql`${table.stockAtSubmit} >= 0`),
    check("orders_comment_check", sql`char_length(${table.comment}) <= 1000`),
    // 07 Order progress: Done short and Not bought carry their reason, stored trimmed by
    // moveReason() (5 to 500, 06 rule 3), and no other progress holds one (plan of 3.5, decided
    // item 5, Look first).
    check(
      "orders_finish_reason_check",
      sql`(${table.progress} IN ('DONE_SHORT', 'NOT_BOUGHT')) = (${table.finishReason} IS NOT NULL) AND (${table.finishReason} IS NULL OR char_length(${table.finishReason}) BETWEEN 5 AND 500)`,
    ),
    // A finished progress exists only from Open on (06 Statuses; 07 Order progress).
    check(
      "orders_progress_status_check",
      sql`${table.progress} = 'OPEN' OR ${table.status} IN ('PURCHASING', 'SETTLEMENT', 'CLOSED')`,
    ),
    // Loosened by 0056 (D67, a requirement changed): a submitted order may lack a department, a
    // needed-by date, or a planned price with its planned total (05 Fields the Head sets 3).
    check(
      "orders_submitted_plan_check",
      sql`${table.status} = 'DRAFT' OR (${table.variantId} IS NOT NULL AND ${table.plannedQty} IS NOT NULL AND ${table.submittedAt} IS NOT NULL)`,
    ),
    // D67: a planned price and a planned total are both present or both empty; a Draft is free,
    // as it may hold a price before its quantity (plan of 2.5d, decided item 5).
    check(
      "orders_planned_price_total_check",
      sql`${table.status} = 'DRAFT' OR ((${table.plannedPrice} IS NULL) = (${table.plannedTotal} IS NULL))`,
    ),
    // 06 Finance step switched off 8: "An order without a planned price never waits for Finance or
    // settlement."
    check(
      "orders_priced_finance_check",
      sql`${table.status} NOT IN ('PENDING_FINANCE', 'SETTLEMENT') OR ${table.plannedPrice} IS NOT NULL`,
    ),
    check(
      "orders_urgent_reason_check",
      sql`${table.priority} = 'NORMAL' OR ${table.status} = 'DRAFT' OR btrim(coalesce(${table.urgentReason}, '')) <> ''`,
    ),
    // 05 Drafts 2: one never-submitted draft per owner, branch, subtype and department.
    uniqueIndex("orders_one_draft_key")
      .on(table.ownerId, table.branchId, table.variantId, table.departmentId)
      .where(sql`${table.number} IS NULL`),
    // 05 Fields the Head sets 3: "Two drafts without a department count as the same department for
    // the merge of Drafts 2". A second index, so an empty row with no subtype yet never collides
    // (plan of 2.5d, decided item 4).
    uniqueIndex("orders_one_draft_no_department_key")
      .on(table.ownerId, table.branchId, table.variantId)
      .where(
        sql`${table.number} IS NULL AND ${table.departmentId} IS NULL AND ${table.variantId} IS NOT NULL`,
      ),
    index("orders_branch_id_status_idx").on(table.branchId, table.status),
    index("orders_owner_id_idx").on(table.ownerId),
    index("orders_variant_id_idx").on(table.variantId),
    index("orders_department_id_branch_id_idx").on(table.departmentId, table.branchId),
    index("orders_company_id_idx").on(table.companyId),
    index("orders_created_by_idx").on(table.createdBy),
    index("orders_submitted_at_idx").on(table.submittedAt),
    // A filter column of its list (developer-rules.md rule 12; plan of 9.2, decided item 3).
    index("orders_branch_id_needed_by_idx").on(table.branchId, table.neededBy),
  ],
);

// Extra costs of an order's plan (05 field 12): each amount more than 0. Removed with a deleted
// never-submitted draft (ON DELETE CASCADE; review of the plan of 2.4, correction 3).
export const orderExtras = pgTable(
  "order_extras",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    extraCostTypeId: uuid("extra_cost_type_id")
      .notNull()
      .references(() => extraCostTypes.id),
    amount: money("amount").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    check("order_extras_amount_check", sql`${table.amount} > 0`),
    index("order_extras_order_id_idx").on(table.orderId),
    index("order_extras_extra_cost_type_id_idx").on(table.extraCostTypeId),
  ],
);

// A full copy of the order at each submit (14; 06 rule 5). Append-only. Written by 2.7.
export const orderRevisions = pgTable(
  "order_revisions",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    revision: integer("revision").notNull(),
    /**
     * The submit within its revision: 1 for the first, 2 after a Take back and a new Submit, which
     * keeps the revision (plan of 2.11, decided items 1 and 2, Look first).
     */
    submission: integer("submission").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("order_revisions_order_id_revision_submission_key").on(
      table.orderId,
      table.revision,
      table.submission,
    ),
    check("order_revisions_revision_check", sql`${table.revision} >= 1`),
    check("order_revisions_submission_check", sql`${table.submission} >= 1`),
  ],
);

// One user action on one or more ticked orders (14; 06 rule 8). Append-only. `client_key` makes
// a repeat return the first result (developer-rules.md rule 8). The reason is stored trimmed by
// moveReason(), so the CHECK counts the stored text (plan of 2.4).
export const orderActions = pgTable(
  "order_actions",
  {
    id: id(),
    clientKey: uuid("client_key").notNull(),
    type: orderActionType("type").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason"),
    orderCount: integer("order_count").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("order_actions_client_key_key").on(table.clientKey),
    check(
      "order_actions_reason_check",
      sql`${table.reason} IS NULL OR char_length(${table.reason}) BETWEEN 5 AND 500`,
    ),
    check(
      "order_actions_order_count_check",
      sql`${table.orderCount} BETWEEN 1 AND ${sql.raw(String(ORDER_ACTION_MAX))}`,
    ),
    index("order_actions_actor_id_idx").on(table.actorId),
  ],
);

// One move of one order, made by one action (06 rule 11). Append-only. `note` is the per-order
// note of a send-back; `payload` holds what a move adds, such as `{ "headStepAuto": true }` on
// the Submit of an order the Head created (2.7; review of the plan of 2.4, correction 5).
export const orderEvents = pgTable(
  "order_events",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    actionId: uuid("action_id")
      .notNull()
      .references(() => orderActions.id),
    type: orderEventType("type").notNull(),
    fromStatus: requestStatus("from_status").notNull(),
    toStatus: requestStatus("to_status").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    comment: text("comment"),
    note: text("note"),
    payload: jsonb("payload"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    index("order_events_order_id_idx").on(table.orderId),
    index("order_events_action_id_idx").on(table.actionId),
    index("order_events_actor_id_idx").on(table.actorId),
  ],
);

// One merged add of a draft (05 Drafts 2; plan of 2.5a, decided item 3, Look first): an add whose
// branch, subtype and department equal the owner's never-submitted draft makes no order row to
// hold its `client_key`, so this row holds it with the quantity added, the quantity, version and
// total after, so a repeat returns the first answer and adds nothing (developer-rules.md rules
// 8, 9). It goes with its deleted never-submitted draft (ON DELETE CASCADE; decided item 14, Look
// first). No code path updates or deletes it.
export const orderDraftAdds = pgTable(
  "order_draft_adds",
  {
    id: id(),
    clientKey: uuid("client_key").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    addedQty: quantity("added_qty").notNull(),
    qtyAfter: quantity("qty_after").notNull(),
    versionAfter: integer("version_after").notNull(),
    // The total of the first answer: null while the draft has no price (review of 2.5a, S2).
    totalAfter: money("total_after"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("order_draft_adds_client_key_key").on(table.clientKey),
    check("order_draft_adds_added_qty_check", sql`${table.addedQty} > 0`),
    check("order_draft_adds_qty_after_check", sql`${table.qtyAfter} > 0`),
    check("order_draft_adds_version_after_check", sql`${table.versionAfter} > 0`),
    check("order_draft_adds_total_after_check", sql`${table.totalAfter} >= 0`),
    index("order_draft_adds_order_id_idx").on(table.orderId),
    index("order_draft_adds_user_id_idx").on(table.userId),
  ],
);
