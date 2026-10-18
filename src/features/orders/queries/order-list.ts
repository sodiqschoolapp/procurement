import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import * as z from "zod";

import {
  type ColourOrder,
  type OrderColours,
  type SetColours,
  orderColours,
  setColours,
} from "@/domain/colours";
import { businessDate, businessDayStart, nextBusinessDate } from "@/domain/business-date";
import { addsDraftsIn, inStock, plainQuantity } from "@/domain/drafts";
import {
  type GroupSummary,
  ORDER_LIST_PAGE_SIZE,
  type ListStatus,
  groupSummary,
  pinsUrgent,
} from "@/domain/order-list";
import {
  ORDER_ACTION_MAX,
  type OrderAction,
  allowedActions,
  ownerMoveAllows,
} from "@/domain/order-moves";
import { type DownloadRow, orderDownloadRow } from "@/domain/order-download";
import {
  STILL_DUE_OPEN,
  STILL_DUE_STATUSES,
  type StepEvent,
  dueSoonUntil,
  isOverdue,
} from "@/domain/order-steps";
import {
  type OrdersTotals,
  orderTotal,
  ordersTotals,
  priceHintPercent,
} from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import { type Actor, decide } from "@/domain/permissions";
import { moneyRecordAllows, overspendNeedsAck, settlementAllows } from "@/domain/money-ledger";
import { type BuyingAction, actualQuantity, buyingActions } from "@/domain/purchases";
import { type Executor, authorize, authorizeList, branchFilter } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  branches,
  categories,
  departments,
  orderEvents,
  orderExtras,
  orders,
  productVariants,
  products,
  stockBalances,
  units,
  users,
} from "@/server/db/schema";
import { orderState } from "@/server/order-moves";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { type ListFilters, NO_FILTERS, numberParts } from "../list-filters";

import { settlementFactsOf } from "@/features/money/settlement-facts";
import { recordsOfListed, recordsOfOrders } from "@/features/purchasing/order-records";

import { exactMatchOf } from "../exact-match";
import { createdByHeadSql, headStepAutoSql, ownerClosesAloneSql } from "../order-facts";

// The order list on /orders (05-order-request-form.md, Group rows; Ticking and filters;
// 11-screens-and-ux.md, Order list layout; Rules for a smooth feel 8; plan of 2.8). Under
// `data.view` with the branch inside the SQL (developer-rules.md rule 4; 03 matrix "See orders,
// stock and reports"). The list holds every status but Draft: that is the draft wall too, inside
// the SQL (06 Statuses; decided item 1, Look first; .claude/rules/server-actions.md). The SQL only
// filters, groups, orders and pages; each number a group row shows is groupSummary() of its
// orders (decided item 3, Look first), and the ticked totals are ordersTotals() (08).

export type ListOrder = {
  id: string;
  number: string;
  revision: number;
  version: number;
  departmentName: string;
  /** Plain decimal text, without trailing zeros. */
  quantity: string;
  /**
   * The branch's stock of the subtype at submit and now (06 rule 10; plan of 2.10, decided item
   * 4): plain decimal text; null for a service, which has no stock.
   */
  stockAtSubmit: string | null;
  stockNow: string | null;
  price: bigint;
  paymentType: PaymentType;
  neededBy: string;
  ownerName: string;
  submittedAt: Date;
  priority: "NORMAL" | "URGENT";
  priceHint: bigint | null;
  /** "Overdue", by isOverdue() (edge case "The needed-by date passes"; plan of 2.13). */
  overdue: boolean;
  /** Number, Price and Total by orderColours(), from Open on; null before (plan of 3.8). */
  colours: OrderColours | null;
};

export type OrderGroup = {
  /** branch, subtype and status: the group's key (decided item 4). */
  key: string;
  branchId: string;
  branchCode: string;
  variantId: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  unitShortName: string;
  status: ListStatus;
  summary: GroupSummary;
  /** The three colours of its orders by setColours(), from Open on; null before (plan of 3.8). */
  colours: SetColours | null;
  orders: ListOrder[];
};

export type OrderGroupPage = { groups: OrderGroup[]; page: number; pages: number; total: number };

const pageInput = z.number().int().min(1).catch(1);
const idsInput = z
  .array(z.uuid())
  .max(ORDER_ACTION_MAX)
  .refine((ids) => new Set(ids).size === ids.length, "An order is ticked twice");

const DATE_COLUMNS = {
  created: orders.createdAt,
  submitted: orders.submittedAt,
  approved: orders.approvedAt,
  closed: orders.closedAt,
} as const;

/** The counter of an order number as an integer, so 10000 comes after 9999 (05 Order number 2). */
const counter = sql`split_part(${orders.number}, '-', 3)::bigint`;
const prefix = sql`split_part(${orders.number}, '-', 1) || '-' || split_part(${orders.number}, '-', 2)`;

/** The walls and the filters of the list, inside the SQL. */
function listWhere(actor: Actor, filters: ListFilters): SQL | undefined {
  const dateColumn = DATE_COLUMNS[filters.dates];
  const from = filters.numberFrom ? numberParts(filters.numberFrom) : null;
  const to = filters.numberTo ? numberParts(filters.numberTo) : null;
  const range = from ?? to;
  return and(
    // The draft wall and decided item 1: no Draft is in the list.
    ne(orders.status, "DRAFT"),
    branchFilter(actor, orders.branchId),
    filters.branch ? eq(orders.branchId, filters.branch) : undefined,
    filters.status ? eq(orders.status, filters.status) : undefined,
    filters.owner ? eq(orders.ownerId, filters.owner) : undefined,
    filters.department ? eq(orders.departmentId, filters.department) : undefined,
    filters.category
      ? inArray(
          orders.variantId,
          sql`(select pv.id from product_variants pv join products p on p.id = pv.product_id where p.category_id = ${filters.category})`,
        )
      : undefined,
    filters.payment ? eq(orders.paymentType, filters.payment) : undefined,
    filters.urgent ? eq(orders.priority, "URGENT") : undefined,
    // Tashkent days, inclusive, as UTC bounds (CLAUDE.md rule 10; decided item 11, Look first).
    filters.from ? gte(dateColumn, businessDayStart(filters.from)) : undefined,
    filters.to ? lt(dateColumn, businessDayStart(nextBusinessDate(filters.to))) : undefined,
    // Decided item 10: the same branch code and year, the counter between the bounds.
    range ? sql`${prefix} = ${range.prefix}` : undefined,
    from ? sql`${counter} >= ${from.counter}` : undefined,
    to ? sql`${counter} <= ${to.counter}` : undefined,
    filters.action
      ? inArray(
          orders.id,
          sql`(select ${orderEvents.orderId} from ${orderEvents} where ${orderEvents.actionId} = ${filters.action})`,
        )
      : undefined,
    // "Orders due soon", as isDueSoon() reads it (plan of 6.1, decided item 2): still waiting,
    // needed by today + 7 days of the injected clock or earlier.
    filters.dueSoon
      ? and(
          lte(orders.neededBy, dueSoonUntil(businessDate(now()))),
          or(
            inArray(orders.status, [...STILL_DUE_STATUSES]),
            and(
              eq(orders.status, STILL_DUE_OPEN.status),
              eq(orders.progress, STILL_DUE_OPEN.progress),
            ),
          ),
        )
      : undefined,
  );
}

const GROUP_BY = [
  orders.branchId,
  orders.variantId,
  orders.status,
  branches.code,
  products.name,
  productVariants.name,
  productVariants.isDefault,
  units.shortName,
] as const;

/**
 * The order of the groups (decided items 9 and 14): Urgent first for approvers, then the sort,
 * then branch code, product, subtype, status in the table's order. `over` makes each aggregate a
 * window over the order's group, so "Select all" takes the orders in the list's order.
 */
function groupOrder(actor: Actor, sort: ListFilters["sort"], over: boolean): SQL[] {
  const of = (aggregate: SQL) =>
    over
      ? sql`${aggregate} over (partition by ${orders.branchId}, ${orders.variantId}, ${orders.status})`
      : aggregate;
  const keys: SQL[] = [];
  if (pinsUrgent(actor.role)) keys.push(desc(of(sql`bool_or(${orders.priority} = 'URGENT')`)));
  if (sort === "neededBy") keys.push(asc(of(sql`min(${orders.neededBy})`)));
  if (sort === "submitted") {
    keys.push(asc(of(sql`min(${orders.submittedAt})`)), asc(of(sql`min(${counter})`)));
  }
  if (sort === "product") keys.push(asc(products.name), sql`${productVariants.isDefault} desc`);
  keys.push(
    asc(branches.code),
    asc(products.name),
    sql`${productVariants.isDefault} desc`,
    asc(productVariants.name),
    asc(orders.status),
    asc(orders.branchId),
    asc(orders.variantId),
  );
  return keys;
}

/** The orders inside a group: oldest first, the lower number first (05 Group rows 6). */
const MEMBER_ORDER = [asc(orders.submittedAt), asc(counter), asc(orders.id)];

const groupKey = (branchId: string, variantId: string, status: string) =>
  `${branchId}:${variantId}:${status}`;

/** Checks the `branch` filter: another branch is "Not found" (03 rule 1; decided item 12). */
async function authorizeFilters(userId: string, filters: ListFilters): Promise<Actor> {
  const actor = await authorizeList(userId, "data.view");
  if (filters.branch) await authorize(userId, "data.view", { branchId: filters.branch });
  return actor;
}

/** The extra costs of orders, by order. */
async function extrasOf(executor: Executor, ids: readonly string[]) {
  const map = new Map<string, bigint[]>();
  if (ids.length === 0) return map;
  const rows = await executor
    .select({ orderId: orderExtras.orderId, amount: orderExtras.amount })
    .from(orderExtras)
    .where(inArray(orderExtras.orderId, [...ids]))
    .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));
  for (const row of rows) map.set(row.orderId, [...(map.get(row.orderId) ?? []), row.amount]);
  return map;
}

/**
 * One page of group rows, 25 a page; a page past the last gives the last. Each group holds its
 * orders of the filter (decided item 15).
 */
export async function listOrderGroups(
  userId: string,
  filters: ListFilters = NO_FILTERS,
  page = 1,
): Promise<OrderGroupPage> {
  const actor = await authorizeFilters(userId, filters);
  // One snapshot: the count, the heads, their orders and extras of one moment (spec review of
  // 2.8, Must fix 1).
  return readSnapshot((db) => readGroups(db, actor, filters, page));
}

/**
 * The list's group rows read inside a snapshot the caller holds: for a page that shows them beside
 * other numbers of the same moment (the home pages; spec review of 6.1, Must fix 2). The caller has
 * authorized `actor` for `data.view` and the `branch` filter, as listOrderGroups() does.
 */
export async function readGroups(
  db: Executor,
  actor: Actor,
  filters: ListFilters,
  page: number,
): Promise<OrderGroupPage> {
  const where = listWhere(actor, filters);

  const grouped = db
    .select({ branchId: orders.branchId })
    .from(orders)
    .where(where)
    .groupBy(orders.branchId, orders.variantId, orders.status)
    .as("grouped");
  const [counted] = await db.select({ total: count() }).from(grouped);
  const total = counted?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ORDER_LIST_PAGE_SIZE));
  const shown = Math.min(pageInput.parse(page), pages);

  const heads = await db
    .select({
      branchId: orders.branchId,
      variantId: sql<string>`${orders.variantId}`,
      status: orders.status,
      branchCode: branches.code,
      productName: products.name,
      variantName: productVariants.name,
      variantIsDefault: productVariants.isDefault,
      unitShortName: units.shortName,
    })
    .from(orders)
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(where)
    .groupBy(...GROUP_BY)
    .orderBy(...groupOrder(actor, filters.sort, false))
    .limit(ORDER_LIST_PAGE_SIZE)
    .offset((shown - 1) * ORDER_LIST_PAGE_SIZE);
  if (heads.length === 0) return { groups: [], page: shown, pages, total };

  const owner = users;
  const members = await db
    .select({
      id: orders.id,
      number: orders.number,
      revision: orders.revision,
      version: orders.version,
      branchId: orders.branchId,
      variantId: orders.variantId,
      status: orders.status,
      departmentName: departments.name,
      quantity: orders.plannedQty,
      productType: products.type,
      stockAtSubmit: orders.stockAtSubmit,
      // In the list's one snapshot: the branch's row, none is 0 (decided item 4).
      stockNow: sql<string | null>`(select ${stockBalances.qty}::text from ${stockBalances}
        where ${stockBalances.branchId} = ${orders.branchId}
          and ${stockBalances.variantId} = ${orders.variantId})`,
      price: orders.plannedPrice,
      paymentType: orders.paymentType,
      neededBy: orders.neededBy,
      ownerName: owner.fullName,
      submittedAt: orders.submittedAt,
      priority: orders.priority,
      progress: orders.progress,
      referencePrice: productVariants.referencePrice,
    })
    .from(orders)
    .innerJoin(owner, eq(owner.id, orders.ownerId))
    .innerJoin(departments, eq(departments.id, orders.departmentId))
    .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        where,
        or(
          ...heads.map((head) =>
            and(
              eq(orders.branchId, head.branchId),
              eq(orders.variantId, head.variantId),
              eq(orders.status, head.status),
            ),
          ),
        ),
      ),
    )
    .orderBy(...MEMBER_ORDER);
  const extras = await extrasOf(
    db,
    members.map((member) => member.id),
  );
  // The members' purchase records, for the three colours (plan of 3.8).
  const records = await recordsOfOrders(
    db,
    members.map((member) => member.id),
  );
  const threshold = (await readSettings(db)).price_hint_percent;
  const today = businessDate(now());

  const byGroup = new Map<string, { order: ListOrder; extras: bigint[]; colour: ColourOrder }[]>();
  for (const member of members) {
    // Outside DRAFT the plan is complete (`orders_submitted_plan_check`).
    const colour: ColourOrder = {
      status: member.status,
      progress: member.progress,
      plan: {
        quantity: member.quantity!,
        price: member.price!,
        extras: extras.get(member.id) ?? [],
        paymentType: member.paymentType,
      },
      records: records.get(member.id) ?? [],
    };
    const order: ListOrder = {
      id: member.id,
      number: member.number!,
      revision: member.revision,
      version: member.version,
      departmentName: member.departmentName,
      quantity: plainQuantity(member.quantity!),
      stockAtSubmit: inStock(member.productType, member.stockAtSubmit),
      stockNow: inStock(member.productType, member.stockNow),
      price: member.price!,
      paymentType: member.paymentType,
      neededBy: member.neededBy!,
      ownerName: member.ownerName,
      submittedAt: member.submittedAt!,
      priority: member.priority,
      priceHint: priceHintPercent(member.price, member.referencePrice, threshold),
      overdue: isOverdue(member.status, member.progress, member.neededBy, today),
      colours: orderColours(colour),
    };
    const key = groupKey(member.branchId, member.variantId!, member.status);
    byGroup.set(key, [
      ...(byGroup.get(key) ?? []),
      { order, extras: extras.get(member.id) ?? [], colour },
    ]);
  }

  const groups = heads.map((head): OrderGroup => {
    const key = groupKey(head.branchId, head.variantId, head.status);
    const held = byGroup.get(key) ?? [];
    return {
      key,
      branchId: head.branchId,
      branchCode: head.branchCode,
      variantId: head.variantId,
      productName: head.productName,
      subtypeName: head.variantIsDefault ? null : head.variantName,
      unitShortName: head.unitShortName,
      status: head.status as ListStatus,
      summary: groupSummary(
        held.map(({ order, extras: amounts }) => ({
          quantity: order.quantity,
          price: order.price,
          extras: amounts,
          paymentType: order.paymentType,
          neededBy: order.neededBy,
          priority: order.priority,
          priceHint: order.priceHint,
          overdue: order.overdue,
        })),
      ),
      colours: setColours(held.map(({ colour }) => colour)),
      orders: held.map(({ order }) => order),
    };
  });
  return { groups, page: shown, pages, total };
}

/**
 * "Select all on this filter" (05 Ticking and filters): the matching orders in the list's order,
 * at most 200, and how many match (decided item 6).
 */
export async function selectAllOnFilter(
  userId: string,
  filters: ListFilters = NO_FILTERS,
): Promise<{ orders: { id: string; version: number }[]; matching: number }> {
  const actor = await authorizeFilters(userId, filters);
  const where = listWhere(actor, filters);
  // One snapshot, so "200 of N" counts the orders it ticks (spec review of 2.8, Should fix 2).
  return readSnapshot(async (db) => {
    const [counted] = await db.select({ total: count() }).from(orders).where(where);
    const rows = await db
      .select({ id: orders.id, version: orders.version })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(where)
      .orderBy(...groupOrder(actor, filters.sort, true), ...MEMBER_ORDER)
      .limit(ORDER_ACTION_MAX);
    return { orders: rows, matching: counted?.total ?? 0 };
  });
}

export type TickedSummary = {
  count: number;
  /** Ticked ids the list no longer holds for this user: unknown, unseen or a Draft now. */
  missing: string[];
  totals: OrdersTotals;
  /** The three colours of the ticked orders by setColours(); null before Open (plan of 3.8). */
  colours: SetColours | null;
  /** The moves the state machine allows on every ticked order (06 rule 8; decided item 7). */
  actions: OrderAction[];
  /**
   * How many ticked orders match exactly (08 Exact match; 07 Finishing, "a summary of their
   * differences"; plan of 4.4, decided item 4): null until a ticked Open order's buying is finished.
   */
  exactCount: number | null;
  /**
   * Copy as new is offered: the user may add drafts in the branch of every ticked order, which is
   * active (05 Ticking and filters; plan of 2.13, decided item 1, Look first). The server asks again.
   */
  canCopy: boolean;
  /**
   * Record purchase is offered (07 One trip, many orders; plan of 3.4, decided item 11): every
   * ticked order is Open with its buying open, all of one branch, and the user may record at least
   * one of them. The trip form takes the owner's orders; the server asks everything again.
   */
  recordTrip: boolean;
  /**
   * Record money is offered (08 Money ledger; plan of 4.3): `money.record` on every ticked order
   * and every one Open or Waiting for settlement (`moneyRecordAllows()`). The server asks again.
   */
  canRecordMoney: boolean;
  /**
   * Settle is offered (08 Closing 2; plan of 4.5, decided item 4, Look first): every ticked order
   * Waiting for settlement (`settlementAllows()`), all of one branch, and `request.settle` on each.
   * The settlement screen and its actions ask again.
   */
  canSettle: boolean;
  /**
   * Acknowledge overspend is offered (08 Overspend guard; plan of 4.7, decided items 2 and 3, Look
   * first): every ticked order Waiting for settlement, above the guard and not yet acknowledged
   * (`overspendNeedsAck()`), and `request.acknowledge_overspend` on each. The action asks again.
   */
  canAcknowledgeOverspend: boolean;
  /**
   * Move to another Manager is offered (03 rule 7; plan of 4.10): every ticked order in a status
   * that can be moved (`ownerMoveAllows()`) and `request.move_owner` on each. The cash count and
   * the chosen Manager are the action's to ask, as Close's readiness is.
   */
  canMoveOwner: boolean;
  /**
   * The buying actions allowed on every ticked order (07 Order progress: "Finish order" and "Not
   * bought" on ticked orders; plan of 3.5): buyingActions() of src/domain/purchases.ts, which the
   * actions ask again.
   */
  buying: BuyingAction[];
  /**
   * Each ticked order's number and payment type, for the approve dialog: Finance may change the
   * payment type there (06 rule 1; plan of 2.10). Its planned total (orderTotal()) and owner, for
   * the dialog's per-type totals and its cash table, one block per Manager (08 When Finance
   * approves; plan of 4.2). In the list's order of numbers.
   */
  orders: {
    id: string;
    number: string;
    status: ListStatus;
    paymentType: PaymentType;
    plannedTotal: bigint;
    owner: { id: string; name: string };
  }[];
};

/**
 * The action bar of the ticked orders (11 Order list layout 4): their count and totals and the
 * actions allowed on all of them. An id the user may not see, an unknown id and a Draft are
 * dropped alike and named in `missing`, so the answer tells nothing about them (03 rule 1;
 * decided item 16). At most 200 ids, none twice (06 rule 8).
 */
export async function tickedSummary(
  userId: string,
  orderIds: readonly string[],
): Promise<TickedSummary> {
  const actor = await authorizeList(userId, "data.view");
  const ids = idsInput.parse(orderIds);
  const none: TickedSummary = {
    count: 0,
    missing: [],
    totals: ordersTotals([]),
    colours: null,
    actions: [],
    exactCount: null,
    canCopy: false,
    recordTrip: false,
    canRecordMoney: false,
    canSettle: false,
    canAcknowledgeOverspend: false,
    canMoveOwner: false,
    buying: [],
    orders: [],
  };
  if (ids.length === 0) return none;
  // The orders and their extras of one moment (spec review of 2.8, Should fix 1).
  return readSnapshot(async (db) => {
    const found = await db
      .select({
        id: orders.id,
        branchId: orders.branchId,
        ownerId: orders.ownerId,
        status: orders.status,
        version: orders.version,
        revision: orders.revision,
        progress: orders.progress,
        createdByHead: createdByHeadSql,
        ownerClosesAlone: ownerClosesAloneSql,
        number: orders.number,
        quantity: orders.plannedQty,
        price: orders.plannedPrice,
        paymentType: orders.paymentType,
        branchActive: branches.isActive,
        ownerName: users.fullName,
      })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .innerJoin(users, eq(users.id, orders.ownerId))
      .where(and(inArray(orders.id, ids), listWhere(actor, NO_FILTERS)));
    const extras = await extrasOf(
      db,
      found.map((row) => row.id),
    );
    const records = await recordsOfOrders(
      db,
      found.map((row) => row.id),
    );
    const exact = await exactMatchOf(
      db,
      found.map((row) => row.id),
    );
    // The overspend facts only when every ticked order is in settlement (none is asked otherwise).
    const inSettlement = found.length > 0 && found.every((row) => settlementAllows(row.status));
    const settlement = inSettlement
      ? await settlementFactsOf(
          db,
          found.map((row) => row.id),
        )
      : null;
    const guard = settlement ? await readSettings(db) : null;
    const seen = new Set(found.map((row) => row.id));
    return {
      count: found.length,
      missing: ids.filter((id) => !seen.has(id)),
      totals: ordersTotals(
        found.map((row) => ({
          quantity: row.quantity!,
          price: row.price!,
          extras: extras.get(row.id) ?? [],
          paymentType: row.paymentType,
        })),
      ),
      colours: setColours(
        found.map((row) => ({
          status: row.status,
          progress: row.progress,
          plan: {
            quantity: row.quantity!,
            price: row.price!,
            extras: extras.get(row.id) ?? [],
            paymentType: row.paymentType,
          },
          records: records.get(row.id) ?? [],
        })),
      ),
      actions: allowedActions(
        actor,
        found.map((row) => orderState({ ...row, exactMatch: exact.get(row.id) === true })),
      ),
      exactCount: found.some((row) => row.status === "PURCHASING" && row.progress !== "OPEN")
        ? found.filter((row) => exact.get(row.id) === true).length
        : null,
      canCopy:
        found.length > 0 &&
        found.every((row) => addsDraftsIn(actor, { id: row.branchId, isActive: row.branchActive })),
      recordTrip:
        found.length > 0 &&
        found.every(
          (row) =>
            row.status === "PURCHASING" &&
            row.progress === "OPEN" &&
            row.branchId === found[0]!.branchId,
        ) &&
        found.some(
          (row) =>
            decide("purchase.record", actor, { branchId: row.branchId, ownerId: row.ownerId }) ===
            "allow",
        ),
      canRecordMoney:
        found.length > 0 &&
        found.every(
          (row) =>
            moneyRecordAllows(row.status) &&
            decide("money.record", actor, { branchId: row.branchId, ownerId: row.ownerId }) ===
              "allow",
        ),
      canSettle:
        found.length > 0 &&
        found.every(
          (row) =>
            settlementAllows(row.status) &&
            row.branchId === found[0]!.branchId &&
            decide("request.settle", actor, { branchId: row.branchId, ownerId: row.ownerId }) ===
              "allow",
        ),
      canAcknowledgeOverspend:
        settlement !== null &&
        guard !== null &&
        found.every((row) => {
          const facts = settlement.get(row.id);
          return (
            facts !== undefined &&
            overspendNeedsAck(facts, guard) &&
            decide("request.acknowledge_overspend", actor, {
              branchId: row.branchId,
              ownerId: row.ownerId,
            }) === "allow"
          );
        }),
      canMoveOwner:
        found.length > 0 &&
        found.every(
          (row) =>
            ownerMoveAllows(row.status) &&
            decide("request.move_owner", actor, {
              branchId: row.branchId,
              ownerId: row.ownerId,
            }) === "allow",
        ),
      buying: buyingActions(
        actor,
        found.map((row) => ({
          status: row.status,
          progress: row.progress,
          branchId: row.branchId,
          ownerId: row.ownerId,
          plannedQty: row.quantity!,
          received: actualQuantity(records.get(row.id) ?? []),
        })),
      ),
      orders: found
        .map((row) => ({
          id: row.id,
          number: row.number!,
          status: row.status as ListStatus,
          paymentType: row.paymentType,
          plannedTotal: orderTotal({
            quantity: row.quantity!,
            price: row.price!,
            extras: extras.get(row.id) ?? [],
            paymentType: row.paymentType,
          }),
          owner: { id: row.ownerId, name: row.ownerName },
        }))
        .sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0)),
    };
  });
}

export type FilterChoice = { id: string; name: string; isActive: boolean };

export type ListFilterChoices = {
  owners: FilterChoice[];
  departments: (FilterChoice & { branchCode: string })[];
  categories: FilterChoice[];
};

/**
 * The choices of the owner, department and category filters: only of the branches the user sees
 * (03 rule 1; decided item 12). Owners are the owners of the list's orders; inactive entries stay,
 * marked, so an old order can still be found.
 */
export async function listOrderFilterChoices(userId: string): Promise<ListFilterChoices> {
  const actor = await authorizeList(userId, "data.view");
  const { db } = await import("@/server/db/client");
  const owners = await db
    .selectDistinct({ id: users.id, name: users.fullName, isActive: users.isActive })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.ownerId))
    .where(listWhere(actor, NO_FILTERS))
    .orderBy(asc(users.fullName), asc(users.id));
  const departmentRows = await db
    .select({
      id: departments.id,
      name: departments.name,
      isActive: departments.isActive,
      branchCode: branches.code,
    })
    .from(departments)
    .innerJoin(branches, eq(branches.id, departments.branchId))
    .where(branchFilter(actor, departments.branchId))
    .orderBy(asc(branches.code), asc(departments.name), asc(departments.id));
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name, isActive: categories.isActive })
    .from(categories)
    .orderBy(asc(categories.name), asc(categories.id));
  return { owners, departments: departmentRows, categories: categoryRows };
}

export type DownloadOrder = {
  id: string;
  number: string;
  revision: number;
  status: ListStatus;
  branchCode: string;
  ownerName: string;
  departmentName: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  unitShortName: string;
  /** Plain decimal text, without trailing zeros. */
  quantity: string;
  price: bigint;
  paymentType: PaymentType;
  /**
   * The extra costs, the planned total, who approved each step and, from Open on, the actual
   * numbers: orderDownloadRow().
   */
  row: DownloadRow;
};

export type OrderDownload = {
  orders: DownloadOrder[];
  /** ordersTotals() of every order of the file (plan of 2.14, decided item 6, Look first). */
  totals: OrdersTotals;
  downloadedBy: string;
  schoolName: string | null;
  /**
   * The names of the filter values, read inside the walls: null for an id this user may not see
   * or that does not exist; it still filters (plan of 2.14, decided item 4, Look first).
   */
  names: {
    branch: string | null;
    owner: string | null;
    department: string | null;
    category: string | null;
  };
};

/**
 * The order list's download (05-order-request-form.md, Download; plan of 2.14): every order of
 * the filter, in the list's order, with no page and no cap (decided item 7). Under `data.export`
 * (03 matrix "Export to Excel, download PDF, print"); the walls are the list's own `listWhere()`.
 */
export async function orderDownload(
  userId: string,
  filters: ListFilters = NO_FILTERS,
): Promise<OrderDownload> {
  const actor = await authorizeList(userId, "data.export");
  if (filters.branch) await authorize(userId, "data.export", { branchId: filters.branch });
  const where = listWhere(actor, filters);
  // The orders of the filter as a subquery, so a long list never meets a bound-parameter limit.
  const listed = listedIds(where);
  return readSnapshot(async (db) => {
    const owner = users;
    const rows = await db
      .select({
        id: orders.id,
        number: orders.number,
        revision: orders.revision,
        status: orders.status,
        branchCode: branches.code,
        ownerName: owner.fullName,
        departmentName: departments.name,
        productName: products.name,
        variantName: productVariants.name,
        variantIsDefault: productVariants.isDefault,
        unitShortName: units.shortName,
        quantity: orders.plannedQty,
        price: orders.plannedPrice,
        paymentType: orders.paymentType,
      })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .innerJoin(owner, eq(owner.id, orders.ownerId))
      .innerJoin(departments, eq(departments.id, orders.departmentId))
      .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(where)
      .orderBy(...groupOrder(actor, filters.sort, true), ...MEMBER_ORDER);

    const extraRows = await db
      .select({ orderId: orderExtras.orderId, amount: orderExtras.amount })
      .from(orderExtras)
      .where(inArray(orderExtras.orderId, listed))
      .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));
    const extras = new Map<string, bigint[]>();
    for (const extra of extraRows) {
      extras.set(extra.orderId, [...(extras.get(extra.orderId) ?? []), extra.amount]);
    }

    const actorOfEvent = users;
    const eventRows = await db
      .select({
        orderId: orderEvents.orderId,
        type: orderEvents.type,
        from: orderEvents.fromStatus,
        to: orderEvents.toStatus,
        actorName: actorOfEvent.fullName,
        at: orderEvents.createdAt,
        headStepAuto: headStepAutoSql,
      })
      .from(orderEvents)
      .innerJoin(actorOfEvent, eq(actorOfEvent.id, orderEvents.actorId))
      .where(inArray(orderEvents.orderId, listed))
      .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id));
    const events = new Map<string, StepEvent[]>();
    for (const { orderId, ...event } of eventRows) {
      events.set(orderId, [...(events.get(orderId) ?? []), event]);
    }

    // Every record of the listed orders, for the actual columns (05 Download 1; plan of 3.5).
    const records = await recordsOfListed(db, listed);

    const [me] = await db
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, actor.userId));
    const settings = await readSettings(db);

    const downloadOrders = rows.map((row): DownloadOrder => {
      // Outside DRAFT the plan is complete (`orders_submitted_plan_check`).
      const plan = {
        quantity: row.quantity!,
        price: row.price!,
        extras: extras.get(row.id) ?? [],
        paymentType: row.paymentType,
      };
      return {
        id: row.id,
        number: row.number!,
        revision: row.revision,
        status: row.status as ListStatus,
        branchCode: row.branchCode,
        ownerName: row.ownerName,
        departmentName: row.departmentName,
        productName: row.productName,
        subtypeName: row.variantIsDefault ? null : row.variantName,
        unitShortName: row.unitShortName,
        quantity: plainQuantity(row.quantity!),
        price: row.price!,
        paymentType: row.paymentType,
        row: orderDownloadRow(
          row.status,
          plan,
          events.get(row.id) ?? [],
          records.get(row.id) ?? [],
        ),
      };
    });

    return {
      orders: downloadOrders,
      totals: ordersTotals(
        downloadOrders.map((order) => ({
          quantity: order.quantity,
          price: order.price,
          extras: extras.get(order.id) ?? [],
          paymentType: order.paymentType,
        })),
      ),
      downloadedBy: me?.name ?? "",
      schoolName: settings.school_name,
      names: await filterNames(db, actor, filters),
    };
  });
}

/** The ids of the orders a `listWhere()` holds, as a subquery. */
function listedIds(where: SQL | undefined): SQL {
  return sql`(select ${orders.id} from ${orders} where ${where ?? sql`true`})`;
}

/** The names of the filter values, each read inside the walls (decided item 4, Look first). */
async function filterNames(
  db: Executor,
  actor: Actor,
  filters: ListFilters,
): Promise<OrderDownload["names"]> {
  const one = async (rows: Promise<{ name: string }[]>) => (await rows)[0]?.name ?? null;
  return {
    // Authorized with `data.export` before the read.
    branch: filters.branch
      ? await one(
          db
            .select({ name: sql<string>`${branches.code} || ' ' || ${branches.name}` })
            .from(branches)
            .where(and(eq(branches.id, filters.branch), branchFilter(actor, branches.id))),
        )
      : null,
    // Only an owner of an order this user may see, as the owner filter's choices.
    owner: filters.owner
      ? await one(
          db
            .select({ name: users.fullName })
            .from(users)
            .where(
              and(
                eq(users.id, filters.owner),
                sql`exists (select 1 from ${orders} where ${orders.ownerId} = ${users.id} and ${listWhere(actor, NO_FILTERS)})`,
              ),
            ),
        )
      : null,
    department: filters.department
      ? await one(
          db
            .select({ name: sql<string>`${branches.code} || ' ' || ${departments.name}` })
            .from(departments)
            .innerJoin(branches, eq(branches.id, departments.branchId))
            .where(
              and(
                eq(departments.id, filters.department),
                branchFilter(actor, departments.branchId),
              ),
            ),
        )
      : null,
    category: filters.category
      ? await one(
          db
            .select({ name: categories.name })
            .from(categories)
            .where(eq(categories.id, filters.category)),
        )
      : null,
  };
}
