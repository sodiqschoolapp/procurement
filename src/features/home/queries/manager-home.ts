import { and, count, eq, inArray, notInArray } from "drizzle-orm";

import { type CashBalance, managerCashBalance, orderCashCount } from "@/domain/money-ledger";
import { REQUESTED_STATUSES, requestedBySubtype } from "@/domain/order-list";
import { receivedTogether } from "@/domain/purchases";
import { mayInSomeBranch } from "@/domain/permissions";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import { orders, productVariants, products, units } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { moneyRowsOf } from "@/features/money/money-rows";
import { type ListFilters, NO_FILTERS } from "@/features/orders/list-filters";
import { type OrderGroupPage, listOrderGroups } from "@/features/orders/queries/order-list";
import { cashRecordsOf } from "@/features/purchasing/order-records";

// The Manager's home, "My tasks" (10-notifications-analytics-reports.md, Home page per role:
// "Sent back to me; my drafts; my open orders with progress; cash I hold; low stock; orders due
// soon"; 11-screens-and-ux.md, Interface per role: Manager; plan of 6.1). Under `data.view`: every
// read is of the user's own orders (`owner_id`) behind the branch wall in the SQL, of the top
// bar's branch when one is chosen (decided item 7). The group blocks are the order list's own
// group rows for the filters their links carry, so the home count is the list's count (spec review
// of the plan, Should fix 1). Everything is read in one snapshot. Low stock is read by the page
// through listStockOnHand(), unchanged.

/** One line of "Requested, every stage": "Tata pens: 30 requested" (decided item 1, Look first). */
export type RequestedLine = {
  variantId: string;
  productName: string;
  /** Null for the hidden default subtype. */
  subtypeName: string | null;
  unitShortName: string;
  /** Plain decimal text: the exact sum of the orders' quantities. */
  quantity: string;
  count: number;
};

export type ManagerHome = {
  /** The three large buttons, each where its page lets the Manager act (decided item 3). */
  buttons: { newOrder: boolean; recordPurchase: boolean; issue: boolean };
  /** The filters of each block's link; `owner` is the user. */
  filters: { sentBack: ListFilters; open: ListFilters; dueSoon: ListFilters; mine: ListFilters };
  sentBack: OrderGroupPage;
  /** My drafts, never submitted or taken back: they stand in the drafts grid, not the list. */
  drafts: number;
  open: OrderGroupPage;
  /**
   * The progress of each open group row, by its key: the received quantity summed over its orders
   * (each actualQuantity() of live records) and how many of them have finished buying (07 Order
   * progress). A screen adds nothing up.
   */
  openProgress: Record<string, { received: string; finished: number }>;
  requested: RequestedLine[];
  /** 08 Manager's cash balance over my orders that are not Closed, and how many have a count. */
  cash: CashBalance & { orders: number };
  dueSoon: OrderGroupPage;
};

/**
 * The Manager home of the user, in the branch chosen in the top bar or in all their branches. A
 * branch that is not the user's is refused "Not found" (03 rule 1).
 */
export async function getManagerHome(userId: string, branch: string | null): Promise<ManagerHome> {
  return readSnapshot(async (db) => {
    const actor = await authorizeList(userId, "data.view", db);
    if (branch) await authorize(userId, "data.view", { branchId: branch }, db);
    const mine: ListFilters = { ...NO_FILTERS, branch, owner: actor.userId };
    const filters = {
      sentBack: { ...mine, status: "RETURNED" },
      open: { ...mine, status: "PURCHASING" },
      dueSoon: { ...mine, dueSoon: true },
      mine,
    } satisfies ManagerHome["filters"];
    const own = and(
      eq(orders.ownerId, actor.userId),
      branchFilter(actor, orders.branchId),
      branch ? eq(orders.branchId, branch) : undefined,
    );

    const [drafts] = await db
      .select({ count: count() })
      .from(orders)
      .where(and(own, eq(orders.status, "DRAFT")));

    const requestedRows = await db
      .select({
        variantId: orders.variantId,
        status: orders.status,
        quantity: orders.plannedQty,
        productName: products.name,
        variantName: productVariants.name,
        variantIsDefault: productVariants.isDefault,
        unitShortName: units.shortName,
      })
      .from(orders)
      .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(and(own, inArray(orders.status, [...REQUESTED_STATUSES])))
      .orderBy(products.name, productVariants.name, orders.variantId);
    const names = new Map(requestedRows.map((row) => [row.variantId, row]));
    const requested = requestedBySubtype(
      // Outside DRAFT the plan is complete (`orders_submitted_plan_check`).
      requestedRows.map((row) => ({
        variantId: row.variantId!,
        status: row.status,
        quantity: row.quantity!,
      })),
    ).map((line): RequestedLine => {
      const named = names.get(line.variantId)!;
      return {
        ...line,
        productName: named.productName,
        subtypeName: named.variantIsDefault ? null : named.variantName,
        unitShortName: named.unitShortName,
      };
    });

    // 08: "his orders that are not Closed"; no money reaches a Draft.
    const counted = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(own, notInArray(orders.status, ["DRAFT", "CLOSED"])));
    const ids = counted.map((row) => row.id);
    const rows = await moneyRowsOf(db, ids);
    const records = await cashRecordsOf(db, ids);
    const counts = counted.map((row) => ({
      status: row.status,
      cashCount: orderCashCount(rows.get(row.id) ?? [], records.get(row.id) ?? []),
    }));

    const open = await listOrderGroups(userId, filters.open, 1, db);
    const openProgress = Object.fromEntries(
      open.groups.map((group) => [
        group.key,
        {
          received: receivedTogether(group.orders.map((order) => order.received)),
          finished: group.orders.filter((order) => order.progress !== "OPEN").length,
        },
      ]),
    );

    return {
      buttons: {
        newOrder: mayInSomeBranch("request.create", actor),
        recordPurchase: mayInSomeBranch("purchase.record", actor),
        issue: mayInSomeBranch("stock.issue", actor),
      },
      filters,
      sentBack: await listOrderGroups(userId, filters.sentBack, 1, db),
      drafts: drafts?.count ?? 0,
      open,
      openProgress,
      requested,
      cash: {
        ...managerCashBalance(counts),
        orders: counts.filter((each) => each.cashCount !== 0n).length,
      },
      dueSoon: await listOrderGroups(userId, filters.dueSoon, 1, db),
    };
  });
}
