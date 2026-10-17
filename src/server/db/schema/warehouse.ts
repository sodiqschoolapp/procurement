import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { MOVEMENT_TYPES } from "@/domain/stock";

import { productVariants } from "./catalogs";
import { branches } from "./organisation";
import { purchases } from "./purchasing";
import { users } from "./users";

// The "Warehouse" group of docs/spec/14-data-model.md. Task 2.4 makes `stock_balances` empty, so
// the "In stock" column of an order (05-order-request-form.md, field 4) has its source; 3.1 brings
// the ledger that fills it and `avg_cost`, whose type is decided with the average formula (plan of
// 2.4, decision 7, Look first). Stock is never below 0 (developer-rules.md rule 5). Task 3.1 adds
// `avg_cost` (whole so'm, plan of 3.1, decided item 1) and `stock_movements`, written only by
// postMovement() of src/server/stock-ledger.ts; migration 0023 adds by hand the append-only
// triggers of stock_movements (developer-rules.md rule 7).

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
    // The key of `purchase_id` is below (3.2); that of `document_line_id` comes with 5.1.
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
    index("stock_movements_reverses_movement_id_idx").on(table.reversesMovementId),
    // A purchase's receipt or reversal moves the subtype bought in the trip's branch (07, What
    // saving a record does, 2; plan of 3.2, decided item 2, Look first).
    foreignKey({
      name: "stock_movements_purchase_fk",
      columns: [table.purchaseId, table.branchId, table.variantId],
      foreignColumns: [purchases.id, purchases.branchId, purchases.variantId],
    }),
    index("stock_movements_purchase_id_idx").on(table.purchaseId),
  ],
);
