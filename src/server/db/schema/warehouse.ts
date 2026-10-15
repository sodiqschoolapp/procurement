import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { productVariants } from "./catalogs";
import { branches } from "./organisation";

// The "Warehouse" group of docs/spec/14-data-model.md. Task 2.4 makes `stock_balances` empty, so
// the "In stock" column of an order (05-order-request-form.md, field 4) has its source; 3.1 brings
// the ledger that fills it and `avg_cost`, whose type is decided with the average formula (plan of
// 2.4, decision 7, Look first). Stock is never below 0 (developer-rules.md rule 5).

const moment = (name: string) => timestamp(name, { withTimezone: true });

export const stockBalances = pgTable(
  "stock_balances",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull().default("0"),
    createdAt: moment("created_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ name: "stock_balances_pkey", columns: [table.branchId, table.variantId] }),
    check("stock_balances_qty_check", sql`${table.qty} >= 0`),
    index("stock_balances_variant_id_idx").on(table.variantId),
  ],
);
