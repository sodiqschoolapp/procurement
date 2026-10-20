import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

// edge-cases/developer-rules.md rule 12: "Every foreign key and filter column has an index"
// (plan of 9.2, What will exist 6; decided item 3, Look first). The foreign keys are read from the
// schema itself. The filter columns are listed here: every column a list's or a page's `where` or
// `order by` reads (src/features/*/queries, the page loaders, the jobs). One without `via` needs an
// index led by it; one with `via` is read only through the key that index leads with (the rows of
// one order, one user, one branch), and the reason is that key.

type FilterColumn = { table: string; column: string; via?: string };

const own = (table: string, ...columns: string[]): FilterColumn[] =>
  columns.map((column) => ({ table, column }));
const through = (table: string, via: string, ...columns: string[]): FilterColumn[] =>
  columns.map((column) => ({ table, column, via }));

export const FILTER_COLUMNS: FilterColumn[] = [
  // Orders and their history: the list filters inside the branch wall, the rest per order.
  ...own("orders", "branch_id", "owner_id", "variant_id", "department_id", "submitted_at"),
  ...through(
    "orders",
    "orders_branch_id_status_idx",
    "status",
    "payment_type",
    "priority",
    "progress",
  ),
  ...through("orders", "orders_branch_id_needed_by_idx", "needed_by"),
  ...through("orders", "orders_owner_id_idx", "created_at"),
  ...own("order_events", "order_id", "action_id", "actor_id"),
  ...through("order_events", "order_events_order_id_idx", "type", "from_status", "created_at"),
  ...through("order_extras", "order_extras_order_id_idx", "created_at"),
  ...through("order_revisions", "order_revisions_order_id_revision_submission_key", "revision"),
  ...own("order_settlements", "order_id"),
  // Purchasing and money: per order, trip, action or Manager.
  ...own("purchases", "order_id", "trip_id", "branch_id", "variant_id"),
  ...through("purchases", "purchases_order_id_branch_id_idx", "is_cancelled", "created_at", "qty"),
  ...own("purchase_trips", "branch_id"),
  ...own("purchase_extras", "purchase_id"),
  ...through("trip_files", "trip_files_pkey", "created_at"),
  ...own("money_actions", "manager_id", "order_action_id"),
  ...own("money_rows", "money_action_id", "order_id"),
  ...through("money_rows", "money_rows_order_id_idx", "kind"),
  ...own("price_history", "variant_id"),
  // Warehouse: per branch and subtype, per document.
  ...through("stock_balances", "stock_balances_pkey", "branch_id", "qty"),
  ...own("stock_balances", "variant_id"),
  ...own("stock_movements", "variant_id", "purchase_id", "document_line_id"),
  ...through("stock_movements", "stock_movements_branch_variant_seq_idx", "branch_id", "type"),
  ...own("stock_documents", "type", "status", "department_id"),
  ...through("stock_documents", "stock_documents_branch_id_doc_date_idx", "branch_id", "doc_date"),
  ...through("stock_documents", "stock_documents_branch_id_created_at_idx", "created_at"),
  ...own("stock_document_lines", "document_id"),
  ...through("stock_minimums", "stock_minimums_pkey", "branch_id"),
  ...own("stock_minimums", "variant_id"),
  // People, notifications, audit, sign-in.
  ...own("notifications", "user_id"),
  ...through(
    "notifications",
    "notifications_user_id_created_at_idx",
    "created_at",
    "type",
    "link",
    "read_at",
  ),
  ...own("audit_log", "entity", "actor_id"),
  ...through(
    "audit_log",
    "audit_log_entity_entity_id_created_at_idx",
    "entity_id",
    "action",
    "created_at",
  ),
  ...own("users", "full_name"),
  ...through("users", "users_id_role_is_active_key", "role", "is_active"),
  ...own("user_branches", "branch_id"),
  ...through(
    "user_branches",
    "user_branches_user_id_user_role_user_is_active_idx",
    "user_id",
    "user_role",
    "user_is_active",
  ),
  ...through("manager_rights", "manager_rights_pkey", "user_id", "right", "enabled"),
  ...through("sessions", "sessions_token_key", "token", "expires_at"),
  ...own("sessions", "user_id"),
  // Catalogs: each list is ordered by name, filtered by active, its kind or its parent.
  ...own("branches", "name"),
  ...own("units", "name", "is_active"),
  ...own("categories", "name", "is_active"),
  ...own("extra_cost_types", "name", "is_active"),
  ...own("companies", "name"),
  ...through("companies", "companies_is_active_kind_idx", "is_active", "kind"),
  ...own("products", "name", "category_id", "is_active", "type"),
  ...own("product_variants", "product_id"),
  ...through(
    "product_variants",
    "product_variants_product_id_idx",
    "name",
    "is_default",
    "is_active",
  ),
  ...own("departments", "is_active"),
  // Searched by part of the text, which no btree serves: the list is one branch's.
  ...through(
    "departments",
    "departments_branch_name_key",
    "branch_id",
    "name",
    "responsible_name",
    "responsible_phone",
  ),
  ...own("catalog_suggestions", "branch_id", "status"),
  ...through("catalog_suggestions", "catalog_suggestions_branch_status_idx", "created_at"),
  ...through("number_counters", "number_counters_pkey", "year"),
  // The summary tables: every page reads them inside the branch wall, by its date.
  ...through(
    "analytics_orders",
    "analytics_orders_branch_id_submitted_on_idx",
    "submitted_on",
    "status",
    "opened_on",
  ),
  ...through("analytics_orders", "analytics_orders_branch_id_needed_by_idx", "needed_by"),
  ...through("analytics_money", "analytics_money_branch_id_occurred_on_idx", "occurred_on", "kind"),
  ...through(
    "analytics_cancelled",
    "analytics_cancelled_branch_id_cancelled_on_idx",
    "cancelled_on",
  ),
  ...through("analytics_settlements", "analytics_settlements_branch_id_closed_on_idx", "closed_on"),
  ...through("analytics_stock_moves", "analytics_stock_moves_branch_id_moved_on_idx", "moved_on"),
  ...through("analytics_stock", "analytics_stock_pkey", "branch_id", "low"),
];

describe("indexes (developer-rules.md rule 12)", () => {
  it("every foreign key has an index led by exactly its columns, or a unique index inside them", async () => {
    const missing = await db.execute<{ key: string }>(sql`
      select c.conrelid::regclass || '.' || c.conname as key
      from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i where i.indrelid = c.conrelid and (
            ((i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
              and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey)
            or (i.indisunique and i.indpred is null and 0 <> all(i.indkey::int2[])
              and c.conkey @> (i.indkey::int2[])[0:i.indnkeyatts - 1])))
      order by 1`);
    expect(missing.rows.map((row) => row.key)).toEqual([]);
  });

  it("every filter column has an index led by it, or the index of the key it is read through", async () => {
    const found = await db.execute<{ table: string; index: string; columns: string[] }>(sql`
      select t.relname as table, x.relname as index,
        array(select coalesce(a.attname::text, '(expression)') from unnest(i.indkey::int2[]) with ordinality k(n, o)
          left join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n order by k.o) as columns
      from pg_index i join pg_class t on t.oid = i.indrelid join pg_class x on x.oid = i.indexrelid
      where t.relnamespace = 'public'::regnamespace`);
    const problems: string[] = [];
    for (const { table, column, via } of FILTER_COLUMNS) {
      const indexes = found.rows.filter((row) => row.table === table);
      const exists = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and table_name = ${table} and column_name = ${column}`);
      if (exists.rows[0]!.n !== 1) {
        problems.push(`${table}.${column} is no column`);
      } else if (via === undefined) {
        if (!indexes.some((row) => row.columns[0] === column)) problems.push(`${table}.${column}`);
      } else if (!indexes.some((row) => row.index === via)) {
        problems.push(`${table}.${column}: no index ${via}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
