import {
  type SettlementNet,
  actionTotal,
  approvalCashRows,
  plannedCash,
  settlementNet,
  settlementRows,
} from "@/domain/money-ledger";
import { ordersTotals } from "@/domain/order-totals";
import { type Permission, decide } from "@/domain/permissions";
import { type Executor, authorize, authorizeList } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { settlementFactsOf } from "@/features/money/settlement-facts";
import { type ListFilters, NO_FILTERS } from "@/features/orders/list-filters";
import { type FilterOrder, ordersOnFilter } from "@/features/orders/queries/order-list";

// The Finance home, "My tasks" (10-notifications-analytics-reports.md, Home page per role:
// "Waiting for my approval; waiting for settlement; money with managers"; 11-screens-and-ux.md,
// Interface per role: Finance, "Home lists approvals and settlements with the exact amount to give
// or receive. Each one opens the order list filtered to those orders, ready to tick"; plan of 6.2,
// decided item 3, Look first). One entry per owner and branch: a money action is one per Manager
// (08 Money ledger 1) and a settlement one branch (decisions 4.5 item 4), so the entry's amount is
// the prefill of the dialog that its link's orders open, and the link (`status`, `owner`,
// `branch`) holds exactly those orders. Every amount is a function of src/domain/money-ledger.ts.
// Money with managers is read by its own query on the page.

type Entry = {
  ownerId: string;
  ownerName: string;
  branchId: string;
  branchCode: string;
  count: number;
  /** The order list of these orders. */
  filters: ListFilters;
};

/** Waiting for Finance: the planned total and the cash the approval dialog prefills (08). */
export type ApprovalEntry = Entry & { planned: bigint; cashToGive: bigint };

/** Waiting for settlement: who hands whom the net of the prefilled Receive and Pay rows (08). */
export type SettlementEntry = Entry & { net: SettlementNet };

export type FinanceHome = {
  filters: { approvals: ListFilters; settlements: ListFilters };
  approvals: ApprovalEntry[];
  settlements: SettlementEntry[];
};

/** The orders by owner and branch, in the order ordersOnFilter() gives them. */
function byOwnerAndBranch(found: readonly FilterOrder[], base: ListFilters) {
  const entries = new Map<string, { entry: Entry; orders: FilterOrder[] }>();
  for (const order of found) {
    const key = `${order.ownerId}:${order.branchId}`;
    const held = entries.get(key) ?? {
      entry: {
        ownerId: order.ownerId,
        ownerName: order.ownerName,
        branchId: order.branchId,
        branchCode: order.branchCode,
        count: 0,
        filters: { ...base, owner: order.ownerId, branch: order.branchId },
      },
      orders: [],
    };
    held.entry.count += 1;
    held.orders.push(order);
    entries.set(key, held);
  }
  return [...entries.values()];
}

/** The orders of the filter that the user may act on with `permission` (03 matrix). */
async function ordersFor(
  userId: string,
  permission: Permission,
  filters: ListFilters,
  executor: Executor,
) {
  const actor = filters.branch
    ? await authorize(userId, permission, { branchId: filters.branch }, executor)
    : await authorizeList(userId, permission, executor);
  return (await ordersOnFilter(userId, filters, executor)).filter(
    (order) =>
      decide(permission, actor, { branchId: order.branchId, ownerId: order.ownerId }) === "allow",
  );
}

export async function getFinanceHome(userId: string, branch: string | null): Promise<FinanceHome> {
  return readSnapshot(async (db) => {
    // Finance's own step, in its own branches (03 Permission matrix, "Approve, send back or reject
    // at step 3"; "Settle and close an order with differences").
    // Another branch is "Not found" for every role first (03 rule 1), then Finance's own step.
    if (branch) {
      await authorize(userId, "data.view", { branchId: branch }, db);
      await authorize(userId, "request.approve_step3", { branchId: branch }, db);
    } else {
      await authorizeList(userId, "request.approve_step3", db);
    }
    const scope: ListFilters = { ...NO_FILTERS, branch };
    const filters = {
      approvals: { ...scope, status: "PENDING_FINANCE" as const },
      settlements: { ...scope, status: "SETTLEMENT" as const },
    };

    const approving = await ordersFor(userId, "request.approve_step3", filters.approvals, db);
    const approvals = byOwnerAndBranch(approving, filters.approvals).map(({ entry, orders }) => ({
      ...entry,
      planned: ordersTotals(orders.map((order) => order.plan)).grand,
      // The dialog's "Cash given to the Manager now" prefill (08 When Finance approves; decisions
      // 4.2 item 6): the rows approvalCashRows() keeps, added up as the action's total.
      cashToGive: actionTotal(
        approvalCashRows(
          orders.map((order) => ({
            id: order.id,
            ownerId: order.ownerId,
            amount: plannedCash(order.plan),
          })),
        ).flatMap((block) => block.rows),
      ),
    }));

    const settling = await ordersFor(userId, "request.settle", filters.settlements, db);
    const facts = await settlementFactsOf(
      db,
      settling.map((order) => order.id),
    );
    const settlements = byOwnerAndBranch(settling, filters.settlements).map(
      ({ entry, orders }) => ({
        ...entry,
        // The settlement screen's prefilled rows (08 Closing 2) and their net (Money ledger 2).
        net: settlementNet(
          settlementRows(
            orders.map((order) => ({
              id: order.id,
              cashCount: facts.get(order.id)?.blocks.cash?.count ?? 0n,
            })),
          ),
        ),
      }),
    );

    return { filters, approvals, settlements };
  });
}
