import { sql } from "drizzle-orm";
import { bigint, check, date, index, pgTable, uuid } from "drizzle-orm/pg-core";

import { categories, companies, departments } from "./catalogs";
import { orders } from "./orders";
import { branches } from "./organisation";
import { purchases } from "./purchasing";
import { users } from "./users";

// The analytics summary tables (10-notifications-analytics-reports.md, Analytics page per role,
// point 5; developer-rules.md rule 12). Task 6.3. Each is a plain table that the scheduler job
// `analytics_refresh` (src/server/jobs/analytics-refresh.ts) rewrites every 5 minutes, its amounts
// from the domain functions, not a materialized view: a view is SQL and would write the formula a
// second time (plan of 6.3, decided item 1, Look first). The rows are derived and written by that
// job only; the pages sum them and never read raw rows.

const som = (name: string) => bigint(name, { mode: "bigint" });

// One row per purchase record that is not cancelled: its Actual total, `actualTotal()` of the one
// record (08: each record rounded on its own, so the rows add up to the total of any set). The
// category is the record's own subtype's (07 Substitution); department and owner the order's;
// supplier the trip's (decided item 5, Look first). No payment type: an extra cost has its own
// (review of the plan, correction 1).
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
  },
  (table) => [
    check("analytics_spending_amount_check", sql`${table.amount} >= 0`),
    index("analytics_spending_branch_id_purchased_on_idx").on(table.branchId, table.purchasedOn),
    index("analytics_spending_order_id_idx").on(table.orderId),
    index("analytics_spending_category_id_idx").on(table.categoryId),
    index("analytics_spending_department_id_idx").on(table.departmentId),
    index("analytics_spending_owner_id_idx").on(table.ownerId),
    index("analytics_spending_supplier_id_idx").on(table.supplierId),
  ],
);
