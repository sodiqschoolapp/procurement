import { sql } from "drizzle-orm";

import { type Change, type Period, changeAgainst } from "@/domain/analytics";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { type PaymentTotal, paymentTotals } from "../payment-totals";
import { resolvePeriod } from "../resolve-period";
import { spendingWhere } from "../spending-where";
import { type Counted, counted } from "../counted";

// The spending numbers of Finance's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Finance: Payments, "Spending by payment type; bank transfers by
// supplier", and Plan vs actual, "purchases without a receipt"; build-plan 6.6b). One query for
// the three, as they read one table under one condition (spec review of the plan, Should fix 5):
// `analytics_spending` under spendingWhere(), the condition the drill-down and export share.
// - By payment type: paymentTotals(), the Head's split read the same way (plan of 6.6b, decided
//   item 1, Look first).
// - Bank transfers by supplier: the Bank transfer parts of the records by the trip's supplier,
//   every supplier with some in either period, largest first, then the records with no supplier
//   (decided item 1; the plan review's worked example: the rows add up to the Bank transfer slice).
// - Without a receipt: the records whose trip has no receipt file, `has_receipt` false (decided
//   item 4), counted with their actual total.
// Every number with its change against the period before (10 point 1; review of the plan,
// correction 1). Under `data.view`, the branch wall in the SQL, in one snapshot.

export type Supplier = Counted & { id: string; name: string; isActive: boolean };

export type FinanceSpending = {
  period: Period;
  before: Period;
  /** The period's spending: the whole the payment types share. */
  total: Counted;
  payments: PaymentTotal[];
  /** The Bank transfer slice: the suppliers and `noSupplier` add up to it. */
  transfers: {
    total: Counted;
    suppliers: Supplier[];
    /** The transfer parts of records with no supplier; `null` when none in either period. */
    noSupplier: Counted | null;
  };
  /** Records without a receipt: their count (a change in records) and their actual total. */
  noReceipt: Counted & { count: number; countChange: Change };
};

export async function getFinanceSpending(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<FinanceSpending> {
  return readSnapshot((db) => financeSpendingIn(db, userId, input, filters));
}

async function financeSpendingIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<FinanceSpending> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const now = spendingWhere(actor, period, filters);
  const then = spendingWhere(actor, before, filters);

  const totals = await db.execute<{
    now: string;
    before: string;
    receiptless_now: string;
    receiptless_before: string;
    receiptless_count_now: string;
    receiptless_count_before: string;
  }>(sql`
    select coalesce(sum(amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(amount) filter (where ${then}), 0)::text as before,
           coalesce(sum(amount) filter (where (${now}) and not has_receipt), 0)::text
             as receiptless_now,
           coalesce(sum(amount) filter (where (${then}) and not has_receipt), 0)::text
             as receiptless_before,
           count(*) filter (where (${now}) and not has_receipt)::text as receiptless_count_now,
           count(*) filter (where (${then}) and not has_receipt)::text as receiptless_count_before
    from analytics_spending
    where (${now}) or (${then})`);
  const payments = await paymentTotals(db, now, then);
  const transfers = await db.execute<{
    id: string | null;
    name: string | null;
    is_active: boolean | null;
    now: string;
    before: string;
  }>(sql`
    select co.id, co.name, co.is_active,
           coalesce(sum(pp.amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(pp.amount) filter (where ${then}), 0)::text as before
    from analytics_spending
    join analytics_spending_payments pp
      on pp.purchase_id = analytics_spending.purchase_id and pp.payment_type = 'TRANSFER'
    left join companies co on co.id = analytics_spending.supplier_id
    where (${now}) or (${then})
    group by co.id
    order by co.id is null, sum(pp.amount) filter (where ${now}) desc nulls last, co.name, co.id`);

  const row = totals.rows[0]!;
  const transfer = payments.find((each) => each.payment === "TRANSFER");
  const none = transfers.rows.find((each) => each.id === null);
  return {
    period,
    before,
    total: counted(row.now, row.before),
    payments,
    transfers: {
      total: transfer ?? counted("0", "0"),
      suppliers: transfers.rows.flatMap((each) =>
        each.id === null
          ? []
          : [
              {
                id: each.id,
                name: each.name!,
                isActive: each.is_active!,
                ...counted(each.now, each.before),
              },
            ],
      ),
      noSupplier: none ? counted(none.now, none.before) : null,
    },
    noReceipt: {
      ...counted(row.receiptless_now, row.receiptless_before),
      count: Number(row.receiptless_count_now),
      countChange: changeAgainst(
        BigInt(row.receiptless_count_now),
        BigInt(row.receiptless_count_before),
      ),
    },
  };
}
