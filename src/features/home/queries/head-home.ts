import { and, asc, desc, eq } from "drizzle-orm";

import { businessDate, businessMonth, type BusinessDate } from "@/domain/business-date";
import { orderOverspend, overspendNeedsAck } from "@/domain/money-ledger";
import type { ListStatus } from "@/domain/order-list";
import { type OrdersTotals, ordersTotals } from "@/domain/order-totals";
import { type Permission, decide } from "@/domain/permissions";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import { now } from "@/server/clock";
import { branches, stockDocuments, users } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { settlementFactsOf } from "@/features/money/settlement-facts";
import { type ListFilters, NO_FILTERS } from "@/features/orders/list-filters";
import {
  type OrderGroupPage,
  countOrdersByStatus,
  listOrderGroups,
  ordersOnFilter,
} from "@/features/orders/queries/order-list";

import { branchSpending } from "../spending";

// The Head's home, "My tasks" (10-notifications-analytics-reports.md, Home page per role: "Waiting
// for my approval, by branch; overspends to acknowledge; write-offs and corrections to approve;
// product suggestions; orders stuck over 48 hours; counts by status per branch; spending this
// month per branch"; 11-screens-and-ux.md, Interface per role: Head, "Home lists every decision
// waiting across all branches"; plan of 6.2). Each list is read under the right it serves, with
// the branch wall inside the SQL, and everything in one snapshot, so a count beside its rows is of
// one moment. The suggestions and the price prompts are the Head's catalog lists, read by their
// own queries on the page (decided item 10).

/** One branch's line of "Waiting for my approval, by branch". */
export type WaitingLine = {
  branchId: string;
  branchCode: string;
  count: number;
  totals: OrdersTotals;
};

/** An order above the overspend guard that waits for the Head (08 Overspend guard). */
export type OverspendLine = {
  id: string;
  number: string;
  branchCode: string;
  productName: string;
  subtypeName: string | null;
  over: bigint;
  percent: string | null;
};

export type WriteOffLine = {
  id: string;
  number: string;
  branchCode: string;
  docDate: string;
  reason: (typeof stockDocuments.$inferSelect)["reason"];
  askedBy: string;
};

export type BranchFigures = {
  branchId: string;
  branchCode: string;
  branchName: string;
  isActive: boolean;
  byStatus: { status: ListStatus; count: number }[];
  /** 08 Actual total of the branch's records bought this Tashkent month (decisions 6.1 item 6). */
  spending: bigint;
};

export type HeadHome = {
  /** The filters of each order list behind a block, the top bar's branch left to the link. */
  filters: { waiting: ListFilters; settlement: ListFilters; stuck: ListFilters };
  waiting: { lines: WaitingLine[]; count: number; groups: OrderGroupPage };
  overspends: OverspendLine[];
  writeOffs: { count: number; lines: WriteOffLine[] };
  stuck: OrderGroupPage;
  branches: BranchFigures[];
  /** The setting `escalation_hours` the stuck list compares with (06 rule 9). */
  escalationHours: number;
  month: { first: BusinessDate; last: BusinessDate };
};

/** How many rows a list of documents shows (the group rows' HOME_GROUP_LIMIT). */
const WRITE_OFF_LINES = 5;

export async function getHeadHome(userId: string, branch: string | null): Promise<HeadHome> {
  return readSnapshot(async (db) => {
    // The Head's own step: refuses every other role (03 Permission matrix, "Approve, send back or
    // reject at step 1").
    // Another branch is "Not found" for every role first (03 rule 1), then the right of each list.
    if (branch) await authorize(userId, "data.view", { branchId: branch }, db);
    const may = (permission: Permission) =>
      branch
        ? authorize(userId, permission, { branchId: branch }, db)
        : authorizeList(userId, permission, db);
    await may("request.approve_step1");
    const ackActor = await may("request.acknowledge_overspend");
    const writeOffActor = await may("stock.approve_write_off");
    const viewer = await authorizeList(userId, "data.view", db);

    const scope: ListFilters = { ...NO_FILTERS, branch };
    const filters = {
      waiting: { ...scope, status: "PENDING_HEAD" as const },
      settlement: { ...scope, status: "SETTLEMENT" as const },
      stuck: { ...scope, stuck: true },
    };

    // Waiting for my approval, one line per branch with its orders' totals (08 Planned total).
    const waitingOrders = await ordersOnFilter(userId, filters.waiting, db);
    const lines = new Map<
      string,
      { branchCode: string; plans: (typeof waitingOrders)[number]["plan"][] }
    >();
    for (const order of waitingOrders) {
      const line = lines.get(order.branchId) ?? { branchCode: order.branchCode, plans: [] };
      line.plans.push(order.plan);
      lines.set(order.branchId, line);
    }

    // Overspends to acknowledge: the one rule of decisions 4.7 item 3, under the settings of now.
    const settling = (await ordersOnFilter(userId, filters.settlement, db)).filter(
      (order) =>
        decide("request.acknowledge_overspend", ackActor, { branchId: order.branchId }) === "allow",
    );
    const facts = await settlementFactsOf(
      db,
      settling.map((order) => order.id),
    );
    const guard = await readSettings(db);
    const overspends = settling.flatMap((order): OverspendLine[] => {
      const fact = facts.get(order.id);
      if (!fact || !overspendNeedsAck(fact, guard)) return [];
      const { over, percent } = orderOverspend(fact, guard);
      return [
        {
          id: order.id,
          number: order.number,
          branchCode: order.branchCode,
          productName: order.productName,
          subtypeName: order.subtypeName,
          over,
          percent,
        },
      ];
    });

    // Write-offs to approve (progress 5.11, "For 6.2"), newest first.
    const writeOffWhere = and(
      eq(stockDocuments.type, "WRITE_OFF"),
      eq(stockDocuments.status, "PENDING_APPROVAL"),
      branchFilter(writeOffActor, stockDocuments.branchId),
      branch ? eq(stockDocuments.branchId, branch) : undefined,
    );
    const writeOffRows = await db
      .select({
        id: stockDocuments.id,
        number: stockDocuments.number,
        branchCode: branches.code,
        docDate: stockDocuments.docDate,
        reason: stockDocuments.reason,
        askedBy: users.fullName,
      })
      .from(stockDocuments)
      .innerJoin(branches, eq(branches.id, stockDocuments.branchId))
      .innerJoin(users, eq(users.id, stockDocuments.createdBy))
      .where(writeOffWhere)
      .orderBy(desc(stockDocuments.createdAt), desc(stockDocuments.id));

    // The branches of the per-branch lists: the top bar's, or every branch the Head sees, an
    // inactive one included (decided item 5).
    const shown = await db
      .select({
        id: branches.id,
        code: branches.code,
        name: branches.name,
        isActive: branches.isActive,
      })
      .from(branches)
      .where(and(branchFilter(viewer, branches.id), branch ? eq(branches.id, branch) : undefined))
      .orderBy(asc(branches.code));
    const month = businessMonth(businessDate(now()));
    const figures: BranchFigures[] = [];
    for (const each of shown) {
      figures.push({
        branchId: each.id,
        branchCode: each.code,
        branchName: each.name,
        isActive: each.isActive,
        byStatus: await countOrdersByStatus(userId, { ...NO_FILTERS, branch: each.id }, db),
        spending: await branchSpending(db, viewer, each.id, month),
      });
    }

    return {
      filters,
      waiting: {
        lines: [...lines].map(([branchId, line]) => ({
          branchId,
          branchCode: line.branchCode,
          count: line.plans.length,
          totals: ordersTotals(line.plans),
        })),
        count: waitingOrders.length,
        groups: await listOrderGroups(userId, filters.waiting, 1, db),
      },
      overspends,
      writeOffs: { count: writeOffRows.length, lines: writeOffRows.slice(0, WRITE_OFF_LINES) },
      stuck: await listOrderGroups(userId, filters.stuck, 1, db),
      branches: figures,
      escalationHours: guard.escalation_hours,
      month,
    };
  });
}
