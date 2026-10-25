import { sql } from "drizzle-orm";
import * as z from "zod";

import {
  type ManagerBlock,
  type ManagerOrder,
  cashSince,
  managerBalances,
  orderCashCount,
} from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import {
  AuthorizationError,
  type Executor,
  authorize,
  authorizeList,
  branchFilter,
} from "@/server/authorize";
import { orders } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { datedCashRecordsOf } from "@/features/purchasing/order-records";

import { datedMoneyRowsOf } from "../money-rows";

// The page Money with managers (08-money-and-settlement.md, Money with managers; 11-screens-and-
// ux.md, Screens: "/money, Finance, Head"; plan of 4.9). `money.managers`: the Head in every
// branch, Finance in its own; the branch wall is inside the SQL (CLAUDE.md rule 4), so a Manager
// in two branches shows Finance of one only that branch's orders (decided item 3). A chosen branch
// is authorized first, as the order list does (decided item 6). Read in one snapshot, so each
// count and the balance made of it are of one moment. The counts are `orderCashCount()` and the
// balance `managerCashBalance()` inside `managerBalances()`: cash is never counted a second way. An
// order that skipped Finance is left out: it has no cash count (06 Finance step switched off 2;
// plan of 4.10c, decided item 5, Look first).

/** One order behind a balance, with what the page shows of it. */
export type MoneyWithManagersOrder = ManagerOrder & {
  branchCode: string;
  productName: string;
  /** Null for the hidden default subtype. */
  subtypeName: string | null;
};

export type MoneyWithManagersBlock = ManagerBlock<MoneyWithManagersOrder> & {
  ownerIsActive: boolean;
};

const branchInput = z.uuid().nullable();

/**
 * Every owner's cash balance over the orders of the branches the user sees, oldest first; with a
 * branch chosen, that branch only. A role without `money.managers`, or a branch that is not the
 * user's, is refused with `AuthorizationError`.
 */
export async function getMoneyWithManagers(
  userId: string,
  branchId: string | null,
): Promise<MoneyWithManagersBlock[]> {
  const parsed = branchInput.safeParse(branchId);
  if (!parsed.success) throw new AuthorizationError("not_found");
  const actor = parsed.data
    ? await authorize(userId, "money.managers", { branchId: parsed.data })
    : await authorizeList(userId, "money.managers");
  const wall = branchFilter(actor, orders.branchId);
  const chosen = parsed.data;
  return readSnapshot(async (db: Executor) => {
    // Not Draft (no money reaches one) and not Closed (08: "his orders that are not Closed").
    const found = await db.execute<{
      id: string;
      number: string;
      status: RequestStatus;
      owner_id: string;
      owner_name: string;
      owner_is_active: boolean;
      branch_code: string;
      product_name: string;
      variant_name: string;
      variant_is_default: boolean;
    }>(sql`
      select orders.id, orders.number, orders.status, orders.owner_id, u.full_name as owner_name,
             u.is_active as owner_is_active, b.code as branch_code, p.name as product_name,
             v.name as variant_name, v.is_default as variant_is_default
      from orders
      join users u on u.id = orders.owner_id
      join branches b on b.id = orders.branch_id
      join product_variants v on v.id = orders.variant_id
      join products p on p.id = v.product_id
      where orders.status not in ('DRAFT', 'CLOSED')
        and not orders.skipped_finance
        and ${wall ?? sql`true`}
        and ${chosen ? sql`orders.branch_id = ${chosen}` : sql`true`}
        and (exists (select 1 from money_rows r where r.order_id = orders.id)
             or exists (select 1 from purchases pu where pu.order_id = orders.id))`);
    const ids = found.rows.map((row) => row.id);
    const rows = await datedMoneyRowsOf(db, ids);
    const records = await datedCashRecordsOf(db, ids);

    const active = new Map<string, boolean>();
    const counted: MoneyWithManagersOrder[] = [];
    for (const row of found.rows) {
      const dated = rows.get(row.id) ?? [];
      const bought = records.get(row.id) ?? [];
      const cashCount = orderCashCount(
        dated.map((each) => each.row),
        bought.map((each) => each.record),
      );
      if (cashCount === 0n) continue;
      const since = cashSince(dated, bought);
      // A count away from 0 has a movement that made it so.
      if (since === null) throw new Error(`Order ${row.id} has a cash count and no movement`);
      active.set(row.owner_id, row.owner_is_active);
      counted.push({
        id: row.id,
        number: row.number,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        status: row.status,
        cashCount,
        since,
        branchCode: row.branch_code,
        productName: row.product_name,
        subtypeName: row.variant_is_default ? null : row.variant_name,
      });
    }
    return managerBalances(counted).map((block) => ({
      ...block,
      ownerIsActive: active.get(block.ownerId) ?? true,
    }));
  });
}
