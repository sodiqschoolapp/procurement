import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { MoneyRowKind } from "@/domain/money-ledger";
import { db } from "@/server/db/client";

// Money rows written straight into the tables, for constraint tests that need a real action or
// row (D39): no action writes money before 4.2.

const AT = "2031-05-02T05:00:00Z";

export type MoneyActionRow = {
  managerId: string;
  createdBy: string;
  clientKey?: string;
  fileId?: string | null;
  documentNo?: string | null;
  comment?: string | null;
};

export function insertMoneyAction(row: MoneyActionRow) {
  return db.execute<{ id: string }>(sql`
    insert into money_actions (client_key, manager_id, occurred_on, document_no, file_id, comment,
      created_by, created_at)
    values (${row.clientKey ?? randomUUID()}, ${row.managerId}, '2031-05-02',
      ${row.documentNo ?? null}, ${row.fileId ?? null}, ${row.comment ?? null}, ${row.createdBy},
      ${AT})
    returning id`);
}

export function insertMoneyRow(row: {
  moneyActionId: string;
  orderId: string;
  kind?: MoneyRowKind | string;
  amount?: string;
}) {
  return db.execute<{ id: string }>(sql`
    insert into money_rows (money_action_id, order_id, kind, amount, created_at)
    values (${row.moneyActionId}, ${row.orderId}, ${row.kind ?? "CASH_GIVEN"},
      ${row.amount ?? "50000"}, ${AT})
    returning id`);
}
