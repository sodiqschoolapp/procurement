import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { companies, extraCostTypes, productVariants } from "./catalogs";
import { files } from "./files";
import { orders, paymentType } from "./orders";
import { branches } from "./organisation";
import { users } from "./users";

// The purchasing part of "Purchasing and money" of docs/spec/14-data-model.md: purchase_trips,
// purchases, purchase_extras, trip_files. Task 3.2; 3.3 and 3.4 write them, 3.7 cancels. Money is
// whole so'm in bigint, quantities numeric(14,3) (developer-rules.md rule 6). Migration 0024 adds
// by hand the guards Drizzle cannot express: a record changes only by its one cancel (Decided
// ahead, question 3), and a trip, its extras and its files are append-only (plan of 3.2, decided
// item 7; developer-rules.md rule 7).

const moment = (name: string) => timestamp(name, { withTimezone: true });
const quantity = (name: string) => numeric(name, { precision: 14, scale: 3 });
const money = (name: string) => bigint(name, { mode: "bigint" });

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

// One shop visit (07-purchasing.md, One trip, many orders): the date, supplier and payment type of
// all of its records, which never copy them (14). `client_key` makes a repeated save safe
// (developer-rules.md rule 8). (id, branch_id) is the key its records name (decided item 1).
export const purchaseTrips = pgTable(
  "purchase_trips",
  {
    id: id(),
    clientKey: uuid("client_key").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    purchasedOn: date("purchased_on").notNull(),
    supplierId: uuid("supplier_id").references(() => companies.id),
    paymentType: paymentType("payment_type").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("purchase_trips_client_key_key").on(table.clientKey),
    unique("purchase_trips_id_branch_key").on(table.id, table.branchId),
    index("purchase_trips_branch_id_purchased_on_idx").on(table.branchId, table.purchasedOn),
    index("purchase_trips_supplier_id_idx").on(table.supplierId),
    index("purchase_trips_created_by_idx").on(table.createdBy),
  ],
);

// One purchase record of one order (07 Purchase record). `branch_id` is the trip's and the
// order's branch, held by two composite keys (plan of 3.2, decided item 1, Look first); (id,
// branch_id, variant_id) is the key a stock movement names (decided item 2, Look first). The
// cancel fields are filled together, once (Decided ahead, question 3).
export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    tripId: uuid("trip_id").notNull(),
    orderId: uuid("order_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: quantity("qty").notNull(),
    unitPrice: money("unit_price").notNull(),
    comment: text("comment"),
    giveToRequester: boolean("give_to_requester").notNull().default(false),
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
    foreignKey({
      name: "purchases_trip_branch_fk",
      columns: [table.tripId, table.branchId],
      foreignColumns: [purchaseTrips.id, purchaseTrips.branchId],
    }),
    foreignKey({
      name: "purchases_order_branch_fk",
      columns: [table.orderId, table.branchId],
      foreignColumns: [orders.id, orders.branchId],
    }),
    unique("purchases_id_branch_variant_key").on(table.id, table.branchId, table.variantId),
    check("purchases_qty_check", sql`${table.qty} > 0`),
    // A gift is 0 (07 Purchase record).
    check("purchases_unit_price_check", sql`${table.unitPrice} >= 0`),
    check("purchases_comment_check", sql`char_length(${table.comment}) <= 1000`),
    check(
      "purchases_cancel_check",
      sql`CASE WHEN ${table.isCancelled}
        THEN btrim(coalesce(${table.cancelReason}, '')) <> '' AND ${table.cancelledBy} IS NOT NULL AND ${table.cancelledAt} IS NOT NULL
        ELSE ${table.cancelReason} IS NULL AND ${table.cancelledBy} IS NULL AND ${table.cancelledAt} IS NULL
      END`,
    ),
    index("purchases_trip_id_branch_id_idx").on(table.tripId, table.branchId),
    index("purchases_order_id_branch_id_idx").on(table.orderId, table.branchId),
    index("purchases_branch_id_idx").on(table.branchId),
    index("purchases_variant_id_idx").on(table.variantId),
    index("purchases_created_by_idx").on(table.createdBy),
    index("purchases_cancelled_by_idx").on(table.cancelledBy),
  ],
);

// The extra costs of a record (07 Purchase record: type, amount, payment type), each more than 0
// (developer-rules.md, Constraints the spec names).
export const purchaseExtras = pgTable(
  "purchase_extras",
  {
    id: id(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id),
    extraCostTypeId: uuid("extra_cost_type_id")
      .notNull()
      .references(() => extraCostTypes.id),
    amount: money("amount").notNull(),
    paymentType: paymentType("payment_type").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    check("purchase_extras_amount_check", sql`${table.amount} > 0`),
    index("purchase_extras_purchase_id_idx").on(table.purchaseId),
    index("purchase_extras_extra_cost_type_id_idx").on(table.extraCostTypeId),
  ],
);

// The receipt files of a trip (07 Purchase record: Receipt). A file has one holder (the file
// contract of src/server/files/owners.ts), so `file_id` is unique.
export const tripFiles = pgTable(
  "trip_files",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => purchaseTrips.id),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    primaryKey({ name: "trip_files_pkey", columns: [table.tripId, table.fileId] }),
    unique("trip_files_file_id_key").on(table.fileId),
  ],
);
