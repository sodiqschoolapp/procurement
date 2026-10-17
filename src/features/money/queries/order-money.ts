import { sql } from "drizzle-orm";
import * as z from "zod";

import { type FileMime, isImageMime } from "@/domain/files";
import {
  type MoneyRowKind,
  actionTotal,
  moneyCancelAllows,
  orderCashCount,
} from "@/domain/money-ledger";
import { type Actor, decide } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import { type Executor, authorizeList, branchFilter } from "@/server/authorize";
import { orders } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { cashRecordsOf } from "@/features/purchasing/order-records";

// The Money tab of /orders/[id] (11-screens-and-ux.md, Order page layout 3; 08-money-and-
// settlement.md, Money ledger; plan of 4.3). Its own `data.view`, with the branch wall and the
// draft wall inside the SQL (CLAUDE.md rule 4; progress 4.1: every read of money actions joins
// money_rows → orders and filters by branch; review of the plan, Must fix 3): another branch's
// order, another user's Draft, an unknown or a malformed id are all null. Read in one snapshot,
// so the rows and the count are of one moment. Seen by every role that sees the order (decided
// item 11); Cancel only where `money.record` and the domain allow it.

/** One row of the order in a money action, newest first. */
export type OrderMoneyRow = {
  actionId: string;
  kind: MoneyRowKind;
  amount: bigint;
  /** The action's business date, `YYYY-MM-DD`. */
  occurredOn: string;
  documentNo: string | null;
  /** The action's file, downloaded under MONEY_FILES of src/server/files/owners.ts. */
  file: { id: string; isImage: boolean } | null;
  comment: string | null;
  recordedBy: string;
  recordedAt: Date;
  isCancelled: boolean;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  /**
   * Cancel is offered: `money.record` on the action's orders and `moneyCancelAllows()` (08 Money
   * ledger); the action's orders with the version and number each is sent with, and its total.
   * Null otherwise. The server asks again.
   */
  cancel: { orders: { id: string; version: number; number: string }[]; total: bigint } | null;
};

export type OrderMoney = {
  /** 08 Order's cash count: above 0 the Manager holds money, below 0 he is owed. */
  count: bigint;
  rows: OrderMoneyRow[];
};

const idInput = z.uuid();

/** The order's Money tab, or null when the user may not see the order or it does not exist. */
export async function getOrderMoney(userId: string, orderId: string): Promise<OrderMoney | null> {
  const actor = await authorizeList(userId, "data.view");
  const parsed = idInput.safeParse(orderId);
  if (!parsed.success) return null;
  return readSnapshot((db) => readMoney(db, actor, parsed.data));
}

/** The branch wall and the draft wall of the table `orders`, in SQL. */
function seen(actor: Actor) {
  const wall = branchFilter(actor, orders.branchId);
  if (!wall) return sql`true`;
  return sql`${wall} and (${orders.status} <> 'DRAFT' or ${orders.ownerId} = ${actor.userId})`;
}

async function readMoney(db: Executor, actor: Actor, id: string): Promise<OrderMoney | null> {
  const found = await db.execute<{
    branch_id: string;
    owner_id: string;
    status: RequestStatus;
  }>(sql`select orders.branch_id, orders.owner_id, orders.status from orders
    where orders.id = ${id} and ${seen(actor)}`);
  const order = found.rows[0];
  if (!order) return null;
  const target = { branchId: order.branch_id, ownerId: order.owner_id };
  const records = (await cashRecordsOf(db, [id])).get(id) ?? [];

  const rows = await db.execute<{
    action_id: string;
    kind: MoneyRowKind;
    amount: string;
    occurred_on: string;
    document_no: string | null;
    file_id: string | null;
    file_mime: string;
    comment: string | null;
    recorded_by: string;
    recorded_at: Date;
    is_cancelled: boolean;
    cancel_reason: string | null;
    cancelled_by: string | null;
    cancelled_at: Date | null;
  }>(sql`
    select a.id as action_id, r.kind, r.amount::text as amount, a.occurred_on::text as occurred_on,
           a.document_no, a.file_id, f.mime as file_mime, a.comment, cu.full_name as recorded_by,
           a.created_at as recorded_at, a.is_cancelled, a.cancel_reason,
           xu.full_name as cancelled_by, a.cancelled_at
    from money_rows r
    join money_actions a on a.id = r.money_action_id
    join orders on orders.id = r.order_id
    join users cu on cu.id = a.created_by
    left join users xu on xu.id = a.cancelled_by
    left join files f on f.id = a.file_id
    where r.order_id = ${id} and ${seen(actor)}
    order by a.occurred_on desc, a.created_at desc, a.id`);

  const canRecordMoney = decide("money.record", actor, target) === "allow";
  const actionIds = rows.rows.filter((row) => !row.is_cancelled).map((row) => row.action_id);
  const ordersOf = new Map<
    string,
    { id: string; version: number; number: string; status: RequestStatus; amount: bigint }[]
  >();
  if (canRecordMoney && actionIds.length > 0) {
    // Every order of each live action, behind the same walls: an order the user may not see
    // leaves the action without Cancel (one action is one branch: decided item 4).
    const all = await db.execute<{
      action_id: string;
      id: string;
      version: number;
      number: string;
      status: RequestStatus;
      amount: string;
      seen: boolean;
    }>(sql`
      select r.money_action_id as action_id, orders.id, orders.version, orders.number, orders.status,
             r.amount::text as amount, (${seen(actor)}) as seen
      from money_rows r join orders on orders.id = r.order_id
      where r.money_action_id in (${sql.join(
        actionIds.map((each) => sql`${each}::uuid`),
        sql`, `,
      )})
      order by orders.number`);
    const hidden = new Set(all.rows.filter((row) => !row.seen).map((row) => row.action_id));
    for (const row of all.rows) {
      if (hidden.has(row.action_id)) continue;
      const list = ordersOf.get(row.action_id) ?? [];
      list.push({
        id: row.id,
        version: row.version,
        number: row.number,
        status: row.status,
        amount: BigInt(row.amount),
      });
      ordersOf.set(row.action_id, list);
    }
  }

  return {
    count: orderCashCount(
      rows.rows.map((row) => ({
        kind: row.kind,
        amount: BigInt(row.amount),
        isCancelled: row.is_cancelled,
      })),
      records,
    ),
    rows: rows.rows.map((row) => {
      const of = ordersOf.get(row.action_id);
      const cancellable =
        of !== undefined &&
        moneyCancelAllows(
          { isCancelled: row.is_cancelled },
          of.map((each) => each.status),
        );
      return {
        actionId: row.action_id,
        kind: row.kind,
        amount: BigInt(row.amount),
        occurredOn: row.occurred_on,
        documentNo: row.document_no,
        file: row.file_id
          ? { id: row.file_id, isImage: isImageMime(row.file_mime as FileMime) }
          : null,
        comment: row.comment,
        recordedBy: row.recorded_by,
        recordedAt: new Date(row.recorded_at),
        isCancelled: row.is_cancelled,
        cancelReason: row.cancel_reason,
        cancelledBy: row.cancelled_by,
        cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
        cancel: cancellable
          ? {
              orders: of.map(({ id, version, number }) => ({ id, version, number })),
              total: actionTotal(of),
            }
          : null,
      };
    }),
  };
}
