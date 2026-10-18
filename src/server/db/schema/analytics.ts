import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
  uuid,
} from "drizzle-orm/pg-core";

import { categories, companies, departments, productVariants } from "./catalogs";
import { orderEventType, orders, paymentType, requestStatus } from "./orders";
import { branches } from "./organisation";
import { purchases } from "./purchasing";
import { users } from "./users";
import { stockBalances, stockDocuments, stockMovementType, stockMovements } from "./warehouse";

// The analytics summary tables (10-notifications-analytics-reports.md, Analytics page per role,
// point 5; developer-rules.md rule 12). Task 6.3. Each is a plain table that the scheduler job
// `analytics_refresh` (src/server/jobs/analytics-refresh.ts) rewrites every 5 minutes, its amounts
// from the domain functions, not a materialized view: a view is SQL and would write the formula a
// second time (plan of 6.3, decided item 1, Look first). The rows are derived and written by that
// job only; the pages sum them and never read raw rows.

const som = (name: string) => bigint(name, { mode: "bigint" });
const moment = (name: string) => timestamp(name, { withTimezone: true });
const quantity = (name: string) => numeric(name, { precision: 14, scale: 3 });

// One row per purchase record that is not cancelled: its Actual total, `actualTotal()` of the one
// record (08: each record rounded on its own, so the rows add up to the total of any set). The
// category is the record's own subtype's (07 Substitution); department and owner the order's;
// supplier the trip's (decided item 5, Look first). No payment type: an extra cost has its own
// (review of the plan, correction 1). Task 6.4b adds what the Prices block reads (plan of 6.4b,
// decided items 1 and 13, Look first): the subtype the record bought (07 Substitution), its
// quantity and unit price, its goods `actualGoods()` of the one record (so a price is
// `unitPriceOf(Σ goods, Σ qty)`, no division in SQL), and its entry time for the tie-break of
// decided item 4.
export const analyticsSpending = pgTable(
  "analytics_spending",
  {
    purchaseId: uuid("purchase_id")
      .primaryKey()
      .references(() => purchases.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    purchasedOn: date("purchased_on").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    supplierId: uuid("supplier_id").references(() => companies.id),
    amount: som("amount").notNull(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: quantity("qty").notNull(),
    unitPrice: som("unit_price").notNull(),
    goods: som("goods").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    check("analytics_spending_amount_check", sql`${table.amount} >= 0`),
    check("analytics_spending_qty_check", sql`${table.qty} > 0`),
    check("analytics_spending_unit_price_check", sql`${table.unitPrice} >= 0`),
    check("analytics_spending_goods_check", sql`${table.goods} >= 0`),
    index("analytics_spending_variant_id_purchased_on_idx").on(table.variantId, table.purchasedOn),
    index("analytics_spending_branch_id_purchased_on_idx").on(table.branchId, table.purchasedOn),
    index("analytics_spending_order_id_idx").on(table.orderId),
    index("analytics_spending_category_id_idx").on(table.categoryId),
    index("analytics_spending_department_id_idx").on(table.departmentId),
    index("analytics_spending_owner_id_idx").on(table.ownerId),
    index("analytics_spending_supplier_id_idx").on(table.supplierId),
  ],
);

// The parts of each `analytics_spending` row by payment type (10 Analytics, Head, Spending: "split
// by payment type"; plan of 6.4, decided item 2, Look first): `paymentParts()` of
// src/domain/purchases.ts, the goods to the trip's type, each extra cost to its own. A record's
// parts add up to its amount; a gift with no extra has none (decided item 13). Task 6.4a.
export const analyticsSpendingPayments = pgTable(
  "analytics_spending_payments",
  {
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => analyticsSpending.purchaseId),
    paymentType: paymentType("payment_type").notNull(),
    amount: som("amount").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.purchaseId, table.paymentType] }),
    check("analytics_spending_payments_amount_check", sql`${table.amount} > 0`),
    index("analytics_spending_payments_payment_type_idx").on(table.paymentType),
  ],
);

/** The Total colours of 08, as `Colour` of src/domain/colours.ts names them. */
export const outcomeColour = pgEnum("outcome_colour", ["green", "amber", "red"]);

// One row per order whose buying ended Done or Done short, from Open on (10 Analytics, Head, Plan
// vs actual; plan of 6.4, decided items 3 to 6, Look first): `orderOutcome()` of
// src/domain/colours.ts. `ended_on` is the Tashkent date of its newest buying event (decided item
// 5); the category is the planned subtype's, department and owner the order's (decided item 6).
// Task 6.4a.
export const analyticsOutcomes = pgTable(
  "analytics_outcomes",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    endedOn: date("ended_on").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    colour: outcomeColour("colour").notNull(),
    planned: som("planned").notNull(),
    actual: som("actual").notNull(),
    difference: som("difference").notNull(),
  },
  (table) => [
    check("analytics_outcomes_planned_check", sql`${table.planned} >= 0`),
    check("analytics_outcomes_actual_check", sql`${table.actual} >= 0`),
    check(
      "analytics_outcomes_difference_check",
      sql`${table.difference} = ${table.planned} - ${table.actual}`,
    ),
    check(
      "analytics_outcomes_colour_check",
      sql`(${table.colour} = 'green') = (${table.difference} = 0)
          AND (${table.colour} = 'amber') = (${table.difference} > 0)
          AND (${table.colour} = 'red') = (${table.difference} < 0)`,
    ),
    index("analytics_outcomes_branch_id_ended_on_idx").on(table.branchId, table.endedOn),
    index("analytics_outcomes_category_id_idx").on(table.categoryId),
    index("analytics_outcomes_department_id_idx").on(table.departmentId),
    index("analytics_outcomes_owner_id_idx").on(table.ownerId),
  ],
);

// One row per stay of an order at an approval step (10 Analytics, Head, Approval speed; plan of
// 6.4b, decided items 6 to 10, Look first): `approvalStays()` of src/domain/approval-stays.ts. A
// decided stay has its end, its whole seconds and the decision of the step's approver; a send
// back or a reject also its reason and `reasonKey()`. An open stay (the order waits there now)
// has none of them: "waiting now" reads its `entered_at` with the clock (review of the plan of
// 6.4b, Must fix 3). The draft wall reads the order's live status, not a copy here (Must fix 4;
// stepsWhere()); the category is the planned subtype's, department and owner the order's (decided
// item 11). Task 6.4b.
export const analyticsSteps = pgTable(
  "analytics_steps",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    step: requestStatus("step").notNull(),
    enteredAt: moment("entered_at").notNull(),
    leftAt: moment("left_at"),
    leftOn: date("left_on"),
    seconds: bigint("seconds", { mode: "bigint" }),
    decision: orderEventType("decision"),
    reason: text("reason"),
    reasonKey: text("reason_key"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.step, table.enteredAt] }),
    check(
      "analytics_steps_step_check",
      sql`${table.step} IN ('PENDING_HEAD', 'PENDING_PRINCIPAL', 'PENDING_FINANCE')`,
    ),
    check(
      "analytics_steps_decision_check",
      sql`${table.decision} IS NULL OR ${table.decision} IN ('APPROVE', 'SEND_BACK', 'REJECT')`,
    ),
    check(
      "analytics_steps_left_check",
      sql`(${table.leftAt} IS NULL AND ${table.leftOn} IS NULL AND ${table.seconds} IS NULL AND ${table.decision} IS NULL)
          OR (${table.leftAt} IS NOT NULL AND ${table.leftOn} IS NOT NULL AND ${table.seconds} IS NOT NULL AND ${table.decision} IS NOT NULL
              AND ${table.leftAt} >= ${table.enteredAt} AND ${table.seconds} >= 0)`,
    ),
    check(
      "analytics_steps_reason_check",
      sql`CASE WHEN ${table.decision} IN ('SEND_BACK', 'REJECT')
        THEN ${table.reason} IS NOT NULL AND ${table.reasonKey} IS NOT NULL
        ELSE ${table.reason} IS NULL AND ${table.reasonKey} IS NULL
      END`,
    ),
    index("analytics_steps_branch_id_left_on_idx").on(table.branchId, table.leftOn),
    index("analytics_steps_open_idx")
      .on(table.branchId, table.step)
      .where(sql`${table.leftAt} IS NULL`),
    index("analytics_steps_category_id_idx").on(table.categoryId),
    index("analytics_steps_department_id_idx").on(table.departmentId),
    index("analytics_steps_owner_id_idx").on(table.ownerId),
    index("analytics_steps_decision_reason_key_idx").on(table.decision, table.reasonKey),
  ],
);

// One row per cancelled purchase record (10 Analytics, Head, Managers: "cancelled purchase
// records"; plan of 6.4c, decided item 5, Look first): `cancelled_on` the Tashkent date of its
// cancel; category the bought subtype's, department and owner the order's, supplier the trip's,
// as `analytics_spending`. `amount` is the record's total as it was entered, `actualTotal()` of
// the record read as live (`actualTotal()` leaves cancelled records out; review of the plan, Must
// fix 1); the list shows it, the block counts. Task 6.4c.
export const analyticsCancelled = pgTable(
  "analytics_cancelled",
  {
    purchaseId: uuid("purchase_id")
      .primaryKey()
      .references(() => purchases.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    cancelledOn: date("cancelled_on").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    supplierId: uuid("supplier_id").references(() => companies.id),
    amount: som("amount").notNull(),
  },
  (table) => [
    // The branch the wall filters on is the order's (permission review of 6.4c, Should fix 3).
    foreignKey({
      name: "analytics_cancelled_order_branch_fk",
      columns: [table.orderId, table.branchId],
      foreignColumns: [orders.id, orders.branchId],
    }),
    check("analytics_cancelled_amount_check", sql`${table.amount} >= 0`),
    index("analytics_cancelled_branch_id_cancelled_on_idx").on(table.branchId, table.cancelledOn),
    index("analytics_cancelled_order_id_idx").on(table.orderId),
    index("analytics_cancelled_category_id_idx").on(table.categoryId),
    index("analytics_cancelled_department_id_idx").on(table.departmentId),
    index("analytics_cancelled_owner_id_idx").on(table.ownerId),
    index("analytics_cancelled_supplier_id_idx").on(table.supplierId),
  ],
);

// One row per order whose cash count is not 0 (10 Analytics, Head, Managers: "cash held and for
// how long"; 08 Money ledger, Order's cash count; plan of 6.4c, decided items 4 and 8, Look
// first): `orderCashCount()` and `cashSince()` of src/domain/money-ledger.ts, of the orders that
// are neither Draft nor Closed, as Money with managers reads them (review of the plan, correction
// 3). No status: the queries join `orders` for the live one. Category the planned subtype's,
// department and owner the order's, as `analytics_outcomes`. Task 6.4c.
export const analyticsCash = pgTable(
  "analytics_cash",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    cashCount: som("cash_count").notNull(),
    since: date("since").notNull(),
  },
  (table) => [
    foreignKey({
      name: "analytics_cash_order_branch_fk",
      columns: [table.orderId, table.branchId],
      foreignColumns: [orders.id, orders.branchId],
    }),
    check("analytics_cash_cash_count_check", sql`${table.cashCount} <> 0`),
    index("analytics_cash_branch_id_idx").on(table.branchId),
    index("analytics_cash_owner_id_idx").on(table.ownerId),
    index("analytics_cash_category_id_idx").on(table.categoryId),
    index("analytics_cash_department_id_idx").on(table.departmentId),
  ],
);

// One row per stock line of a product, `stock_balances` copied with what the Warehouse block reads
// (10 Analytics, Head, Warehouse: "stock value per branch; low-stock items; items with no movement
// for 90 days"; plan of 6.4d, decided items 1, 3 and 7, Look first): `value` is `stockValue()` of
// src/domain/stock.ts, `low` is `isLow()` against `min_qty` (null: no minimum), `last_moved_on`
// the Tashkent date of the newest movement of the subtype in the branch (null: none). Numbers of
// now: no dates. Category the product's. Task 6.4d.
export const analyticsStock = pgTable(
  "analytics_stock",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    qty: quantity("qty").notNull(),
    avgCost: som("avg_cost").notNull(),
    value: som("value").notNull(),
    minQty: quantity("min_qty"),
    low: boolean("low").notNull(),
    lastMovedOn: date("last_moved_on"),
  },
  (table) => [
    primaryKey({ name: "analytics_stock_pkey", columns: [table.branchId, table.variantId] }),
    foreignKey({
      name: "analytics_stock_balance_fk",
      columns: [table.branchId, table.variantId],
      foreignColumns: [stockBalances.branchId, stockBalances.variantId],
    }),
    check("analytics_stock_qty_check", sql`${table.qty} >= 0`),
    check("analytics_stock_avg_cost_check", sql`${table.avgCost} >= 0`),
    check("analytics_stock_value_check", sql`${table.value} >= 0`),
    check("analytics_stock_min_qty_check", sql`${table.minQty} > 0`),
    index("analytics_stock_variant_id_idx").on(table.variantId),
    index("analytics_stock_category_id_idx").on(table.categoryId),
  ],
);

// One row per ISSUE, RETURN or WRITE_OFF movement of a warehouse document that is not Reversed
// (10 Analytics, Head, Warehouse: "use by department; value written off"; plan of 6.4d, decided
// items 4 and 5, Look first): `moved_on` the document's date, `qty` the movement's size and
// `value` `stockValue(qty, unit_cost)` of the movement, at the cost it moved at (09 Stock value).
// Department the document's (none for a write-off), category the product's. The branch the wall
// filters on is the document's (as 6.4c's order key). Task 6.4d.
export const analyticsStockMoves = pgTable(
  "analytics_stock_moves",
  {
    movementId: uuid("movement_id")
      .primaryKey()
      .references(() => stockMovements.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => stockDocuments.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    departmentId: uuid("department_id").references(() => departments.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    type: stockMovementType("type").notNull(),
    movedOn: date("moved_on").notNull(),
    qty: quantity("qty").notNull(),
    value: som("value").notNull(),
  },
  (table) => [
    foreignKey({
      name: "analytics_stock_moves_document_branch_fk",
      columns: [table.documentId, table.branchId],
      foreignColumns: [stockDocuments.id, stockDocuments.branchId],
    }),
    check(
      "analytics_stock_moves_type_check",
      sql`${table.type} IN ('ISSUE', 'RETURN', 'WRITE_OFF')`,
    ),
    check(
      "analytics_stock_moves_department_check",
      sql`(${table.type} IN ('ISSUE', 'RETURN')) = (${table.departmentId} IS NOT NULL)`,
    ),
    check("analytics_stock_moves_qty_check", sql`${table.qty} > 0`),
    check("analytics_stock_moves_value_check", sql`${table.value} >= 0`),
    index("analytics_stock_moves_branch_id_moved_on_idx").on(table.branchId, table.movedOn),
    index("analytics_stock_moves_document_id_idx").on(table.documentId),
    index("analytics_stock_moves_department_id_idx").on(table.departmentId),
    index("analytics_stock_moves_category_id_idx").on(table.categoryId),
    index("analytics_stock_moves_variant_id_idx").on(table.variantId),
  ],
);
