import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { MOVEMENT_TYPES } from "@/domain/stock";
import { DOCUMENT_REASONS, DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/domain/stock-documents";

import { departments, productVariants } from "./catalogs";
import { catalogImports } from "./imports";
import { branches } from "./organisation";
import { purchases } from "./purchasing";
import { users } from "./users";

// The "Warehouse" group of docs/spec/14-data-model.md. Task 2.4 makes `stock_balances` empty, so
// the "In stock" column of an order (05-order-request-form.md, field 4) has its source; 3.1 brings
// the ledger that fills it and `avg_cost`, whose type is decided with the average formula (plan of
// 2.4, decision 7, Look first). Stock is never below 0 (developer-rules.md rule 5). Task 3.1 adds
// `avg_cost` (whole so'm, plan of 3.1, decided item 1) and `stock_movements`, written only by
// postMovement() of src/server/stock-ledger.ts; migration 0023 adds by hand the append-only
// triggers of stock_movements (developer-rules.md rule 7). Task 5.1 adds the documents and their
// lines, written by src/server/stock-documents.ts, and the movements' key to their line.

const moment = (name: string) => timestamp(name, { withTimezone: true });
const quantity = (name: string) => numeric(name, { precision: 14, scale: 3 });
const som = (name: string) => bigint(name, { mode: "bigint" });

export const stockMovementType = pgEnum("stock_movement_type", MOVEMENT_TYPES);

export const stockBalances = pgTable(
  "stock_balances",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: quantity("qty").notNull().default("0"),
    avgCost: som("avg_cost")
      .notNull()
      .default(sql`0`),
    createdAt: moment("created_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ name: "stock_balances_pkey", columns: [table.branchId, table.variantId] }),
    check("stock_balances_qty_check", sql`${table.qty} >= 0`),
    check("stock_balances_avg_cost_check", sql`${table.avgCost} >= 0`),
    // 09 Stock value: "If stock reaches 0, the average resets to 0" (decided item 4, Look first).
    check("stock_balances_empty_avg_check", sql`${table.qty} > 0 OR ${table.avgCost} = 0`),
    index("stock_balances_variant_id_idx").on(table.variantId),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The order of movements, also of those that share one clock instant (decided item 11).
    seq: bigint("seq", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity().unique(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    type: stockMovementType("type").notNull(),
    qtyDelta: quantity("qty_delta").notNull(),
    unitCost: som("unit_cost").notNull(),
    balanceAfter: quantity("balance_after").notNull(),
    // The keys of `purchase_id` (3.2) and `document_line_id` (5.1) are below.
    purchaseId: uuid("purchase_id"),
    documentLineId: uuid("document_line_id"),
    reversesMovementId: uuid("reverses_movement_id").references(
      (): AnyPgColumn => stockMovements.id,
    ),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    check("stock_movements_qty_delta_check", sql`${table.qtyDelta} <> 0`),
    check("stock_movements_balance_after_check", sql`${table.balanceAfter} >= 0`),
    check("stock_movements_unit_cost_check", sql`${table.unitCost} >= 0`),
    // The Stock column of 09 Movement types (decided item 6).
    check(
      "stock_movements_direction_check",
      sql`CASE
        WHEN ${table.type} IN ('RECEIPT', 'RETURN', 'TRANSFER_IN', 'DIRECT_ENTRY') THEN ${table.qtyDelta} > 0
        WHEN ${table.type} IN ('ISSUE', 'TRANSFER_OUT', 'WRITE_OFF') THEN ${table.qtyDelta} < 0
        ELSE true
      END`,
    ),
    index("stock_movements_branch_variant_seq_idx").on(table.branchId, table.variantId, table.seq),
    index("stock_movements_variant_id_idx").on(table.variantId),
    index("stock_movements_created_by_idx").on(table.createdBy),
    // A movement is reversed at most once (plan of 5.1, decided item 4, Look first).
    uniqueIndex("stock_movements_reverses_movement_id_key").on(table.reversesMovementId),
    // A purchase's receipt or reversal moves the subtype bought in the trip's branch (07, What
    // saving a record does, 2; plan of 3.2, decided item 2, Look first).
    foreignKey({
      name: "stock_movements_purchase_fk",
      columns: [table.purchaseId, table.branchId, table.variantId],
      foreignColumns: [purchases.id, purchases.branchId, purchases.variantId],
    }),
    index("stock_movements_purchase_id_idx").on(table.purchaseId),
    // A document's movement moves the subtype of its line; the branch stays free, since a
    // transfer's TRANSFER_IN lands in its `to_branch_id` (plan of 5.1, decided item 5, Look first).
    foreignKey({
      name: "stock_movements_document_line_fk",
      columns: [table.documentLineId, table.variantId],
      foreignColumns: [stockDocumentLines.id, stockDocumentLines.variantId],
    }),
    index("stock_movements_document_line_id_idx").on(table.documentLineId),
  ],
);

export const stockDocumentType = pgEnum("stock_document_type", DOCUMENT_TYPES);
export const stockDocumentStatus = pgEnum("stock_document_status", DOCUMENT_STATUSES);
export const stockDocumentReason = pgEnum("stock_document_reason", DOCUMENT_REASONS);

// One warehouse document of one branch (09-warehouse.md, Movement types; Issue to a department;
// Other documents; 14, stock_documents). The number is given at the create (plan of 5.1, decided
// item 7); a reverse fills the three `reversed_*` columns once (decided item 1, Look first). The
// database holds the shape of each type; the status moves and the comment rules are the actions'
// (decided item 3; D44).
export const stockDocuments = pgTable(
  "stock_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    type: stockDocumentType("type").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    // A transfer's receiving branch; empty for every other type.
    toBranchId: uuid("to_branch_id").references(() => branches.id),
    // An issue's or a return's department, of the document's branch; empty for the other types.
    departmentId: uuid("department_id"),
    // Who received the items, as typed (09 Issue 2; Transfer); empty where nobody is named.
    receivedByName: text("received_by_name"),
    docDate: date("doc_date").notNull(),
    status: stockDocumentStatus("status").notNull(),
    // A direct entry's or a write-off's reason; empty for the other types.
    reason: stockDocumentReason("reason"),
    comment: text("comment"),
    clientKey: uuid("client_key").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    // Empty until the Head decides a write-off or count, or the receiver receives a transfer.
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: moment("decided_at"),
    // Empty until the document is reversed.
    reversedBy: uuid("reversed_by").references(() => users.id),
    reversedAt: moment("reversed_at"),
    reverseReason: text("reverse_reason"),
    // The Excel import a direct entry came from (build-plan 5.9); empty for one typed in a form.
    importId: uuid("import_id").references(() => catalogImports.id),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("stock_documents_number_key").on(table.number),
    unique("stock_documents_client_key_key").on(table.clientKey),
    check(
      "stock_documents_number_check",
      sql`${table.number} ~ ('^' || CASE ${table.type}
        WHEN 'ISSUE' THEN 'ISS' WHEN 'RETURN' THEN 'RET' WHEN 'TRANSFER' THEN 'TRF'
        WHEN 'WRITE_OFF' THEN 'WOF' WHEN 'COUNT' THEN 'CNT' WHEN 'DIRECT_ENTRY' THEN 'ENT'
      END || '-[A-Z]{2,4}-[0-9]{2}-[0-9]{4,}$')`,
    ),
    check(
      "stock_documents_to_branch_check",
      sql`(${table.type} = 'TRANSFER') = (${table.toBranchId} IS NOT NULL)
        AND ${table.toBranchId} IS DISTINCT FROM ${table.branchId}`,
    ),
    check(
      "stock_documents_department_check",
      sql`(${table.type} IN ('ISSUE', 'RETURN')) = (${table.departmentId} IS NOT NULL)`,
    ),
    check(
      "stock_documents_reason_check",
      sql`COALESCE(CASE ${table.type}
        WHEN 'DIRECT_ENTRY' THEN ${table.reason} IN ('EXISTING_STOCK', 'GIFT', 'OTHER')
        WHEN 'WRITE_OFF' THEN ${table.reason} IN ('DAMAGED', 'EXPIRED', 'LOST',
          'RETURNED_TO_SUPPLIER', 'LOST_IN_TRANSFER', 'OTHER')
        ELSE ${table.reason} IS NULL
      END, false)`,
    ),
    check(
      "stock_documents_decided_check",
      sql`(${table.decidedBy} IS NULL) = (${table.decidedAt} IS NULL)`,
    ),
    check(
      "stock_documents_reversed_check",
      sql`CASE WHEN ${table.status} = 'REVERSED'
        THEN ${table.reversedBy} IS NOT NULL AND ${table.reversedAt} IS NOT NULL
          AND COALESCE(btrim(${table.reverseReason}), '') <> ''
        ELSE ${table.reversedBy} IS NULL AND ${table.reversedAt} IS NULL
          AND ${table.reverseReason} IS NULL
      END`,
    ),
    check(
      "stock_documents_import_check",
      sql`${table.importId} IS NULL OR ${table.type} = 'DIRECT_ENTRY'`,
    ),
    // 09 Issue: "Department … from this branch" (the way orders hold theirs, plan of 2.4).
    foreignKey({
      name: "stock_documents_department_branch_fk",
      columns: [table.departmentId, table.branchId],
      foreignColumns: [departments.id, departments.branchId],
    }),
    index("stock_documents_branch_id_doc_date_idx").on(table.branchId, table.docDate),
    index("stock_documents_type_idx").on(table.type),
    index("stock_documents_status_idx").on(table.status),
    index("stock_documents_department_id_idx").on(table.departmentId),
    index("stock_documents_to_branch_id_idx").on(table.toBranchId),
    index("stock_documents_created_by_idx").on(table.createdBy),
    index("stock_documents_decided_by_idx").on(table.decidedBy),
    index("stock_documents_reversed_by_idx").on(table.reversedBy),
    index("stock_documents_import_id_idx").on(table.importId),
  ],
);

// One item of a document (14, stock_document_lines): one line per subtype (plan of 5.1, decided
// item 6). `counted_qty` and `received_qty` are typed by a count (7.3) and a receipt (7.2);
// `unit_cost` is a direct entry's own cost (09 Direct entry, Lines). `qty` may be 0 on a count
// line (decided item 11); a posted 0 is refused by stock_movements_qty_delta_check.
export const stockDocumentLines = pgTable(
  "stock_document_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => stockDocuments.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: quantity("qty").notNull(),
    countedQty: quantity("counted_qty"),
    receivedQty: quantity("received_qty"),
    unitCost: som("unit_cost"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("stock_document_lines_document_id_variant_id_key").on(table.documentId, table.variantId),
    // The target of the movements' key (document_line_id, variant_id).
    unique("stock_document_lines_id_variant_id_key").on(table.id, table.variantId),
    check("stock_document_lines_qty_check", sql`${table.qty} >= 0`),
    check("stock_document_lines_counted_qty_check", sql`${table.countedQty} >= 0`),
    check("stock_document_lines_received_qty_check", sql`${table.receivedQty} >= 0`),
    check("stock_document_lines_unit_cost_check", sql`${table.unitCost} >= 0`),
    index("stock_document_lines_variant_id_idx").on(table.variantId),
  ],
);
