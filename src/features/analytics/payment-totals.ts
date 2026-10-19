import { type SQL, sql } from "drizzle-orm";

import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import type { Executor } from "@/server/authorize";

import { type Counted, counted } from "./counted";

// Spending split by payment type, read one way by the Head's Spending block (build-plan 6.4a) and
// Finance's Payments block (build-plan 6.6b; plan of 6.6b, decided item 1, Look first): the parts
// of `analytics_spending_payments`, `paymentParts()` of each record (plan of 6.4, decided item 2,
// Look first), summed under the caller's spendingWhere() of the period and of the period before.

export type PaymentTotal = Counted & { payment: PaymentType };

/** In the order of PAYMENT_TYPES, each type with spending in either period. */
export async function paymentTotals(
  db: Executor,
  now: SQL,
  then: SQL,
): Promise<PaymentTotal[]> {
  const payments = await db.execute<{ payment_type: PaymentType; now: string; before: string }>(sql`
    select pp.payment_type,
           coalesce(sum(pp.amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(pp.amount) filter (where ${then}), 0)::text as before
    from analytics_spending
    join analytics_spending_payments pp on pp.purchase_id = analytics_spending.purchase_id
    where (${now}) or (${then})
    group by pp.payment_type`);
  const byType = new Map(payments.rows.map((row) => [row.payment_type, row]));
  return PAYMENT_TYPES.flatMap((payment) => {
    const row = byType.get(payment);
    return row ? [{ payment, ...counted(row.now, row.before) }] : [];
  });
}
