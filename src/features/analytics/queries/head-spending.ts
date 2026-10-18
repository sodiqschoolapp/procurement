import { type SQL, sql } from "drizzle-orm";

import type { Period } from "@/domain/analytics";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, type PeriodInput, TOP_SUPPLIERS } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { resolvePeriod } from "../resolve-period";
import { spendingWhere } from "../spending-where";
import { type Counted, counted } from "../counted";

// The parts of the Head's Spending block beyond 6.3's months and categories
// (10-notifications-analytics-reports.md, Analytics page per role, Head: "branches side by side;
// by department; top 10 suppliers; split by payment type"; build-plan 6.4a). Read from the summary
// tables under spendingWhere(), the one condition of a number, its list and its export (6.3);
// every row with its change against the same key in the period before (10 point 1; plan of 6.3,
// decided item 6). Payment types sum the parts of `analytics_spending_payments` (plan of 6.4,
// decided item 2, Look first). Under `data.view`, the branch wall in the SQL, in one snapshot.

export type Named = Counted & { id: string; name: string; isActive: boolean };

export type HeadSpending = {
  period: Period;
  before: Period;
  /** The period's spending, read in the same snapshot: the total line of the exports. */
  total: Counted;
  /** Every branch of the user with spending in either period (decided item 11). */
  branches: Named[];
  departments: (Named & { branchName: string })[];
  /** The 10 suppliers with the most spending in the period; records without one are left out. */
  suppliers: Named[];
  /** In the order of PAYMENT_TYPES, each type with spending in either period. */
  payments: (Counted & { payment: PaymentType })[];
};

export async function getHeadSpending(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<HeadSpending> {
  return readSnapshot((db) => headSpendingIn(db, userId, input, filters));
}

type GroupRow = { id: string; name: string; is_active: boolean; now: string; before: string };

async function headSpendingIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<HeadSpending> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const now = spendingWhere(actor, period, filters);
  const then = spendingWhere(actor, before, filters);

  // One breakdown: the sum of the period and of the period before per key, largest first.
  const grouped = (table: SQL, column: SQL, limit = sql``) =>
    db.execute<GroupRow & { branch_name?: string }>(sql`
      select k.id, k.name, k.is_active,
             coalesce(sum(analytics_spending.amount) filter (where ${now}), 0)::text as now,
             coalesce(sum(analytics_spending.amount) filter (where ${then}), 0)::text as before
      from analytics_spending
      join ${table} k on k.id = ${column}
      where (${now}) or (${then})
      group by k.id
      order by sum(analytics_spending.amount) filter (where ${now}) desc nulls last, k.name, k.id
      ${limit}`);

  const totals = await db.execute<{ now: string; before: string }>(sql`
    select coalesce(sum(amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(amount) filter (where ${then}), 0)::text as before
    from analytics_spending`);
  const branches = await grouped(sql`branches`, sql`analytics_spending.branch_id`);
  const departments = await db.execute<GroupRow & { branch_name: string }>(sql`
    select k.id, k.name, k.is_active, b.name as branch_name,
           coalesce(sum(analytics_spending.amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(analytics_spending.amount) filter (where ${then}), 0)::text as before
    from analytics_spending
    join departments k on k.id = analytics_spending.department_id
    join branches b on b.id = k.branch_id
    where (${now}) or (${then})
    group by k.id, b.id
    order by sum(analytics_spending.amount) filter (where ${now}) desc nulls last, k.name, k.id`);
  const suppliers = await grouped(
    sql`companies`,
    sql`analytics_spending.supplier_id`,
    sql`limit ${TOP_SUPPLIERS}`,
  );
  const payments = await db.execute<{ payment_type: PaymentType; now: string; before: string }>(sql`
    select pp.payment_type,
           coalesce(sum(pp.amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(pp.amount) filter (where ${then}), 0)::text as before
    from analytics_spending
    join analytics_spending_payments pp on pp.purchase_id = analytics_spending.purchase_id
    where (${now}) or (${then})
    group by pp.payment_type`);
  const byType = new Map(payments.rows.map((row) => [row.payment_type, row]));

  const named = (row: GroupRow): Named => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    ...counted(row.now, row.before),
  });
  return {
    period,
    before,
    total: counted(totals.rows[0]!.now, totals.rows[0]!.before),
    branches: branches.rows.map(named),
    departments: departments.rows.map((row) => ({ ...named(row), branchName: row.branch_name })),
    // A supplier with spending only in the period before is no top supplier of this one.
    suppliers: suppliers.rows.map(named).filter((row) => row.amount > 0n),
    payments: PAYMENT_TYPES.flatMap((payment) => {
      const row = byType.get(payment);
      return row ? [{ payment, ...counted(row.now, row.before) }] : [];
    }),
  };
}
